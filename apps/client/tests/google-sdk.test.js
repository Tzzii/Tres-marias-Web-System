import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadGoogleIdentity } from '../src/lib/googleIdentity.js';

function browser() {
  const scripts = [];
  const windowObject = {};
  const documentObject = { createElement: () => ({}), head: { appendChild: (script) => scripts.push(script) } };
  return { windowObject, documentObject, scripts };
}

test('Google SDK loads once across concurrent mounts and resolves the official API', async () => {
  const f = browser();
  const first = loadGoogleIdentity(f);
  const second = loadGoogleIdentity(f);
  assert.equal(first, second);
  assert.equal(f.scripts.length, 1);
  assert.equal(f.scripts[0].src, 'https://accounts.google.com/gsi/client?hl=en');
  f.windowObject.google = { accounts: { id: { renderButton() {} } } };
  f.scripts[0].onload();
  assert.equal(await first, f.windowObject.google.accounts.id);
});

test('Google SDK failures clear the failed request so a user can retry', async () => {
  const f = browser();
  const failed = loadGoogleIdentity(f);
  f.scripts[0].onerror();
  await assert.rejects(failed, /Google sign-in/);
  const retry = loadGoogleIdentity(f);
  assert.equal(f.scripts.length, 2);
  f.windowObject.google = { accounts: { id: {} } };
  f.scripts[1].onload();
  await retry;
});

test('an existing Google SDK is reused and a blocked load times out', async () => {
  const f = browser();
  f.windowObject.google = { accounts: { id: {} } };
  assert.equal(await loadGoogleIdentity(f), f.windowObject.google.accounts.id);
  await assert.rejects(loadGoogleIdentity({ ...browser(), timeoutMs: 5 }), /Google sign-in/);
});
