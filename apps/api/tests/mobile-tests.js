import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateMobile } from '@tm/shared/src/utils/validation.js';
import { mobileInputValue, nationalMobile, readPhilippineMobile } from '@tm/shared/src/utils/mobile.js';
import { formatMobile } from '@tm/shared/src/utils/format.js';
import { cleanMobile } from '@tm/shared/src/domain/account.js';
import { partnerFields, partnerProblem } from '@tm/shared/src/domain/outsource.js';
import { startGoogleEmailSignup, startSignUp, updateCustomerProfile } from '../src/modules/auth/auth.service.js';
import { updateCustomerContact } from '../src/modules/customers/customers.service.js';
import { config } from '../src/config.js';
import { pool } from '../src/db.js';
import { assertCustomerMobileAllowedWithAbstract } from '../src/modules/auth/mobile-policy.js';

const partner = {
  name: 'Phone test supplier',
  service: 'Transport',
  email: 'supplier@example.test',
  contactPerson: 'Local Coordinator',
  address: 'Malvar, Batangas'
};
const invalid = '+6391234567896';

test('PH mobile equivalents share validation, domestic storage and +63 display', () => {
  for (const input of [
    '09171234567',
    '+639171234567',
    '+63 917 123 4567',
    '639171234567',
    '9171234567',
    '0917-123-4567'
  ]) {
    assert.equal(validateMobile(input), '', input);
    assert.equal(cleanMobile(input), '09171234567', input);
    assert.equal(mobileInputValue(input), '09171234567', input);
    assert.equal(formatMobile(input), '+63 917 123 4567', input);
    assert.equal(partnerFields({ ...partner, mobile: input }).mobile, '09171234567', input);
  }
});

test('recognized mobile ranges across networks, including 8-series, are supported', () => {
  for (const input of [
    '09171234567',
    '09181234567',
    '09911234567',
    '09561234567',
    '08131234567',
    '08171234567',
    '08951234567'
  ]) {
    assert.equal(validateMobile(input), '', input);
    assert.equal(readPhilippineMobile(input).getType(), 'MOBILE');
  }
  assert.equal(formatMobile('08131234567'), '+63 813 123 4567');
});

test('interactive input stops at 11 digits while the API rejects extra digits', () => {
  assert.equal(nationalMobile(invalid), '91234567896');
  assert.equal(mobileInputValue(invalid), '09123456789');
  assert.match(validateMobile(invalid), /exactly 10 digits/);
  assert.equal(cleanMobile(invalid), invalid);
  assert.equal(readPhilippineMobile(invalid), null);
});

test('short, long, duplicated prefix, foreign, landline and unknown mobile ranges are rejected', () => {
  for (const input of [
    '0917123456',
    '091712345678',
    '+6309171234567',
    '009171234567',
    '+6581234567',
    '+63281234567',
    '+639001234567',
    '00000000000'
  ]) {
    assert.notEqual(validateMobile(input), '', input);
    assert.equal(partnerProblem({ ...partner, mobile: input }).meta.field, 'mobile', input);
  }
});

test('letters, commas, extensions and embedded text cannot be silently stripped into a valid phone', () => {
  for (const input of [
    '+639171234567,,',
    '0917abc1234567',
    'call +639171234567',
    '+639171234567 ext 1',
    '+63(0)9171234567'
  ]) {
    assert.notEqual(validateMobile(input), '', input);
    assert.equal(readPhilippineMobile(input), null);
  }
});

test('partner email and mobile are required; provided phones must pass', () => {
  assert.equal(partnerProblem({ ...partner, mobile: '' }).meta.field, 'mobile');
  assert.equal(partnerProblem({ ...partner, email: '', mobile: '' }).meta.field, 'email');
  assert.equal(partnerProblem({ ...partner, email: '', mobile: '+639171234567' }).meta.field, 'email');
  assert.equal(partnerProblem({ ...partner, mobile: invalid }).meta.field, 'mobile');
  assert.equal(validateMobile(''), 'Mobile number is required.');
});

const mobileRejection = (error) => error.code === 'INVALID' && error.meta.field === 'mobile';

test('signup API service rejects the overlong phone before account creation or email', async () => {
  await assert.rejects(
    startSignUp({
      firstName: 'Local',
      lastName: 'Preview',
      email: 'phone@example.test',
      mobile: invalid,
      password: 'Mobile-Test-2026',
      agreeTerms: true
    }),
    mobileRejection
  );
});

test('customer profile API service rejects the overlong phone before reading or writing records', async () => {
  await assert.rejects(
    updateCustomerProfile('no-record-needed', { name: 'Local Preview', mobile: invalid }),
    mobileRejection
  );
});

test('admin customer-contact API service rejects the overlong phone before entering a database transaction', async () => {
  await assert.rejects(
    updateCustomerContact('no-record-needed', { email: 'phone@example.test', mobile: invalid }),
    mobileRejection
  );
});

