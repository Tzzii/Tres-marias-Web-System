import {
  normalizeBudgetSelection,
  estimateBudget,
  applyBudgetCandidate
} from '../../../../packages/shared/src/domain/budget.js';
import { budgetBookableAddons } from '../../../../packages/shared/src/domain/budgetPolicy.js';
import { endTimeProblem } from '../../../../packages/shared/src/domain/availability.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
const stable = (v) =>
  JSON.stringify(v, (_, entry) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
      : entry
  );
export const blankBudgetDraft = () => ({
  amount: '',
  preferences: '',
  protectedAddonIds: [],
  baseline: null,
  history: [],
  proposalRef: null
});
const validSelection = (s) =>
  s &&
  Array.isArray(s.addonIds) &&
  s.addonIds.length <= 100 &&
  s.addonIds.every((id) => typeof id === 'string' && id.length <= 40) &&
  s.addonQty &&
  typeof s.addonQty === 'object' &&
  Object.values(s.addonQty).every((n) => Number.isInteger(n) && n >= 1 && n <= 99);

/** Whitelist persisted metadata. Old provider results are not restored as executable recommendations. */
export function cleanBudgetDraft(raw) {
  const draft = blankBudgetDraft();
  if (!raw || typeof raw !== 'object') return draft;
  draft.amount = typeof raw.amount === 'string' ? raw.amount.replace(/\D/g, '').slice(0, 8) : '';
  draft.preferences = typeof raw.preferences === 'string' ? raw.preferences.slice(0, 500) : '';
  draft.protectedAddonIds = Array.isArray(raw.protectedAddonIds)
    ? [...new Set(raw.protectedAddonIds.filter((id) => typeof id === 'string' && id.length <= 40))].slice(0, 100)
    : [];
  if (
    raw.baseline &&
    validSelection(raw.baseline.selection) &&
    typeof raw.baseline.eventKey === 'string' &&
    raw.baseline.eventKey.length <= 1000 &&
    typeof raw.baseline.catalogFingerprint === 'string' &&
    Number.isFinite(raw.baseline.estimate?.knownTotal)
  )
    draft.baseline = {
      selection: clone(raw.baseline.selection),
      eventKey: raw.baseline.eventKey,
      catalogFingerprint: raw.baseline.catalogFingerprint,
      estimate: { knownTotal: raw.baseline.estimate.knownTotal }
    };
  if (Array.isArray(raw.history))
    draft.history = raw.history
      .filter((r) => validSelection(r?.before) && validSelection(r?.after))
      .slice(-10)
      .map((r) => ({ before: clone(r.before), after: clone(r.after) }));
  if (
    raw.proposalRef &&
    typeof raw.proposalRef.id === 'string' &&
    raw.proposalRef.id.length <= 40 &&
    Number.isFinite(raw.proposalRef.generatedAt)
  )
    draft.proposalRef = { id: raw.proposalRef.id, generatedAt: raw.proposalRef.generatedAt };
  return draft;
}

