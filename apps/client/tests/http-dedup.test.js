import assert from 'node:assert/strict';
import test from 'node:test';
import { http } from '../../../packages/shared/src/services/http.js';
import { emitChange } from '../../../packages/shared/src/services/events.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function session(t) {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  for (const [name, value] of [
    ['sessionStorage', storage],
    ['localStorage', { getItem: () => null }]
  ]) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else delete globalThis[name];
    });
  }
  const signIn = (token) => storage.setItem('tm.client.session', JSON.stringify({ token }));
  signIn('first-session');
  emitChange();
  return signIn;
}
const reply = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

test('concurrent reads share one request but return independent objects, and later reads stay fresh', async (t) => {
  session(t);
  const network = deferred();
  const fetch = t.mock.method(globalThis, 'fetch', () => network.promise);
  const first = http.get('/dedup-reservations');
  const second = http.get('/dedup-reservations');
  assert.equal(fetch.mock.callCount(), 1);
  network.resolve(reply([{ ref: 'RES-1' }]));
  const [a, b] = await Promise.all([first, second]);
  a[0].ref = 'changed locally';
  assert.equal(b[0].ref, 'RES-1');
  fetch.mock.mockImplementation(async () => reply([{ ref: 'RES-2' }]));
  assert.equal((await http.get('/dedup-reservations'))[0].ref, 'RES-2');
  assert.equal(fetch.mock.callCount(), 2);
});

test('reads for different accounts or endpoints never share a request', async (t) => {
  const signIn = session(t);
  const network = deferred();
  const fetch = t.mock.method(globalThis, 'fetch', () => network.promise.then(() => reply({ ok: true })));
  const first = http.get('/private-profile');
  signIn('second-session');
  const second = http.get('/private-profile');
  const other = http.get('/private-reservations');
  assert.equal(fetch.mock.callCount(), 3);
  network.resolve();
  await Promise.all([first, second, other]);
  assert.equal(fetch.mock.calls[0].arguments[1].headers.Authorization, 'Bearer first-session');
  assert.equal(fetch.mock.calls[1].arguments[1].headers.Authorization, 'Bearer second-session');
});

test('quiet writes and change notifications invalidate older in-flight reads', async (t) => {
  session(t);
  const older = deferred();
  const fresh = deferred();
  let reads = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (options.method !== 'GET') return reply({ saved: true });
    reads += 1;
    return reads === 1 ? older.promise : fresh.promise;
  });
  const before = http.get('/write-boundary');
  await http.post('/write-boundary', {}, { quiet: true });
  const after = http.get('/write-boundary');
  assert.equal(reads, 2);
  older.resolve(reply({ version: 1 }));
  await before;
  const concurrent = http.get('/write-boundary');
  assert.equal(reads, 2, 'An old response cannot remove a newer pending read');
  fresh.resolve(reply({ version: 2 }));
  assert.deepEqual(await after, { version: 2 });
  assert.deepEqual(await concurrent, { version: 2 });
  const pending = deferred();
  t.mock.method(globalThis, 'fetch', () => pending.promise.then(() => reply({ ok: true })));
  const a = http.get('/event-boundary');
  emitChange();
  const b = http.get('/event-boundary');
  pending.resolve();
  await Promise.all([a, b]);
});

test('failed requests are retried rather than cached', async (t) => {
  session(t);
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('offline');
  });
  await assert.rejects(http.get('/retry-read'), (error) => error.code === 'NETWORK');
  fetch.mock.mockImplementation(async () => reply({ recovered: true }));
  assert.deepEqual(await http.get('/retry-read'), { recovered: true });
  assert.equal(fetch.mock.callCount(), 2);
});
