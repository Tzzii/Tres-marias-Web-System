import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config } from '../src/config.js';
import { pool, closePool } from '../src/db.js';
import { removeCustomerAccess } from '../src/modules/customers/customers.service.js';
import { createReservation } from '../src/modules/reservations/reservations.service.js';

test('a booking waiting on account removal observes the committed removal', async () => {
  assert.equal(config.isProduction, false);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(config.db.host));
  const id = `race-${randomUUID().slice(0, 20)}`;
  const removalConn = await pool.getConnection();
  const bookingConn = await pool.getConnection();
  let releaseRemoval;
  let signalReady;
  let booking;
  let removal;
  const ready = new Promise((resolve) => {
    signalReady = resolve;
  });
  const release = new Promise((resolve) => {
    releaseRemoval = resolve;
  });
  try {
    await pool.query('INSERT INTO customers (id, name, email, created_at) VALUES (?, ?, ?, ?)', [
      id,
      'Race QA',
      `${id}@example.invalid`,
      Date.now()
    ]);
    removal = removeCustomerAccess(
      id,
      { reason: 'Concurrency fixture' },
      { role: 'admin', id: 'qa-race-admin' },
      {
        transact: async (fn) => {
          await removalConn.beginTransaction();
          const result = await fn(removalConn);
          signalReady();
          await release;
          await removalConn.commit();
          return result;
        }
      }
    );
    await Promise.race([
      ready,
      removal.then(() => {
        throw new Error('Removal committed before the booking started');
      })
    ]);
    let queried = false;
    let settled = false;
    booking = createReservation(
      { id, name: 'Race QA' },
      {},
      {
        transact: async (fn) => {
          await bookingConn.beginTransaction();
          return fn({
            query: async (...args) => {
              queried = true;
              const rows = await bookingConn.query(...args);
              settled = true;
              return rows;
            }
          });
        }
      }
    );
    const rejected = assert.rejects(booking, { code: 'UNAUTHENTICATED' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(queried, true);
    assert.equal(settled, false, 'The customer lock holds the booking until removal commits');
    releaseRemoval();
    await removal;
    await rejected;
    const [[count]] = await pool.query('SELECT COUNT(*) AS total FROM reservations WHERE customer_id = ?', [id]);
    assert.equal(count.total, 0);
  } finally {
    releaseRemoval();
    await Promise.allSettled([removal, booking]);
    await removalConn.rollback();
    await bookingConn.rollback();
    removalConn.release();
    bookingConn.release();
    await pool.query('DELETE FROM customers WHERE id = ?', [id]);
    await closePool();
  }
});
