import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config } from '../src/config.js';
import { pool, closePool } from '../src/db.js';
import { createReservation, sendQuotation, updateLogistics } from '../src/modules/reservations/reservations.service.js';
import { setSixHourFee, getSixHourFee } from '../src/modules/catalog/catalog.service.js';
import * as repo from '../src/modules/reservations/reservations.repo.js';
import { quotationStaleReason } from '@tm/shared/src/domain/reservation.js';

test('duration pricing persists through bookings, setting changes and revised quotations; fixtures roll back', async (t) => {
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(config.db.host) && config.env !== 'production');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    conn.afterCommit = () => {}; // No delivery hooks run for rolled-back fixtures.
    t.mock.method(pool, 'query', (...args) => conn.query(...args));
    const id = `qa-${randomUUID()}`;
    await conn.query(
      'INSERT INTO customers (id, first_name, last_name, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, 'Duration', 'QA', 'Duration QA', `${id}@example.invalid`, 'test-only-disabled-hash', Date.now()]
    );
    const [[pkg]] = await conn.query(
      "SELECT id, price, guests FROM packages WHERE kind = 'package' AND visible = 1 AND archived = 0 ORDER BY sort_order LIMIT 1"
    );
    assert.ok(pkg, 'A bookable package is available');
    const admin = { name: 'Duration QA Admin' };
    const form = {
      packageId: pkg.id,
      eventName: 'QA duration booking',
      occasion: 'Birthday',
      date: '2090-06-20',
      startTime: '12:00',
      guests: pkg.guests,
      serviceType: 'Catering only',
      agreeTerms: true,
      venueName: 'QA venue',
      venueAddress: 'QA street',
      city: 'Malvar',
      addonIds: [],
      menu: {}
    };
    const transact = (fn) => fn(conn);
    const read = async (ref) => (await repo.findReservations(conn, { ref }))[0].reservation;
    let sixHours;
    let latest;
    await t.test('2–5.5 hours are free of duration charges and exactly 6 hours adds 5000 server-side', async () => {
      await setSixHourFee(5000);
      for (const endTime of ['14:00', '15:00', '16:00', '17:00', '17:30', '18:00']) {
        const created = await createReservation(
          { id, name: 'Duration QA' },
          { ...form, endTime, sixHourFee: 0, durationCharge: 0 },
          { transact }
        );
        const saved = await read(created.ref);
        assert.equal(saved.estimate.sixHourFee, 5000);
        assert.equal(saved.estimate.durationCharge, endTime === '18:00' ? 5000 : 0);
        assert.equal(saved.estimate.net, pkg.price + saved.estimate.durationCharge);
        if (endTime === '18:00') sixHours = saved;
      }
    });
    await t.test('admin rates of 10000, 15000 and 50000 persist; older reservations keep 5000', async () => {
      for (const amount of [10000, 15000, 50000]) {
        await setSixHourFee(amount);
        assert.equal((await getSixHourFee()).sixHourFee, amount);
        latest = await createReservation({ id, name: 'Duration QA' }, { ...form, endTime: '18:00' }, { transact });
        assert.equal((await read(latest.ref)).estimate.durationCharge, amount);
      }
      assert.equal((await read(sixHours.ref)).estimate.durationCharge, 5000);
      await assert.rejects(conn.query('UPDATE catalog_settings SET six_hour_fee = 50001 WHERE id = 1'));
      assert.equal((await getSixHourFee()).sixHourFee, 50000);
    });
    await t.test('individual quotation override is capped at 50000 and saved in the total', async () => {
      const quoted = await sendQuotation(sixHours.ref, { sixHourFee: 15000 }, admin, { transact });
      assert.equal(quoted.quotation.sixHourFee, 15000);
      assert.equal(quoted.quotation.durationCharge, 15000);
      assert.equal(quoted.quotation.net, pkg.price + 15000);
      for (const amount of [50001, 100000, -1, 1.5, '1e4'])
        await assert.rejects(
          sendQuotation(sixHours.ref, { sixHourFee: amount }, admin, { transact }),
          (error) => error.code === 'INVALID' && error.meta.field === 'sixHourFee'
        );
      assert.equal((await read(sixHours.ref)).quotation.durationCharge, 15000);
    });
    const logistics = (endTime) => ({ ...form, endTime });
    await t.test('moving a quoted event below six hours requires revision and then removes the charge', async () => {
      await updateLogistics(sixHours.ref, logistics('17:00'), admin, { transact });
      assert.match(quotationStaleReason(await read(sixHours.ref)), /duration/);
      const revised = await sendQuotation(sixHours.ref, {}, admin, { transact });
      assert.equal(revised.quotation.durationCharge, 0);
      assert.equal(revised.quotation.sixHourFee, 15000);
      assert.equal(revised.quotation.net, pkg.price);
      await updateLogistics(sixHours.ref, logistics('18:00'), admin, { transact });
      assert.match(quotationStaleReason(await read(sixHours.ref)), /duration/);
      const waived = await sendQuotation(sixHours.ref, { sixHourFee: 0 }, admin, { transact });
      assert.equal(waived.quotation.durationCharge, 0);
      assert.equal(waived.quotation.net, pkg.price);
    });
    await t.test('duration changes refresh an unquoted estimate using its saved rate', async () => {
      await updateLogistics(latest.ref, logistics('17:00'), admin, { transact });
      assert.equal((await read(latest.ref)).estimate.durationCharge, 0);
      assert.equal((await read(latest.ref)).estimate.net, pkg.price);
      await setSixHourFee(10000);
      await updateLogistics(latest.ref, logistics('18:00'), admin, { transact });
      assert.equal((await read(latest.ref)).estimate.durationCharge, 50000);
      assert.equal((await read(latest.ref)).estimate.net, pkg.price + 50000);
    });
  } finally {
    t.mock.restoreAll();
    await conn.rollback();
    delete conn.afterCommit;
    conn.release();
    await closePool();
  }
});
