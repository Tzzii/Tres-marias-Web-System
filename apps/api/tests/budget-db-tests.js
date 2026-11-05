import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config } from '../src/config.js';
import { pool, closePool } from '../src/db.js';
import { readBudgetCatalog } from '../src/modules/budget/budget.submission.js';
import { createBudgetProposalService } from '../src/modules/budget/budget.service.js';
import { insertBudgetProposal, findBudgetProposal } from '../src/modules/budget/budget.repo.js';
import {
  createReservation,
  updateAddons,
  sendQuotation,
  acceptQuotation
} from '../src/modules/reservations/reservations.service.js';
import * as repo from '../src/modules/reservations/reservations.repo.js';
import { applyBudgetCandidate } from '@tm/shared/src/domain/budget.js';
import { quotationStale } from '@tm/shared/src/domain/reservation.js';
import { itemsToConfirm } from '@tm/shared/src/domain/packageItems.js';

test('local full budget workflow persists immutable snapshots, revises quotations and accepts; all fixtures roll back', async () => {
  assert.ok(
    config.env !== 'production' && ['127.0.0.1', 'localhost', '::1'].includes(config.db.host),
    'Only a local non-production database is allowed'
  );
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    db.afterCommit = () => {};
    const customer = { id: `qa-${randomUUID()}`, name: 'Budget QA' };
    await db.query(
      'INSERT INTO customers (id, first_name, last_name, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [customer.id, 'Budget', 'QA', customer.name, `${customer.id}@example.invalid`, 'disabled-test-hash', Date.now()]
    );
    const helpers = `qa-${randomUUID()}`;
    const unknown = `qa-${randomUUID()}`;
    await db.query(
      'INSERT INTO addons (id, name, description, price, has_quantity, has_packages, archived, sort_order, budget_policy) VALUES (?, ?, ?, ?, ?, 0, 0, 9999, ?), (?, ?, ?, NULL, 0, 0, 0, 9999, NULL)',
      [
        helpers,
        'QA Helpers',
        'Fixture only',
        800,
        1,
        JSON.stringify({ allowRemove: true, minQty: 2, replacementIds: [], requires: [] }),
        unknown,
        'QA Unknown',
        'Price pending'
      ]
    );
    const catalog = await readBudgetCatalog(db);
    const pkg = catalog.packages.find((p) => p.kind !== 'rental');
    assert.ok(pkg);
    const guests = Math.max(100, pkg.guests);
    const transact = (fn) => fn(db);
    const form = {
      packageId: pkg.id,
      serviceType: 'Buffet and Catering',
      eventName: 'QA Budget Workflow',
      occasion: 'Birthday',
      date: '2092-06-20',
      startTime: '12:00',
      endTime: '16:00',
      guests,
      agreeTerms: true,
      venueName: 'QA Venue',
      venueAddress: 'QA Street',
      city: 'Malvar',
      menu: { pork: ['Adobo'], chicken: ['Inasal'], fish: ['Fish fillet'], vegetable: ['Chopsuey'] },
      addonIds: [helpers, unknown],
      addonQty: { [helpers]: 5, [unknown]: 1 }
    };
    const context = {
      ...form,
      selection: { addonIds: form.addonIds, addonQty: form.addonQty },
      budget: 1000,
      preferences: '',
      protectedAddonIds: [],
      reviewedCatalogFingerprint: catalog.budgetCatalogFingerprint
    };
    let providerCalls = 0;
    const generate = createBudgetProposalService({
      readCatalog: async () => readBudgetCatalog(db),
      readStock: async () => ({}),
      save: (p) => insertBudgetProposal(p, db),
      rank: async ({ candidates }) => {
        providerCalls++;
        return {
          rankings: candidates
            .filter((c) => c.action.type === 'reduce')
            .map((c) => ({ id: c.id, reasonCode: 'quantity' }))
        };
      }
    });
    const proposal = await generate(customer, context);
    assert.equal(providerCalls, 1);
    assert.equal(proposal.status, 'ready');
    const applied = applyBudgetCandidate(context.selection, proposal.candidates[0], { context, catalog });
    assert.equal(applied.problem, null);
    const baseline = {
      ...form,
      ...applied.selection,
      budgetRequest: {
        budget: 1000,
        preferences: 'Keep optional services if possible',
        protectedAddonIds: [],
        proposalId: proposal.proposalId,
        reviewedCatalogFingerprint: catalog.budgetCatalogFingerprint
      }
    };
    const created = await createReservation(customer, baseline, { transact });
    const read = async () => (await repo.findReservations(db, { ref: created.ref }))[0].reservation;
    let saved = await read();
    const snapshot = structuredClone(saved.budgetRequest);
    assert.equal(snapshot.estimate.budgetStatus, 'incomplete');
    assert.equal(snapshot.selection.addonQty[helpers], 2);
    assert.equal(snapshot.changes[0].before, 5);
    assert.equal(snapshot.changes[0].after, 2);
    assert.equal(await findBudgetProposal(proposal.proposalId, 'not-the-owner', { db }), null);
    assert.equal(await findBudgetProposal(proposal.proposalId, customer.id, { db, now: Date.now() + 86400001 }), null);
    assert.deepEqual(await repo.findReservations(db, { ref: created.ref, customerId: 'not-the-owner' }), []);
    const plain = await createReservation(
      customer,
      { ...form, date: '2092-06-21', addonIds: [], addonQty: {} },
      { transact }
    );
    assert.equal(plain.budgetRequest, null);
    const itemCounts = Object.fromEntries(itemsToConfirm(pkg, guests).map((a) => [a.name, a.defaultQty]));
    const quote = { addonPrices: { [helpers]: 800, [unknown]: 1200 }, itemCounts, extraGuestsCharge: 0 };
    const admin = { name: 'QA Admin' };
    await sendQuotation(created.ref, quote, admin, { transact });
    saved = await read();
    const firstQuote = structuredClone(saved.quotation);
    assert.equal(firstQuote.addonLines.find((a) => a.id === helpers).quantity, 2);
    await updateAddons(created.ref, { addonIds: form.addonIds, addonQty: { [helpers]: 3, [unknown]: 1 } }, admin, {
      transact
    });
    saved = await read();
    assert.deepEqual(saved.budgetRequest, snapshot);
    assert.deepEqual(saved.quotation, firstQuote);
    assert.equal(quotationStale(saved), true);
    await assert.rejects(
      acceptQuotation(created.ref, customer, firstQuote.sentAt, { transact }),
      (e) => e.code === 'INVALID_STATE'
    );
    await assert.rejects(
      updateAddons(created.ref, { addonIds: [helpers], addonQty: { [helpers]: 0 } }, admin, { transact }),
      (e) => e.code === 'INVALID'
    );
    const inventoryId = `qa-${randomUUID()}`;
    await db.query(
      'INSERT INTO inventory_items (id, code, name, category, total, low_stock_at, notes, addon_id) VALUES (?, ?, ?, ?, 3, 1, ?, ?)',
      [inventoryId, inventoryId, inventoryId, 'Other', 'Rollback-only budget fixture', helpers]
    );
    await assert.rejects(
      updateAddons(created.ref, { addonIds: form.addonIds, addonQty: { [helpers]: 4, [unknown]: 1 } }, admin, {
        transact
      }),
      /Only 3|free|available/i
    );
    await db.query('INSERT INTO inventory_allocations (item_id, reservation_ref, qty) VALUES (?, ?, 3)', [
      inventoryId,
      created.ref
    ]);
    await assert.rejects(
      updateAddons(created.ref, { addonIds: form.addonIds, addonQty: { [helpers]: 2, [unknown]: 1 } }, admin, {
        transact
      }),
      /return|checked-out/
    );
    await db.query('DELETE FROM inventory_allocations WHERE item_id = ?', [inventoryId]);
    await db.query('UPDATE addons SET budget_policy = ? WHERE id = ?', [
      JSON.stringify({ allowRemove: true, minQty: 2, replacementIds: [], requires: [unknown] }),
      helpers
    ]);
    await assert.rejects(
      updateAddons(created.ref, { addonIds: [helpers], addonQty: { [helpers]: 3 } }, admin, { transact }),
      /required additional services/
    );
    await db.query('UPDATE addons SET name = ? WHERE id = ?', ['QA Catalog Changed', helpers]);
    assert.equal((await read()).budgetRequest.lines.find((a) => a.id === helpers).name, 'QA Helpers');
    assert.equal((await read()).quotation.addonLines.find((a) => a.id === helpers).name, 'QA Helpers');
    await assert.rejects(
      createReservation(customer, { ...baseline, date: '2092-06-22' }, { transact }),
      (e) => e.code === 'CATALOG_CHANGED'
    );
    await sendQuotation(created.ref, quote, admin, { transact });
    saved = await read();
    assert.equal(quotationStale(saved), false);
    assert.equal(saved.quotation.net, firstQuote.net + 800);
    const accepted = await acceptQuotation(created.ref, customer, saved.quotation.sentAt, { transact });
    assert.equal(accepted.status, 'approved');
    assert.deepEqual((await read()).budgetRequest, snapshot);
    await assert.rejects(
      updateAddons(created.ref, { addonIds: [], addonQty: {} }, admin, { transact }),
      (e) => e.code === 'INVALID_STATE'
    );
    console.log(
      'Local budget workflow passed with fake ranker, owner-scoped snapshots, disabled delivery and rollback'
    );
  } finally {
    await db.rollback();
    delete db.afterCommit;
    db.release();
    await closePool();
  }
});
