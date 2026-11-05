import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBudgetSelection,
  estimateBudget,
  buildBudgetCandidates,
  applyBudgetCandidate
} from '@tm/shared/src/domain/budget.js';

const permission = (patch = {}) => ({ allowRemove: true, minQty: null, replacementIds: [], requires: [], ...patch });
const catalog = {
  pricePerPlate: 600,
  sixHourFee: 5000,
  packages: [{ id: 'p', price: 12000, guests: 100, items: [{ name: 'Plates', qty: 100 }] }],
  addons: [
    { id: 'stage', name: 'Stage', price: 5000, budgetPolicy: permission() },
    { id: 'helpers', name: 'Helpers', hasQuantity: true, price: 800, budgetPolicy: permission({ minQty: 2 }) },
    { id: 'unknown', name: 'Custom service', price: null, budgetPolicy: permission() },
    { id: 'protected', name: 'Protected', price: 9000 },
    { id: 'add-dessert', name: 'Dessert', price: 2000, budgetPolicy: permission() },
    {
      id: 'sound',
      hasPackages: true,
      sizes: [
        {
          id: 'premium',
          parentId: 'sound',
          isPackage: true,
          name: 'Premium',
          price: 4000,
          description: '4 speakers',
          budgetPolicy: permission({ replacementIds: ['basic'] })
        },
        { id: 'basic', parentId: 'sound', isPackage: true, name: 'Basic', price: 1500, description: '2 speakers' }
      ]
    }
  ]
};
const selection = { addonIds: ['stage', 'helpers', 'premium'], addonQty: { helpers: 5 } };
const context = {
  serviceType: 'Buffet and Catering',
  packageId: 'p',
  guests: 200,
  date: '2030-01-01',
  startTime: '12:00',
  endTime: '16:00',
  budget: 200000,
  selection,
  protectedAddonIds: []
};
const inputs = { catalog, context };
const ctx = (patch) => ({ ...context, ...patch });
const run = (c = context, i = inputs) => buildBudgetCandidates(c, { ...i, context: c });
const find = (type, id = 'helpers', candidates = run()) =>
  candidates.find((c) => c.action.type === type && c.action.addonId === id);