test('customer profile rejects an Abstract-invalid number before writing the customer', async (t) => {
  const originalKey = config.abstractPhoneApiKey;
  config.abstractPhoneApiKey = 'test-profile-phone-key';
  t.after(() => { config.abstractPhoneApiKey = originalKey; });
  const writes = [];
  t.mock.method(pool, 'query', async (sql) => {
    if (sql.startsWith('SELECT')) return [[{ id: 'phone-customer', name: 'Local Preview', mobile: '09171234567' }]];
    writes.push(sql);
    return [{}];
  });
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({ phone_number: '639614196426', phone_validation: { is_valid: false } })
  }));
  await assert.rejects(updateCustomerProfile('phone-customer', {
    name: 'Local Preview', mobile: '09614196426'
  }), mobileRejection);
  assert.equal(writes.length, 0);
});

function phoneFixture(t, verdict = true) {
  const originalKey = config.abstractPhoneApiKey;
  config.abstractPhoneApiKey = `phone-test-${t.name}`;
  t.after(() => { config.abstractPhoneApiKey = originalKey; });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    const number = JSON.parse(options.body).phone;
    return { ok: true, json: async () => ({
      phone_number: number.slice(1),
      phone_format: { international: number },
      phone_validation: { is_valid: verdict, line_status: verdict ? 'active' : 'unknown', is_voip: false }
    }) };
  });
  return calls;
}

test('Abstract phone normalizes PH equivalents, preserves plus and caches the valid verdict', async (t) => {
  const calls = phoneFixture(t);
  for (const phone of ['09614196426', '+639614196426', '639614196426', '9614196426', '+63 961 419 6426']) {
    await assert.doesNotReject(assertCustomerMobileAllowedWithAbstract(phone));
  }
  assert.equal(calls.length, 1);
  const { url, options } = calls[0];
  assert.equal(url, 'https://phoneintelligence.abstractapi.com/v1/');
  assert.equal(options.method, 'POST');
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers.Authorization, `Bearer ${config.abstractPhoneApiKey}`);
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(options.body), { phone: '+639614196426' });
  assert.ok(options.signal instanceof AbortSignal);
});

test('Abstract invalid verdict is cached and uses the correct contact-form field', async (t) => {
  const calls = phoneFixture(t, false);
  await assert.rejects(assertCustomerMobileAllowedWithAbstract('09614196426'), mobileRejection);
  await assert.rejects(assertCustomerMobileAllowedWithAbstract('+639614196426', 'value'), (error) => {
    assert.equal(error.code, 'INVALID');
    assert.equal(error.meta.field, 'value');
    assert.ok(!error.message.includes(config.abstractPhoneApiKey));
    return true;
  });
  assert.equal(calls.length, 1);
});

test('phone policy rejects local invalid input without spending quota and works without a key', async (t) => {
  const calls = phoneFixture(t);
  await assert.rejects(assertCustomerMobileAllowedWithAbstract('+6581234567'), mobileRejection);
  config.abstractPhoneApiKey = '';
  await assert.doesNotReject(assertCustomerMobileAllowedWithAbstract('09614196426'));
  assert.equal(calls.length, 0);
});

test('inconclusive and mismatched phone results never reject or become cached', async (t) => {
  phoneFixture(t);
  for (const result of [null, [], {},
    { phone_number: '639614196426', phone_validation: { is_valid: 'false' } },
    { phone_number: '639614196426', phone_validation: { line_status: 'unknown' } },
    { phone_number: '639171234567', phone_validation: { is_valid: false } }
  ]) {
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => result }));
    await assert.doesNotReject(assertCustomerMobileAllowedWithAbstract('09614196426'));
  }
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({
    phone_number: '+639614196426', phone_validation: { is_valid: false }
  }) }));
  await assert.rejects(assertCustomerMobileAllowedWithAbstract('09614196426'), mobileRejection);
});

test('network, JSON and authentication errors retain local mobile validation', async (t) => {
  phoneFixture(t);
  for (const fetchResponse of [
    async () => { throw new Error('offline'); },
    async () => { throw new DOMException('timeout', 'TimeoutError'); },
    async () => ({ ok: false, status: 401 }),
    async () => ({ ok: false, status: 503 }),
    async () => ({ ok: true, json: async () => { throw new SyntaxError('invalid response'); } })
  ]) {
    t.mock.method(globalThis, 'fetch', fetchResponse);
    await assert.doesNotReject(assertCustomerMobileAllowedWithAbstract('09614196426'));
  }
});

test('phone cache expires, separates keys and shares concurrent equivalent-number requests', async (t) => {
  const calls = phoneFixture(t);
  let at = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => at);
  await Promise.all([
    assertCustomerMobileAllowedWithAbstract('09614196426'),
    assertCustomerMobileAllowedWithAbstract('+639614196426')
  ]);
  assert.equal(calls.length, 1);
  at += 15 * 60_000 + 1;
  await assertCustomerMobileAllowedWithAbstract('09614196426');
  assert.equal(calls.length, 2);
  config.abstractPhoneApiKey += '-rotated';
  await assertCustomerMobileAllowedWithAbstract('09614196426');
  assert.equal(calls.length, 3);
});

