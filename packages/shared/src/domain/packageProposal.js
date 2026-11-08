import { MAX_BUDGET_CANDIDATES } from './budget.js';
import { isBudgetFoodAddon } from './budgetPolicy.js';
import {
  cleanPackageProposalContext,
  completeProposalMenu,
  recipeFor,
  resolveProposal
} from './packageProposalEngine.js';
import { proposalAddonLookup, validatePackageProposalRules } from './packageProposalPolicy.js';
import { setupQuestions, validateSetupAnswers } from './packageSetup.js';

export { cleanPackageProposalContext } from './packageProposalEngine.js';
export { defaultPackageProposalRules, validatePackageProposalRules } from './packageProposalPolicy.js';

/** Fill a short model ranking with distinct, server-priced candidates; never manufacture unavailable options. */
export function selectRankedPackageOptions(ranked, candidates) {
  if (
    !Array.isArray(ranked) ||
    !ranked.length ||
    new Set(ranked).size !== ranked.length ||
    ranked.some((id) => !candidates.some((c) => c.id === id))
  )
    throw new Error('Choose distinct available custom package options.');
  const status = { within: 0, incomplete: 1, over: 2 };
  const remaining = candidates
    .filter((c) => !ranked.includes(c.id))
    .sort(
      (a, b) =>
        status[a.estimate.budgetStatus] - status[b.estimate.budgetStatus] ||
        a.estimate.knownTotal - b.estimate.knownTotal
    );
  return [...ranked, ...remaining.map((c) => c.id)].slice(0, 3);
}

function currentRules(inputs, addons) {
  const { rules, problem } = validatePackageProposalRules(inputs.rules, inputs.catalog, addons);
  if (problem) throw new Error(problem);
  if (!rules.enabled) throw new Error('The team has not enabled approved package recipes yet.');
  return rules;
}

function resolveReference(reference, raw, inputs, checkStock) {
  const addons = proposalAddonLookup(inputs.catalog);
  const context = cleanPackageProposalContext(raw, inputs.catalog, addons);
  const recipe = recipeFor(reference, context, currentRules(inputs, addons));
  const menu = completeProposalMenu(context, inputs.catalog, reference.menuVariant || 0);
  return resolveProposal(reference, recipe, context, menu, inputs, addons, checkStock);
}

/** Approval/compatibility only. Generation, selection and submission must also recheck dated stock. */
export function validatePackageRecipe(recipe, context, catalog, rules) {
  try {
    resolveReference(recipe, context, { catalog, rules }, false);
    return { valid: true };
  } catch (err) {
    return { valid: false, problem: err.message };
  }
}

export function estimatePackageProposal(recipe, context, inputs) {
  return resolveReference(recipe, context, inputs, true).estimate;
}

function* changesFor(recipe, context, addons) {
  const { byId } = addons;
  for (const id of context.addonIds) {
    const source = byId.get(id);
    if (
      isBudgetFoodAddon(source) ||
      context.protectedAddonIds.includes(id) ||
      context.protectedAddonIds.includes(source.parentId)
    )
      continue;
    const { policy } = addons.readPolicy(source);
    if (policy?.allowRemove) yield { type: 'remove', addonId: id };
    if (policy?.minQty != null && context.addonQty[id] > policy.minQty)
      yield { type: 'reduce', addonId: id, quantity: policy.minQty };
    for (const replacementId of policy?.replacementIds || []) {
      if (recipe.optionalAddonIds.includes(replacementId)) yield { type: 'replace', addonId: id, replacementId };
    }
  }
  for (const id of recipe.optionalAddonIds) {
    if (!context.addonIds.includes(id) && !isBudgetFoodAddon(byId.get(id))) yield { type: 'add', addonId: id };
  }
}

