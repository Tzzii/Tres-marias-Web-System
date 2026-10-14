import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import { io as connect } from 'socket.io-client';
import { config } from '../src/config.js';
import { signToken } from '../src/lib/tokens.js';
import { readSessionToken } from '../src/middleware/auth.js';
import { createRealtimeServer, REALTIME_PATH } from '../src/realtime.js';
import { createApp } from '../src/app.js';
import { onChange, publishChange } from '../src/modules/changes/changes.events.js';
import { bumpStamp } from '../src/modules/changes/changes.repo.js';
import { pool } from '../src/db.js';
import { createLiveRefresh } from '../../../packages/shared/src/services/liveRefresh.js';
import { startRealtimeSync } from '../../../packages/shared/src/services/realtime.js';
import { http as portalHttp } from '../../../packages/shared/src/services/http.js';
import { subscribe, onSignedOut } from '../../../packages/shared/src/services/events.js';

const ORIGIN = 'https://portal.example.test';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const future = () => Math.floor(Date.now() / 1000) + 3600;

async function fixture(t, options = {}) {
  const accounts = new Map([
    ['customer:alice', { name: 'Alice', passwordChangedAt: 0 }],
    ['customer:bob', { name: 'Bob', passwordChangedAt: 0 }],
    ['admin:staff', { name: 'Staff', passwordChangedAt: 0, sessionId: 'current-sign-in' }]
  ]);
  let databaseDown = false;
  const authenticate = (token) =>
    readSessionToken(token, async (role, id) => {
      if (databaseDown) throw new Error('private database credentials must never appear');
      return accounts.get(`${role}:${id}`) || null;
    });
  const server = http.createServer(
    options.handler ||
      ((req, res) => {
        res.writeHead(404);
        res.end();
      })
  );
  const realtime = createRealtimeServer(server, { origins: [ORIGIN], authenticate, batchMs: 10, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];
  t.after(async () => {
    clients.forEach((socket) => socket.disconnect());
    await realtime.close();
  });
  const token = (role = 'customer', id = 'alice', extra = {}) =>
    signToken(
      {
        id,
        role,
        ...accounts.get(`${role}:${id}`),
        ...extra
      },
      { expiresAt: future() }
    );
  function client(auth = { token: token() }, extra = {}) {
    const socket = connect(url, {
      path: REALTIME_PATH,
      auth,
      autoConnect: false,
      reconnection: false,
      forceNew: true,
      timeout: 2000,
      transports: ['websocket'],
      extraHeaders: { Origin: ORIGIN },
      ...extra
    });
    clients.push(socket);
    return socket;
  }
  return {
    accounts,
    realtime,
    token,
    client,
    authenticate,
    url,
    down: () => {
      databaseDown = true;
    }
  };
}

function connected(socket) {
  return new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
    socket.connect();
  });
}

function refused(socket) {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => reject(new Error('An unauthorized connection was accepted')));
    socket.once('connect_error', resolve);
    socket.connect();
  });
}

function event(socket, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, receive);
      reject(new Error(`Missing ${name} event`));
    }, 3000);
    function receive(...args) {
      clearTimeout(timer);
      resolve(args);
    }
    socket.once(name, receive);
  });
}

test('accepts current customer/admin sessions and sends no private payload to either customer', async (t) => {
  const f = await fixture(t);
  const alice = f.client({ token: f.token() });
  const bob = f.client({ token: f.token('customer', 'bob'), role: 'admin', customerId: 'alice', rooms: ['admin'] });
  const admin = f.client({ token: f.token('admin', 'staff') });
  await Promise.all([connected(alice), connected(bob), connected(admin)]);
  for (const socket of f.realtime.io.of('/').sockets.values()) assert.deepEqual([...socket.rooms], [socket.id]);
  const updates = [event(alice, 'change'), event(bob, 'change'), event(admin, 'change')];
  publishChange();
  assert.deepEqual(await Promise.all(updates), [[], [], []]);
  assert.equal((await f.authenticate(f.token('customer', 'bob'))).user.role, 'customer');
});

