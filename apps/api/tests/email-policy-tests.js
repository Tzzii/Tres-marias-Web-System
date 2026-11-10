import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertCustomerEmailAllowed, assertCustomerEmailAllowedWithDisify } from '../src/modules/auth/email-policy.js';
import { startGoogleEmailSignup, startSignUp } from '../src/modules/auth/auth.service.js';

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
    startGoogleEmailSignup({ email: 'person@custom.example', sub: 'google-subject' }, {}),
    (error) => error.code === 'INVALID' && error.meta.field === 'email'
  );
});
