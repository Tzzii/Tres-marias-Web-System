import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { config } from '../src/config.js';
import { pool, closePool } from '../src/db.js';
import { insertCustomer } from '../src/modules/auth/auth.repo.js';
import { findGoogleCustomer, linkGoogle } from '../src/modules/auth/google.repo.js';

test('Google persistence preserves nullable passwords, unique identities and cascade cleanup in MySQL', async () => {
  assert.equal(config.isProduction, false, 'Only run this test against local development MySQL');
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(config.db.host));
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const id = `google-test-${randomUUID().slice(0, 12)}`;
    const customer = {
      id,
      firstName: 'Google',
      middleName: '',
      lastName: 'Fixture',
      name: 'Google Fixture',
      email: `${id}@example.test`,
      mobile: '09171234567',
      passwordHash: null,
      company: '',
      createdAt: Date.now()
    };
    await insertCustomer(customer, conn);
    await linkGoogle(id, id, conn);
    const saved = await findGoogleCustomer(id, conn);
    assert.equal(saved.id, id);
    assert.equal(saved.passwordHash, null);
    await assert.rejects(linkGoogle(`${id}-another`, id, conn), { code: 'ER_DUP_ENTRY' });
    await assert.rejects(linkGoogle(id, id, conn), { code: 'ER_DUP_ENTRY' });
    await conn.query('DELETE FROM customers WHERE id = ?', [id]);
    assert.equal(await findGoogleCustomer(id, conn), undefined);
  } finally {
    await conn.rollback();
    conn.release();
    await closePool();
  }
});