// Names/marketing copy do not distinguish two otherwise identical setups. Menu/styling are fixed per context.
function contentsKey(candidate) {
  const items = candidate.packageSnapshot.items.map(({ name, qty }) => [name.trim().toLowerCase(), qty]);
  items.sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([
    items,
    candidate.packageSnapshot.price,
    candidate.packageSnapshot.setupAdjustment || 0,
    candidate.menu,
    candidate.addonIds.map((id) => [id, candidate.addonQty[id]])
  ]);
}

/** Offer every eligible recipe's base first, then rotate across recipes for optional alternatives. */
export function buildPackageCandidates(raw, inputs) {
  const addons = proposalAddonLookup(inputs.catalog);
  const context = cleanPackageProposalContext(raw, inputs.catalog, addons);
  if (context.setupPreferences)
    validateSetupAnswers(context.setupPreferences, setupQuestions(inputs.catalog, context, inputs.rules));
  const candidates = [];
  let rules, menu;
  try {
    rules = currentRules(inputs, addons);
    menu = completeProposalMenu(context, inputs.catalog);
  } catch (err) {
    return { context, candidates, noFitReasons: [err.message] };
  }
  const seen = new Set();
  const reasons = new Set();
  function append(recipe, change, menuVariant = 0) {
    const candidate = resolveProposal(
      { recipeId: recipe.id, change, ...(menuVariant ? { menuVariant } : {}) },
      recipe,
      context,
      menuVariant ? completeProposalMenu(context, inputs.catalog, menuVariant) : menu,
      inputs,
      addons
    );
    const key = contentsKey(candidate);
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(candidate);
    }
  }
  let iterators = [];
  for (const recipe of rules.recipes) {
    try {
      recipeFor({ recipeId: recipe.id }, context, rules);
      iterators.push({ recipe, changes: changesFor(recipe, context, addons) });
      append(recipe, null);
      if (context.setupPreferences && context.serviceType === 'Buffet and Catering') {
        append(recipe, null, 1);
        append(recipe, null, 2);
      }
    } catch (err) {
      reasons.add(err.message);
    }
  }
  // Bound work even when many approved variants conflict or fail dated inventory checks.
  let attempts = 0;
  while (iterators.length && candidates.length < MAX_BUDGET_CANDIDATES && attempts < MAX_BUDGET_CANDIDATES * 10) {
    const active = [];
    for (const entry of iterators) {
      if (candidates.length >= MAX_BUDGET_CANDIDATES || attempts >= MAX_BUDGET_CANDIDATES * 10) break;
      const next = entry.changes.next();
      if (next.done) continue;
      active.push(entry);
      attempts++;
      try {
        append(entry.recipe, next.value);
      } catch {
        // A failed optional change never authorizes dropping extra services or changing a meal.
      }
    }
    iterators = active;
  }
  const noFitReasons = [];
  if (!candidates.length) {
    noFitReasons.push(...reasons);
    if (!noFitReasons.length) noFitReasons.push('No approved setup covers the requested event.');
  } else if (!candidates.some((c) => c.estimate.budgetStatus === 'within')) {
    const minimum = Math.min(...candidates.map((c) => c.estimate.baseTotal));
    const pendingSetup = candidates.some((c) =>
      c.estimate.unknownCharges.some((charge) => charge.id.startsWith('setup-'))
    );
    if (pendingSetup)
      noFitReasons.push('Setup adjustments still need a quotation before the final budget fit can be confirmed.');
    else if (minimum > context.budget)
      noFitReasons.push('The required setup, meals when included, and schedule charges already exceed your budget.');
    else if (candidates.every((c) => c.estimate.knownTotal > context.budget))
      noFitReasons.push('Even the lowest known subtotal for the proposed combinations exceeds your budget.');
    else if (candidates.some((c) => c.estimate.budgetStatus === 'over'))
      noFitReasons.push('The available fully priced combinations exceed your budget.');
    if (candidates.some((c) => c.estimate.budgetStatus === 'incomplete'))
      noFitReasons.push('Some proposed combinations include charges that the team still needs to quote.');
  }
  return { context, candidates, noFitReasons };
}
