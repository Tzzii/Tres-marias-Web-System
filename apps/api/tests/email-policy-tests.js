import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertCustomerEmailAllowed, assertCustomerEmailAllowedWithDisify } from '../src/modules/auth/email-policy.js';
import { startGoogleEmailSignup, startSignUp } from '../src/modules/auth/auth.service.js';
import * as emailPolicy from '../src/modules/auth/email-policy.js';
import { config } from '../src/config.js';

// These fixtures isolate email checks from the separately tested phone provider.
config.abstractPhoneApiKey = '';

test('blocks known disposable providers including mixed-case and provider subdomains', () => {
  for (const email of [
    'test@mailinator.com',
    'test@yopmail.com',
    'test@mailinator.com.',
    ' Test@MAILINATOR.COM ',
    'test@inbox.mailinator.com',
    'test@nbasweeps.com',
    'test@inbox.nbasweeps.com'
  ]) {
    assert.throws(
      () => assertCustomerEmailAllowed(email),
      (error) => {
        assert.equal(error.code, 'INVALID');
        assert.equal(error.meta.field, 'email');
        assert.match(error.message, /Temporary email/);
        return true;
      }
    );
  }
});

test('allows permanent, school and custom domains and preserves address aliases', () => {
  for (const email of [
    'test@gmail.com',
    'test+booking@gmail.com',
    'person@outlook.com',
    'person@school.edu.ph',
    'person@mycompany.ph',
    'person@mailinator.com.example.org'
  ]) {
    assert.doesNotThrow(() => assertCustomerEmailAllowed(email));
  }
});

test('rejects malformed addresses before the disposable-provider lookup', () => {
  for (const email of [
    '',
    null,
    'mailinator.com',
    'person@@gmail.com',
    'person@ gmail.com',
    'test@mailinator\u3002com'
  ]) {
    assert.throws(
      () => assertCustomerEmailAllowed(email),
      (error) => error.code === 'INVALID' && error.meta.field === 'email'
    );
  }
});

test('signup rejects the newly reported disposable domain before sending a code', async () => {
  await assert.rejects(
    startSignUp({
      firstName: 'Temporary',
      lastName: 'Inbox',
      email: 'example@nbasweeps.com',
      mobile: '09171234567',
      password: 'Valid-Test-2026!',
      agreeTerms: true
    }),
    (error) => error.code === 'INVALID' && error.meta.field === 'email' && /Temporary email/.test(error.message)
  );
});

test('Disify checks the complete email and rejects a reported temporary address', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://disify.com/api/email');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(new URLSearchParams(options.body).get('email'), 'person+booking@custom.example');
    return { ok: true, json: async () => ({ format: true, disposable: true, dns: true }) };
  };
  await assert.rejects(
    assertCustomerEmailAllowedWithDisify('person+booking@custom.example'),
    (error) => error.code === 'INVALID' && error.meta.field === 'email' && /Temporary email/.test(error.message)
  );
});

test('Disify accepts a clear address and honors invalid format and blocked verdicts', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  for (const [answer, allowed] of [
    [{ format: true, disposable: false, dns: true }, true],
    [{ format: false }, false],
    [{ format: true, disposable: false, dns: true, blocked: true }, false]
  ]) {
    globalThis.fetch = async () => ({ ok: true, json: async () => answer });
    if (allowed) await assert.doesNotReject(assertCustomerEmailAllowedWithDisify('person@custom.example'));
    else await assert.rejects(assertCustomerEmailAllowedWithDisify('person@custom.example'), { code: 'INVALID' });
  }
});

test('Disify failures fall back to the bundled policy', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  for (const response of [
    { ok: false, status: 429 },
    { ok: true, json: async () => ({ format: true }) }
  ]) {
    globalThis.fetch = async () => response;
    await assert.doesNotReject(assertCustomerEmailAllowedWithDisify('person@custom.example'));
  }
  globalThis.fetch = async () => {
    throw new Error('offline');
  };
  await assert.doesNotReject(assertCustomerEmailAllowedWithDisify('person@custom.example'));
  await assert.rejects(assertCustomerEmailAllowedWithDisify('person@mailinator.com'), { code: 'INVALID' });
});

test('Google customer signup applies the Disify verdict before creating a challenge', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ format: true, disposable: true, dns: true })
  });
  await assert.rejects(
    startGoogleEmailSignup({ email: 'person@custom.example', sub: 'google-subject' }, { mobile: '09171234567' }),
    (error) => error.code === 'INVALID' && error.meta.field === 'email'
  );
});

