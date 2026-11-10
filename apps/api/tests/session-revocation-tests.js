import jwt from 'jsonwebtoken';
import { config } from '../src/config.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readSessionToken, sessionTokenHash } from '../src/middleware/auth.js';
import { signToken, readToken } from '../src/lib/tokens.js';
import express from 'express';
import { once } from 'node:events';
import { customerSessionRoutes } from '../src/modules/auth/session.routes.js';
import { errorHandler } from '../src/middleware/errors.js';

test('logout router permits anonymous authentication routes to fall through while guarding logout', async (t) => {
  const app = express();
  app.use('/api/auth/customer', customerSessionRoutes);
  app.post('/api/auth/customer/:action', (req, res) => res.json({ action: req.params.action }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/auth/customer`;
  for (const action of ['login', 'register', 'password-reset', 'google']) {
    const response = await fetch(`${base}/${action}`, { method: 'POST' });
    assert.equal(response.status, 200, action);
    assert.deepEqual(await response.json(), { action });
  }
  for (const action of ['logout', 'logout-all']) {
    const response = await fetch(`${base}/${action}`, { method: 'POST' });
    assert.equal(response.status, 401, action);
  }
});

const token = () => signToken({ id: 'customer-a', role: 'customer', passwordChangedAt: 0 }, { ttl: '1h' });

test('individual logout rejects copied customer token and passes only its digest to storage', async () => {
  const copied = token();
  const result = await readSessionToken(copied, async (role, id, hash) => {
    assert.equal(role, 'customer');
    assert.equal(id, 'customer-a');
    assert.equal(hash, sessionTokenHash(copied));
    assert.equal(hash.length, 64);
    assert.notEqual(hash, copied);
    return { name: 'Customer', passwordChangedAt: 0, tokenRevoked: true };
  });
  assert.equal(result.user, null);
});

test('all-device cutoff rejects tokens issued before or at cutoff and allows later ones', async () => {
  const saved = token();
  const issued = readToken(saved).issuedMs;
  assert.ok(Number.isFinite(issued));
  for (const cutoff of [issued, issued + 1]) {
    assert.equal(
      (
        await readSessionToken(saved, async () => ({
          name: 'Customer',
          passwordChangedAt: 0,
          sessionsRevokedAt: cutoff
        }))
      ).user,
      null
    );
  }
  assert.equal(
    (
      await readSessionToken(saved, async () => ({
        name: 'Customer',
        passwordChangedAt: 0,
        sessionsRevokedAt: issued - 1
      }))
    ).user.id,
    'customer-a'
  );
});

test('legacy tokens remain supported before logout-all and are revoked afterward', async () => {
  const saved = jwt.sign({ sub: 'customer-a', role: 'customer', pwv: 0 }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: '1h'
  });
  assert.equal(
    (
      await readSessionToken(saved, async () => ({
        name: 'Customer',
        passwordChangedAt: 0,
        sessionsRevokedAt: Date.now()
      }))
    ).user,
    null
  );
  assert.equal(
    (await readSessionToken(saved, async () => ({ name: 'Customer', passwordChangedAt: 0 }))).user.id,
    'customer-a'
  );
});

test('concurrent sign-ins have distinct tokens so logout revokes only one session', () => {
  assert.notEqual(token(), token());
});

test('HTTP logout invalidates the copied token and logout-all invalidates other sessions', async (t) => {
  const { default: express } = await import('express');
  const { once } = await import('node:events');
  const { pool } = await import('../src/db.js');
  const { customerSessionRoutes } = await import('../src/modules/auth/session.routes.js');
  const { requireAuth } = await import('../src/middleware/auth.js');
  const revoked = new Set();
  let cutoff = 0;
  const originalQuery = pool.query;
  pool.query = async (sql, params) => {
    if (sql.includes('FROM customers WHERE id = ?'))
      return [
        [
          {
            name: 'Customer',
            password_changed_at: 0,
            sessions_revoked_at: cutoff,
            token_revoked: revoked.has(params[0]) ? 1 : 0
          }
        ]
      ];
    if (sql.startsWith('INSERT INTO revoked_customer_tokens')) {
      revoked.add(params[0]);
      return [{}];
    }
    if (sql.startsWith('DELETE FROM revoked_customer_tokens')) return [{}];
    if (sql.startsWith('UPDATE customers SET sessions_revoked_at')) {
      cutoff = Math.max(cutoff, params[0]);
      return [{}];
    }
    throw new Error(`Unexpected query ${sql}`);
  };
  const app = express();
  app.use('/session', customerSessionRoutes);
  app.get('/private', requireAuth, (req, res) => res.json({ ok: true }));
  app.use((err, req, res, next) => res.status(401).json({ code: err.code }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    pool.query = originalQuery;
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, bearer, method = 'GET') =>
    fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${bearer}` } });
  const first = token();
  const other = token();
  assert.equal((await call('/private', first)).status, 200);
  assert.equal((await call('/session/logout', first, 'POST')).status, 200);
  assert.equal((await call('/private', first)).status, 401);
  assert.equal((await call('/private', other)).status, 200);
  assert.equal((await call('/session/logout-all', other, 'POST')).status, 200);
  assert.equal((await call('/private', other)).status, 401);
});
