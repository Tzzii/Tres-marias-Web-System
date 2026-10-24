import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { createGoogleRoutes } from '../src/modules/auth/google.routes.js';
import { errorHandler } from '../src/middleware/errors.js';

test('Google HTTP routes protect origin, validate bodies and return uncached config and sessions', async (t) => {
  const received = [];
  const app = express();
  app.use(express.json());
  app.use(
    '/api/auth',
    createGoogleRoutes({
      identity: { issue: () => ({ clientId: 'fixture-client', nonce: 'nonce', challenge: 'challenge' }) },
      origins: ['https://tresmariascater.com'],
      service: {
        signIn: async (values) => {
          received.push(values);
          return { token: 'own-session', user: { id: 'cus-1' } };
        }
      }
    })
  );
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/auth/customer/google`;
  const config = await fetch(`${base}/config`);
  assert.equal(config.headers.get('cache-control'), 'no-store');
  assert.equal((await config.json()).nonce, 'nonce');
  const body = { credential: 'Google-ID-token', challenge: 'signed-nonce-challenge', remember: true };
  const post = (origin, value) =>
    fetch(base, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(value)
    });
  assert.equal((await post('https://attacker.example', body)).status, 403);
  assert.equal((await post('https://tresmariascater.com', { ...body, remember: 'true' })).status, 400);
  assert.equal((await post('https://tresmariascater.com', { ...body, credential: '' })).status, 400);
  assert.equal(received.length, 0);
  const result = await post('https://tresmariascater.com', { ...body, role: 'admin', email: 'injected@example.com' });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal((await result.json()).token, 'own-session');
  assert.deepEqual(received, [body]);
});
