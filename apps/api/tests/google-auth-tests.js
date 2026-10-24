import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TERMS_VERSION } from '@tm/shared/src/legal/terms.js';
import { createGoogleCustomerService } from '../src/modules/auth/google.service.js';
import { requireGoogleOrigin } from '../src/modules/auth/google.identity.js';
import { ApiError } from '../src/lib/ApiError.js';

const identity = {
  sub: 'google-1',
  email: 'maria@gmail.com',
  firstName: 'Maria',
  lastName: 'Santos',
  authoritativeEmail: true
};
const profile = {
  firstName: 'Maria',
  middleName: '',
  lastName: 'Santos',
  mobile: '09171234567',
  agreeTerms: true,
  termsVersion: TERMS_VERSION
};

function setup({ customers = [], identities = [], person = identity, locked = false } = {}) {
  let records = structuredClone(customers);
  let links = structuredClone(identities);
  let queued = 0;
  const cleared = [];
  const repo = {
    findGoogleCustomer: async (sub) => records.find((c) => c.id === links.find((g) => g.sub === sub)?.customerId),
    findCustomerByEmail: async (email) => records.find((c) => c.email === email),
    findCustomerForUpdate: async (id) => records.find((c) => c.id === id),
    insertCustomer: async (customer) => {
      records.push(customer);
    },
    linkGoogle: async (sub, customerId) => {
      if (links.some((g) => g.sub === sub || g.customerId === customerId))
        throw Object.assign(new Error('duplicate identity'), { code: 'ER_DUP_ENTRY' });
      links.push({ sub, customerId });
    }
  };
  const service = createGoogleCustomerService({
    verify: async () => person,
    repo,
    transaction: async (fn) => {
      const before = { records: structuredClone(records), links: structuredClone(links) };
      try {
        return await fn({});
      } catch (err) {
        records = before.records;
        links = before.links;
        throw err;
      }
    },
    session: (user, remember) => ({ token: 'session-token', user, remember }),
    checkPassword: async (plain, hash) => hash === `hash:${plain}`,
    assertNotLocked: async () => {
      if (locked) throw new ApiError('LOCKED', 'Locked');
    },
    reserveAttempt: async () => ({ remaining: 3 }),
    wrongAnswer: (scope, attempt, error) => error,
    clearAttempts: async (...args) => {
      cleared.push(args);
    },
    startEmailSignup: async () => {
      queued++;
      return { challengeId: 'email-request' };
    },
    newId: () => 'new-customer',
    now: () => 123456789
  });
  return { service, repo, records: () => records, links: () => links, queued: () => queued, cleared };
}

test('a new Google identity receives profile completion before any customer or session exists', async () => {
  const f = setup();
  const result = await f.service.signIn({});
  assert.equal(result.status, 'profile_required');
  assert.equal(result.profile.email, identity.email);
  assert.equal(result.token, undefined);
  assert.equal(f.records().length, 0);
  assert.equal(f.links().length, 0);
});

test('Google signup validates names, mobile and explicit current terms before creating accounts', async () => {
  for (const change of [
    { firstName: '' },
    { lastName: '' },
    { mobile: '' },
    { agreeTerms: false },
    { termsVersion: 'old-version' },
    { firstName: 'x'.repeat(61) }
  ]) {
    const f = setup();
    await assert.rejects(f.service.signIn({ profile: { ...profile, ...change } }), { code: 'INVALID' });
    assert.equal(f.records().length, 0);
  }
  const f = setup();
  const result = await f.service.signIn({ profile: { ...profile, email: 'attacker@example.com' }, remember: true });
  assert.equal(result.user.email, identity.email);
  assert.equal(result.user.mobile, '09171234567');
  assert.equal(result.user.passwordHash, null);
  assert.equal(result.user.termsVersion, TERMS_VERSION);
  assert.equal(result.remember, true);
  assert.deepEqual(f.links(), [{ sub: identity.sub, customerId: 'new-customer' }]);
});