function abstractFixture(t, answer) {
  const originalKey = config.abstractEmailApiKey;
  const originalFetch = globalThis.fetch;
  config.abstractEmailApiKey = `test-key-${t.name}`;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => answer };
  };
  t.after(() => {
    config.abstractEmailApiKey = originalKey;
    globalThis.fetch = originalFetch;
  });
  return requests;
}

function abstractAnswer(email, status = 'deliverable') {
  return {
    email_address: email,
    suggested_correction: null,
    email_deliverability: {
      status,
      status_detail: status === 'undeliverable' ? 'invalid_email' : 'valid_email',
      is_format_valid: true,
      is_smtp_valid: status === 'deliverable',
      is_mx_valid: true,
      mx_records: ['mx.custom.example']
    }
  };
}

test('Abstract screens the complete email with server-only credentials and accepts deliverable mail', async (t) => {
  const address = 'person+booking@custom.example';
  const requests = abstractFixture(t, abstractAnswer(address));
  await assert.doesNotReject(emailPolicy.assertCustomerEmailAllowedWithAbstract(` ${address} `));
  assert.equal(requests.length, 1);
  const { url, options } = requests[0];
  assert.equal(url, 'https://emailreputation.abstractapi.com/v1/');
  assert.equal(options.method, 'POST');
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers.Authorization, `Bearer ${config.abstractEmailApiKey}`);
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(options.body), { email: address });
  assert.ok(options.signal instanceof AbortSignal);
});

test('Abstract rejects confirmed undeliverable mail with a safe email-field error', async (t) => {
  abstractFixture(t, abstractAnswer('missing@custom.example', 'undeliverable'));
  await assert.rejects(emailPolicy.assertCustomerEmailAllowedWithAbstract('missing@custom.example'), (error) => {
    assert.equal(error.code, 'INVALID');
    assert.equal(error.meta.field, 'email');
    assert.match(error.message, /receive email/);
    assert.ok(!error.message.includes(config.abstractEmailApiKey));
    return true;
  });
});

test('Abstract leaves unknown, malformed, and mismatched results to email code verification', async (t) => {
  abstractFixture(t);
  const address = 'uncertain@custom.example';
  for (const answer of [
    abstractAnswer(address, 'unknown'),
    { email_address: address, email_deliverability: { is_smtp_valid: false } },
    abstractAnswer('someone-else@custom.example', 'undeliverable'),
    { email_address: address, email_deliverability: { status: 'unexpected' } },
    null,
    []
  ]) {
    globalThis.fetch = async () => ({ ok: true, json: async () => answer });
    await assert.doesNotReject(emailPolicy.assertCustomerEmailAllowedWithAbstract(address));
  }
});

test('Abstract missing-key and local-policy rejection avoid external calls', async (t) => {
  const requests = abstractFixture(t, abstractAnswer('person@custom.example'));
  config.abstractEmailApiKey = '';
  await assert.doesNotReject(emailPolicy.assertCustomerEmailAllowedWithAbstract('person@custom.example'));
  await assert.rejects(emailPolicy.assertCustomerEmailAllowedWithAbstract('person@mailinator.com'), { code: 'INVALID' });
  assert.equal(requests.length, 0);
});

test('Abstract network, timeout, authentication, JSON, and server failures preserve the code flow', async (t) => {
  abstractFixture(t);
  for (const fetchResponse of [
    async () => { throw new Error('network unavailable'); },
    async () => { throw new DOMException('timeout', 'TimeoutError'); },
    async () => ({ ok: false, status: 401 }),
    async () => ({ ok: false, status: 500 }),
    async () => ({ ok: true, json: async () => { throw new SyntaxError('bad json'); } })
  ]) {
    globalThis.fetch = fetchResponse;
    await assert.doesNotReject(emailPolicy.assertCustomerEmailAllowedWithAbstract('offline@custom.example'));
  }
});

test('Abstract caches conclusive verdicts, expires them, and separates API keys', async (t) => {
  const requests = abstractFixture(t, abstractAnswer('cached@custom.example', 'undeliverable'));
  let at = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => at);
  await assert.rejects(emailPolicy.assertCustomerEmailAllowedWithAbstract('cached@custom.example'), { code: 'INVALID' });
  await assert.rejects(emailPolicy.assertCustomerEmailAllowedWithAbstract('cached@custom.example'), { code: 'INVALID' });
  assert.equal(requests.length, 1);
  at += 15 * 60 * 1000 + 1;
  await assert.rejects(emailPolicy.assertCustomerEmailAllowedWithAbstract('cached@custom.example'), { code: 'INVALID' });
  assert.equal(requests.length, 2);
  config.abstractEmailApiKey += '-rotated';
  await assert.rejects(emailPolicy.assertCustomerEmailAllowedWithAbstract('cached@custom.example'), { code: 'INVALID' });
  assert.equal(requests.length, 3);
});

