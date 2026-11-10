import assert from 'node:assert/strict';
import { test } from 'node:test';
import { config } from '../src/config.js';
import { verifySignupCaptcha, verifyGoogleSignupCaptcha } from '../src/modules/auth/turnstile.js';

test('signup requires a server-verified CAPTCHA token before proceeding', async () => {
  const originalSecret = config.turnstileSecret;
  const originalFetch = globalThis.fetch;
  config.turnstileSecret = 'test-secret';
  let calls = 0;
  globalThis.fetch = async (_, options) => {
    calls++;
    const body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ success: body.response === 'valid' }) };
  };
  const next = () => {
    calls++;
  };
  try {
    await assert.rejects(verifySignupCaptcha({ valid: { body: {} }, ip: '127.0.0.1' }, {}, next), /security check/);
    assert.equal(calls, 0);
    await assert.rejects(
      verifySignupCaptcha({ valid: { body: { captchaToken: 'forged' } }, ip: '127.0.0.1' }, {}, next),
      /security check/
    );
    assert.equal(calls, 1);
    await verifySignupCaptcha({ valid: { body: { captchaToken: 'valid' } }, ip: '127.0.0.1' }, {}, next);
    assert.equal(calls, 3);
  } finally {
    config.turnstileSecret = originalSecret;
    globalThis.fetch = originalFetch;
  }
});

test('Google sign-in stays available while a new Google profile requires CAPTCHA', async () => {
  const originalSecret = config.turnstileSecret;
  config.turnstileSecret = 'test-secret';
  let continued = false;
  try {
    verifyGoogleSignupCaptcha({ valid: { body: {} } }, {}, () => {
      continued = true;
    });
    assert.equal(continued, true);
    await assert.rejects(
      verifyGoogleSignupCaptcha({ valid: { body: { profile: {} } } }, {}, () => {}),
      /security check/
    );
  } finally {
    config.turnstileSecret = originalSecret;
  }
});
