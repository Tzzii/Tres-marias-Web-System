import { packagePickProblem } from './catalog.js';
import { budgetBookableAddons, isBudgetFoodAddon, readBudgetPolicy } from './budgetPolicy.js';
import { computeQuote, INCLUSIVE_PRICING_MODEL, isInclusiveBuffet } from '../services/pricing.js';
import { RULES } from '../services/config.js';

export const MAX_BUDGET_CANDIDATES = 50;
const stable = (value) =>
  JSON.stringify(value, (_, entry) =>
    entry && !Array.isArray(entry) && typeof entry === 'object'
      ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
      : entry
  );
const invalid = (message) => {
  throw new Error(message);
};
const knownPrice = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Accept canonical leaf IDs or the booking form's parent-ID plus child-quantity representation. */
export function normalizeBudgetSelection(raw, catalog, bookableById) {
  if (!Array.isArray(raw?.addonIds) || raw.addonIds.some((id) => typeof id !== 'string'))
    invalid('Choose valid additional charges.');
  const byId = bookableById ?? new Map(budgetBookableAddons(catalog).map((a) => [a.id, a]));
  const ids = new Set();
  for (const id of raw.addonIds) {
    if (byId.has(id)) {
      ids.add(id);
      continue;
    }
    const roots = Array.isArray(catalog) ? catalog : catalog?.addons || [];
    const parent = roots.find((a) => a.id === id && !a.archived);
    const children = [...byId.values()].filter((a) => a.parentId === parent?.id && Number(raw.addonQty?.[a.id]) > 0);
    if (!parent || !children.length) invalid('A selected service is unavailable or has no chosen option.');
    children.forEach((a) => ids.add(a.id));
  }
  const addonIds = [...ids].sort();
  const addonQty = {};
  for (const id of addonIds) {
    const addon = byId.get(id);
    const qty = raw.addonQty?.[id] ?? 1;
    if (!Number.isInteger(qty) || qty < 1 || qty > 99 || (!addon.hasQuantity && qty !== 1))
      invalid('Use supported whole quantities from 1 to 99.');
    addonQty[id] = qty;
  }
  const problem = packagePickProblem(addonIds.map((id) => byId.get(id)));
  if (problem) invalid(problem.message);
  return { addonIds, addonQty };
}

function prepared(context, inputs) {
  if (context.serviceType !== 'Buffet and Catering')
    invalid('Budget recommendations are available only for Buffet and Catering.');
  if (!Number.isInteger(context.budget) || context.budget < 1 || context.budget > 10000000)
    invalid('Enter a positive budget in whole pesos up to 10,000,000.');
  if (!Number.isInteger(context.guests) || context.guests < RULES.minGuests || context.guests > RULES.maxGuests)
    invalid('Enter a supported guest count.');
  const { catalog } = inputs;
  const pkg = catalog?.packages?.find(
    (p) => p.id === context.packageId && !p.archived && p.visible !== false && p.kind !== 'rental'
  );
  if (!pkg) invalid('Choose an available standard inclusion package.');
  if (!Number.isInteger(catalog.pricePerPlate) || catalog.pricePerPlate <= 0)
    invalid('The buffet rate needs confirmation.');
  const offered = budgetBookableAddons(catalog);
  return {
    pkg,
    offered,
    byId: new Map(offered.map((a) => [a.id, a])),
    selection: normalizeBudgetSelection(context.selection, catalog)
  };
}

/** All money comes from computeQuote and authoritative catalog data; unknown is distinct from zero. */
export function estimateBudget(context, inputs) {
  const { pkg, byId, selection } = prepared(context, inputs);
  const unknownCharges = [];
  const addonPrices = {};
  for (const id of selection.addonIds) {
    const addon = byId.get(id);
    if (knownPrice(addon.price)) addonPrices[id] = addon.price;
    else unknownCharges.push({ id, label: addon.name });
  }
  const fixedCharges = inputs.fixedCharges || [];
  for (const line of fixedCharges)
    if (!knownPrice(line.amount)) unknownCharges.push({ id: line.id, label: line.label });
  const pricingModel = inputs.pricingModel || INCLUSIVE_PRICING_MODEL;
  const quote = computeQuote({
    pkg,
    pricingModel,
    serviceType: context.serviceType,
    guests: context.guests,
    pricePerPlate: inputs.catalog.pricePerPlate,
    startTime: context.startTime,
    endTime: context.endTime,
    sixHourFee: inputs.catalog.sixHourFee ?? 0,
    ...selection,
    addonPrices,
    extraGuestsCharge: inputs.extraGuestsCharge ?? 0,
    otherChargeItems: fixedCharges.filter((line) => knownPrice(line.amount))
  });
  if (!isInclusiveBuffet(quote) && quote.extraGuests && inputs.extraGuestsCharge == null)
    unknownCharges.push({ id: 'extra-equipment', label: 'Extra-guest equipment' });
  const complete = unknownCharges.length === 0;
  return {
    pricingModel: quote.pricingModel,
    budget: context.budget,
    baseTotal: quote.food,
    knownAddonsTotal: quote.addons,
    knownTotal: quote.net,
    unknownCharges,
    budgetStatus: !complete ? 'incomplete' : quote.net > context.budget ? 'over' : 'within',
    baseExceedsBudget: quote.food > context.budget,
    difference: complete ? quote.net - context.budget : null,
    knownOverBudget: Math.max(0, quote.net - context.budget)
  };
}

