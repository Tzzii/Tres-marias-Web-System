import test from 'node:test';
import assert from 'node:assert/strict';
import { presenceLabel, shouldSendAwayReply } from '@tm/shared/src/domain/presence.js';
import { startAdminPresence } from '@tm/shared/src/services/adminPresence.js';

test('customer presence text distinguishes online, unknown and elapsed offline time', () => {
  assert.equal(presenceLabel({ online: true }), 'Active now');
  assert.equal(presenceLabel({ online: false, offlineSince: null }), 'Offline');
  assert.equal(presenceLabel({ online: false, offlineSince: 1000, serverTime: 7201000 }), 'Active 2 hours ago');
  assert.equal(presenceLabel({ online: false, offlineSince: 1000, serverTime: 61000 }), 'Active 1 minute ago');
});

test('away acknowledgment is sent once per thread in each offline period', () => {
  assert.equal(shouldSendAwayReply({ online: true }, null), false);
  assert.equal(shouldSendAwayReply({ online: false, offlineSince: null }, null), true);
  assert.equal(shouldSendAwayReply({ online: false, offlineSince: null }, 100), false);
  assert.equal(shouldSendAwayReply({ online: false, offlineSince: 200 }, 100), true);
  assert.equal(shouldSendAwayReply({ online: false, offlineSince: 200 }, 200), false);
});

test('presence works on HTTP LAN origins without randomUUID and closes with a newer sequence', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const random = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: random } });
  t.after(() => Object.defineProperty(globalThis, 'crypto', descriptor));
  const previousWindow = globalThis.window;
  globalThis.window = new EventTarget();
  t.after(() => {
    globalThis.window = previousWindow;
  });
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(JSON.parse(options.body));
    return {};
  });
  const stop = startAdminPresence('fixture-token');
  stop();
  assert.equal(requests.length, 2);
  assert.match(requests[0].clientId, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(requests[0].active, true);
  assert.equal(requests[1].active, false);
  assert.ok(requests[1].sequence > requests[0].sequence);
  assert.equal(requests[1].clientId, requests[0].clientId);
});
