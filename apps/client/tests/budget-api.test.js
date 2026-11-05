import test from 'node:test';
import assert from 'node:assert/strict';
import { http } from '../../../packages/shared/src/services/http.js';
import { reviewBudget } from '../../../packages/shared/src/services/remote/budget.js';
test('proposal transport is an explicit quiet POST and propagates unavailable/validation states', async (t) => {
  const calls = [];
  t.mock.method(http, 'post', async (...args) => {
    calls.push(args);
    return { status: 'unavailable', candidates: [] };
  });
  const context = { budget: 100000 };
  assert.equal((await reviewBudget(context)).status, 'unavailable');
  assert.deepEqual(calls, [['/budget-proposals', context, { quiet: true }]]);
});
