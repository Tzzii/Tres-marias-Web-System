import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config } from '../src/config.js';
import { pool, closePool } from '../src/db.js';
import { getAdminPresence, updateAdminPresence, PRESENCE_LEASE_MS } from '../src/modules/messages/presence.service.js';
import { openThread, sendMessage, getThread } from '../src/modules/messages/messages.service.js';
import { createApp } from '../src/app.js';
import { signToken } from '../src/lib/tokens.js';

test('admin presence and away acknowledgments persist with correct session and thread boundaries', async (t) => {
  assert.equal(config.isProduction, false);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(config.db.host));
  const conn = await pool.getConnection();
  let server;
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM admin_presence');
    t.mock.method(pool, 'query', (...args) => conn.query(...args));
    t.mock.method(pool, 'getConnection', async () => ({
      query: (...args) => conn.query(...args),
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release() {}
    }));
    const id = `presence-${randomUUID().slice(0, 16)}`;
    const admin = { id, role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 };
    await conn.query(
      'INSERT INTO admins (id, name, email, password_hash, created_at, session_id) VALUES (?, ?, ?, ?, ?, ?)',
      [id, 'QA Admin', `${id}@example.invalid`, 'disabled', Date.now(), 'current']
    );
    await conn.query('INSERT INTO customers (id, name, email, created_at) VALUES (?, ?, ?, ?)', [
      id,
      'QA Customer',
      `customer-${id}@example.invalid`,
      Date.now()
    ]);
    const { id: threadId } = await openThread({ customerId: id });
    const firstTab = randomUUID();
    const secondTab = randomUUID();
    const update = (clientId, sequence, active, at = Date.now()) =>
      updateAdminPresence(admin, 'current', { clientId, sequence, active }, { transact: (fn) => fn(conn), at });
    const send = (body = 'What packages are available?', side = 'customer') =>
      sendMessage(threadId, { customerId: id, side, senderName: side === 'admin' ? 'QA Admin' : 'QA Customer', body });
    const history = () => getThread(threadId, { customerId: id, side: 'customer' });
    const replies = async () => (await history()).messages.filter((m) => m.senderName === 'Automated reply');

    await t.test('an admin with no presence history is offline without an invented last-active time', async () => {
      assert.deepEqual(await getAdminPresence(conn, 1000), { online: false, offlineSince: null, serverTime: 1000 });
    });
    await t.test('offline questions receive one ordered acknowledgment per conversation', async () => {
      const question = await send();
      await send('And the price?');
      const automated = await replies();
      assert.equal(automated.length, 1);
      assert.equal(automated[0].typed, false);
      assert.ok(automated[0].at > question.at);
      assert.equal((await history()).messages[0].body, question.body);
    });
    await t.test('active tabs keep admin online and suppress automatic replies', async () => {
      await update(firstTab, 1, true);
      await update(secondTab, 1, true);
      assert.equal((await getAdminPresence(conn)).online, true);
      await send();
      assert.equal((await replies()).length, 1);
      await update(firstTab, 2, false);
      assert.equal((await getAdminPresence(conn)).online, true);
    });
    await t.test('last tab closure starts a new offline period and ignores delayed heartbeats', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await update(secondTab, 3, false);
      await update(secondTab, 2, true);
      assert.equal((await getAdminPresence(conn)).online, false);
      await send();
      await send('Another follow-up');
      assert.equal((await replies()).length, 2);
      await send('Actual admin reply', 'admin');
      assert.equal((await replies()).length, 2);
    });
    await t.test('browser crashes expire and elapsed hours come from stored timestamps', async () => {
      const at = Date.now();
      await update(firstTab, 3, true, at);
      const expired = await getAdminPresence(conn, at + PRESENCE_LEASE_MS + 7200000);
      assert.equal(expired.online, false);
      assert.equal(expired.offlineSince, at + PRESENCE_LEASE_MS);
    });
    await t.test('a replaced session cannot keep the admin online', async () => {
      await conn.query('UPDATE admins SET session_id = ? WHERE id = ?', ['replacement', id]);
      assert.equal((await getAdminPresence(conn)).online, false);
      await assert.rejects(update(firstTab, 4, true), { code: 'UNAUTHENTICATED' });
    });
    await t.test('HTTP boundaries expose only admin availability to signed-in customers', async () => {
      const app = createApp();
      server = app.listen(0, '127.0.0.1');
      await new Promise((resolve) => server.once('listening', resolve));
      const base = `http://127.0.0.1:${server.address().port}/api`;
      const customerToken = signToken({ id, role: 'customer' }, { ttl: 3600 });
      const adminToken = signToken({ id, role: 'admin', sessionId: 'replacement' }, { ttl: 3600 });
      const request = (path, token, body) =>
        fetch(base + path, {
          method: body ? 'POST' : 'GET',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {})
        });
      assert.equal((await request('/threads/admin-presence')).status, 401);
      assert.equal((await request('/threads/admin-presence', adminToken)).status, 403);
      const visible = await request('/threads/admin-presence', customerToken);
      assert.equal(visible.status, 200);
      assert.deepEqual(Object.keys(await visible.json()).sort(), ['offlineSince', 'online', 'serverTime']);
      assert.equal(
        (await request('/admin/presence', customerToken, { clientId: randomUUID(), sequence: 1, active: true })).status,
        403
      );
      assert.equal(
        (await request('/admin/presence', adminToken, { clientId: randomUUID(), sequence: 1, active: true })).status,
        200
      );
      assert.equal((await request('/admin/presence', adminToken, { clientId: 'invalid' })).status, 400);
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    t.mock.restoreAll();
    await conn.rollback();
    conn.release();
    await closePool();
  }
});