function lockedFingerprint(context, inputs) {
  return stable({
    serviceType: context.serviceType,
    packageId: context.packageId,
    guests: context.guests,
    date: context.date,
    startTime: context.startTime,
    endTime: context.endTime,
    budget: context.budget,
    preferences: context.preferences || '',
    catalog: inputs.catalog.budgetCatalogFingerprint || inputs.catalog,
    pricingModel: inputs.pricingModel || INCLUSIVE_PRICING_MODEL,
    fixedCharges: inputs.fixedCharges || [],
    extraGuestsCharge: inputs.extraGuestsCharge
  });
}
const protectedItem = (addon, context) =>
  (context.protectedAddonIds || []).some((id) => id === addon.id || id === addon.parentId);
const policyFor = (addon, catalog) => readBudgetPolicy(addon.budgetPolicy, addon, catalog).policy;

export function actionSelection(context, selection, action, inputs, { checkStock = true, addons } = {}) {
  const byId = addons?.byId ?? new Map(budgetBookableAddons(inputs.catalog).map((a) => [a.id, a]));
  const approvedPolicy = (addon) => (addons ? addons.readPolicy(addon).policy : policyFor(addon, inputs.catalog));
  const source = byId.get(action.addonId);
  if (!source || !selection.addonIds.includes(source.id) || isBudgetFoodAddon(source) || protectedItem(source, context))
    invalid('This service is protected or no longer selected.');
  const policy = approvedPolicy(source);
  if (!policy) invalid('The adjustment rules changed; refresh the proposal.');
  const next = { addonIds: [...selection.addonIds], addonQty: { ...selection.addonQty } };
  if (action.type === 'remove') {
    if (!policy.allowRemove) invalid('Removal is not permitted for this service.');
    next.addonIds = next.addonIds.filter((id) => id !== source.id);
    delete next.addonQty[source.id];
  } else if (action.type === 'reduce') {
    if (
      !source.hasQuantity ||
      policy.minQty === null ||
      !Number.isInteger(action.quantity) ||
      action.quantity < policy.minQty ||
      action.quantity >= selection.addonQty[source.id]
    )
      invalid('This quantity reduction is no longer valid.');
    next.addonQty[source.id] = action.quantity;
  } else if (action.type === 'replace') {
    const target = byId.get(action.replacementId);
    if (
      !target ||
      isBudgetFoodAddon(target) ||
      next.addonIds.includes(target.id) ||
      !policy.replacementIds.includes(target.id)
    )
      invalid('Choose an approved replacement.');
    const qty = source.hasQuantity ? selection.addonQty[source.id] : 1;
    if (!target.hasQuantity && qty !== 1) invalid('This alternative does not support the requested quantity.');
    if (
      !knownPrice(source.price) ||
      !knownPrice(target.price) ||
      target.price * qty >= source.price * selection.addonQty[source.id]
    )
      invalid('No verified cheaper replacement is available.');
    if (checkStock && target.inventoryItemId) {
      const stock = inputs.stock?.[target.inventoryItemId] ?? inputs.stock?.[target.id];
      if (!Number.isInteger(stock?.left) || stock.left < qty) invalid('Replacement availability needs confirmation.');
    }
    next.addonIds = next.addonIds.filter((id) => id !== source.id).concat(target.id);
    delete next.addonQty[source.id];
    next.addonQty[target.id] = qty;
  } else invalid('Unknown adjustment action.');
  const normalized = normalizeBudgetSelection(next, inputs.catalog, byId);
  for (const id of normalized.addonIds) {
    const addon = byId.get(id);
    const approved = approvedPolicy(addon);
    if (approved?.minQty !== null && approved?.minQty !== undefined && normalized.addonQty[id] < approved.minQty)
      invalid('A service would fall below its approved minimum.');
    if (approved?.requires.some((required) => !normalized.addonIds.includes(required)))
      invalid('This change would remove a required supporting service.');
    // Malformed saved policies never authorize changes or hide their dependencies.
    if (!approved && addon.budgetPolicy != null)
      invalid('A selected service has invalid adjustment rules; admin review is needed.');
    const stock = inputs.stock?.[addon.inventoryItemId] ?? inputs.stock?.[id];
    if (checkStock && Number.isInteger(stock?.left) && stock.left < normalized.addonQty[id])
      invalid('The selected quantity is no longer available.');
  }
  return normalized;
}

