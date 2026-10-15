import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { BANK_DETAILS_LIMITS, bankDetailsProblem, cleanBankDetails } from '@tm/shared/src/domain/payment.js';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { signToken } from '../src/lib/tokens.js';

const details = { bankName: 'Test Bank', bankAccountName: 'Test Catering', bankAccountNumber: '0012 3456-7890' };

test('bank details require all fields, bounded text and a string account number', () => {
  assert.equal(bankDetailsProblem(details), null);
  assert.equal(cleanBankDetails({ ...details, bankName: '  Test   Bank  ' }).bankName, 'Test Bank');
  assert.equal(cleanBankDetails(details).bankAccountNumber, '0012 3456-7890');
  for (const field of Object.keys(BANK_DETAILS_LIMITS)) {
    for (const value of [undefined, null, ' \t ', 123, {}, []])
      assert.equal(bankDetailsProblem({ ...details, [field]: value }).field, field);
    const atLimit = field === 'bankAccountNumber' ? '1' : 'a';
    assert.equal(bankDetailsProblem({ ...details, [field]: atLimit.repeat(BANK_DETAILS_LIMITS[field]) }), null);
    assert.equal(
      bankDetailsProblem({ ...details, [field]: atLimit.repeat(BANK_DETAILS_LIMITS[field] + 1) }).field,
      field
    );
  }
  assert.equal(bankDetailsProblem({ ...details, bankAccountNumber: '1234abc' }).field, 'bankAccountNumber');
});

test('only admins can save; customers read the saved bank details and rejected changes keep the previous values', async (t) => {
  let stored = { ...details };
  let writes = 0;
  let stamps = 0;
  t.mock.method(pool, 'query', async (sql, values) => {
    if (sql.includes('FROM admins WHERE'))
      return [[{ name: 'Test Admin', password_changed_at: 0, session_id: 'test-session' }]];
    if (sql.includes('FROM customers WHERE')) return [[{ name: 'Test Customer', password_changed_at: 0 }]];
    if (sql.startsWith('SELECT bank_name'))
      return [
        [
          {
            bank_name: stored.bankName,
            bank_account_name: stored.bankAccountName,
            bank_account_number: stored.bankAccountNumber
          }
        ]
      ];
    if (sql.startsWith('UPDATE catalog_settings')) {
      stored = { bankName: values[0], bankAccountName: values[1], bankAccountNumber: values[2] };
      writes++;
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO counters')) {
      stamps++;
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const tokens = Object.fromEntries(
    ['admin', 'customer'].map((role) => [
      role,
      signToken(
        {
          id: `test-${role}`,
          role,
          name: role,
          passwordChangedAt: 0,
          sessionId: role === 'admin' ? 'test-session' : undefined
        },
        { expiresAt: Math.floor(Date.now() / 1000) + 3600 }
      )
    ])
  );
  const request = async (path, role, body) => {
    const response = await fetch(`${base}${path}`, {
      method: body ? 'PUT' : 'GET',
      headers: { ...(role ? { Authorization: `Bearer ${tokens[role]}` } : {}), 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
  };
  assert.equal((await request('/payments/bank-details')).status, 401);
  assert.equal((await request('/admin/payments/bank-details', null, details)).status, 401);
  assert.equal((await request('/admin/payments/bank-details', 'customer', details)).status, 403);
  assert.equal((await request('/payments/bank-details', 'customer', details)).status, 404);
  assert.equal(writes, 0);
  const before = await request('/admin/payments/bank-details', 'admin');
  assert.deepEqual(before.body, details);
  assert.match(before.cache, /no-store/);
  const next = { bankName: '  Updated Bank  ', bankAccountName: 'New Account', bankAccountNumber: '0000-1234-5678' };
  const saved = await request('/admin/payments/bank-details', 'admin', next);
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body, cleanBankDetails(next));
  const customer = await request('/payments/bank-details', 'customer');
  assert.equal(customer.status, 200);
  assert.deepEqual(customer.body, saved.body);
  assert.match(customer.cache, /no-store/);
  const invalid = await request('/admin/payments/bank-details', 'admin', { ...details, bankAccountNumber: 1234 });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.meta.field, 'bankAccountNumber');
  assert.deepEqual((await request('/payments/bank-details', 'customer')).body, saved.body);
  assert.equal(writes, 1);
  assert.equal(stamps, 1);
});