test('normalization uses only bookable leaf IDs, preserves quantity rules and rejects invalid choices', () => {
  assert.deepEqual(normalizeBudgetSelection({ addonIds: ['sound'], addonQty: { premium: 1 } }, catalog), {
    addonIds: ['premium'],
    addonQty: { premium: 1 }
  });
  for (const raw of [
    { addonIds: ['missing'] },
    { addonIds: ['sound'] },
    { addonIds: ['helpers'], addonQty: { helpers: 0 } },
    { addonIds: ['premium', 'basic'] }
  ])
    assert.throws(() => normalizeBudgetSelection(raw, catalog));
});
test('complete totals, equality and base-only excess use the fixed inclusive base', () => {
  const estimate = estimateBudget(context, inputs);
  assert.equal(estimate.baseTotal, 120000);
  assert.equal(estimate.knownTotal, 133000);
  assert.equal(estimate.budgetStatus, 'within');
  assert.equal(estimateBudget(ctx({ budget: 133000 }), inputs).difference, 0);
  const over = estimateBudget(ctx({ budget: 100000 }), inputs);
  assert.equal(over.baseExceedsBudget, true);
  assert.equal(over.knownOverBudget, 33000);
  assert.equal(estimateBudget(ctx({ endTime: '18:00' }), inputs).knownTotal, 138000);
});
test('unknown prices give incomplete estimates and an honest minimum excess', () => {
  const c = ctx({ budget: 100000, selection: { addonIds: ['stage', 'unknown'] } });
  const estimate = estimateBudget(c, inputs);
  assert.equal(estimate.budgetStatus, 'incomplete');
  assert.equal(estimate.difference, null);
  assert.equal(estimate.knownTotal, 125000);
  assert.equal(estimate.knownOverBudget, 25000);
  assert.deepEqual(
    estimate.unknownCharges.map((a) => a.id),
    ['unknown']
  );
  assert.equal(find('remove', 'unknown', run(c)).knownSavings, null);
  assert.equal(find('remove', 'stage', run(c)).knownSavings, 5000);
});
test('removal, quantity reduction and replacement savings are computed from catalog values', () => {
  assert.equal(find('remove', 'stage').knownSavings, 5000);
  assert.equal(find('reduce').action.quantity, 2);
  assert.equal(find('reduce').knownSavings, 2400);
  assert.equal(find('replace', 'premium').knownSavings, 2500);
  assert.ok(find('replace', 'premium').tradeoffs.join(' ').includes('2 speakers'));
});
test('protected services, absent permissions and food never generate cuts', () => {
  const c = ctx({
    protectedAddonIds: ['stage', 'sound'],
    selection: { addonIds: [...selection.addonIds, 'protected', 'add-dessert'], addonQty: { helpers: 5 } }
  });
  assert.ok(run(c).every((r) => r.action.addonId === 'helpers'));
  for (const r of run()) {
    assert.ok(['remove', 'reduce', 'replace'].includes(r.action.type));
    assert.equal(r.beforeEstimate.baseTotal, r.afterEstimate.baseTotal);
    assert.equal(r.afterEstimate.pricingModel, 'inclusive-buffet-v2');
  }
  assert.throws(() => estimateBudget(ctx({ serviceType: 'Catering only' }), inputs));
});
test('dependencies prevent removal and no cheaper option is invented', () => {
  const amended = structuredClone(catalog);
  amended.addons[1].budgetPolicy.requires = ['stage'];
  assert.equal(find('remove', 'stage', run(context, { catalog: amended })), undefined);
  amended.addons[1].budgetPolicy.minQty = null;
  assert.equal(find('reduce', 'helpers', run(context, { catalog: amended })), undefined);
  amended.addons[5].sizes[1].price = 6000;
  assert.equal(find('replace', 'premium', run(context, { catalog: amended })), undefined);
});
test('known availability and missing availability exclude inventory replacements', () => {
  const amended = structuredClone(catalog);
  amended.addons[5].sizes[1].inventoryItemId = 'speakers';
  assert.equal(find('replace', 'premium', run(context, { catalog: amended })), undefined);
  assert.equal(
    find('replace', 'premium', run(context, { catalog: amended, stock: { speakers: { left: 0 } } })),
    undefined
  );
  assert.ok(find('replace', 'premium', run(context, { catalog: amended, stock: { speakers: { left: 1 } } })));
});
test('apply is atomic, respects current policies and rejects duplicate or incompatible actions', () => {
  const candidate = find('reduce');
  const result = applyBudgetCandidate(selection, candidate, inputs);
  assert.equal(result.problem, null);
  assert.equal(result.selection.addonQty.helpers, 2);
  assert.ok(applyBudgetCandidate(result.selection, candidate, inputs).problem);
  assert.ok(
    applyBudgetCandidate(selection, candidate, { ...inputs, context: ctx({ protectedAddonIds: ['helpers'] }) }).problem
  );
  assert.ok(applyBudgetCandidate(selection, candidate, { ...inputs, context: ctx({ guests: 201 }) }).problem);
  const tampered = { ...candidate, action: { ...candidate.action, quantity: 1 } };
  assert.ok(applyBudgetCandidate(selection, tampered, inputs).problem);
});
test('independent edits are preserved and current savings are recomputed', () => {
  const removeStage = find('remove', 'stage');
  const reduced = applyBudgetCandidate(selection, find('reduce'), inputs).selection;
  const result = applyBudgetCandidate(reduced, removeStage, inputs);
  assert.equal(result.problem, null);
  assert.equal(result.selection.addonQty.helpers, 2);
  assert.ok(!result.selection.addonIds.includes('stage'));
  assert.equal(estimateBudget(ctx({ selection: result.selection }), inputs).knownTotal, 125600);
});
test('catalog price edits, archived options and quantity drift invalidate old actions', () => {
  const candidate = find('replace', 'premium');
  const amended = structuredClone(catalog);
  amended.addons[5].sizes[1].price = 1400;
  assert.ok(applyBudgetCandidate(selection, candidate, { ...inputs, catalog: amended }).problem);
  const drift = { ...selection, addonQty: { helpers: 4 } };
  assert.ok(applyBudgetCandidate(drift, find('reduce'), inputs).problem);
  amended.addons[5].sizes[1].archived = true;
  assert.equal(find('replace', 'premium', run(context, { catalog: amended })), undefined);
});

test('dessert variants cannot produce AI removal recommendations', () => {
  const amended = structuredClone(catalog);
  amended.addons = [
    {
      id: 'add-dessert',
      sizes: [{ id: 'dessert-variant', parentId: 'add-dessert', price: 2000, budgetPolicy: permission() }]
    }
  ];
  const c = ctx({ selection: { addonIds: ['dessert-variant'] } });
  assert.deepEqual(run(c, { catalog: amended }), []);
});
