import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { once } from 'node:events';
import { createBudgetRoutes } from '../src/modules/budget/budget.routes.js';
import { requireAuth, requireRole } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/errors.js';
import { signToken } from '../src/lib/tokens.js';
import { pool } from '../src/db.js';
import { budgetContext } from './helpers/budget-fixtures.js';

test('proposal route authenticates customers, rejects injected prices and limits explicit generation', async (t) => {
  t.mock.method(pool, 'query', async () => [[{ name: 'QA account', password_changed_at: 0, session_id: 'qa' }]]);
  const calls = [];
  const app = express();
  app.use(express.json());
  app.use(
    '/api/budget-proposals',
    requireAuth,
    requireRole('customer'),
    createBudgetRoutes({
      limit: 5,
      service: async (customer, body) => {
        calls.push({ customer, body });
        return { status: 'no-changes', candidates: [] };
      }
    })
  );
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((r) => server.close(r)));
  const url = `http://127.0.0.1:${server.address().port}/api/budget-proposals`;
  const send = (role, body = budgetContext(), identity = 'qa') =>
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(role
          ? { Authorization: `Bearer ${signToken({ id: identity, role, sessionId: 'qa' }, { ttl: '1h' })}` }
          : {})
      },
      body: JSON.stringify(body)
    });
  assert.equal((await send(null)).status, 401);
  assert.equal((await send('admin')).status, 403);
  assert.equal((await send('customer', { ...budgetContext(), pricePerPlate: 1 })).status, 400);
  assert.equal((await send('customer', { ...budgetContext(), serviceType: 'Catering only' })).status, 400);
  assert.equal((await send('customer', { ...budgetContext(), budget: -1 })).status, 400);
  for (const invalid of [
    { ...budgetContext(), packageId: '' },
    { ...budgetContext(), selection: { addonIds: ['helpers'], addonQty: { helpers: -1 } } },
    { ...budgetContext(), selection: { addonIds: ['helpers'], addonQty: { helpers: 1 }, price: 800 } }
  ])
    assert.equal((await send('customer', invalid, 'qa-invalid')).status, 400);
  assert.equal(calls.length, 0);
  const result = await send('customer');
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(calls[0].customer.id, 'qa');
  assert.equal((await send('customer')).status, 200);
  assert.equal((await send('customer')).status, 429);
  assert.equal(calls.length, 2);
});
