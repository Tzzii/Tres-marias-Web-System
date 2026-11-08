import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPackageCandidates,
  selectRankedPackageOptions,
  estimatePackageProposal,
  validatePackageRecipe
} from '@tm/shared/src/domain/packageProposal.js';
import { menuProblem } from '@tm/shared/src/domain/menu.js';
import { actionSelection } from '@tm/shared/src/domain/budget.js';
import { budgetCatalog } from './helpers/budget-fixtures.js';

function fixture() {
  const catalog = budgetCatalog();
  catalog.packages.push({ id: 'second', items: [{ name: 'Buffet Table', qty: null }] });
  catalog.dishes = [
    { category: 'pork', name: 'Adobo' },
    { category: 'chicken', name: 'Inasal' },
    { category: 'fish', name: 'Fish fillet' },
    { category: 'vegetable', name: 'Chopsuey' },
    { category: 'pork', name: 'Roast pork' },
    { category: 'fish', name: 'Archived dish', archived: true }
  ];
  const recipe = {
    id: 'mixed',
    name: 'Family dining',
    description: 'Plates and buffet table.',
    serviceTypes: ['Buffet and Catering', 'Catering only'],
    minGuests: 50,
    maxGuests: 200,
    cateringSetupPrice: 8000,
    components: [
      { packageId: 'p', itemIndex: 0, itemName: 'Plates', mode: 'perGuests', qty: 1, perGuests: 1 },
      { packageId: 'second', itemIndex: 0, itemName: 'Buffet Table', mode: 'fixed', qty: 1 }
    ],
    optionalAddonIds: ['premium', 'basic', 'unknown', 'stage', 'helpers']
  };
  const context = {
    serviceType: 'Buffet and Catering',
    guests: 120,
    budget: 72000,
    date: '2030-12-20',
    startTime: '12:00',
    endTime: '16:00',
    occasion: 'Birthday'
  };
  return { context, catalog, recipe, inputs: { catalog, rules: { enabled: true, recipes: [recipe] } } };
}

function setupFixture() {
  const f = fixture();
  const names = ['Chairs with cloth', 'Tiffany chairs', 'Spoons and forks', 'Glasses', 'Food warmers', 'Water table'];
  f.catalog.packages.push({ id: 'equipment', items: names.map((name) => ({ name, qty: 1 })) });
  f.recipe.components.push(
    ...names
      .map((itemName, itemIndex) => ({
        packageId: 'equipment',
        itemIndex,
        itemName,
        mode: 'fixed',
        qty: itemName === 'Food warmers' ? 5 : 100,
        ...(itemName === 'Water table' ? { qty: 1, optional: true, unitPrice: 200 } : {}),
        ...(itemName === 'Chairs with cloth' ? { unitPrice: 10 } : {}),
        ...(itemName === 'Tiffany chairs' ? { unitPrice: 30 } : {})
      }))
      .filter((c) => c.itemName !== 'Tiffany chairs')
  );
  f.inputs.rules.recipes.push({
    ...structuredClone(f.recipe),
    id: 'tiffany',
    components: f.recipe.components.map((c) =>
      c.itemName === 'Chairs with cloth' ? { ...c, itemIndex: 1, itemName: 'Tiffany chairs', unitPrice: 30 } : c
    )
  });
  f.context.guests = 100;
  f.context.setupPreferences = {
    reviewed: true,
    chairName: 'Chairs with cloth',
    items: [{ itemName: 'Water table', included: false }]
  };
  return f;
}

test('custom setup follows guest count, actual dishes and explicitly excluded optional equipment', () => {
  const { context, inputs } = setupFixture();
  const result = buildPackageCandidates(context, inputs);
  assert.ok(result.candidates.length);
  for (const candidate of result.candidates) {
    const items = candidate.packageSnapshot.items;
    for (const name of ['Plates', 'Chairs with cloth', 'Spoons and forks', 'Glasses'])
      assert.equal(items.find((i) => i.name === name)?.qty, 100);
    assert.equal(items.find((i) => i.name === 'Food warmers')?.qty, 4);
    assert.ok(!items.some((i) => ['Water table', 'Tiffany chairs'].includes(i.name)));
    assert.match(candidate.packageSnapshot.name, /custom/i);
  }
});

