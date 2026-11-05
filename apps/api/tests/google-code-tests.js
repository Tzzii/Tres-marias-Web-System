import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RULES } from '@tm/shared/src/services/config.js';
import { ApiError } from '../src/lib/ApiError.js';
import { hashSecret, checkSecret } from '../src/lib/passwords.js';
import { createGoogleSignInCodeService } from '../src/modules/auth/google-code.service.js';

const initialCustomer = { id: 'customer-1', name: 'Maria Santos', email: 'maria@gmail.com', passwordChangedAt: null };

function setup() {
  let at = 1000000;
  let counter = 0;
  let nextCode = '123456';
  let customer = { ...initialCustomer };
  let subject = 'google-1';
  let deliveryFails = false;
  const requests = new Map();
  const mails = [];
  const locks = new Set();
  const failures = new Map();
  const sessions = [];
  let beforeTransaction = () => {};
  const repo = {
    insertSignInChallenge: async (request) => requests.set(request.id, { ...request, usedAt: null }),
    findSignInChallenge: async (id) => (requests.has(id) ? { ...requests.get(id) } : null),
    findSignInChallengeForUpdate: async (id) => repo.findSignInChallenge(id),
    deleteSignInChallenge: async (id) => requests.delete(id),
    replaceSignInCode: async (id, code) => Object.assign(requests.get(id), code),
    setSignInResendAt: async (id, resendAt, codeHash) => {
      if (requests.get(id)?.codeHash === codeHash) requests.get(id).resendAt = resendAt;
    },
    markSignInUsed: async (conn, id, usedAt) => {
      if (requests.get(id)?.usedAt) return false;
      requests.get(id).usedAt = usedAt;
      return true;
    },
    findGoogleCustomer: async (sub) => (sub === subject && customer ? { ...customer } : undefined),
    findCustomerForUpdate: async () => (customer ? { ...customer } : undefined)
  };
  const service = createGoogleSignInCodeService({
    repo,
    transaction: async (run) => {
      beforeTransaction();
      return run({});
    },
    session: (user, remember) => {
      const session = { token: 'application-session', user, remember };
      sessions.push(session);
      return session;
    },
    sendCode: async (user, code, id) => {
      if (deliveryFails) throw new ApiError('DELIVERY_FAILED', 'Email unavailable');
      mails.push({ to: user.email, code, id });
    },
    hashSecret,
    checkSecret,
    newCode: () => nextCode,
    newId: () => `signin-${++counter}`,
    now: () => at,
    assertNotLocked: async (scope, identifier) => {
      if (locks.has(`${scope}:${identifier}`)) throw new ApiError('LOCKED', 'Locked');
    },
    reserveAttempt: async (scope, identifier) => {
      const key = `${scope}:${identifier}`;
      if (locks.has(key)) throw new ApiError('LOCKED', 'Locked');
      const count = (failures.get(key) || 0) + 1;
      failures.set(key, count);
      return { remaining: RULES.maxCodeAttempts - count };
    },
    clearAttempts: async (scope, identifier) => failures.delete(`${scope}:${identifier}`),
    wrongAnswer: (scope, attempt, error) => Object.assign(error, { meta: { remaining: attempt.remaining } })
  });
  return {
    service,
    requests,
    mails,
    sessions,
    locks,
    failures,
    start: (remember = false) => service.start(customer, remember, subject),
    advance: (ms) => {
      at += ms;
    },
    code: (code) => {
      nextCode = code;
    },
    changeCustomer: (values) => {
      customer = values === null ? null : { ...customer, ...values };
    },
    unlink: () => {
      subject = 'different-google-account';
    },
    failDelivery: () => {
      deliveryFails = true;
    },
    beforeTransaction: (run) => {
      beforeTransaction = run;
    }
  };
}

test('Google login emails a hashed code without issuing a session, then verifies once with server-held remember', async () => {
  const f = setup();
  const challenge = await f.start(true);
  assert.equal(challenge.token, undefined);
  assert.equal(challenge.code, undefined);
  assert.equal(challenge.codeHash, undefined);
  assert.equal(challenge.maskedEmail.includes('maria@'), false);
  assert.equal(f.sessions.length, 0);
  assert.equal(f.mails[0].to, 'maria@gmail.com');
  assert.equal(f.mails[0].code, '123456');
  assert.notEqual(f.requests.get(challenge.challengeId).codeHash, '123456');
  const result = await f.service.verify({ challengeId: challenge.challengeId, code: '123456', remember: false });
  assert.equal(result.user.id, 'customer-1');
  assert.equal(result.remember, true);
  await assert.rejects(f.service.verify({ challengeId: challenge.challengeId, code: '123456' }), {
    code: 'CHALLENGE_EXPIRED'
  });
  await assert.rejects(f.service.resend(challenge.challengeId), { code: 'CHALLENGE_EXPIRED' });
  assert.equal(f.sessions.length, 1);
});

