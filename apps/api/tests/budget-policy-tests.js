import test from 'node:test';
import assert from 'node:assert/strict';
import * as policies from '@tm/shared/src/domain/budgetPolicy.js';
import { budgetCatalogFingerprint } from '../src/lib/budgetCatalogFingerprint.js';
import { saveBudgetPolicy } from '../src/modules/catalog/catalog.service.js';
import { createApp } from '../src/app.js';
import { signToken } from '../src/lib/tokens.js';
import { pool } from '../src/db.js';
import { once } from 'node:events';

const catalog = [
  { id: 'helpers', hasQuantity: true },
  { id: 'stage' },
  { id: 'basic' },
  { id: 'archived', archived: true },
  { id: 'add-dessert' },
  { id: 'sound', hasPackages: true, sizes: [{ id: 'premium', parentId: 'sound', isPackage: true }] }
];
const policy = { allowRemove: true, minQty: 2, replacementIds: [], requires: [] };
test('missing policy is disabled and policies preserve explicit approved actions', () => {
  assert.deepEqual(policies.readBudgetPolicy(null, catalog[0], catalog).policy, {
    allowRemove: false,
    minQty: null,
    replacementIds: [],
    requires: []
  });
  assert.deepEqual(policies.readBudgetPolicy(policy, catalog[0], catalog).policy, policy);
});
test('invalid reductions and non-bookable, food, self, duplicate and archived references fail', () => {
  for (const minQty of [0, 100, 1.5, '2', NaN])
    assert.ok(policies.readBudgetPolicy({ ...policy, minQty }, catalog[0], catalog).problem);
  assert.ok(policies.readBudgetPolicy(policy, catalog[1], catalog).problem);
  for (const id of ['helpers', 'missing', 'archived', 'sound', 'add-dessert'])
    assert.ok(policies.readBudgetPolicy({ ...policy, replacementIds: [id] }, catalog[0], catalog).problem);
  assert.ok(policies.readBudgetPolicy({ ...policy, replacementIds: ['basic', 'basic'] }, catalog[0], catalog).problem);
  assert.ok(policies.readBudgetPolicy({ ...policy, minQty: null }, catalog[4], catalog).problem);
});
test('dependency cycles and mutually exclusive dependency choices fail', () => {
  const items = [{ id: 'a' }, { id: 'b', budgetPolicy: { ...policy, minQty: null, requires: ['a'] } }];
  assert.ok(policies.readBudgetPolicy({ ...policy, minQty: null, requires: ['b'] }, items[0], items).problem);
  const choices = [
    {
      id: 'sound',
      sizes: [
        { id: 'a', isPackage: true, parentId: 'sound' },
        { id: 'b', isPackage: true, parentId: 'sound' }
      ]
    }
  ];
  assert.ok(
    policies.readBudgetPolicy({ ...policy, minQty: null, requires: ['b'] }, choices[0].sizes[0], choices).problem
  );
});

test('dessert variants inherit the parent food exclusion', () => {
  const foodCatalog = [
    { id: 'add-dessert', sizes: [{ id: 'dessert-variant', parentId: 'add-dessert', hasQuantity: true }] }
  ];
  assert.ok(policies.readBudgetPolicy(policy, foodCatalog[0].sizes[0], foodCatalog).problem);
  const marked = [
    { id: 'food-parent', food: true, sizes: [{ id: 'food-child', parentId: 'food-parent', hasQuantity: true }] }
  ];
  assert.ok(policies.readBudgetPolicy(policy, marked[0].sizes[0], marked).problem);
});
test('catalog fingerprints ignore property/list ordering but track prices, inclusions and policies', () => {
  const a = {
    pricePerPlate: 600,
    sixHourFee: 5000,
    packages: [{ id: 'p', items: [{ name: 'Plates', qty: 200 }] }],
    addons: catalog
  };
  assert.equal(budgetCatalogFingerprint(a), budgetCatalogFingerprint({ ...a, addons: [...catalog].reverse() }));
  assert.notEqual(budgetCatalogFingerprint(a), budgetCatalogFingerprint({ ...a, pricePerPlate: 601 }));
  assert.notEqual(
    budgetCatalogFingerprint(a),
    budgetCatalogFingerprint({ ...a, addons: [{ ...catalog[0], budgetPolicy: policy }, ...catalog.slice(1)] })
  );
});
test('saving a policy validates bookable IDs and uses the authenticated admin catalog path', async () => {
  const writes = [];
  const dependencies = { readCatalog: async () => catalog, writePolicy: async (...args) => writes.push(args) };
  const result = await saveBudgetPolicy('helpers', policy, dependencies);
  assert.deepEqual(result.budgetPolicy, policy);
  assert.deepEqual(writes, [['helpers', policy]]);
  await assert.rejects(saveBudgetPolicy('sound', policy, dependencies), /bookable|available/i);
  assert.equal(writes.length, 1);
});

test('HTTP policy writes require admin authentication and persist only validated policies', async (t) => {
  const writes = [];
  t.mock.method(pool, 'query', async (sql, params) => {
    if (sql.startsWith('INSERT INTO counters')) return [{ affectedRows: 1 }];
    if (/FROM admins|FROM customers/.test(sql))
      return [[{ name: 'QA account', password_changed_at: 0, session_id: 'qa-session' }]];
    if (sql.startsWith('UPDATE addons')) {
      writes.push(params);
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM addons a')) return [[{ id: 'helpers', name: 'Helpers', has_quantity: 1, price: 800 }]];
    throw new Error(`Unexpected SQL in isolated HTTP fixture: ${sql}`);
  });
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/admin/addons/helpers/budget-policy`;
  const put = (role, body = { budgetPolicy: policy }) =>
    fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(role
          ? { Authorization: `Bearer ${signToken({ id: 'qa-account', role, sessionId: 'qa-session' }, { ttl: '1h' })}` }
          : {})
      },
      body: JSON.stringify(body)
    });
  assert.equal((await put(null)).status, 401);
  assert.equal((await put('customer')).status, 403);
  assert.equal(writes.length, 0);
  assert.equal((await put('admin', { budgetPolicy: { ...policy, minQty: 0 } })).status, 400);
  assert.equal(writes.length, 0);
  const response = await put('admin');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).budgetPolicy, policy);
  assert.equal(writes.length, 1);
});