test('rejects missing, malformed, oversized, forged, expired and unknown-account JWTs', async (t) => {
  const f = await fixture(t);
  const cases = [
    {},
    { token: 'garbage' },
    { token: 42 },
    { token: 'x'.repeat(2049) },
    { token: jwt.sign({ sub: 'alice', role: 'customer', pwv: 0 }, 'wrong-secret', { expiresIn: '1h' }) },
    {
      token: signToken(
        { id: 'alice', role: 'customer', passwordChangedAt: 0 },
        { expiresAt: Math.floor(Date.now() / 1000) - 1 }
      )
    },
    { token: f.token('customer', 'missing') },
    { token: jwt.sign({ sub: 'alice', role: 'customer', pwv: 0 }, config.jwtSecret, { algorithm: 'HS256' }) },
    {
      token: jwt.sign({ sub: 'alice', role: 'admin', pwv: 0 }, config.jwtSecret, { algorithm: 'none', expiresIn: '1h' })
    }
  ];
  for (const auth of cases) assert.equal((await refused(f.client(auth))).data.code, 'UNAUTHENTICATED');
});

test('rejects stale passwords, old admin sign-ins and unlock tickets', async (t) => {
  const f = await fixture(t);
  const oldCustomer = f.token();
  f.accounts.get('customer:alice').passwordChangedAt = 100;
  assert.equal((await refused(f.client({ token: oldCustomer }))).data.code, 'UNAUTHENTICATED');
  assert.equal(
    (await refused(f.client({ token: f.token('admin', 'staff', { sessionId: 'old-sign-in' }) }))).data.code,
    'SESSION_REPLACED'
  );
  assert.equal(
    (await refused(f.client({ token: f.token('admin', 'staff', { sessionId: undefined }) }))).data.code,
    'UNAUTHENTICATED'
  );
  const unlock = jwt.sign(
    { sub: 'staff', role: 'admin', pwv: 0, kind: 'admin-unlock' },
    `${config.jwtSecret}:admin-unlock`,
    { expiresIn: '1h' }
  );
  assert.equal((await refused(f.client({ token: unlock }))).data.code, 'UNAUTHENTICATED');
});

for (const transport of ['websocket', 'polling']) {
  test(`${transport}: rejects disallowed or missing browser Origin`, async (t) => {
    const f = await fixture(t);
    for (const extraHeaders of [{ Origin: 'https://attacker.example.test' }, {}]) {
      const err = await refused(f.client(undefined, { transports: [transport], extraHeaders }));
      assert.equal(err.data, undefined);
    }
  });
}

test('HTTP polling transport receives authenticated updates too', async (t) => {
  const f = await fixture(t);
  const socket = f.client(undefined, { transports: ['polling'] });
  await connected(socket);
  const update = event(socket, 'change');
  publishChange();
  assert.deepEqual(await update, []);
});

test('cannot emit changes, send messages or join privileged rooms through the socket', async (t) => {
  const f = await fixture(t);
  const bob = f.client({ token: f.token('customer', 'bob') });
  await connected(bob);
  let received = 0;
  bob.on('change', () => received++);
  for (const name of ['change', 'join-room', 'message', 'approve-reservation']) {
    const attacker = f.client();
    await connected(attacker);
    const ended = event(attacker, 'disconnect');
    attacker.emit(name, { room: 'admin', customerId: 'bob', text: 'forged' });
    await ended;
  }
  await wait(30);
  assert.equal(received, 0);
});

test('password revocation blocks delivery on an already-open connection', async (t) => {
  const f = await fixture(t);
  const socket = f.client();
  await connected(socket);
  let updates = 0;
  socket.on('change', () => updates++);
  const ended = event(socket, 'session-ended');
  const disconnected = event(socket, 'disconnect');
  f.accounts.get('customer:alice').passwordChangedAt = 200;
  publishChange();
  assert.deepEqual(await ended, [{ code: 'UNAUTHENTICATED' }]);
  await disconnected;
  assert.equal(updates, 0);
});

