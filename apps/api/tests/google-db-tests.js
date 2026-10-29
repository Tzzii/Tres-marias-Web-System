import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { config } from '../src/config.js';
import { pool, closePool, tx } from '../src/db.js';
import { insertCustomer } from '../src/modules/auth/auth.repo.js';
import { findGoogleCustomer, linkGoogle } from '../src/modules/auth/google.repo.js';
import * as googleRepo from '../src/modules/auth/google.repo.js';
import { createGoogleSignInCodeService } from '../src/modules/auth/google-code.service.js';

after(closePool);

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
  }
});

test('Google sign-in SQL consumes codes once under concurrent verification and cascades on deletion', async () => {
  assert.equal(config.isProduction, false);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(config.db.host));
  const id = `google-code-${randomUUID().slice(0, 12)}`;
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
    createdAt: Date.now(),
    passwordChangedAt: null
  };
  const mails = [];
  let sessions = 0;
  const codes = createGoogleSignInCodeService({
    sendCode: async (user, code) => mails.push({ to: user.email, code }),
    session: (user, remember) => {
      sessions++;
      return { token: 'verified', user, remember };
    },
    assertNotLocked: async () => {},
    reserveAttempt: async () => ({ remaining: 2 }),
    clearAttempts: async () => {}
  });
  try {
    await tx(async (conn) => {
      await insertCustomer(customer, conn);
      await linkGoogle(id, id, conn);
    });
    const challenge = await codes.start(customer, true, id);
    const stored = await googleRepo.findSignInChallenge(challenge.challengeId);
    assert.equal(stored.remember, true);
    assert.equal(stored.passwordChangedAt, null);
    assert.equal(stored.googleSubject, id);
    assert.notEqual(stored.codeHash, mails[0].code);
    const results = await Promise.allSettled([
      codes.verify({ challengeId: challenge.challengeId, code: mails[0].code }),
      codes.verify({ challengeId: challenge.challengeId, code: mails[0].code })
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.find((result) => result.status === 'fulfilled').value.remember, true);
    assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'CHALLENGE_EXPIRED');
    assert.equal(sessions, 1);
    const pending = await codes.start(customer, false, id);
    await pool.query('UPDATE customer_google_signins SET resend_at = 0 WHERE id = ?', [pending.challengeId]);
    await codes.resend(pending.challengeId);
    assert.equal(mails.length, 3);
    const resent = await googleRepo.findSignInChallenge(pending.challengeId);
    assert.notEqual(resent.codeHash, stored.codeHash);
    await pool.query('DELETE FROM customers WHERE id = ?', [id]);
    assert.equal(await googleRepo.findSignInChallenge(pending.challengeId), undefined);
  } finally {
    await pool.query('DELETE FROM customers WHERE id = ?', [id]);
  }
});