test('setup adjustments recalculate using approved unit prices and survive shared quote recomputation', async () => {
  const { context, inputs } = setupFixture();
  const { computeQuote } = await import('@tm/shared/src/services/pricing.js');
  const standard = buildPackageCandidates(context, inputs).candidates[0];
  context.setupPreferences.chairName = 'Tiffany chairs';
  const upgraded = buildPackageCandidates(context, inputs).candidates.find((c) => c.recipe.recipeId === 'mixed');
  assert.ok(upgraded.packageSnapshot.items.some((i) => i.name === 'Tiffany chairs' && i.qty === 100));
  assert.equal(upgraded.estimate.knownTotal - standard.estimate.knownTotal, 2000);
  assert.equal(
    computeQuote({ ...upgraded.estimate.quote, pkg: upgraded.packageSnapshot, guests: 100 }).net,
    upgraded.estimate.knownTotal
  );
});

test('identical buffet equipment has one price regardless of which reference recipe resolves it', () => {
  const { context, inputs } = setupFixture();
  const standard = estimatePackageProposal({ recipeId: 'mixed' }, context, inputs);
  const alternate = estimatePackageProposal({ recipeId: 'tiffany' }, context, inputs);
  assert.deepEqual(alternate, standard);
  const base = buildPackageCandidates(context, inputs).candidates.filter(
    (c) => !c.recipe.change && !c.recipe.menuVariant
  );
  assert.equal(base.length, 1, 'Identical delivered setups must not count as multiple package choices');
});

test('unpriced setup changes remain pending and essential dining items cannot be excluded', () => {
  const { context, inputs, recipe } = setupFixture();
  delete recipe.components.find((c) => c.itemName === 'Water table').unitPrice;
  const candidate = buildPackageCandidates(context, inputs).candidates[0];
  assert.equal(candidate.estimate.budgetStatus, 'incomplete');
  assert.ok(candidate.estimate.unknownCharges.some((c) => /water table/i.test(c.label)));
  context.setupPreferences.items.push({ itemName: 'Plates', included: false });
  assert.throws(() => buildPackageCandidates(context, inputs), /optional|essential/i);
});

test('custom buffet can build distinct menu alternatives while keeping explicit dishes and equipment answers', () => {
  const { context, inputs } = setupFixture();
  context.menu = { pork: ['Adobo'] };
  inputs.catalog.dishes.push(
    { category: 'chicken', name: 'Fried chicken' },
    { category: 'vegetable', name: 'Pinakbet' }
  );
  const options = buildPackageCandidates(context, inputs).candidates.filter(
    (c) => c.recipe.recipeId === 'mixed' && !c.recipe.change
  );
  assert.ok(new Set(options.map((o) => JSON.stringify(o.menu))).size >= 3);
  for (const option of options) {
    assert.ok(option.menu.pork.includes('Adobo'));
    assert.ok(!option.packageSnapshot.items.some((i) => i.name === 'Water table'));
    assert.deepEqual(estimatePackageProposal(option.recipe, context, inputs), option.estimate);
  }
});

test('three available custom options are returned even when ranking supplies only one ID', () => {
  const candidates = [
    { id: 'over', estimate: { budgetStatus: 'over', knownTotal: 20000 } },
    { id: 'fit-b', estimate: { budgetStatus: 'within', knownTotal: 12000 } },
    { id: 'fit-a', estimate: { budgetStatus: 'within', knownTotal: 10000 } },
    { id: 'unknown', estimate: { budgetStatus: 'incomplete', knownTotal: 8000 } }
  ];
  assert.deepEqual(selectRankedPackageOptions(['fit-b'], candidates), ['fit-b', 'fit-a', 'unknown']);
  assert.deepEqual(selectRankedPackageOptions(['fit-b'], candidates.slice(1, 2)), ['fit-b']);
  assert.throws(() => selectRankedPackageOptions(['invented'], candidates));
});