test('replaced admin sessions are disconnected even without a new change', async (t) => {
  const f = await fixture(t, { authCheckMs: 30 });
  const socket = f.client({ token: f.token('admin', 'staff') });
  await connected(socket);
  const ended = event(socket, 'session-ended');
  f.accounts.get('admin:staff').sessionId = 'new-sign-in';
  assert.deepEqual(await ended, [{ code: 'SESSION_REPLACED' }]);
});

test('deleted accounts cannot receive the next notification', async (t) => {
  const f = await fixture(t);
  const socket = f.client();
  await connected(socket);
  const ended = event(socket, 'session-ended');
  f.accounts.delete('customer:alice');
  publishChange();
  assert.deepEqual(await ended, [{ code: 'UNAUTHENTICATED' }]);
});

test('connections expire at the JWT deadline without waiting for polling', async (t) => {
  const f = await fixture(t);
  const exp = Math.floor(Date.now() / 1000) + 2;
  const token = signToken({ id: 'alice', role: 'customer', passwordChangedAt: 0 }, { expiresAt: exp });
  const socket = f.client({ token });
  await connected(socket);
  const ended = event(socket, 'session-ended');
  assert.deepEqual(await ended, [{ code: 'UNAUTHENTICATED' }]);
});

test('a renewed password token reconnects, while the old token remains rejected', async (t) => {
  const f = await fixture(t);
  const oldToken = f.token();
  f.accounts.get('customer:alice').passwordChangedAt = 300;
  assert.equal((await refused(f.client({ token: oldToken }))).data.code, 'UNAUTHENTICATED');
  const fresh = f.client({ token: f.token() });
  await connected(fresh);
  const update = event(fresh, 'change');
  publishChange();
  assert.deepEqual(await update, []);
});

test('database errors fail closed and reveal no internal error text', async (t) => {
  const f = await fixture(t);
  const socket = f.client();
  await connected(socket);
  f.down();
  const error = await refused(f.client());
  assert.equal(error.message, 'Connection refused.');
  assert.deepEqual(error.data, { code: 'SERVER_ERROR' });
  let updates = 0;
  socket.on('change', () => updates++);
  const disconnected = event(socket, 'disconnect');
  publishChange();
  await disconnected;
  assert.equal(updates, 0);
});

test('limits concurrent connections per account and releases the slot on disconnect', async (t) => {
  const f = await fixture(t, { maxPerAccount: 1 });
  const first = f.client();
  await connected(first);
  assert.equal((await refused(f.client())).data.code, 'RATE_LIMITED');
  const other = f.client({ token: f.token('customer', 'bob') });
  await connected(other);
  first.disconnect();
  await wait(30);
  await connected(f.client());
});

test('handshake rate limits also apply to WebSockets with spoofed forwarded addresses', async (t) => {
  const f = await fixture(t, { maxAttempts: 1 });
  await connected(f.client());
  const error = await refused(
    f.client(undefined, { extraHeaders: { Origin: ORIGIN, 'X-Forwarded-For': '198.51.100.22' } })
  );
  assert.equal(error.data, undefined);
});

test('caps global connections before allocating another unauthenticated handshake', async (t) => {
  const f = await fixture(t, { maxConnections: 1 });
  await connected(f.client());
  assert.equal((await refused(f.client({ token: f.token('customer', 'bob') }))).data, undefined);
});

test('coalesces bursts of committed writes into one notification per connection', async (t) => {
  const f = await fixture(t, { batchMs: 30 });
  const socket = f.client();
  await connected(socket);
  let updates = 0;
  socket.on('change', () => updates++);
  const update = event(socket, 'change');
  for (let i = 0; i < 100; i++) publishChange();
  await update;
  await wait(70);
  assert.equal(updates, 1);
});

