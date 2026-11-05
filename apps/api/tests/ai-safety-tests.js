import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import express from 'express';
import { once } from 'node:events';
import { createAssistantRoutes } from '../src/modules/assistant/assistant.routes.js';
import { errorHandler } from '../src/middleware/errors.js';

test('admission policy covers paid text/audio, fresh sessions and photo uploads only', async () => {
  const { admissionKind } = await import('../src/modules/assistant/aiSafety.js');
  for (const path of [
    '/conversations/a/messages',
    '/conversations/a/transcriptions',
    '/conversations/a/messages/b/speech'
  ])
    assert.equal(admissionKind({ method: 'POST', path }), 'paid');
  assert.equal(admissionKind({ method: 'POST', path: '/session' }), 'session');
  assert.equal(admissionKind({ method: 'POST', path: '/conversations/a/reference-photos' }), 'upload');
  assert.equal(admissionKind({ method: 'GET', path: '/config' }), null);
  assert.equal(admissionKind({ method: 'POST', path: '/conversations/a/draft' }), null);
});

test('guard stops rejected requests before handlers and never exposes IP or credentials', async () => {
  const { createAIAdmission } = await import('../src/modules/assistant/aiSafety.js');
  let received;
  const middleware = createAIAdmission({
    admit: async (request) => {
      received = request;
      return { allowed: false, reason: 'attempt-limit' };
    }
  });
  let error;
  await middleware({ method: 'POST', path: '/session', ip: '203.0.113.1', user: { id: 'owner' } }, {}, (e) => {
    error = e;
  });
  assert.equal(error.code, 'RATE_LIMITED');
  assert.ok(received.ipKey && !received.ipKey.includes('203.0.113.1'));
  assert.ok(!JSON.stringify(received).includes('owner'));
});

test('mixed-case Express routes cannot bypass durable admission for any protected action', async () => {
  const { createAIAdmission } = await import('../src/modules/assistant/aiSafety.js');
  let admissions = 0;
  const app = express();
  app.use(express.json());
  app.use(
    '/api/assistant',
    createAssistantRoutes({
      authenticate: (req, res, next) => {
        req.user = { id: 'owner', role: 'customer' };
        next();
      },
      service: {},
      admission: createAIAdmission({
        admit: async () => {
          admissions++;
          return { allowed: false, reason: 'attempt-limit' };
        }
      })
    })
  );
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}/API/ASSISTANT`;
    const actions = [
      '/Session',
      '/Conversations/a/Messages',
      '/Conversations/a/Transcriptions',
      '/Conversations/a/Messages/b/Speech',
      '/Conversations/a/Reference-Photos'
    ];
    for (const path of actions)
      assert.equal(
        (await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }))
          .status,
        429,
        path
      );
    assert.equal(admissions, actions.length);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('admission fails closed when persistence fails, releases normal leases only on finish', async () => {
  const { createAIAdmission } = await import('../src/modules/assistant/aiSafety.js');
  const { EventEmitter } = await import('node:events');
  const res = new EventEmitter();
  let releases = 0,
    nextCalls = 0;
  const admission = createAIAdmission({
    admit: async () => ({ allowed: true, lease: 'lease' }),
    release: async () => {
      releases++;
    },
    report: async () => {}
  });
  await admission({ method: 'POST', path: '/conversations/a/messages', ip: '::1' }, res, (e) => {
    assert.equal(e, undefined);
    nextCalls++;
  });
  res.emit('close');
  assert.equal(releases, 0);
  res.emit('finish');
  await new Promise(setImmediate);
  assert.equal(releases, 1);
  assert.equal(nextCalls, 1);
  let error;
  await createAIAdmission({
    admit: async () => {
      throw new Error('private db details');
    }
  })({ method: 'POST', path: '/session', ip: '::1' }, res, (e) => {
    error = e;
  });
  assert.equal(error.code, 'ASSISTANT_UNAVAILABLE');
  assert.ok(!error.message.includes('private'));
});

test('usage alerts cover budget threshold, cap, failure circuit and abnormal traffic', async () => {
  const { deriveAlerts } = await import('../src/modules/assistant/aiSafety.repo.js');
  const alerts = deriveAlerts({
    spending: { daily: { usedCents: 80, limitCents: 100 }, monthly: { usedCents: 200, limitCents: 200 } },
    recent: { requests: 50, unknownFailures: 5 }
  });
  assert.deepEqual(
    alerts.map((a) => a.code),
    ['daily-budget-warning', 'monthly-budget-cap', 'provider-circuit', 'request-spike']
  );
  assert.deepEqual(
    deriveAlerts({
      spending: { daily: { usedCents: 0, limitCents: 0 }, monthly: { usedCents: 0, limitCents: 0 } },
      recent: { requests: 0, unknownFailures: 0 }
    }),
    []
  );
});

test('legacy budget ranking shares allowance and ledger and cleans up failures', async () => {
  const { rankBudgetForCustomer } = await import('../src/modules/budget/budget.service.js');
  const order = [];
  const assistant = {
    beginExternal: async (actor) => {
      order.push(['begin', actor.customerId]);
      return { id: 'work' };
    },
    reserveSpend: async (...args) => {
      order.push(['reserve', ...args]);
      return 'reservation';
    },
    settleSpend: async (...args) => order.push(['settle', ...args]),
    finishExternal: async (_, success) => {
      order.push(['finish', success]);
      return true;
    }
  };
  const result = await rankBudgetForCustomer({ id: 'owner' }, {}, assistant, async (_, { spend }) => {
    const id = await spend.reserve('answer', 30);
    await spend.settle(id, 20, {});
    return { rankings: [] };
  });
  assert.deepEqual(result, { rankings: [] });
  assert.deepEqual(
    order.map((entry) => entry[0]),
    ['begin', 'reserve', 'settle', 'finish']
  );
  assert.equal(order[1][2], 'c:owner');
  assert.deepEqual(order.at(-1), ['finish', true]);
  await assert.rejects(
    rankBudgetForCustomer({ id: 'owner' }, {}, assistant, async () => {
      throw new Error('provider failed');
    })
  );
  assert.deepEqual(order.at(-1), ['finish', false]);
});

test('one turn caps total reserved cost and nested calls; unknown failures do not refill budget', async () => {
  const { capTurnSpend } = await import('../src/integrations/ai/turnSpend.js');
  let requests = 0;
  const cap = capTurnSpend(
    { reserve: async () => String(++requests), settle: async () => {} },
    { maxMicro: 100, maxCalls: 3 }
  );
  const first = await cap.reserve('answer', 60);
  await cap.settle(first, 20);
  const second = await cap.reserve('answer', 60);
  await cap.settle(second, undefined);
  await assert.rejects(cap.reserve('answer', 30), (e) => e.code === 'RATE_LIMITED');
  await cap.reserve('answer', 10);
  await assert.rejects(cap.reserve('answer', 1), (e) => e.code === 'RATE_LIMITED');
  assert.equal(requests, 3);
});

test('accidentally oversized global budgets are rejected at startup', () => {
  for (const [daily, monthly, ok] of [
    [1000, 4000, true],
    [1001, 4000, false],
    [1000, 4001, false]
  ]) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', "import './src/config.js';"], {
      cwd: new URL('../', import.meta.url),
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        AI_ASSISTANT_DAILY_BUDGET_CENTS: String(daily),
        AI_ASSISTANT_MONTHLY_BUDGET_CENTS: String(monthly)
      }
    });
    assert.equal(result.status === 0, ok, result.stderr);
  }
});
