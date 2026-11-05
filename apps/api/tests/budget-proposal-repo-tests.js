import test from 'node:test';
import assert from 'node:assert/strict';
import { insertBudgetProposal, findBudgetProposal } from '../src/modules/budget/budget.repo.js';

test('proposal repository serializes server snapshots and scopes reads by authenticated owner and expiry', async () => {
  let stored;
  const db = {
    query: async (sql, args) => {
      if (sql.startsWith('INSERT')) {
        stored = args;
        return [{ affectedRows: 1 }];
      }
      assert.ok(sql.includes('customer_id = ? AND expires_at > ?'));
      if (args[0] !== stored[0] || args[1] !== stored[1] || args[2] >= stored[9]) return [[]];
      return [
        [
          {
            id: stored[0],
            customer_id: stored[1],
            context: stored[2],
            original_selection: stored[3],
            original_estimate: stored[4],
            candidates: stored[5],
            input_fingerprint: stored[6],
            catalog_fingerprint: stored[7],
            created_at: stored[8],
            expires_at: stored[9]
          }
        ]
      ];
    }
  };
  const record = {
    id: 'budget-qa',
    customerId: 'owner-a',
    context: { budget: 100000 },
    originalSelection: { addonIds: [], addonQty: {} },
    originalEstimate: { knownTotal: 120000 },
    candidates: [],
    inputFingerprint: 'a'.repeat(64),
    catalogFingerprint: 'b'.repeat(64),
    createdAt: 1,
    expiresAt: 86400001
  };
  await insertBudgetProposal(record, db);
  assert.deepEqual(await findBudgetProposal('budget-qa', 'owner-a', { db, now: 2 }), record);
  assert.equal(await findBudgetProposal('budget-qa', 'owner-b', { db, now: 2 }), null);
  assert.equal(await findBudgetProposal('budget-qa', 'owner-a', { db, now: record.expiresAt }), null);
});