export function buildBudgetContext(form, catalog) {
  const draft = cleanBudgetDraft(form.budgetDraft);
  const selection = normalizeBudgetSelection(
    {
      addonIds: form.addonIds,
      addonQty: Object.fromEntries(
        Object.entries(form.addonQty || {}).map(([id, value]) => [id, value === '' ? NaN : Number(value)])
      )
    },
    catalog
  );
  const offered = budgetBookableAddons(catalog);
  const protectedAddonIds = draft.protectedAddonIds
    .filter(
      (id) =>
        selection.addonIds.includes(id) || offered.some((a) => a.parentId === id && selection.addonIds.includes(a.id))
    )
    .sort();
  return {
    serviceType: form.serviceType,
    packageId: form.packageId,
    guests: Number(form.guests),
    date: form.date,
    startTime: form.startTime,
    endTime: form.endTime,
    occasion: form.occasion === 'Other' ? form.occasionOther || '' : form.occasion || '',
    budget: Number(draft.amount),
    selection,
    protectedAddonIds,
    preferences: draft.preferences,
    reviewedCatalogFingerprint: catalog?.budgetCatalogFingerprint || ''
  };
}
export function budgetInputKey(form, catalog, stock = {}) {
  return stable({
    serviceType: form.serviceType,
    packageId: form.packageId,
    guests: form.guests,
    date: form.date,
    startTime: form.startTime,
    endTime: form.endTime,
    occasion: form.occasion,
    occasionOther: form.occasionOther,
    addonIds: form.addonIds,
    addonQty: form.addonQty,
    budget: cleanBudgetDraft(form.budgetDraft).amount,
    preferences: cleanBudgetDraft(form.budgetDraft).preferences,
    protectedAddonIds: cleanBudgetDraft(form.budgetDraft).protectedAddonIds.sort(),
    catalogFingerprint: catalog?.budgetCatalogFingerprint,
    stock
  });
}

/** Send editable metadata only; the server reconstructs prices and history. */
export function budgetSubmission(form, catalog) {
  const draft = cleanBudgetDraft(form.budgetDraft);
  if (form.serviceType !== 'Buffet and Catering' || !draft.amount) return undefined;
  const context = buildBudgetContext(form, catalog);
  const link =
    draft.proposalRef &&
    draft.baseline?.eventKey === budgetEventKey(context) &&
    draft.baseline?.catalogFingerprint === catalog.budgetCatalogFingerprint;
  return {
    budget: context.budget,
    preferences: context.preferences,
    protectedAddonIds: context.protectedAddonIds,
    reviewedCatalogFingerprint: catalog.budgetCatalogFingerprint,
    ...(link ? { proposalId: draft.proposalRef.id } : {})
  };
}
export const budgetEventKey = (context) =>
  stable({
    serviceType: context.serviceType,
    packageId: context.packageId,
    guests: context.guests,
    date: context.date,
    startTime: context.startTime,
    endTime: context.endTime
  });
