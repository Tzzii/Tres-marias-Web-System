import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { config } from '../src/config.js';
import { pool, closePool } from '../src/db.js';
import { hashSecret } from '../src/lib/passwords.js';
import { signToken } from '../src/lib/tokens.js';
import { requireAuth, requireRole, readSessionToken } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/errors.js';
import { customerAdminRoutes } from '../src/modules/customers/customers.routes.js';
import { getCustomer, updateCustomerContact } from '../src/modules/customers/customers.service.js';
import { createReservation } from '../src/modules/reservations/reservations.service.js';
import { customerLogin, customerSession, startPasswordReset, startSignUp } from '../src/modules/auth/auth.service.js';
import { findCustomerById } from '../src/modules/auth/auth.repo.js';

test('admin removal preserves bookings, revokes access and recovery, and is safe to retry', async (t) => {
  assert.equal(config.isProduction, false);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(config.db.host));
  const conn = await pool.getConnection();
  let server;
  try {
    await conn.beginTransaction();
    conn.afterCommit = () => {};
    // Keep all route and service fixtures inside this rolled-back transaction.
    t.mock.method(pool, 'query', (...args) => conn.query(...args));
    t.mock.method(pool, 'getConnection', async () => ({
      query: (...args) => conn.query(...args),
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release() {}
    }));
    const id = `qa-${randomUUID().slice(0, 20)}`;
    const adminId = `${id}-admin`;
    const email = `${id}@example.invalid`;
    const password = 'CustomerFixture123!';
    await conn.query(
      'INSERT INTO admins (id, name, email, password_hash, created_at, session_id) VALUES (?, ?, ?, ?, ?, ?)',
      [adminId, 'QA Admin', `${adminId}@example.invalid`, 'disabled', Date.now(), 'qa-session']
    );
    await conn.query('INSERT INTO customers (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)', [
      id,
      'QA Customer',
      email,
      await hashSecret(password),
      Date.now()
    ]);
    const [[pkg]] = await conn.query(
      "SELECT id, guests FROM packages WHERE kind = 'package' AND visible = 1 AND archived = 0 LIMIT 1"
    );
    assert.ok(pkg, 'Local database has a bookable package');
    const form = {
      packageId: pkg.id,
      eventName: 'QA removal',
      occasion: 'Birthday',
      date: '2091-06-20',
      startTime: '12:00',
      endTime: '16:00',
      guests: pkg.guests,
      serviceType: 'Catering only',
      agreeTerms: true,
      venueName: 'QA',
      venueAddress: 'QA',
      city: 'Malvar',
      addonIds: [],
      menu: {}
    };
    const customer = { id, name: 'QA Customer' };
    const booking = await createReservation(customer, form, { transact: (fn) => fn(conn) });
    const paid = await createReservation(customer, { ...form, date: '2091-06-21' }, { transact: (fn) => fn(conn) });
    await conn.query("UPDATE reservations SET status = 'downpayment_paid' WHERE ref = ?", [paid.ref]);
    await conn.query(
      "INSERT INTO payments (id, ref, customer_id, amount, kind, method, status, submitted_at, verified_at, reject_reason) VALUES (?, ?, ?, 1000, 'downpayment', 'cash', 'verified', ?, ?, '')",
      [id, paid.ref, id, Date.now(), Date.now()]
    );
    const before = await getCustomer(id);
    const customerToken = customerSession(await findCustomerById(id)).token;
    const adminToken = signToken({ id: adminId, role: 'admin', sessionId: 'qa-session' }, { ttl: 3600 });
    await conn.query(
      'INSERT INTO password_resets (id, customer_id, code_hash, expires_at, resend_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, id, 'disabled', Date.now() + 60000, Date.now(), Date.now()]
    );

    const app = express();
    app.use(express.json());
    app.use('/customers', requireAuth, requireRole('admin'), customerAdminRoutes);
    app.use(errorHandler);
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/customers/${id}/remove-access`;
    const request = async (token, reason = 'Repeated spam requests') => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ reason })
      });
      return { status: response.status, body: await response.json() };
    };
    assert.equal((await request(null)).status, 401);
    assert.equal((await request(customerToken)).status, 403);
    assert.equal((await request(adminToken, '   ')).status, 400);
    assert.equal((await request(adminToken, 'x'.repeat(1001))).status, 400);
    const removed = await request(adminToken);
    assert.equal(removed.status, 200);
    assert.equal(removed.body.removedBy, adminId);
    assert.ok(removed.body.removedAt);
    const retry = await request(adminToken, 'Second reason');
    assert.deepEqual(retry, removed);
    assert.equal((await readSessionToken(customerToken)).user, null);
    await assert.rejects(customerLogin({ email, password }), { code: 'FORBIDDEN' });
    await assert.rejects(startPasswordReset({ email }), { code: 'FORBIDDEN' });
    await assert.rejects(
      startSignUp({ firstName: 'QA', lastName: 'Customer', email, mobile: '09171234567', password, agreeTerms: true }),
      { code: 'EMAIL_TAKEN' }
    );
    await assert.rejects(updateCustomerContact(id, { email: `new-${email}`, mobile: '09171234567' }), {
      code: 'INVALID_STATE'
    });
    await assert.rejects(createReservation(customer, form, { transact: (fn) => fn(conn) }), {
      code: 'UNAUTHENTICATED'
    });
    const after = await getCustomer(id);
    assert.deepEqual(after.reservations, before.reservations);
    assert.ok(after.reservations.some((r) => r.ref === booking.ref && r.status === 'pending'));
    assert.ok(after.reservations.some((r) => r.ref === paid.ref && r.status === 'downpayment_paid' && r.paid === 1000));
    const [[reset]] = await conn.query('SELECT used_at FROM password_resets WHERE id = ?', [id]);
    assert.ok(reset.used_at);
    const otherId = `${id}-other`;
    const otherEmail = `other-${email}`;
    await conn.query(
      'INSERT INTO customers (id, name, email, password_hash, created_at) SELECT ?, name, ?, password_hash, created_at FROM customers WHERE id = ?',
      [otherId, otherEmail, id]
    );
    const unaffected = await customerLogin({ email: otherEmail, password });
    assert.equal(unaffected.status, 'code_required');
    const nextBooking = await createReservation(
      { id: otherId, name: 'QA Customer' },
      { ...form, date: '2091-06-22' },
      { transact: (fn) => fn(conn) }
    );
    assert.equal(nextBooking.status, 'pending');
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    t.mock.restoreAll();
    await conn.rollback();
    conn.release();
    await closePool();
  }
});
