import test from 'node:test';
import assert from 'node:assert/strict';
import { getUsage } from '../../../packages/shared/src/services/remote/aiUsage.js';

function adminSession(t) {
  const originalSessionStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key) => (key === 'tm.admin.session' ? JSON.stringify({ token: 'admin-usage-session' }) : null)
    }
  });
  t.after(() => {
    if (originalSessionStorage) Object.defineProperty(globalThis, 'sessionStorage', originalSessionStorage);
    else delete globalThis.sessionStorage;
  });
}

test('AI usage reads admin telemetry with the existing admin session and never starts an AI request', async (t) => {
  adminSession(t);
  const calls = [];
  const snapshot = { enabled: false, available: false, alerts: [] };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => snapshot };
  });

  assert.deepEqual(await getUsage(), snapshot);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/admin\/ai-usage$/);
  assert.deepEqual(calls[0].options, {
    method: 'GET',
    headers: { Authorization: 'Bearer admin-usage-session' },
    body: undefined
  });
});

test('AI usage surfaces a denied admin read instead of returning a healthy zero snapshot', async (t) => {
  adminSession(t);
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: false,
    status: 403,
    json: async () => ({ code: 'FORBIDDEN', message: 'Admin access is required.' })
  }));
  await assert.rejects(getUsage(), { code: 'FORBIDDEN', message: 'Admin access is required.' });
});