export function generationProblem(form, catalog) {
  try {
    const context = buildBudgetContext(form, catalog);
    estimateBudget(context, { catalog });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(context.date)) return 'Choose your event date before reviewing the budget.';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(context.startTime)) return 'Choose a valid start time.';
    const endProblem = endTimeProblem(context.startTime, context.endTime);
    if (endProblem) return endProblem;
    if (!/^[a-f0-9]{64}$/.test(context.reviewedCatalogFingerprint))
      return 'Refresh the service catalog before reviewing your budget.';
    return '';
  } catch (error) {
    return error.message;
  }
}
export function selectionToBookingPatch(selection, catalog) {
  const canonical = normalizeBudgetSelection(selection, catalog);
  const offered = new Map(budgetBookableAddons(catalog).map((a) => [a.id, a]));
  return {
    addonIds: [...new Set(canonical.addonIds.map((id) => offered.get(id).parentId || id))],
    addonQty: Object.fromEntries(canonical.addonIds.map((id) => [id, String(canonical.addonQty[id])]))
  };
}
export function baselineFor(context, estimate, catalog) {
  return {
    selection: clone(context.selection),
    estimate: { knownTotal: estimate.knownTotal },
    eventKey: budgetEventKey(context),
    catalogFingerprint: catalog.budgetCatalogFingerprint
  };
}
export function applyDraftRecommendation(form, candidate, catalog, stock = {}) {
  const context = buildBudgetContext(form, catalog);
  const result = applyBudgetCandidate(context.selection, candidate, { context, catalog, stock });
  if (result.problem) return { problem: result.problem };
  const draft = cleanBudgetDraft(form.budgetDraft);
  return {
    problem: null,
    patch: {
      ...selectionToBookingPatch(result.selection, catalog),
      budgetDraft: {
        ...draft,
        baseline: draft.baseline || baselineFor(context, estimateBudget(context, { catalog }), catalog),
        history: [...draft.history, { before: context.selection, after: result.selection }].slice(-10)
      }
    }
  };
}
function checkedRestore(selection, catalog, stock) {
  const normalized = normalizeBudgetSelection(selection, catalog);
  const byId = new Map(budgetBookableAddons(catalog).map((a) => [a.id, a]));
  for (const id of normalized.addonIds) {
    const a = byId.get(id);
    const left = stock?.[a.inventoryItemId]?.left;
    if (Number.isInteger(left) && normalized.addonQty[id] > left)
      throw new Error('An original service quantity is no longer available. Adjust it in Additional Charges.');
  }
  return selectionToBookingPatch(normalized, catalog);
}
export function undoDraftRecommendation(form, catalog, stock = {}) {
  const draft = cleanBudgetDraft(form.budgetDraft);
  const last = draft.history.at(-1);
  if (!last) return { problem: 'There is no recommendation to undo.' };
  try {
    const current = buildBudgetContext(form, catalog).selection;
    const ids = new Set([...last.before.addonIds, ...last.after.addonIds]);
    const changed = [...ids].filter((id) => last.before.addonQty[id] !== last.after.addonQty[id]);
    if (changed.some((id) => current.addonQty[id] !== last.after.addonQty[id]))
      throw new Error(
        'That service was edited after this recommendation. Adjust it manually to preserve your newer choices.'
      );
    const restored = clone(current);
    for (const id of changed) {
      restored.addonIds = restored.addonIds.filter((chosen) => chosen !== id);
      delete restored.addonQty[id];
      if (last.before.addonIds.includes(id)) {
        restored.addonIds.push(id);
        restored.addonQty[id] = last.before.addonQty[id];
      }
    }
    return {
      problem: null,
      patch: {
        ...checkedRestore(restored, catalog, stock),
        budgetDraft: { ...draft, history: draft.history.slice(0, -1) }
      }
    };
  } catch (error) {
    return { problem: error.message };
  }
}
export function restoreDraftSelections(form, catalog, stock = {}) {
  const draft = cleanBudgetDraft(form.budgetDraft);
  if (!draft.baseline) return { problem: 'There are no original selections to restore.' };
  try {
    return {
      problem: null,
      patch: { ...checkedRestore(draft.baseline.selection, catalog, stock), budgetDraft: { ...draft, history: [] } }
    };
  } catch (error) {
    return { problem: error.message };
  }
}
export function verifiedDraftSavings(form, catalog, estimate) {
  try {
    const context = buildBudgetContext(form, catalog);
    const baseline = cleanBudgetDraft(form.budgetDraft).baseline;
    if (
      !baseline ||
      baseline.catalogFingerprint !== catalog.budgetCatalogFingerprint ||
      baseline.eventKey !== budgetEventKey(context)
    )
      return null;
    const byId = new Map(budgetBookableAddons(catalog).map((a) => [a.id, a]));
    const changed = [...new Set([...baseline.selection.addonIds, ...context.selection.addonIds])].filter(
      (id) => baseline.selection.addonQty[id] !== context.selection.addonQty[id]
    );
    if (changed.some((id) => typeof byId.get(id)?.price !== 'number')) return null;
    return Math.max(0, baseline.estimate.knownTotal - estimate.knownTotal);
  } catch {
    return null;
  }
}

/** Logical cancellation preserves paid in-flight work server-side but ignores stale browser responses. */
export function createBudgetRequestGuard() {
  let sequence = 0;
  let active = null;
  return {
    begin(key) {
      if (active?.key === key) return null;
      active = { ticket: ++sequence, key };
      return active.ticket;
    },
    current(ticket, key) {
      return active?.ticket === ticket && active.key === key;
    },
    finish(ticket) {
      if (active?.ticket === ticket) active = null;
    },
    cancel() {
      sequence += 1;
      active = null;
    }
  };
}
