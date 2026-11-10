import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCustomerAbuseGuard, createCustomerWriteGuard } from '../src/middleware/customerAbuse.js';

test('signup budget combines normal and Google requests by network', async () => {
  const calls = [];
  const guard = createCustomerAbuseGuard(async (...args) => calls.push(args));
  for (const path of ['/auth/customer/register', '/auth/customer/google'])
    await guard({ method: 'POST', path, ip: '192.0.2.1' }, {}, () => {});
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[0][0], 'signup-network');
  assert.equal(calls[0][2], 20);
});

test('customer write limits cover booking and messages without limiting reads or staff', async () => {
  const calls = [];
  const guard = createCustomerWriteGuard(async (...args) => calls.push(args));
  const request = { method: 'POST', user: { role: 'customer', id: 'cus-one' } };
  await guard({ ...request, baseUrl: '/api/reservations', path: '/' }, {}, () => {});
  await guard({ ...request, baseUrl: '/api/threads', path: '/thread-one/messages' }, {}, () => {});
  await guard({ ...request, method: 'GET', baseUrl: '/api/reservations', path: '/' }, {}, () => {});
  await guard({ ...request, user: { role: 'admin' }, baseUrl: '/api/reservations', path: '/' }, {}, () => {});
  assert.deepEqual(calls, [
    ['booking-submit', 'cus-one', 5, 3600000],
    ['message-submit', 'cus-one', 20, 60000]
  ]);
});

test('exhausted action budget rejects request before handler runs', async () => {
  const guard = createCustomerWriteGuard(async () => {
    throw new Error('budget exhausted');
  });
  let continued = false;
  await assert.rejects(
    guard(
      { method: 'POST', user: { role: 'customer', id: 'cus-one' }, baseUrl: '/api/reservations', path: '/' },
      {},
      () => {
        continued = true;
      }
    ),
    /budget exhausted/
  );
  assert.equal(continued, false);
});