test('Abstract does not cache unknown results and coalesces concurrent checks', async (t) => {
  const address = 'concurrent@custom.example';
  const requests = abstractFixture(t, abstractAnswer(address, 'unknown'));
  await Promise.all([
    emailPolicy.assertCustomerEmailAllowedWithAbstract(address),
    emailPolicy.assertCustomerEmailAllowedWithAbstract(address)
  ]);
  assert.equal(requests.length, 1);
  await emailPolicy.assertCustomerEmailAllowedWithAbstract(address);
  assert.equal(requests.length, 2);
});

test('Abstract rate and credit limits back off while permitting existing verification', async (t) => {
  abstractFixture(t);
  let at = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => at);
  for (const [status, cooldown] of [[429, 60_000], [403, 3_600_000], [422, 3_600_000]]) {
    config.abstractEmailApiKey = `limit-${status}`;
    let calls = 0;
    globalThis.fetch = async () => { calls++; return { ok: false, status }; };
    await assert.doesNotReject(emailPolicy.assertCustomerEmailAllowedWithAbstract('limited@custom.example'));
    await assert.doesNotReject(emailPolicy.assertCustomerEmailAllowedWithAbstract('another@custom.example'));
    assert.equal(calls, 1);
    at += cooldown + 1;
    await assert.doesNotReject(emailPolicy.assertCustomerEmailAllowedWithAbstract('limited@custom.example'));
    assert.equal(calls, 2);
  }
});

test('combined policy stops at Disify rejection before spending an Abstract request', async (t) => {
  const requests = abstractFixture(t, { format: true, disposable: true, dns: true });
  await assert.rejects(emailPolicy.assertCustomerEmailAllowedWithProviders('rejected@custom.example'), { code: 'INVALID' });
  assert.deepEqual(requests.map(({ url }) => url), ['https://disify.com/api/email']);
});

test('a later rate-limit response cannot shorten the credit-exhaustion cooldown', async (t) => {
  abstractFixture(t);
  let at = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => at);
  const responses = [];
  globalThis.fetch = () => new Promise((resolve) => responses.push(resolve));
  const creditCheck = emailPolicy.assertCustomerEmailAllowedWithAbstract('credit@custom.example');
  const rateCheck = emailPolicy.assertCustomerEmailAllowedWithAbstract('rate@custom.example');
  assert.equal(responses.length, 2);
  responses[0]({ ok: false, status: 403 });
  await creditCheck;
  responses[1]({ ok: false, status: 429 });
  await rateCheck;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: false, status: 500 }; };
  at += 60_001;
  await emailPolicy.assertCustomerEmailAllowedWithAbstract('after-minute@custom.example');
  assert.equal(calls, 0);
  at += 3_600_000;
  await emailPolicy.assertCustomerEmailAllowedWithAbstract('after-hour@custom.example');
  assert.equal(calls, 1);
});

test('combined policy still checks Abstract when Disify is unavailable', async (t) => {
  abstractFixture(t);
  globalThis.fetch = async (url) => url === 'https://disify.com/api/email'
    ? { ok: false, status: 503 }
    : { ok: true, json: async () => abstractAnswer('missing@custom.example', 'undeliverable') };
  await assert.rejects(emailPolicy.assertCustomerEmailAllowedWithProviders('missing@custom.example'), { code: 'INVALID' });
});

test('new Google signup rejects Abstract undeliverable results before creating a challenge', async (t) => {
  const requests = abstractFixture(t);
  globalThis.fetch = async (url) => {
    requests.push({ url });
    return {
      ok: true,
      json: async () => url === 'https://disify.com/api/email'
        ? { format: true, disposable: false, dns: true }
        : abstractAnswer('google@custom.example', 'undeliverable')
    };
  };
  await assert.rejects(startGoogleEmailSignup({ email: 'google@custom.example', sub: 'google-subject' }, { mobile: '09171234567' }),
    (error) => error.code === 'INVALID' && error.meta.field === 'email' && /receive email/.test(error.message));
  assert.equal(requests.length, 2);
});
