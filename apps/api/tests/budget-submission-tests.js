import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBudgetRequestSnapshot } from '../src/modules/budget/budget.submission.js';
import { createBody } from '../src/modules/reservations/reservations.schemas.js';
import { budgetCatalog, budgetContext } from './helpers/budget-fixtures.js';
import { budgetCatalogFingerprint } from '../src/lib/budgetCatalogFingerprint.js';

const fixture = () => {
  const catalog = budgetCatalog();
  catalog.budgetCatalogFingerprint = budgetCatalogFingerprint(catalog);
  const context = budgetContext(catalog.budgetCatalogFingerprint);
  return {
    catalog,
    fields: { ...context, ...context.selection, menu: { pork: ['Adobo'] } },
    request: {
      budget: 100000,
      preferences: 'Keep the stage.',
      protectedAddonIds: ['stage'],
      reviewedCatalogFingerprint: catalog.budgetCatalogFingerprint
    }
  };
};
test('normal bookings without a budget remain unchanged, including unsupported budget service types', async () => {
  assert.equal(
    await buildBudgetRequestSnapshot({ request: undefined, fields: { serviceType: 'Catering only' } }),
    null
  );
  const f = fixture();
  await assert.rejects(
    buildBudgetRequestSnapshot({ ...f, fields: { ...f.fields, serviceType: 'Catering only' } }),
    (e) => e.code === 'INVALID'
  );
});
test('snapshot records trusted exact inclusions, over-budget and unknown prices without a provider', async () => {
  const f = fixture();
  const saved = await buildBudgetRequestSnapshot({ ...f, customerId: 'owner', at: 1000 });
  assert.equal(saved.estimate.budgetStatus, 'over');
  assert.equal(saved.estimate.baseTotal, 120000);
  assert.equal(saved.estimate.knownTotal, 133000);
  assert.equal(saved.submittedAt, 1000);
  assert.equal(saved.inclusions.items[0].qty, 200);
  assert.equal(saved.inclusions.ulamCount, 4);
  assert.equal(saved.lines.find((a) => a.id === 'helpers').quantity, 5);
  assert.equal(saved.proposal, null);
  f.fields.addonIds.push('unknown');
  f.fields.addonQty.unknown = 1;
  const unknown = await buildBudgetRequestSnapshot({ ...f });
  assert.equal(unknown.estimate.budgetStatus, 'incomplete');
  assert.equal(unknown.estimate.difference, null);
  assert.equal(unknown.lines.find((a) => a.id === 'unknown').total, null);
  f.catalog.addons[0].name = 'Changed name';
  assert.equal(saved.lines.find((a) => a.id === 'stage').name, 'Stage decoration');
});
test('strict budget payload rejects money/history tampering and changed displayed pricing before submission', async () => {
  const f = fixture();
  assert.equal(createBody.safeParse({ budgetRequest: f.request }).success, true);
  for (const extra of [{ knownTotal: 1 }, { history: [] }, { originalSelection: {} }, { proposal: {} }]) {
    assert.equal(createBody.safeParse({ budgetRequest: { ...f.request, ...extra } }).success, false);
    await assert.rejects(
      buildBudgetRequestSnapshot({ ...f, request: { ...f.request, ...extra } }),
      (e) => e.code === 'INVALID'
    );
  }
  f.catalog.pricePerPlate = 650;
  await assert.rejects(
    buildBudgetRequestSnapshot(f),
    (e) => e.code === 'CATALOG_CHANGED' && e.meta.field === 'budgetRequest'
  );
});
test('proposal ownership/expiry are checked and trusted baseline changes preserve independent manual edits', async () => {
  const f = fixture();
  f.request.proposalId = 'budget-qa';
  const proposal = {
    id: 'budget-qa',
    customerId: 'owner',
    catalogFingerprint: f.catalog.budgetCatalogFingerprint,
    context: budgetContext(f.catalog.budgetCatalogFingerprint),
    originalSelection: structuredClone(f.fields.selection),
    originalEstimate: { knownTotal: 133000 },
    createdAt: 100,
    expiresAt: 10000
  };
  let seen;
  const findProposal = async (...args) => {
    seen = args;
    return proposal;
  };
  f.fields.addonQty = { ...f.fields.addonQty, helpers: 2 };
  const saved = await buildBudgetRequestSnapshot({ ...f, customerId: 'owner', at: 1000, findProposal });
  assert.equal(seen[1], 'owner');
  assert.equal(saved.proposal.originalEstimate.knownTotal, 133000);
  assert.deepEqual(
    saved.changes.map((a) => [a.id, a.before, a.after]),
    [['helpers', 5, 2]]
  );
  for (const bad of [
    null,
    { ...proposal, customerId: 'other' },
    { ...proposal, expiresAt: 1000 },
    { ...proposal, context: { ...proposal.context, guests: 10 } }
  ])
    await assert.rejects(
      buildBudgetRequestSnapshot({ ...f, customerId: 'owner', at: 1000, findProposal: async () => bad }),
      (e) => e.code === 'PROPOSAL_STALE'
    );
  delete f.request.proposalId;
  assert.equal(
    (await buildBudgetRequestSnapshot({ ...f, customerId: 'owner' })).proposal,
    null,
    'Manual submission needs no new model generation'
  );
});
