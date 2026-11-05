import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config } from '../src/config.js';
import { pool, closePool } from '../src/db.js';
import { createAssistantRepository } from '../src/modules/assistant/assistant.repo.js';
import { createAssistantService } from '../src/modules/assistant/assistant.service.js';
import { createAssistedReservation } from '../src/modules/reservations/reservations.service.js';
import * as reservationRepo from '../src/modules/reservations/reservations.repo.js';
import { readBudgetCatalog } from '../src/modules/budget/budget.submission.js';
import { assistantReservationForm } from '@tm/shared/src/domain/assistantReservation.js';
import { themeColorSchemes } from '@tm/shared/src/domain/themeColors.js';
import { TERMS_VERSION } from '@tm/shared/src/legal/terms.js';

const localOnly = () =>
  assert.ok(
    config.env !== 'production' && ['localhost', '127.0.0.1', '::1'].includes(config.db.host),
    'Only a local development MySQL database may run assistant submission verification.'
  );
const id = (prefix = 'qa') => `${prefix}-${randomUUID()}`.slice(0, 40);
const settings = { ...config.assistant, dailyLimit: 20, conversationTtlMs: 86400000, visitorTtlMs: 86400000 };
const customerFixture = async (db, customer) =>
  db.query(
    'INSERT INTO customers (id, first_name, last_name, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      customer.id,
      'Assistant',
      'QA',
      customer.name,
      `${customer.id}@example.invalid`,
      'test-only-disabled-hash',
      Date.now()
    ]
  );
const conversationFixture = async (db, customerId, draft, photos = []) => {
  const conversationId = randomUUID();
  await db.query(
    'INSERT INTO assistant_conversations (id,customer_id,created_at,expires_at,booking_draft,reference_photos,draft_revision) VALUES (?,?,?,?,?,?,0)',
    [conversationId, customerId, Date.now(), Date.now() + 86400000, JSON.stringify(draft), JSON.stringify(photos)]
  );
  return conversationId;
};

