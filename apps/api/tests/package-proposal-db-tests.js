import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config } from '../src/config.js';
import { pool, closePool } from '../src/db.js';
import { buildPackageCandidates } from '@tm/shared/src/domain/packageProposal.js';
import { itemsToConfirm } from '@tm/shared/src/domain/packageItems.js';
import { quotationStale } from '@tm/shared/src/domain/reservation.js';
import { readPackageProposalCatalog } from '../src/modules/catalog/catalog.service.js';
import { selectPackageProposal } from '../src/modules/package-proposals/packageProposal.service.js';
import { readOwnedPackageProposal } from '../src/modules/package-proposals/packageProposal.read.js';
import * as proposalRepo from '../src/modules/package-proposals/packageProposal.repo.js';
import * as reservationRepo from '../src/modules/reservations/reservations.repo.js';
import {
  createReservation,
  updateAddons,
  sendQuotation,
  acceptQuotation
} from '../src/modules/reservations/reservations.service.js';

test('custom package selection, booking, quotation and response-loss recovery persist safely; all data rolls back', async () => {
  assert.ok(
    !config.isProduction && ['localhost', '127.0.0.1', '::1'].includes(config.db.host),
    'Local development database only'
  );
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    db.afterCommit = () => {};
    const transact = (fn) => fn(db);
    const customer = { id: `qa-${randomUUID()}`, name: 'Custom package QA' };
    await db.query(
      'INSERT INTO customers (id,first_name,last_name,name,email,password_hash,created_at) VALUES (?,?,?,?,?,?,?)',
      [customer.id, 'Custom', 'QA', customer.name, `${customer.id}@example.invalid`, 'disabled-fixture', Date.now()]
    );
    const addonId = `qa-${randomUUID()}`;
    await db.query(
      'INSERT INTO addons (id,name,description,price,has_quantity,has_packages,archived,sort_order,budget_policy) VALUES (?,?,?,500,1,0,0,9999,?)',
      [
        addonId,
        'QA optional helpers',
        'Rollback-only service',
        JSON.stringify({ allowRemove: true, minQty: 1, replacementIds: [], requires: [] })
      ]
    );
    let catalog = await readPackageProposalCatalog(db);
    const source = catalog.packages.find(
      (p) => p.kind === 'package' && p.visible !== false && !p.archived && p.items?.length
    );
    assert.ok(source, 'Existing catalog supplies the explicitly approved fixture component');
    const rules = {
      enabled: true,
      recipes: [
        {
          id: 'qa-complete-setup',
          name: 'QA complete private setup',
          serviceTypes: ['Catering only', 'Buffet and Catering'],
          minGuests: 100,
          maxGuests: 100,
          cateringSetupPrice: 20000,
          components: [{ packageId: source.id, itemIndex: 0, itemName: source.items[0].name, mode: 'fixed', qty: 100 }],
          optionalAddonIds: [addonId]
        }
      ]
    };
    await db.query('UPDATE catalog_settings SET package_proposal_rules=?', [JSON.stringify(rules)]);
    catalog = await readPackageProposalCatalog(db);
    const persistProposal = async (context) => {
      const built = buildPackageCandidates(context, { catalog, rules, stock: {} });
      assert.ok(built.candidates.length, built.noFitReasons.join('; '));
      const option = built.candidates.find((item) => !item.recipe.change);
      assert.ok(option);
      const id = randomUUID(),
        now = Date.now();
      await db.query(
        `INSERT INTO package_proposals (id,customer_id,request_id,input_fingerprint,catalog_fingerprint,context,options,no_fit_reasons,status,created_at,expires_at)
        VALUES (?,?,?,?,?,?,?,'[]','ready',?,?)`,
        [
          id,
          customer.id,
          randomUUID(),
          'a'.repeat(64),
          catalog.packageProposalCatalogFingerprint,
          JSON.stringify(built.context),
          JSON.stringify([option]),
          now,
          now + 86400000
        ]
      );
      return { reference: { proposalId: id, revision: 1, optionId: option.id }, context: built.context, option };
    };
    const context = {
      serviceType: 'Catering only',
      guests: 100,
      budget: 1000000,
      date: '2093-06-20',
      startTime: '12:00',
      endTime: '16:00',
      occasion: 'Baby shower',
      preferences: 'Keep full seating',
      foodNotes: '',
      menu: {},
      styling: null,
      addonIds: [addonId],
      addonQty: { [addonId]: 2 },
      protectedAddonIds: []
    };
    for (const serviceType of ['Catering only', 'Buffet and Catering']) {
      const saved = await persistProposal({
        ...context,
        serviceType,
        date: serviceType === 'Catering only' ? '2093-06-20' : '2093-06-21'
      });
      await assert.rejects(
        selectPackageProposal('not-the-owner', saved.reference, db),
        (error) => error.code === 'NOT_FOUND'
      );
      await selectPackageProposal(customer.id, saved.reference, db);
      const form = {
        ...saved.context,
        packageId: '',
        packageProposalRef: saved.reference,
        eventName: 'Private custom QA event',
        occasion: 'Other',
        occasionOther: 'Baby shower',
        menu: saved.option.menu,
        styling: saved.option.styling,
        addonIds: saved.option.addonIds,
        addonQty: saved.option.addonQty,
        venueName: 'QA hall',
        venueAddress: 'QA street',
        city: 'Malvar',
        agreeTerms: true
      };
      await assert.rejects(
        createReservation(customer, { ...form, guests: 101 }, { transact }),
        (error) => error.code === 'PROPOSAL_STALE'
      );
      const created = await createReservation(customer, form, { transact });
      const read = async () =>
        (await reservationRepo.findReservations(db, { ref: created.ref, customerId: customer.id }))[0].reservation;
      let reservation = await read();
      assert.equal(reservation.packageId, null);
      assert.equal(reservation.packageSource, 'custom');
      assert.equal(created.packageName, 'QA complete private setup');
      assert.equal(reservation.packageSnapshot.items[0].qty, 100);
      assert.equal(reservation.budgetRequest.version, 2);
      assert.equal(
        reservation.estimate.net,
        serviceType === 'Catering only' ? 21000 : catalog.pricePerPlate * 100 + 1000
      );
      const originalPackage = structuredClone(reservation.packageSnapshot);
      const originalBudget = structuredClone(reservation.budgetRequest);
      assert.equal(
        (await proposalRepo.findOwned(customer.id, saved.reference.proposalId, db)).submittedRef,
        created.ref
      );
      const repeated = await createReservation(customer, form, { transact });
      assert.equal(repeated.ref, created.ref);
      const [[boundCount]] = await db.query('SELECT COUNT(*) AS n FROM reservations WHERE customer_id=? AND date=?', [
        customer.id,
        form.date
      ]);
      assert.equal(boundCount.n, 1, 'Response-loss retry must not create a second reservation');
      const admin = { name: 'QA admin' };
      const quote = {
        itemCounts: Object.fromEntries(
          itemsToConfirm(originalPackage, 100).map((item) => [item.name, item.defaultQty])
        ),
        addonPrices: { [addonId]: 500 },
        extraGuestsCharge: 0
      };
      await sendQuotation(created.ref, quote, admin, { transact });
      const firstQuote = structuredClone((await read()).quotation);
      await updateAddons(created.ref, { addonIds: [addonId], addonQty: { [addonId]: 1 } }, admin, { transact });
      reservation = await read();
      assert.deepEqual(reservation.packageSnapshot, originalPackage);
      assert.deepEqual(reservation.budgetRequest, originalBudget);
      assert.deepEqual(reservation.quotation, firstQuote);
      assert.equal(quotationStale(reservation), true);
      await assert.rejects(
        acceptQuotation(created.ref, customer, firstQuote.sentAt, { transact }),
        (error) => error.code === 'INVALID_STATE'
      );
      await sendQuotation(created.ref, quote, admin, { transact });
      reservation = await read();
      assert.equal(reservation.quotation.net, firstQuote.net - 500);
      assert.equal(
        (await acceptQuotation(created.ref, customer, reservation.quotation.sentAt, { transact })).status,
        'approved'
      );
      await db.query('UPDATE package_proposals SET expires_at=1 WHERE id=?', [saved.reference.proposalId]);
      const recovery = await readOwnedPackageProposal(customer.id, saved.reference.proposalId, {
        findOwned: (owner, id) => proposalRepo.findOwned(owner, id, db),
        findSubmittedReservation: (owner, ref) => proposalRepo.findSubmittedReservation(owner, ref, db)
      });
      assert.equal(recovery.submission.reservationRef, created.ref);
      assert.deepEqual(recovery.submission.packageProposalRef, saved.reference);
      assert.equal((await createReservation(customer, form, { transact })).ref, created.ref);
    }
    const stale = await persistProposal({ ...context, date: '2093-06-22' });
    await selectPackageProposal(customer.id, stale.reference, db);
    await db.query('UPDATE addons SET price=501 WHERE id=?', [addonId]);
    await assert.rejects(
      selectPackageProposal(customer.id, stale.reference, db),
      (error) => error.code === 'CATALOG_CHANGED'
    );
  } finally {
    await db.rollback();
    delete db.afterCommit;
    db.release();
    await closePool();
  }
});