test('phone quota and rate failures pause only their own provider checks', async (t) => {
  phoneFixture(t);
  let at = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => at);
  for (const [status, wait] of [[429, 60_000], [422, 3_600_000]]) {
    config.abstractPhoneApiKey = `phone-limit-${status}`;
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => { calls++; return { ok: false, status }; });
    await assert.doesNotReject(assertCustomerMobileAllowedWithAbstract('09614196426'));
    await assert.doesNotReject(assertCustomerMobileAllowedWithAbstract('09171234567'));
    assert.equal(calls, 1);
    at += wait + 1;
    await assert.doesNotReject(assertCustomerMobileAllowedWithAbstract('09614196426'));
    assert.equal(calls, 2);
  }
});

test('phone cache evicts old verdicts after 500 conclusive numbers', async (t) => {
  const calls = phoneFixture(t);
  for (let i = 0; i <= 500; i++) {
    await assertCustomerMobileAllowedWithAbstract(`+63917${String(i).padStart(7, '0')}`);
  }
  await assertCustomerMobileAllowedWithAbstract('+639170000000');
  assert.equal(calls.length, 502);
});

test('signup rejects an Abstract-invalid phone before email-provider calls or challenge creation', async (t) => {
  const calls = phoneFixture(t, false);
  t.mock.method(pool, 'query', async (sql) => {
    assert.match(sql, /^SELECT \* FROM customers WHERE email/);
    return [[]];
  });
  await assert.rejects(startSignUp({
    firstName: 'Local', lastName: 'Preview', email: 'phone@example.test',
    mobile: '09614196426', password: 'Mobile-Test-2026!', agreeTerms: true
  }), mobileRejection);
  assert.equal(calls.length, 1);
});

test('new Google signup rejects an Abstract-invalid phone before email or challenge creation', async (t) => {
  const calls = phoneFixture(t, false);
  await assert.rejects(startGoogleEmailSignup({ email: 'phone@example.test', sub: 'test-subject' }, {
    name: 'Local Preview', mobile: '09614196426'
  }), mobileRejection);
  assert.equal(calls.length, 1);
});

test('profile updates with an unchanged equivalent number skip the phone provider', async (t) => {
  const calls = phoneFixture(t, false);
  const writes = [];
  t.mock.method(pool, 'query', async (sql, params) => {
    if (sql.startsWith('SELECT')) return [[{
      id: 'phone-customer', name: 'Local Preview', mobile: '09614196426', email: 'phone@example.test'
    }]];
    writes.push(params);
    return [{}];
  });
  const saved = await updateCustomerProfile('phone-customer', { name: 'Local Preview', mobile: '+639614196426' });
  assert.equal(saved.mobile, '09614196426');
  assert.equal(writes.length, 1);
  assert.equal(calls.length, 0);
});

test('admin customer phone lookup waits for Abstract without holding a database transaction', async (t) => {
  phoneFixture(t, false);
  const row = { id: 'phone-customer', name: 'Local Preview', email: 'phone@example.test', mobile: '09171234567' };
  let transactions = 0;
  let writes = 0;
  const connection = {
    beginTransaction: async () => { transactions++; },
    commit: async () => { transactions--; },
    rollback: async () => { transactions--; },
    release() {},
    query: async (sql) => {
      if (sql.startsWith('SELECT id FROM customers')) return [[]];
      if (sql.startsWith('SELECT')) return [[row]];
      writes++;
      return [{}];
    }
  };
  t.mock.method(pool, 'getConnection', async () => connection);
  t.mock.method(pool, 'query', async () => [[row]]);
  let finishLookup;
  let lookupStarted;
  const started = new Promise((resolve) => { lookupStarted = resolve; });
  t.mock.method(globalThis, 'fetch', () => {
    lookupStarted(transactions);
    return new Promise((resolve) => { finishLookup = resolve; });
  });
  const rejected = assert.rejects(updateCustomerContact('phone-customer', {
    email: row.email, mobile: '09614196426'
  }), mobileRejection);
  const transactionsDuringLookup = await started;
  finishLookup({ ok: true, json: async () => ({
    phone_number: '639614196426', phone_validation: { is_valid: false }
  }) });
  await rejected;
  assert.equal(transactionsDuringLookup, 0);
  assert.equal(transactions, 0);
  assert.equal(writes, 0);
});

test('admin customer update rechecks concurrent mobile changes before persistence', async (t) => {
  phoneFixture(t);
  const original = { id: 'phone-customer', name: 'Local Preview', email: 'phone@example.test', mobile: '09171234567' };
  let writes = 0;
  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {},
    query: async (sql) => {
      if (sql.includes('FOR UPDATE')) return [[{ ...original, mobile: '09181234567' }]];
      if (sql.startsWith('SELECT')) return [[]];
      writes++;
      return [{}];
    }
  };
  t.mock.method(pool, 'getConnection', async () => connection);
  t.mock.method(pool, 'query', async () => [[original]]);
  await assert.rejects(updateCustomerContact(original.id, { email: original.email, mobile: '09614196426' }), {
    code: 'INVALID_STATE'
  });
  assert.equal(writes, 0);
});