test('real guided submission uses booking validation and persists complete requests; fixtures and delivery hooks roll back', async (t) => {
  localOnly();
  const conn = await pool.getConnection();
  const customer = { id: id(), name: 'Guided Assistant QA Customer' };
  const pkgId = id(),
    rentalPkgId = id(),
    addonId = id(),
    rentalItemId = id();
  const photo = { key: `styling/${randomUUID()}.png`, mime: 'image/png', name: 'QA inspiration.png', size: 67 };
  let savepoint = 0;
  try {
    await conn.beginTransaction();
    // No queued delivery hook may execute: this entire fixture transaction always rolls back.
    conn.afterCommit = () => {};
    await customerFixture(conn, customer);
    for (const [packageId, kind, price, guests] of [
      [pkgId, 'package', 10000, 100],
      [rentalPkgId, 'rental', 0, 0]
    ])
      await conn.query(
        'INSERT INTO packages (id,slug,name,kind,price,guests,description,items,visible,archived) VALUES (?,?,?,?,?,?,?,JSON_ARRAY(),1,0)',
        [packageId, packageId, `Assistant QA ${packageId}`, kind, price, guests, 'Rollback test package']
      );
    await conn.query(
      'INSERT INTO addons (id,name,description,price,has_quantity,has_packages,archived) VALUES (?,?,?,250,1,0,0)',
      [addonId, `Assistant QA ${addonId}`, 'Rollback additional service']
    );
    await conn.query(
      'INSERT INTO inventory_items (id,code,name,category,total,low_stock_at,rentable,rent_price,damage_fee,notes,archived) VALUES (?,?,?,?,100,1,1,75,150,?,0)',
      [rentalItemId, rentalItemId, `Assistant QA ${rentalItemId}`, 'Tables', 'Rollback rental fixture']
    );
    // Savepoints preserve production transaction rollback semantics inside one outer rollback.
    const transact = async (fn) => {
      const name = `assistant_qa_${++savepoint}`;
      await conn.query(`SAVEPOINT ${name}`);
      try {
        const result = await fn(conn);
        await conn.query(`RELEASE SAVEPOINT ${name}`);
        return result;
      } catch (error) {
        await conn.query(`ROLLBACK TO SAVEPOINT ${name}`);
        await conn.query(`RELEASE SAVEPOINT ${name}`);
        throw error;
      }
    };
    const repo = createAssistantRepository({ query: (...args) => conn.query(...args), transact, settings });
    const actor = { customerId: customer.id };
    const draft = {
      planningStarted: true,
      eventName: 'QA guided catering',
      occasion: 'Birthday',
      serviceType: 'Catering only',
      packageSlug: pkgId,
      date: '2093-07-21',
      startTime: '12:00',
      endTime: '16:00',
      guests: 100,
      venueName: 'QA event hall',
      venueAddress: '123 QA street',
      city: 'Malvar',
      accessNotes: 'Use the side entrance',
      styling: {
        theme: 'Royal',
        colors: themeColorSchemes('Royal')[0].colors,
        notes: 'Simple flowers with ivory linens'
      },
      addonIds: [addonId],
      addonQty: { [addonId]: 2 },
      foodNotes: 'No peanuts'
    };
    const create = async (db, saved, photos, account) => {
      const catalog = await readBudgetCatalog(db);
      return createAssistedReservation(
        db,
        account,
        { ...assistantReservationForm(saved, catalog), agreeTerms: true },
        photos,
        { budget: saved.budget, budgetNotes: saved.budgetNotes }
      );
    };
    const read = async (ref) => (await reservationRepo.findReservations(conn, { ref }))[0].reservation;
    const service = createAssistantService({
      settings: {
        ...settings,
        enabled: true,
        apiKey: 'fixture-only-no-provider-call',
        dailyBudgetMicro: 1,
        monthlyBudgetMicro: 1
      },
      repo,
      getCatalog: () => readBudgetCatalog(conn),
      toolsFactory: () => ({ run: async () => ({ error: 'No projection needed for this submission test' }) })
    });

    for (const [serviceType, date] of [
      ['Catering only', '2093-08-01'],
      ['Buffet and Catering', '2093-08-02']
    ])
      await t.test(
        `${serviceType} rejects a saved additional service retired after planning, then accepts its explicit removal`,
        async () => {
          const planned = {
            ...draft,
            serviceType,
            date,
            ...(serviceType === 'Buffet and Catering'
              ? { menu: { pork: ['Adobo'], chicken: ['Inasal'], fish: ['Fish fillet'], vegetable: ['Chopsuey'] } }
              : {})
          };
          const conversationId = await conversationFixture(conn, customer.id, planned);
          const [[before]] = await conn.query('SELECT COUNT(*) AS n FROM reservations WHERE customer_id = ?', [
            customer.id
          ]);
          await conn.query('UPDATE addons SET archived = 1 WHERE id = ?', [addonId]);
          try {
            const warning = await service.read(actor, conversationId);
            assert.ok(warning.bookingPlan.warnings.length, 'The saved plan remains readable for correction');
            await assert.rejects(
              () => service.submit(actor, conversationId, { revision: 0, agreeTerms: true, confirmSubmission: true }),
              (e) => e.code === 'INVALID' && e.meta.field === 'addonIds'
            );
            const [[after]] = await conn.query('SELECT COUNT(*) AS n FROM reservations WHERE customer_id = ?', [
              customer.id
            ]);
            assert.equal(after.n, before.n);
            assert.equal((await repo.read(actor, conversationId)).submittedRef, null);
            await service.updateDraft(actor, conversationId, {
              revision: 0,
              draft: { ...planned, addonIds: [], addonQty: {} }
            });
            const submitted = await service.submit(actor, conversationId, {
              revision: 1,
              agreeTerms: true,
              confirmSubmission: true
            });
            assert.ok(submitted.submittedRef);
            assert.deepEqual((await read(submitted.submittedRef)).addonIds, []);
          } finally {
            await conn.query('UPDATE addons SET archived = 0 WHERE id = ?', [addonId]);
          }
        }
      );

    await t.test(
      'service submission validates rental selections against the same transaction current rental catalog',
      async () => {
        const planned = {
          eventName: 'QA validated rental',
          occasion: 'Birthday',
          serviceType: 'Equipment rental',
          packageSlug: rentalPkgId,
          date: '2093-08-03',
          startTime: '10:00',
          fulfilment: 'pickup',
          rentalQty: { [rentalItemId]: 2 }
        };
        const conversationId = await conversationFixture(conn, customer.id, planned);
        const submitted = await service.submit(actor, conversationId, {
          revision: 0,
          agreeTerms: true,
          confirmSubmission: true
        });
        assert.equal((await read(submitted.submittedRef)).rentalItems[0].itemId, rentalItemId);
      }
    );

    await t.test(
      'catering selections, styling, quantity, private photos, customer actor and explicit terms round trip',
      async () => {
        const conversationId = await conversationFixture(conn, customer.id, draft, [photo]);
        const ref = await repo.submit(actor, conversationId, 0, create);
        const reservation = await read(ref);
        assert.equal(reservation.customerId, customer.id);
        assert.equal(reservation.eventName, draft.eventName);
        assert.equal(reservation.packageId, pkgId);
        assert.equal(reservation.startTime, '12:00');
        assert.equal(reservation.endTime, '16:00');
        assert.deepEqual(reservation.venue, {
          name: draft.venueName,
          address: draft.venueAddress,
          city: draft.city,
          accessNotes: draft.accessNotes
        });
        assert.deepEqual(reservation.addonIds, [addonId]);
        assert.equal(reservation.addonQty[addonId], 2);
        assert.equal(reservation.estimate.net, 10500);
        assert.deepEqual(reservation.styling.colors, draft.styling.colors);
        assert.equal(reservation.styling.notes, draft.styling.notes);
        assert.deepEqual(reservation.styling.referencePhotos, [photo]);
        assert.equal(reservation.termsVersion, TERMS_VERSION);
        assert.deepEqual(reservation.activity[0].actor, customer.name);
        assert.match(reservation.activity[0].text, /through AI Assistant/);
        const snapshot = await repo.read(actor, conversationId);
        assert.equal(snapshot.submittedRef, ref);
        assert.equal(snapshot.draftRevision, 1);
        assert.deepEqual(snapshot.referencePhotos, [
          { index: 0, name: photo.name, mime: photo.mime, size: photo.size }
        ]);
        assert.equal(JSON.stringify(snapshot).includes(photo.key), false);
        assert.equal(
          await repo.submit(actor, conversationId, 0, () => {
            throw Error('Retry cannot create');
          }),
          ref
        );
        await assert.rejects(
          () => repo.updatePhotos(actor, conversationId, 1, () => []),
          (e) => e.code === 'INVALID_STATE'
        );
      }
    );

    await t.test('calendar changes after review are revalidated and cannot record a submitted reference', async () => {
      const changed = { ...draft, date: '2093-07-22' };
      const conversationId = await conversationFixture(conn, customer.id, changed);
      await conn.query('INSERT INTO calendar_blocks (date,reason,note) VALUES (?, ?, ?)', [
        changed.date,
        'Closed',
        'QA private calendar note'
      ]);
      await assert.rejects(
        () => repo.submit(actor, conversationId, 0, create),
        (e) => e.code === 'DATE_UNAVAILABLE'
      );
      assert.equal((await repo.read(actor, conversationId)).submittedRef, null);
      await conn.query('DELETE FROM calendar_blocks WHERE date = ?', [changed.date]);
      assert.ok(await repo.submit(actor, conversationId, 0, create));
    });

    await t.test('reservation rows and messages roll back together if recording submission fails', async () => {
      const conversationId = await conversationFixture(conn, customer.id, { ...draft, date: '2093-07-23' });
      const [[before]] = await conn.query('SELECT COUNT(*) AS n FROM reservations WHERE customer_id = ?', [
        customer.id
      ]);
      const messageCount = async () => {
        const [[row]] = await conn.query(
          'SELECT COUNT(*) AS n FROM messages m JOIN threads t ON t.id=m.thread_id WHERE t.customer_id=?',
          [customer.id]
        );
        return row.n;
      };
      const messagesBefore = await messageCount();
      await assert.rejects(
        () =>
          repo.submit(actor, conversationId, 0, async (...args) => {
            await create(...args);
            throw Error('QA failure after creation');
          }),
        /QA failure after creation/
      );
      const [[after]] = await conn.query('SELECT COUNT(*) AS n FROM reservations WHERE customer_id = ?', [customer.id]);
      assert.equal(after.n, before.n);
      assert.equal((await repo.read(actor, conversationId)).submittedRef, null);
      assert.equal(await messageCount(), messagesBefore);
    });

    await t.test('buffet budget target and preferences create the existing server-priced budget snapshot', async () => {
      const buffet = {
        ...draft,
        date: '2093-07-24',
        serviceType: 'Buffet and Catering',
        addonIds: [],
        addonQty: {},
        budget: 200000,
        budgetNotes: 'Keep the flowers',
        menu: { pork: ['Adobo'], chicken: ['Inasal'], fish: ['Fish fillet'], vegetable: ['Chopsuey'] }
      };
      const conversationId = await conversationFixture(conn, customer.id, buffet);
      const reservation = await read(await repo.submit(actor, conversationId, 0, create));
      assert.equal(reservation.budgetRequest.budget, buffet.budget);
      assert.equal(reservation.budgetRequest.preferences, buffet.budgetNotes);
      assert.equal(reservation.budgetRequest.inclusions.packageId, pkgId);
      assert.equal(reservation.budgetRequest.inclusions.pricePerPlate, reservation.pricePerPlate);
      assert.equal(reservation.estimate.net, buffet.guests * reservation.pricePerPlate);
      assert.match(reservation.budgetRequest.catalogFingerprint, /^[a-f0-9]{64}$/);
      assert.equal(
        reservation.venue.accessNotes,
        draft.accessNotes,
        'Numeric buffet requests keep the existing budget snapshot without duplicating notes'
      );
    });

    await t.test(
      'catering-only budget and preferences remain customer-visible beside unchanged access instructions',
      async () => {
        const planned = { ...draft, date: '2093-07-26', budget: 30000, budgetNotes: 'Keep the entrance flowers' };
        const conversationId = await conversationFixture(conn, customer.id, planned);
        const reservation = await read(await repo.submit(actor, conversationId, 0, create));
        assert.equal(reservation.budgetRequest, null);
        assert.equal(
          reservation.venue.accessNotes,
          'Use the side entrance\n\nTarget budget: ₱30,000\nBudget preferences: Keep the entrance flowers'
        );
        assert.equal(reservation.notes, '', 'Customer preferences do not become admin-private notes');
      }
    );

    await t.test('buffet preferences without a numeric budget survive in customer-visible request notes', async () => {
      const planned = {
        ...draft,
        date: '2093-07-27',
        serviceType: 'Buffet and Catering',
        addonIds: [],
        addonQty: {},
        budgetNotes: 'Prioritize the food and keep the setup simple',
        menu: { pork: ['Adobo'], chicken: ['Inasal'], fish: ['Fish fillet'], vegetable: ['Chopsuey'] }
      };
      const conversationId = await conversationFixture(conn, customer.id, planned);
      const reservation = await read(await repo.submit(actor, conversationId, 0, create));
      assert.equal(reservation.budgetRequest, null);
      assert.equal(
        reservation.venue.accessNotes,
        'Use the side entrance\n\nBudget preferences: Prioritize the food and keep the setup simple'
      );
    });

    await t.test(
      'rental pickup preserves target budget and preferences after pickup logistics normalization',
      async () => {
        const planned = {
          planningStarted: true,
          eventName: 'QA pickup budget',
          occasion: 'Birthday',
          serviceType: 'Equipment rental',
          packageSlug: rentalPkgId,
          date: '2093-07-28',
          startTime: '10:00',
          fulfilment: 'pickup',
          rentalQty: { [rentalItemId]: 2 },
          budget: 5000,
          budgetNotes: 'Pickup by a family member'
        };
        const conversationId = await conversationFixture(conn, customer.id, planned);
        const reservation = await read(await repo.submit(actor, conversationId, 0, create));
        assert.equal(reservation.budgetRequest, null);
        assert.equal(
          reservation.venue.accessNotes,
          'Target budget: ₱5,000\nBudget preferences: Pickup by a family member'
        );
      }
    );

    await t.test(
      'rental selections resolve their package and persist pickup time, delivery place and server stock prices',
      async () => {
        const rental = {
          planningStarted: true,
          eventName: 'QA equipment rental',
          occasion: 'Birthday',
          serviceType: 'Equipment rental',
          packageSlug: rentalPkgId,
          date: '2093-07-25',
          startTime: '10:00',
          fulfilment: 'delivery',
          rentalQty: { [rentalItemId]: 3 },
          venueName: 'QA rental venue',
          venueAddress: '456 QA street',
          city: 'Malvar',
          accessNotes: 'Delivery gate'
        };
        const conversationId = await conversationFixture(conn, customer.id, rental);
        const reservation = await read(await repo.submit(actor, conversationId, 0, create));
        assert.equal(reservation.serviceType, 'Equipment rental');
        assert.equal(reservation.endTime, null);
        assert.equal(reservation.fulfilment, 'delivery');
        assert.equal(reservation.venue.address, rental.venueAddress);
        assert.equal(reservation.venue.accessNotes, rental.accessNotes);
        assert.deepEqual(
          reservation.rentalItems.map(({ itemId, qty, price }) => ({ itemId, qty, price })),
          [{ itemId: rentalItemId, qty: 3, price: 75 }]
        );
      }
    );
    const [[deliveries]] = await conn.query('SELECT COUNT(*) AS n FROM outbox WHERE to_address = ?', [
      `${customer.id}@example.invalid`
    ]);
    assert.equal(deliveries.n, 0, 'No customer email or other external delivery was queued');
  } finally {
    await conn.rollback();
    delete conn.afterCommit;
    conn.release();
  }
  const [[left]] = await pool.query('SELECT COUNT(*) AS n FROM customers WHERE id = ?', [customer.id]);
  assert.equal(left.n, 0, 'Outer rollback removed the customer and every dependent fixture');
});

