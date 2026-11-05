import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBudgetCandidates } from '../../../packages/shared/src/domain/budget.js';
import {
  blankBudgetDraft,
  buildBudgetContext,
  applyDraftRecommendation,
  undoDraftRecommendation,
  restoreDraftSelections
} from '../src/lib/budgetDraft.js';
import { budgetCatalog } from '../../api/tests/helpers/budget-fixtures.js';

const fixture = () => ({
  catalog: { ...budgetCatalog(), budgetCatalogFingerprint: 'a'.repeat(64) },
  form: {
    serviceType: 'Buffet and Catering',
    packageId: 'p',
    guests: '200',
    date: '2030-12-20',
    startTime: '12:00',
    endTime: '16:00',
    occasion: 'Birthday',
    addonIds: ['stage', 'helpers', 'sound'],
    addonQty: { helpers: '5', premium: '1' },
    menu: { pork: ['Adobo'] },
    budgetDraft: { ...blankBudgetDraft(), amount: '150000' }
  }
});
test('apply, undo and restore share normal booking selections and leave menu/event data untouched', () => {
  const { catalog, form } = fixture();
  const context = buildBudgetContext(form, catalog);
  const candidates = buildBudgetCandidates(context, { catalog });
  const reduce = candidates.find((c) => c.action.type === 'reduce');
  const applied = applyDraftRecommendation(form, reduce, catalog);
  assert.equal(applied.problem, null);
  const next = { ...form, ...applied.patch };
  assert.equal(next.addonQty.helpers, '2');
  assert.deepEqual(next.menu, form.menu);
  const undone = undoDraftRecommendation(next, catalog);
  assert.equal(undone.problem, null);
  assert.equal(undone.patch.addonQty.helpers, '5');
  const replacement = candidates.find((c) => c.action.type === 'replace');
  const replaced = applyDraftRecommendation(form, replacement, catalog);
  assert.equal(replaced.problem, null);
  assert.ok(replaced.patch.addonIds.includes('sound'));
  assert.equal(replaced.patch.addonQty.basic, '1');
  assert.ok(!('premium' in replaced.patch.addonQty));
  const restored = restoreDraftSelections({ ...form, ...replaced.patch }, catalog);
  assert.equal(restored.problem, null);
  assert.equal(restored.patch.addonQty.premium, '1');
  assert.deepEqual(Object.keys(restored.patch).sort(), ['addonIds', 'addonQty', 'budgetDraft']);
});
test('undo preserves independent manual edits and refuses to overwrite a newer quantity', () => {
  const { catalog, form } = fixture();
  const candidate = buildBudgetCandidates(buildBudgetContext(form, catalog), { catalog }).find(
    (c) => c.action.type === 'reduce'
  );
  const next = { ...form, ...applyDraftRecommendation(form, candidate, catalog).patch };
  next.addonIds = next.addonIds.filter((id) => id !== 'stage');
  delete next.addonQty.stage;
  const undone = undoDraftRecommendation(next, catalog);
  assert.equal(undone.problem, null);
  assert.ok(!undone.patch.addonIds.includes('stage'));
  next.addonQty.helpers = '3';
  assert.ok(undoDraftRecommendation(next, catalog).problem);
});
test('protected selections and unavailable original options cannot be applied or restored silently', () => {
  const { catalog, form } = fixture();
  const candidate = buildBudgetCandidates(buildBudgetContext(form, catalog), { catalog }).find(
    (c) => c.action.type === 'remove' && c.action.addonId === 'stage'
  );
  assert.ok(
    applyDraftRecommendation(
      { ...form, budgetDraft: { ...form.budgetDraft, protectedAddonIds: ['stage'] } },
      candidate,
      catalog
    ).problem
  );
  const next = { ...form, ...applyDraftRecommendation(form, candidate, catalog).patch };
  catalog.addons[0].archived = true;
  assert.ok(restoreDraftSelections(next, catalog).problem);
});