test('builds a mixed complete setup at exactly the buffet budget without a selected package', () => {
  const { context, inputs } = fixture();
  const [base] = buildPackageCandidates(context, inputs).candidates;
  assert.deepEqual(base.packageSnapshot.items, [
    { name: 'Plates', qty: 120, grows: false },
    { name: 'Buffet Table', qty: 1, grows: false }
  ]);
  assert.equal(base.packageSnapshot.guests, 120);
  assert.equal(base.estimate.quote.food, 72000);
  assert.equal(base.estimate.quote.packageTotal, 0);
  assert.equal(base.estimate.knownTotal, 72000);
  assert.equal(base.estimate.difference, 0);
  assert.equal(base.estimate.budgetStatus, 'within');
  assert.deepEqual(estimatePackageProposal(base.recipe, context, inputs), base.estimate);
  assert.equal(menuProblem(base.menu), null);
  assert.ok(base.pending.length);
});

test('keeps complete meals for all guests even when required food alone exceeds budget', () => {
  const { context, inputs } = fixture();
  const result = buildPackageCandidates({ ...context, budget: 70000 }, inputs);
  assert.ok(result.noFitReasons.length);
  assert.equal(result.candidates[0].estimate.difference, 2000);
  assert.equal(result.candidates[0].estimate.quote.plates, 120);
  assert.ok(result.candidates.every((option) => option.estimate.budgetStatus !== 'within'));
});

test('fills partial menu from offered dishes, retaining both custom selections in a category', () => {
  const { context, inputs } = fixture();
  const menu = { pork: ['Roast pork', 'Adobo'] };
  const result = buildPackageCandidates({ ...context, menu }, inputs).candidates[0];
  assert.deepEqual(result.menu.pork, menu.pork);
  assert.equal(menuProblem(result.menu), null);
  for (const bad of [{ fish: ['Archived dish'] }, { pork: ['Adobo', 'Adobo'] }, { pork: ['Aa', 'Bb', 'Cc'] }])
    assert.throws(() => buildPackageCandidates({ ...context, menu: bad }, inputs));
});

test('reassigns overlapping catalog dishes between categories to fill four distinct slots', () => {
  const { context, inputs, catalog } = fixture();
  catalog.dishes = [
    { category: 'pork', name: 'Adobo' },
    { category: 'pork', name: 'Roast pork' },
    { category: 'pork', name: 'Humba' },
    { category: 'chicken', name: 'ADOBO' },
    { category: 'chicken', name: 'Inasal' }
  ];
  const [option] = buildPackageCandidates(context, inputs).candidates;
  assert.deepEqual(new Set(option.menu.pork), new Set(['Roast pork', 'Humba']));
  assert.deepEqual(new Set(option.menu.chicken), new Set(['ADOBO', 'Inasal']));
  assert.throws(() => buildPackageCandidates({ ...context, menu: { pork: ['Adobo'], chicken: ['adobo'] } }, inputs));
  // An explicit choice cannot be moved to another category to fill a fourth slot.
  const locked = buildPackageCandidates({ ...context, menu: { pork: ['Adobo'] } }, inputs);
  assert.deepEqual(locked.candidates, []);
  assert.ok(locked.noFitReasons.length);
  catalog.dishes = catalog.dishes.filter((d) => d.name !== 'Humba');
  const impossible = buildPackageCandidates(context, inputs);
  assert.deepEqual(impossible.candidates, []);
  assert.ok(impossible.noFitReasons.length);
});

test('catalog indexing and saved policy reads stay bounded across many service variants', () => {
  const { context, inputs, catalog, recipe } = fixture();
  let catalogReads = 0,
    policyReads = 0;
  const services = Array.from({ length: 32 }, (_, i) => ({
    id: `service-${i}`,
    name: `Service ${i}`,
    price: 100,
    budgetPolicy: {
      allowRemove: true,
      get requires() {
        policyReads++;
        return [];
      }
    }
  }));
  Object.defineProperty(catalog, 'addons', {
    get() {
      catalogReads++;
      return services;
    }
  });
  context.addonIds = services.map((a) => a.id);
  recipe.optionalAddonIds = context.addonIds;
  inputs.rules.recipes.push({ ...recipe, id: 'another', name: 'Another name' });
  const result = buildPackageCandidates(context, inputs);
  assert.equal(result.candidates.length, 33);
  assert.ok(catalogReads > 0 && catalogReads <= 2, `Full catalog accesses: ${catalogReads}`);
  assert.ok(policyReads > 0 && policyReads <= services.length * 2, `Policy reads: ${policyReads}`);
});