test('real independent MySQL transactions serialize one submission reference across concurrent retries and repository restart', async () => {
  localOnly();
  const customer = { id: id(), name: 'Assistant concurrency QA' };
  let conversationId;
  try {
    await customerFixture(pool, customer);
    conversationId = await conversationFixture(pool, customer.id, { eventName: 'Concurrency QA' });
    const repo = createAssistantRepository({ settings });
    let calls = 0;
    const create = async (conn, saved, photos, account) => {
      calls++;
      assert.equal(saved.eventName, 'Concurrency QA');
      assert.equal(account.name, customer.name);
      await conn.query('SELECT id FROM assistant_conversations WHERE id = ? FOR UPDATE', [conversationId]);
      return { ref: 'QA-ASSISTANT-IDEMPOTENT' };
    };
    const results = await Promise.all(
      Array.from({ length: 6 }, () => repo.submit({ customerId: customer.id }, conversationId, 0, create))
    );
    assert.equal(calls, 1);
    assert.deepEqual(new Set(results), new Set(['QA-ASSISTANT-IDEMPOTENT']));
    const restarted = createAssistantRepository({ settings });
    assert.equal(
      await restarted.submit({ customerId: customer.id }, conversationId, 0, () => {
        throw Error('Must not create again');
      }),
      'QA-ASSISTANT-IDEMPOTENT'
    );
    assert.equal((await restarted.read({ customerId: customer.id }, conversationId)).draftRevision, 1);
  } finally {
    if (conversationId) await pool.query('DELETE FROM assistant_conversations WHERE id = ?', [conversationId]);
    await pool.query('DELETE FROM assistant_allowances WHERE id LIKE ?', [`c:${customer.id}:%`]);
    await pool.query('DELETE FROM customers WHERE id = ?', [customer.id]);
  }
  const [[left]] = await pool.query('SELECT COUNT(*) AS n FROM customers WHERE id=?', [customer.id]);
  assert.equal(left.n, 0);
});

test.after(async () => {
  await closePool();
});
