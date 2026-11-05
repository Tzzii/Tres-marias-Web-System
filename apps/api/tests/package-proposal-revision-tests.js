import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCustomServiceRevision } from '@tm/shared/src/domain/packageProposalRevision.js';

const selection = (quantities) => ({ addonIds: Object.keys(quantities), addonQty: quantities });
const policy = (extra = {}) => ({ allowRemove: false, minQty: null, replacementIds: [], requires: [], ...extra });
function fixture() {
  return {
    current: selection({ sound: 1, helpers: 4, stage: 1 }),
    snapshot: {
      recipe: { optionalAddonIds: ['sound', 'basic', 'other', 'helpers', 'stage', 'tent', 'food'] },
      context: { protectedAddonIds: [] },
      candidate: { addonIds: ['sound'], addonQty: { sound: 1 } }
    },
    catalog: {
      addons: [
        { id: 'sound', name: 'Sound', price: 4000, budgetPolicy: policy({ replacementIds: ['basic'] }) },
        { id: 'basic', name: 'Basic sound', price: 1500 },
        { id: 'other', name: 'Other service', price: 1000 },
        { id: 'helpers', name: 'Helpers', price: 800, hasQuantity: true, budgetPolicy: policy({ minQty: 2 }) },
        { id: 'stage', name: 'Stage', price: 5000, budgetPolicy: policy({ allowRemove: true }) },
        { id: 'tent', name: 'Tent', price: 2000 },
        { id: 'food', name: 'Food', price: 500, food: true }
      ]
    }
  };
}
const revise = (input, quantities) => validateCustomServiceRevision({ ...input, selection: selection(quantities) });

test('custom service removal requires explicit removal permission', () => {
  assert.equal(revise(fixture(), { helpers: 4, stage: 1 }).valid, false);
  assert.equal(revise(fixture(), { sound: 1, helpers: 4 }).valid, true);
});

test('quantity reductions need a permitted non-null minimum and preserve its lower bound', () => {
  const input = fixture();
  assert.equal(revise(input, { sound: 1, helpers: 2, stage: 1 }).valid, true);
  assert.equal(revise(input, { sound: 1, helpers: 1, stage: 1 }).valid, false);
  input.catalog.addons.find((a) => a.id === 'helpers').budgetPolicy.minQty = null;
  assert.equal(revise(input, { sound: 1, helpers: 3, stage: 1 }).valid, false);
});

test('remove-plus-add cannot disguise an unapproved replacement even when removal is allowed', () => {
  const input = fixture();
  input.catalog.addons.find((a) => a.id === 'sound').budgetPolicy.allowRemove = true;
  assert.equal(revise(input, { other: 1, helpers: 4, stage: 1 }).valid, false);
  assert.equal(revise(input, { basic: 1, helpers: 4, stage: 1 }).valid, true);
});

test('permitted atomic multi-service revisions retain immutable original snapshots', () => {
  const input = fixture(),
    original = structuredClone(input.snapshot);
  assert.equal(revise(input, { basic: 1, helpers: 2 }).valid, true);
  assert.deepEqual(input.snapshot, original);
  assert.deepEqual(input.current, {
    addonIds: ['sound', 'helpers', 'stage'],
    addonQty: { sound: 1, helpers: 4, stage: 1 }
  });
});

test('revision compares against actual current quantities rather than original submitted quantities', () => {
  const input = fixture();
  input.current = selection({ helpers: 2 });
  assert.equal(revise(input, { helpers: 3 }).valid, true);
  assert.equal(revise(input, { helpers: 1 }).valid, false);
});

test('protected services, food and required dependencies remain guarded', () => {
  const input = fixture();
  input.snapshot.context.protectedAddonIds = ['sound'];
  assert.equal(revise(input, { basic: 1, helpers: 4, stage: 1 }).valid, false);
  assert.equal(revise(input, { sound: 1, helpers: 4, stage: 1, food: 1 }).valid, false);
  input.catalog.addons.find((a) => a.id === 'sound').budgetPolicy.requires = ['stage'];
  assert.equal(revise(input, { sound: 1, helpers: 4 }).valid, false);
});

test('new services must be whitelisted by the saved recipe and have valid current policies', () => {
  const input = fixture();
  input.snapshot.recipe.optionalAddonIds = ['sound', 'helpers', 'stage'];
  assert.equal(revise(input, { sound: 1, helpers: 4, stage: 1, tent: 1 }).valid, false);
  input.catalog.addons.find((a) => a.id === 'sound').budgetPolicy.allowRemove = 'yes';
  assert.equal(revise(input, { sound: 1, helpers: 4 }).valid, false);
});

test('replacement retains supported quantities and a verified cheaper price', () => {
  const input = fixture();
  input.catalog.addons.find((a) => a.id === 'basic').price = 5000;
  assert.equal(revise(input, { basic: 1, helpers: 4, stage: 1 }).valid, false);
  input.catalog.addons.find((a) => a.id === 'basic').price = null;
  assert.equal(revise(input, { basic: 1, helpers: 4, stage: 1 }).valid, false);
});

test('multiple replacements find compatible pairs rather than greedily rejecting a valid revision', () => {
  const input = fixture();
  input.current = selection({ sound: 1, stage: 1 });
  input.catalog.addons.find((a) => a.id === 'sound').budgetPolicy.replacementIds = ['basic', 'other'];
  input.catalog.addons.find((a) => a.id === 'stage').budgetPolicy = policy({ replacementIds: ['basic'] });
  assert.equal(revise(input, { basic: 1, other: 1 }).valid, true);
});