test('request-local policies never survive a build and stock remains specific to each candidate', () => {
  const { context, inputs, catalog, recipe } = fixture();
  catalog.addons = [
    { id: 'first', name: 'First', price: 100, inventoryItemId: 'shared-stock' },
    { id: 'second', name: 'Second', price: 100, inventoryItemId: 'shared-stock' }
  ];
  context.addonIds = ['first'];
  recipe.optionalAddonIds = ['first', 'second'];
  inputs.stock = { 'shared-stock': { left: 1 } };
  const original = buildPackageCandidates(context, inputs);
  assert.equal(original.candidates.length, 1);
  assert.deepEqual(original.candidates[0].addonIds, ['first']);
  inputs.stock['shared-stock'].left = 2;
  assert.ok(buildPackageCandidates(context, inputs).candidates.some((c) => c.recipe.change?.type === 'add'));
  catalog.addons[0].budgetPolicy = { allowRemove: true };
  assert.ok(buildPackageCandidates(context, inputs).candidates.some((c) => c.recipe.change?.type === 'remove'));
  catalog.addons[0].budgetPolicy = { allowRemove: false };
  assert.ok(buildPackageCandidates(context, inputs).candidates.every((c) => c.recipe.change?.type !== 'remove'));
  inputs.stock['shared-stock'].left = 0;
  assert.deepEqual(buildPackageCandidates(context, inputs).candidates, []);
});

test('quoted addons stay incomplete even if known subtotal is affordable, explicit zero is known', () => {
  const { context, inputs, catalog } = fixture();
  context.addonIds = ['unknown'];
  context.protectedAddonIds = ['unknown'];
  const result = buildPackageCandidates(context, inputs);
  assert.ok(result.noFitReasons.length);
  assert.ok(result.candidates.every((c) => c.addonIds.includes('unknown') && c.estimate.budgetStatus === 'incomplete'));
  assert.equal(result.candidates[0].estimate.difference, null);
  assert.equal(result.candidates[0].estimate.unknownCharges[0].id, 'unknown');
  catalog.addons.find((a) => a.id === 'unknown').price = 0;
  assert.equal(buildPackageCandidates(context, inputs).candidates[0].estimate.budgetStatus, 'within');
});

test('catering-only receives the approved setup charge and six-hour fee, without buffet meals', () => {
  const { context, inputs } = fixture();
  const [base] = buildPackageCandidates(
    { ...context, serviceType: 'Catering only', endTime: '18:00' },
    inputs
  ).candidates;
  assert.deepEqual(base.menu, {});
  assert.equal(base.packageSnapshot.price, 8000);
  assert.equal(base.estimate.quote.plates, 0);
  assert.equal(base.estimate.quote.durationCharge, 5000);
  assert.equal(base.estimate.knownTotal, 13000);
});

test('requires known stock for inventory replacements and preserves requested protected groups', () => {
  const { context, catalog, inputs } = fixture();
  catalog.addons[3].sizes[1].inventoryItemId = 'speakers';
  context.addonIds = ['premium'];
  const replacement = (stock) =>
    buildPackageCandidates(context, { ...inputs, stock }).candidates.find(
      (option) => option.recipe.change?.type === 'replace'
    );
  const change = { type: 'replace', addonId: 'premium', replacementId: 'basic' };
  const ref = { recipeId: 'mixed', change };
  assert.equal(validatePackageRecipe(ref, context, catalog, inputs.rules).valid, true);
  assert.throws(() => estimatePackageProposal(ref, context, inputs));
  assert.throws(() => actionSelection(context, { addonIds: ['premium'], addonQty: { premium: 1 } }, change, inputs));
  assert.equal(replacement(), undefined);
  assert.equal(replacement({ speakers: { left: 0 } }), undefined);
  assert.deepEqual(replacement({ speakers: { left: 1 } }).addonIds, ['basic']);
  context.protectedAddonIds = ['sound'];
  assert.equal(replacement({ speakers: { left: 1 } }), undefined);
  assert.ok(buildPackageCandidates(context, inputs).candidates.every((c) => c.addonIds.includes('premium')));
});