test('matching email requires the existing account password and preserves its ID and records', async () => {
  const existing = {
    id: 'existing-customer',
    email: identity.email,
    passwordHash: 'hash:correct',
    name: 'Existing Name'
  };
  const f = setup({ customers: [existing] });
  assert.equal((await f.service.signIn({})).status, 'link_required');
  assert.equal(f.links().length, 0);
  await assert.rejects(f.service.signIn({ password: 'incorrect' }), { code: 'INVALID_CREDENTIALS' });
  assert.equal(f.links().length, 0);
  const result = await f.service.signIn({ password: 'correct' });
  assert.equal(result.user.id, existing.id);
  assert.equal(result.user.name, existing.name);
  assert.equal(f.records().length, 1);
  assert.equal(f.links()[0].customerId, existing.id);
});

test('returning Google users are found by sub even after their application email changes', async () => {
  const customer = { id: 'existing', email: 'changed@example.com', name: 'Saved Name' };
  const f = setup({ customers: [customer], identities: [{ sub: identity.sub, customerId: customer.id }] });
  const result = await f.service.signIn({ profile: { ...profile, firstName: 'Overwrite' } });
  assert.equal(result.user.id, customer.id);
  assert.equal(result.user.email, 'changed@example.com');
  assert.equal(result.user.name, 'Saved Name');
  assert.deepEqual(
    f.cleared,
    [['customer', customer.email]],
    'successful Google login resets the account failure counter'
  );
});

test('locked accounts cannot link or sign in through Google', async () => {
  for (const identities of [[], [{ sub: identity.sub, customerId: 'existing' }]]) {
    const f = setup({
      customers: [{ id: 'existing', email: identity.email, passwordHash: 'hash:correct' }],
      identities,
      locked: true
    });
    await assert.rejects(f.service.signIn({ password: 'correct' }), { code: 'LOCKED' });
  }
});

test('a conflicting Google identity rolls back registration without creating a duplicate customer', async () => {
  const f = setup();
  f.repo.linkGoogle = async () => {
    throw Object.assign(new Error('race'), { code: 'ER_DUP_ENTRY' });
  };
  await assert.rejects(f.service.signIn({ profile }), { code: 'INVALID_STATE' });
  assert.equal(f.records().length, 0);
});

test('a password changed during account linking requires a fresh verification', async () => {
  const f = setup({ customers: [{ id: 'existing', email: identity.email, passwordHash: 'hash:correct' }] });
  f.repo.findCustomerForUpdate = async () => ({ id: 'existing', passwordHash: 'hash:new-password' });
  await assert.rejects(f.service.signIn({ password: 'correct' }), { code: 'INVALID_STATE' });
  assert.equal(f.links().length, 0);
});

test('new Google accounts with third-party emails receive an email code before registration', async () => {
  const f = setup({ person: { ...identity, email: 'maria@third-party.example', authoritativeEmail: false } });
  const result = await f.service.signIn({ profile });
  assert.equal(result.status, 'email_required');
  assert.equal(result.challengeId, 'email-request');
  assert.equal(f.queued(), 1);
  assert.equal(f.records().length, 0);
  assert.equal(result.token, undefined);
});

test('Google exchange only accepts JSON from an explicitly allowed browser origin', () => {
  const middleware = requireGoogleOrigin(['https://tresmariascater.com']);
  for (const origin of [undefined, 'https://attacker.example', 'null'])
    assert.throws(
      () => middleware({ get: () => origin, is: () => true }, {}, () => assert.fail('rejected origin passed')),
      { code: 'FORBIDDEN' }
    );
  assert.throws(() => middleware({ get: () => 'https://tresmariascater.com', is: () => false }, {}, () => {}), {
    code: 'FORBIDDEN'
  });
  let accepted = false;
  middleware({ get: () => 'https://tresmariascater.com', is: () => true }, {}, () => {
    accepted = true;
  });
  assert.equal(accepted, true);
});
