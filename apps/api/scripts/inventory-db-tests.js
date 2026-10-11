import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test, after } from 'node:test';
import { config } from '../src/config.js';
import { pool, closePool } from '../src/db.js';
import * as repo from '../src/modules/inventory/inventory.repo.js';
import * as reservations from '../src/modules/reservations/reservations.repo.js';
import { checkOutRental, returnRental } from '../src/modules/inventory/inventory.service.js';
import { availableOf } from '@tm/shared/src/domain/inventory.js';

if (config.isProduction || !['127.0.0.1', 'localhost', '::1'].includes(config.db.host)) throw new Error('Inventory database tests require local, non-production MySQL.');
after(() => closePool());
const clock = { date: '2040-11-20', time: '09:00' };
const actor = { name: 'Automatic inventory' };

test('automatic rental checkout transactions (temporary fixtures are rolled back or removed)', async (t) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[customer]] = await conn.query('SELECT id FROM customers LIMIT 1');
    const [[pkg]] = await conn.query('SELECT id FROM packages LIMIT 1');
    assert.ok(customer && pkg, 'A local customer and package are needed; no seed/reset is performed.');
    const transact = (fn) => fn(conn);
    let sequence = 0;
    async function fixture(changes = {}, totals = [60]) {
      const suffix = randomUUID().slice(0, 8);
      const ref = `RES-QA-AUTO-${suffix}`;
      const rentalItems = [];
      for (const [i, total] of totals.entries()) {
        const itemId = `inv-qa-auto-${suffix}-${i}`;
        const name = `QA automatic ${suffix} ${i}`;
        await repo.insertItem(conn, { id: itemId, code: `QA-AUTO-${suffix}-${i}`, name, category: 'Chairs', total, lowStockAt: 0,
          damaged: 0, rentable: true, rentPrice: 10, damageFee: 0, notes: '', archived: false });
        rentalItems.push({ itemId, name, qty: 10, price: 10, damageFee: 0 });
      }
      const r = { ref, customerId: customer.id, packageId: pkg.id, eventName: 'Temporary checkout verification', occasion: 'Others',
        date: clock.date, startTime: '09:00', endTime: null, guests: 0, serviceType: 'Equipment rental', fulfilment: 'pickup',
        menu: null, foodNotes: '', styling: null, pricePerPlate: 0, minDownpayment: 0,
        venue: { name: 'QA', address: 'QA', city: 'QA', accessNotes: '' }, status: 'confirmed', estimate: {}, quotation: null,
        downpaymentDue: null, notes: '', declineReason: '', cancelReason: '', createdAt: Date.now() + sequence++, ...changes };
      await reservations.insertReservation(conn, r);
      await reservations.insertRentalLines(conn, ref, rentalItems);
      return { ref, rentalItems, id: rentalItems[0].itemId };
    }
    const automatic = (ref, at = clock) => checkOutRental(ref, actor, { automatic: true, clock: at, transact });
    const read = async (id) => (await repo.findItems(conn, { ids: [id] })).items[0];

    await t.test('pickup deducts available, writes ledger and signs both audit trails', async () => {
      const f = await fixture();
      assert.deepEqual(await automatic(f.ref), { lines: 1, changed: true });
      const current = await read(f.id);
      assert.equal(availableOf(current), 50);
      assert.equal(current.allocations[f.ref], 10);
      assert.equal(current.history[0].actor, actor.name);
      assert.equal((await repo.rentalDispatches(conn, f.ref))[f.id], 10);
      const [booking] = await reservations.findReservations(conn, { ref: f.ref });
      assert.equal(booking.reservation.activity.length, 1);
      assert.equal(booking.reservation.activity[0].actor, actor.name);
      assert.deepEqual(await automatic(f.ref), { lines: 0, changed: false });
      assert.equal((await read(f.id)).history.length, 1);
    });
    await t.test('delivery checks out at its scheduled time, never early', async () => {
      const f = await fixture({ fulfilment: 'delivery', startTime: '09:30' });
      assert.equal((await automatic(f.ref)).lines, 0);
      assert.equal(availableOf(await read(f.id)), 60);
      assert.equal((await automatic(f.ref, { ...clock, time: '09:30' })).lines, 1);
    });
    await t.test('pending, approved, cancelled, completed and rescheduled rentals remain untouched', async () => {
      for (const changes of [{ status: 'pending' }, { status: 'approved' }, { status: 'cancelled' }, { status: 'completed' }, { date: '2040-11-21' }]) {
        const f = await fixture(changes);
        assert.equal((await automatic(f.ref)).lines, 0);
        assert.equal(availableOf(await read(f.id)), 60);
      }
    });
    await t.test('partial manual dispatch is completed once and returned pieces never go out again', async () => {
      const f = await fixture();
      await repo.setAllocation(conn, f.id, f.ref, 4);
      await repo.insertHistory(conn, f.id, { at: Date.now(), actor: 'QA admin', ref: f.ref, text: `Checked out 4 pcs for ${f.ref}.` });
      assert.equal((await automatic(f.ref)).lines, 1);
      assert.equal((await read(f.id)).allocations[f.ref], 10);
      await returnRental(f.ref, [{ itemId: f.id, good: 10, damaged: 0 }], { name: 'QA admin' }, { transact });
      assert.equal(availableOf(await read(f.id)), 60);
      assert.equal((await repo.rentalDispatches(conn, f.ref))[f.id], 10);
      assert.equal((await automatic(f.ref)).changed, false);
      await assert.rejects(checkOutRental(f.ref, { name: 'QA admin' }, { transact }), { code: 'INVALID_STATE' });
    });
    await t.test('legacy returned rentals without ledger rows are not re-dispatched', async () => {
      const f = await fixture();
      await repo.insertHistory(conn, f.id, { at: Date.now(), actor: 'QA admin', ref: f.ref, text: `Checked out 10 pcs for ${f.ref}.` });
      await repo.insertHistory(conn, f.id, { at: Date.now(), actor: 'QA admin', ref: f.ref, text: `Returned 10 pcs from ${f.ref}.` });
      assert.equal((await automatic(f.ref)).changed, false);
      assert.equal(availableOf(await read(f.id)), 60);
    });
    await t.test('shortage refuses all items, deduplicates warnings and retries after stock is restored', async () => {
      const f = await fixture({}, [60, 5]);
      const first = await automatic(f.ref);
      assert.equal(first.problem, 'OUT_OF_STOCK'); assert.equal(first.changed, true);
      assert.equal(availableOf(await read(f.id)), 60);
      assert.equal(Object.keys(await repo.rentalDispatches(conn, f.ref)).length, 0);
      assert.equal((await automatic(f.ref)).changed, false);
      const [booking] = await reservations.findReservations(conn, { ref: f.ref });
      assert.equal(booking.reservation.activity.length, 1);
      await repo.updateItem(conn, f.rentalItems[1].itemId, { total: 60 });
      assert.equal((await automatic(f.ref)).lines, 2);
      assert.equal(availableOf(await read(f.id)), 50);
    });
    await t.test('manual checkout uses the same ledger and prevents automatic duplication', async () => {
      const f = await fixture();
      assert.equal((await checkOutRental(f.ref, { name: 'QA admin' }, { transact })).lines, 1);
      assert.equal((await automatic(f.ref)).changed, false);
      assert.equal((await read(f.id)).history[0].actor, 'QA admin');
    });
    await t.test('new quantities dispatch only their extra pieces', async () => {
      const f = await fixture();
      await automatic(f.ref);
      await conn.query('UPDATE reservation_rental_items SET qty = 15 WHERE reservation_ref = ?', [f.ref]);
      assert.equal((await automatic(f.ref)).lines, 1);
      assert.equal((await read(f.id)).allocations[f.ref], 15);
      assert.equal((await repo.rentalDispatches(conn, f.ref))[f.id], 15);
    });
    await t.test('date-based SQL availability counts checked-out and no-event stock once', async () => {
      const f = await fixture();
      await automatic(f.ref);
      await repo.setAllocation(conn, f.id, 'none', 3);
      const { rentalStock } = await import('@tm/shared/src/domain/reservation.js');
      const inputs = await reservations.rentalStockInputs(conn, clock.date);
      assert.equal(rentalStock(inputs, clock.date)[f.id], 47);
      assert.equal(rentalStock(inputs, clock.date, f.ref)[f.id], 57);
    });
    await conn.rollback(); // discard every preceding fixture before the concurrency scenario
    await t.test('two independent workers commit one checkout; a later worker cannot re-dispatch returned stock', async () => {
      await conn.beginTransaction();
      const f = await fixture();
      await conn.commit(); // only this synthetic future-dated fixture is visible to the two connections
      try {
        const results = await Promise.all([
          checkOutRental(f.ref, actor, { automatic: true, clock }),
          checkOutRental(f.ref, actor, { automatic: true, clock })
        ]);
        assert.deepEqual(results.map((r) => r.lines).sort(), [0, 1]);
        assert.equal(availableOf(await read(f.id)), 50);
        assert.equal((await read(f.id)).history.length, 1);
        await returnRental(f.ref, [{ itemId: f.id, good: 10, damaged: 0 }], { name: 'QA admin' });
        assert.equal((await checkOutRental(f.ref, actor, { automatic: true, clock })).changed, false);
        assert.equal(availableOf(await read(f.id)), 60);
      } finally {
        // Remove only the exact UUID fixture created above, with foreign keys still enforced.
        assert.match(f.ref, /^RES-QA-AUTO-[a-f0-9]{8}$/);
        await conn.beginTransaction();
        for (const table of ['inventory_allocations', 'rental_dispatches', 'reservation_rental_items', 'reservation_activity']) {
          await conn.query('DELETE FROM ?? WHERE reservation_ref = ?', [table, f.ref]);
        }
        await conn.query('DELETE FROM inventory_history WHERE item_id = ?', [f.id]);
        await conn.query('DELETE FROM reservations WHERE ref = ?', [f.ref]);
        await conn.query('DELETE FROM inventory_items WHERE id = ?', [f.id]);
        await conn.commit();
      }
    });
  } finally {
    await conn.rollback();
    conn.release();
  }
});