test('the change bus publishes only after the stamp write succeeds', async (t) => {
  const original = pool.query;
  let committed = false;
  let received = 0;
  const unsubscribe = onChange(() => {
    assert.equal(committed, true);
    received++;
  });
  t.after(() => {
    pool.query = original;
    unsubscribe();
  });
  pool.query = async () => {
    committed = true;
    return [];
  };
  await bumpStamp();
  assert.equal(received, 1);
  pool.query = async () => {
    throw new Error('write failed');
  };
  await assert.rejects(bumpStamp());
  assert.equal(received, 1);
});

test('refreshes coalesce, retain changes received during a request, and stop cleanly', async () => {
  let resolveFirst;
  let loads = 0;
  let emitted = 0;
  const refresh = createLiveRefresh({
    loadCalendar: () => {
      loads++;
      return loads === 1
        ? new Promise((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve();
    },
    emit: () => emitted++,
    isVisible: () => true,
    delayMs: 5
  });
  for (let i = 0; i < 20; i++) refresh.request();
  await wait(20);
  assert.equal(loads, 1);
  refresh.request();
  resolveFirst();
  await wait(25);
  assert.equal(loads, 2);
  assert.equal(emitted, 2);
  refresh.request();
  refresh.stop();
  await wait(20);
  assert.equal(loads, 2);
});

test('hidden pages defer refresh until visible and cleanup suppresses late events', async () => {
  let visible = false;
  let emitted = 0;
  let release;
  const refresh = createLiveRefresh({
    loadCalendar: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    emit: () => emitted++,
    isVisible: () => visible,
    delayMs: 5
  });
  refresh.request();
  await wait(15);
  assert.equal(release, undefined);
  visible = true;
  refresh.request();
  await wait(15);
  refresh.stop();
  release();
  await wait(10);
  assert.equal(emitted, 0);
});

async function portalFixture(t) {
  const f = await fixture(t);
  const savedWindow = globalThis.window;
  const savedDocument = globalThis.document;
  const originalGet = portalHttp.get;
  const page = new EventTarget();
  page.visibilityState = 'visible';
  const browser = new EventTarget();
  browser.location = { origin: ORIGIN };
  globalThis.window = browser;
  globalThis.document = page;
  portalHttp.get = async (path) => (path === '/changes' ? { stamp: 1 } : { capacity: 2, blocks: [], bookings: [] });
  t.after(() => {
    portalHttp.get = originalGet;
    globalThis.window = savedWindow;
    globalThis.document = savedDocument;
  });
  const options = {
    base: `${f.url}/api`,
    connect: (url, opts) => connect(url, { ...opts, extraHeaders: { Origin: ORIGIN } })
  };
  async function until(predicate) {
    for (let i = 0; i < 250; i++) {
      if (predicate()) return;
      await wait(20);
    }
    assert.fail('Portal failed to reach the expected state');
  }
  return { ...f, options, page, until };
}

test('portal receives push updates, catches up after reconnect, and closes on sign-out', async (t) => {
  const f = await portalFixture(t);
  let updates = 0;
  const unsubscribe = subscribe(() => updates++);
  const stop = startRealtimeSync(f.token(), f.options);
  t.after(() => {
    stop();
    unsubscribe();
  });
  await f.until(() => updates === 1);
  publishChange();
  await f.until(() => updates === 2);
  const [serverSocket] = f.realtime.io.of('/').sockets.values();
  serverSocket.conn.close();
  await f.until(() => f.realtime.io.of('/').sockets.size === 0);
  publishChange();
  await f.until(() => updates === 3);
  assert.equal(f.realtime.io.of('/').sockets.size, 1);
  stop();
  await f.until(() => f.realtime.io.of('/').sockets.size === 0);
  publishChange();
  await wait(300);
  assert.equal(updates, 3);
});

test('portal catches up after a hidden tab returns and ends a revoked session', async (t) => {
  const f = await portalFixture(t);
  let updates = 0;
  let ended = null;
  const unsubscribe = subscribe(() => updates++);
  const unsubscribeAuth = onSignedOut((code) => {
    ended = code;
  });
  const stop = startRealtimeSync(f.token(), f.options);
  t.after(() => {
    stop();
    unsubscribe();
    unsubscribeAuth();
  });
  await f.until(() => updates === 1);
  f.page.visibilityState = 'hidden';
  publishChange();
  await wait(300);
  assert.equal(updates, 1);
  f.page.visibilityState = 'visible';
  f.page.dispatchEvent(new Event('visibilitychange'));
  await f.until(() => updates === 2);
  f.accounts.get('customer:alice').passwordChangedAt = 400;
  publishChange();
  await f.until(() => ended !== null);
  assert.equal(ended, 'UNAUTHENTICATED');
  await f.until(() => f.realtime.io.of('/').sockets.size === 0);
});

test('an old socket cannot sign out a token saved by password renewal', async (t) => {
  const f = await portalFixture(t);
  let currentToken = f.token();
  let signedOut = false;
  const unsubscribe = onSignedOut(() => {
    signedOut = true;
  });
  const stop = startRealtimeSync(currentToken, { ...f.options, getToken: () => currentToken });
  t.after(() => {
    stop();
    unsubscribe();
  });
  await f.until(() => f.realtime.io.of('/').sockets.size === 1);
  f.accounts.get('customer:alice').passwordChangedAt = 500;
  currentToken = f.token();
  publishChange();
  await f.until(() => f.realtime.io.of('/').sockets.size === 0);
  assert.equal(signedOut, false);
});

test('real HTTP routes retain admin guards and scope reservation reads to the JWT customer', async (t) => {
  const f = await fixture(t, { handler: createApp() });
  const originalQuery = pool.query;
  const originalConnection = pool.getConnection;
  const queries = [];
  pool.query = async (sql, params) => {
    if (sql.includes('FROM customers WHERE id = ?')) {
      const account = f.accounts.get(`customer:${params[0]}`);
      return [account ? [{ name: account.name, password_changed_at: account.passwordChangedAt }] : []];
    }
    throw new Error('Unexpected SQL in the HTTP guard test');
  };
  pool.getConnection = async () => ({
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql, params) {
      queries.push({ sql, params });
      return [[]];
    }
  });
  t.after(() => {
    pool.query = originalQuery;
    pool.getConnection = originalConnection;
  });
  const token = f.token('customer', 'bob');
  const get = (path, bearer = token) =>
    fetch(`${f.url}${path}`, { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} });
  assert.equal((await get('/api/admin/reservations', '')).status, 401);
  assert.equal((await get('/api/admin/reservations')).status, 403);
  const listing = await get('/api/reservations?customerId=alice');
  assert.equal(listing.status, 200);
  assert.deepEqual(await listing.json(), []);
  assert.match(queries[0].sql, /WHERE r\.customer_id = \?/);
  assert.deepEqual(queries[0].params, ['bob']);
  const other = await get('/api/reservations/other-customer-ref?customerId=alice');
  assert.equal(other.status, 404);
  assert.match(queries[1].sql, /WHERE r\.customer_id = \? AND r\.ref = \?/);
  assert.deepEqual(queries[1].params, ['bob', 'other-customer-ref']);
  f.accounts.get('customer:bob').passwordChangedAt = 999;
  assert.equal((await get('/api/reservations')).status, 401);
});

test('oversized socket packets are disconnected without broadcasting', async (t) => {
  const f = await fixture(t);
  const socket = f.client();
  await connected(socket);
  const disconnected = event(socket, 'disconnect');
  socket.emit('change', 'x'.repeat(8192));
  await disconnected;
});