test('preserves food add-ons and supporting services and does not generate an unapproved extra', () => {
  const { context, inputs, catalog, recipe } = fixture();
  catalog.addons.push({ id: 'add-dessert', name: 'Dessert', price: 1500 });
  recipe.optionalAddonIds.push('add-dessert');
  recipe.optionalAddonIds = recipe.optionalAddonIds.filter((id) => id !== 'basic');
  catalog.addons[0].budgetPolicy.requires = ['helpers'];
  context.addonIds = ['add-dessert', 'helpers', 'stage'];
  context.protectedAddonIds = ['stage'];
  context.addonQty = { helpers: 3 };
  context.menu = { dessert: { name: 'Fruit salad' } };
  const result = buildPackageCandidates(context, inputs);
  assert.ok(result.candidates.length);
  for (const c of result.candidates) {
    assert.ok(c.addonIds.includes('helpers') && c.addonIds.includes('stage') && c.addonIds.includes('add-dessert'));
    assert.equal(c.menu.dessert.name, 'Fruit salad');
    assert.ok(!c.addonIds.includes('basic'));
  }
});

test('missing price, missing duration fee, and missing buffet options cannot establish a fit', () => {
  const { context, inputs, catalog } = fixture();
  context.endTime = '18:00';
  delete catalog.pricePerPlate;
  delete catalog.sixHourFee;
  const [base] = buildPackageCandidates(context, inputs).candidates;
  assert.equal(base.estimate.budgetStatus, 'incomplete');
  assert.deepEqual(
    base.estimate.unknownCharges.map((a) => a.id),
    ['buffet-rate', 'duration']
  );
  catalog.dishes = [{ category: 'chicken', name: 'Inasal' }];
  const empty = buildPackageCandidates(context, inputs);
  assert.deepEqual(empty.candidates, []);
  assert.ok(empty.noFitReasons.length);
});

test('unsupported quantities cannot be passed on to a replacement or used to price a package', () => {
  const { context, catalog, inputs } = fixture();
  catalog.addons[1].budgetPolicy.replacementIds = ['basic'];
  context.addonIds = ['helpers'];
  context.addonQty = { helpers: 3 };
  const result = buildPackageCandidates(context, inputs);
  assert.ok(result.candidates.length);
  assert.ok(result.candidates.every((c) => c.recipe.change?.type !== 'replace'));
  assert.throws(() => buildPackageCandidates({ ...context, addonIds: ['stage'], addonQty: { stage: 2 } }, inputs));
});

test('missing approvals and catalog edits fail closed, equivalent recipes do not crowd out alternatives', () => {
  const { context, inputs, recipe, catalog } = fixture();
  for (const rules of [undefined, { enabled: false, recipes: [] }, { enabled: true, recipes: [] }]) {
    const result = buildPackageCandidates(context, { ...inputs, rules });
    assert.deepEqual(result.candidates, []);
    assert.ok(result.noFitReasons.length);
  }
  const original = buildPackageCandidates(context, inputs);
  inputs.rules.recipes.push({ ...recipe, id: 'copy', name: 'Other name' });
  assert.equal(buildPackageCandidates(context, inputs).candidates.length, original.candidates.length);
  catalog.packages[1].archived = true;
  assert.deepEqual(buildPackageCandidates(context, inputs).candidates, []);
});

test('caller supplied prices, package, selections, stock and fit cannot override authoritative values', () => {
  const { context, inputs } = fixture();
  const forged = {
    ...context,
    packageId: 'p',
    packageSnapshot: { price: 1 },
    estimate: { knownTotal: 1 },
    stock: { fake: { left: 900 } },
    pricePerPlate: 1,
    budgetStatus: 'within',
    recipe: { recipeId: 'fake' }
  };
  const result = buildPackageCandidates(forged, inputs);
  assert.equal(result.context.packageId, undefined);
  assert.equal(result.candidates[0].estimate.knownTotal, 72000);
  for (const fake of [
    { recipeId: 'made-up' },
    { recipeId: 'mixed', price: 1 },
    { recipeId: 'mixed', change: { type: 'add', addonId: 'fake' } }
  ]) {
    assert.equal(validatePackageRecipe(fake, context, inputs.catalog, inputs.rules).valid, false);
    assert.throws(() => estimatePackageProposal(fake, context, inputs));
  }
});
