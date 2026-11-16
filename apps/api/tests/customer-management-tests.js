import test from 'node:test';
import assert from 'node:assert/strict';
import { customerSession } from '../src/modules/auth/auth.service.js';
import { removalBody } from '../src/modules/customers/customers.schemas.js';
import { removeCustomerAccess } from '../src/modules/customers/customers.service.js';
import { createReservation } from '../src/modules/reservations/reservations.service.js';

test('removal requires admin authority and a bounded nonempty reason before opening a transaction', async () => {
  const transact = () => {
    throw new Error('Transaction must not start');
  };
  for (const user of [null, { id: 'customer', role: 'customer' }, { role: 'admin' }]) {
    await assert.rejects(removeCustomerAccess('customer', { reason: 'Spam' }, user, { transact }), {
      code: 'FORBIDDEN'
    });
  }
  for (const reason of ['', '   ', 'x'.repeat(1001), 42]) {
    assert.equal(removalBody.safeParse({ reason }).success, false);
    await assert.rejects(removeCustomerAccess('customer', { reason }, { id: 'admin', role: 'admin' }, { transact }), {
      code: 'INVALID'
    });
  }
  assert.equal(removalBody.parse({ reason: ' Spam ' }).reason, 'Spam');
});

test('a removed customer cannot receive a session', () => {
  assert.throws(() => customerSession({ id: 'customer', removedAt: 123 }), { code: 'FORBIDDEN' });
});

test('booking rechecks the account before taking availability locks or writing anything', async () => {
  const queries = [];
  const transact = (fn) =>
    fn({
      query: async (sql) => {
        queries.push(sql);
        return [[{ id: 'customer', removed_at: 123 }]];
      }
    });
  await assert.rejects(createReservation({ id: 'customer' }, {}, { transact }), { code: 'UNAUTHENTICATED' });
  assert.equal(queries.length, 1);
  assert.match(queries[0], /customers.*FOR UPDATE/);
});
