import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { budgetPolicyBody } from '../src/modules/catalog/catalog.schemas.js';
import { listAddons, setBudgetPolicy } from '../src/modules/catalog/catalog.repo.js';

test('schema supports disabled policy defaults, immutable request JSON and expiring owner-scoped proposals', async () => {
  const sql = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
  assert.match(sql.match(/CREATE TABLE addons \([\s\S]*?\) ENGINE/)[0], /budget_policy\s+JSON\s+NULL/);
  assert.match(sql.match(/CREATE TABLE reservations \([\s\S]*?\) ENGINE/)[0], /budget_request\s+JSON\s+NULL/);
  const proposals = sql.match(/CREATE TABLE budget_proposals \([\s\S]*?\) ENGINE/)?.[0] || '';
  assert.match(proposals, /REFERENCES customers \(id\)/);
  assert.match(proposals, /expires_at/);
  assert.match(proposals, /PRIMARY KEY \(id\)/);
});
test('catalog repository round trips nullable and saved policy JSON for bookable children', async () => {
  const policy = { allowRemove: true, minQty: null, replacementIds: [], requires: [] };
  const writes = [];
  const db = {
    query: async (sql, params) => {
      if (sql.startsWith('UPDATE')) {
        writes.push(params);
        return [{ affectedRows: 1 }];
      }
      return [
        [
          { id: 'sound', name: 'Sound', has_packages: 1, price: null },
          { id: 'basic', parent_id: 'sound', name: 'Basic', price: 1000, budget_policy: JSON.stringify(policy) }
        ]
      ];
    }
  };
  const catalog = await listAddons({}, db);
  assert.equal(catalog[0].budgetPolicy, null);
  assert.deepEqual(catalog[0].sizes[0].budgetPolicy, policy);
  await setBudgetPolicy('basic', policy, db);
  assert.deepEqual(writes, [[JSON.stringify(policy), 'basic']]);
  assert.equal(budgetPolicyBody.safeParse({}).success, false);
  assert.equal(budgetPolicyBody.safeParse({ budgetPolicy: null }).success, true);
});