test('incorrect Google code reports attempts and never signs in; correct retry clears failures', async () => {
  const f = setup();
  const { challengeId } = await f.start();
  await assert.rejects(f.service.verify({ challengeId, code: '000000' }), (error) => {
    assert.equal(error.code, 'INVALID_CODE');
    assert.equal(error.meta.remaining, RULES.maxCodeAttempts - 1);
    return true;
  });
  assert.equal(f.sessions.length, 0);
  await f.service.verify({ challengeId, code: '123456' });
  assert.equal(f.failures.has('google-code:maria@gmail.com'), false);
});

test('expired Google codes can be resent after cooldown and the old code becomes invalid', async () => {
  const f = setup();
  const { challengeId } = await f.start();
  await assert.rejects(f.service.resend(challengeId), { code: 'TOO_SOON' });
  f.advance(RULES.codeValidMinutes * 60000 + 1);
  await assert.rejects(f.service.verify({ challengeId, code: '123456' }), { code: 'CODE_EXPIRED' });
  f.code('654321');
  const resent = await f.service.resend(challengeId);
  assert.ok(resent.expiresAt > f.requests.get(challengeId).createdAt);
  assert.equal(f.mails[1].code, '654321');
  await assert.rejects(f.service.verify({ challengeId, code: '123456' }), { code: 'INVALID_CODE' });
  assert.equal((await f.service.verify({ challengeId, code: '654321' })).token, 'application-session');
});

test('unknown and thirty-minute-old Google requests cannot verify or resend', async () => {
  const f = setup();
  const { challengeId } = await f.start();
  f.advance(30 * 60000 + 1);
  for (const id of ['unknown', challengeId]) {
    await assert.rejects(f.service.verify({ challengeId: id, code: '123456' }), { code: 'CHALLENGE_EXPIRED' });
    await assert.rejects(f.service.resend(id), { code: 'CHALLENGE_EXPIRED' });
  }
  assert.equal(f.sessions.length, 0);
});

test('Google code challenges cannot outlive account changes or an unlinked Google identity', async () => {
  for (const change of [{ email: 'changed@example.com' }, { passwordChangedAt: 1000010 }, null, 'unlink']) {
    const f = setup();
    const { challengeId } = await f.start();
    if (change === 'unlink') f.unlink();
    else f.changeCustomer(change);
    await assert.rejects(f.service.verify({ challengeId, code: '123456' }), { code: 'CHALLENGE_EXPIRED' });
    f.advance(60000);
    await assert.rejects(f.service.resend(challengeId), { code: 'CHALLENGE_EXPIRED' });
    assert.equal(f.sessions.length, 0);
  }
});

test('customer locks and Google code locks cannot be bypassed by a valid code or resend', async () => {
  for (const scope of ['customer', 'google-code']) {
    const f = setup();
    const { challengeId } = await f.start();
    f.locks.add(`${scope}:maria@gmail.com`);
    await assert.rejects(f.service.verify({ challengeId, code: '123456' }), { code: 'LOCKED' });
    f.advance(60000);
    await assert.rejects(f.service.resend(challengeId), { code: 'LOCKED' });
    assert.equal(f.sessions.length, 0);
  }
});

test('mail failure removes an initial Google challenge and allows retrying a failed resend', async () => {
  const f = setup();
  const { challengeId } = await f.start();
  f.failDelivery();
  await assert.rejects(f.start(), { code: 'DELIVERY_FAILED' });
  assert.equal(f.requests.size, 1);
  f.advance(60000);
  await assert.rejects(f.service.resend(challengeId), { code: 'DELIVERY_FAILED' });
  assert.equal(f.requests.get(challengeId).resendAt, 1060000);
  assert.equal(f.sessions.length, 0);
});

test('Google verification rechecks a code replaced or consumed during verification', async () => {
  for (const change of ['replaced', 'consumed', 'expired', 'account']) {
    const f = setup();
    const { challengeId } = await f.start();
    f.beforeTransaction(() => {
      const request = f.requests.get(challengeId);
      if (change === 'replaced') request.codeHash = 'new-hash';
      if (change === 'consumed') request.usedAt = 1000001;
      if (change === 'expired') f.advance(31 * 60000);
      if (change === 'account') f.changeCustomer({ email: 'changed@example.com' });
    });
    await assert.rejects(f.service.verify({ challengeId, code: '123456' }), (error) => {
      assert.ok(['CHALLENGE_EXPIRED', 'CODE_EXPIRED'].includes(error.code));
      return true;
    });
    assert.equal(f.sessions.length, 0);
  }
});
