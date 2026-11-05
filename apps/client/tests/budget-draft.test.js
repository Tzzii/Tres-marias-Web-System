import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blankBudgetDraft,
  cleanBudgetDraft,
  buildBudgetContext,
  budgetInputKey,
  baselineFor,
  verifiedDraftSavings,
  generationProblem,
  createBudgetRequestGuard
} from '../src/lib/budgetDraft.js';
import { estimateBudget } from '../../../packages/shared/src/domain/budget.js';
import { budgetCatalog, budgetContext } from '../../api/tests/helpers/budget-fixtures.js';

export function draftFixture() {
  const catalog = { ...budgetCatalog(), budgetCatalogFingerprint: 'a'.repeat(64) };
  const context = budgetContext();
  const form = {
    ...context,
    guests: '200',
    addonIds: ['stage', 'helpers', 'sound'],
    addonQty: { helpers: '5', premium: '1' },
    menu: { pork: ['Adobo'] },
    budgetDraft: { ...blankBudgetDraft(), amount: '150000' }
  };
  return { catalog, form };
}
test('old/corrupted drafts restore safe defaults and never restore executable provider output', () => {
  assert.deepEqual(cleanBudgetDraft(null), blankBudgetDraft());
  assert.deepEqual(
    cleanBudgetDraft({
      history: [{}],
      protectedAddonIds: 'broken',
      secret: 'not-persisted',
      proposal: { candidates: ['fake'] }
    }),
    blankBudgetDraft()
  );
  const cleaned = cleanBudgetDraft({
    amount: '₱150,000',
    preferences: 'x'.repeat(600),
    protectedAddonIds: ['a', 'a'],
    proposalRef: { id: 'budget-1', generatedAt: 1 }
  });
  assert.equal(cleaned.amount, '150000');
  assert.equal(cleaned.preferences.length, 500);
  assert.deepEqual(cleaned.protectedAddonIds, ['a']);
  assert.ok(!('proposal' in cleaned));
});
test('generation context normalizes parent choices and validates budget, date and current catalog', () => {
  const { catalog, form } = draftFixture();
  const context = buildBudgetContext(form, catalog);
  assert.deepEqual(context.selection.addonIds, ['helpers', 'premium', 'stage']);
  assert.equal(generationProblem(form, catalog), '');
  assert.ok(generationProblem({ ...form, budgetDraft: { amount: '' } }, catalog));
  assert.ok(generationProblem({ ...form, date: '' }, catalog));
  assert.ok(generationProblem(form, { ...catalog, budgetCatalogFingerprint: '' }));
  const initial = budgetInputKey(form, catalog);
  assert.notEqual(initial, budgetInputKey({ ...form, guests: '201' }, catalog));
  assert.equal(initial, budgetInputKey({ ...form, budgetDraft: { ...form.budgetDraft, history: [] } }, catalog));
});
test('savings never count guest-count changes or unpriced changes as verified savings', () => {
  const { catalog, form } = draftFixture();
  const context = buildBudgetContext(form, catalog);
  const estimate = estimateBudget(context, { catalog });
  form.budgetDraft.baseline = baselineFor(context, estimate, catalog);
  const fewerGuests = { ...form, guests: '199' };
  assert.equal(
    verifiedDraftSavings(fewerGuests, catalog, estimateBudget(buildBudgetContext(fewerGuests, catalog), { catalog })),
    null
  );
  form.addonIds.push('unknown');
  assert.equal(
    verifiedDraftSavings(form, catalog, estimateBudget(buildBudgetContext(form, catalog), { catalog })),
    null
  );
});
test('request guard ignores late results, cancels on context changes and deduplicates generation', () => {
  const guard = createBudgetRequestGuard();
  const first = guard.begin('a');
  assert.equal(guard.begin('a'), null);
  assert.equal(guard.current(first, 'a'), true);
  guard.cancel();
  const second = guard.begin('b');
  assert.equal(guard.current(first, 'a'), false);
  assert.equal(guard.current(second, 'b'), true);
  guard.finish(first);
  assert.equal(guard.current(second, 'b'), true);
  guard.finish(second);
  assert.equal(guard.current(second, 'b'), false);
});