function preconditions(context, selection, addon, inputs) {
  return {
    addonId: addon.id,
    quantity: selection.addonQty[addon.id],
    exclusiveParentChoice: addon.isPackage ? addon.parentId : null,
    lockedContextFingerprint: lockedFingerprint(context, inputs)
  };
}
const candidateId = (action, condition) => stable({ action, preconditions: condition });

/** Bounded single-change options; these are alternatives, never a claim of global optimization. */
export function buildBudgetCandidates(context, inputs) {
  const { selection, offered, byId } = prepared(context, inputs);
  const beforeEstimate = estimateBudget(context, inputs);
  const candidates = [];
  for (const id of selection.addonIds) {
    const source = byId.get(id);
    const policy = policyFor(source, inputs.catalog);
    if (!policy || isBudgetFoodAddon(source) || protectedItem(source, context)) continue;
    const actions = [];
    if (policy.allowRemove) actions.push({ type: 'remove', addonId: id, replacementId: null, quantity: null });
    if (source.hasQuantity && policy.minQty !== null && selection.addonQty[id] > policy.minQty)
      actions.push({ type: 'reduce', addonId: id, replacementId: null, quantity: policy.minQty });
    for (const replacementId of policy.replacementIds)
      actions.push({ type: 'replace', addonId: id, replacementId, quantity: null });
    for (const action of actions) {
      try {
        const afterSelection = actionSelection(context, selection, action, inputs);
        const afterEstimate = estimateBudget({ ...context, selection: afterSelection }, inputs);
        const target = byId.get(action.replacementId);
        const knownSavings =
          knownPrice(source.price) && (!target || knownPrice(target.price))
            ? beforeEstimate.knownTotal - afterEstimate.knownTotal
            : null;
        if (knownSavings !== null && knownSavings <= 0) continue;
        const condition = preconditions(context, selection, source, inputs);
        const tradeoffs =
          action.type === 'remove'
            ? [`Remove ${source.name}.`, source.description || '']
            : action.type === 'reduce'
              ? [`${source.name}: ${selection.addonQty[id]} → ${action.quantity}.`]
              : [
                  `Replace ${source.name} with ${target.name}.`,
                  `Current inclusions: ${source.description || 'See catalog'}.`,
                  `Replacement inclusions: ${target.description || 'See catalog'}.`
                ];
        candidates.push({
          id: candidateId(action, condition),
          action,
          preconditions: condition,
          beforeSelectionFingerprint: stable(selection),
          afterSelection,
          beforeEstimate,
          afterEstimate,
          knownSavings,
          tradeoffs: tradeoffs.filter(Boolean)
        });
      } catch {
        /* An invalid single change is omitted, never repaired by silently cutting dependencies. */
      }
    }
  }
  return candidates
    .sort((a, b) => (b.knownSavings ?? -1) - (a.knownSavings ?? -1) || a.id.localeCompare(b.id))
    .slice(0, MAX_BUDGET_CANDIDATES);
}

/** Apply to the CURRENT selection. inputs.context is required to recheck locked event facts. */
export function applyBudgetCandidate(rawSelection, candidate, inputs) {
  try {
    const context = inputs.context;
    if (!context) invalid('The current event context is required.');
    const { selection, byId } = prepared({ ...context, selection: rawSelection }, inputs);
    const source = byId.get(candidate?.action?.addonId);
    if (
      !source ||
      !candidate.preconditions ||
      candidate.id !== candidateId(candidate.action, candidate.preconditions) ||
      stable(candidate.preconditions) !== stable(preconditions(context, selection, source, inputs))
    )
      invalid('This recommendation is stale; review your budget again.');
    const next = actionSelection(context, selection, candidate.action, inputs);
    return { selection: next, problem: null, estimate: estimateBudget({ ...context, selection: next }, inputs) };
  } catch (err) {
    return { selection: rawSelection, problem: err.message };
  }
}
