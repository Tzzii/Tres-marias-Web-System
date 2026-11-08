import { RULES, SERVICE_TYPES } from '../services/config.js';
import { budgetBookableAddons, readBudgetPolicy } from './budgetPolicy.js';
import { ITEM_COUNT_MAX } from './packageItems.js';

export const defaultPackageProposalRules = () => ({ enabled: false, recipes: [] });
const fail = (message) => {
  throw new Error(message);
};
const bounded = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const shortText = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
export const hasOnlyKeys = (value, allowed) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => allowed.includes(key));
export const componentQuantity = (item, guests) =>
  item.mode === 'perGuests' ? Math.ceil(guests / item.perGuests) * item.qty : item.qty;

/** Scope the lookup and all policy decisions to this single authoritative catalog read. */
export function proposalAddonLookup(catalog) {
  const byId = new Map(budgetBookableAddons(catalog).map((a) => [a.id, a]));
  const policies = new Map();
  return {
    byId,
    readPolicy(addon) {
      if (!policies.has(addon.id)) policies.set(addon.id, readBudgetPolicy(addon.budgetPolicy, addon, catalog, byId));
      return policies.get(addon.id);
    }
  };
}

function validatedRecipe(recipe, catalog, addons) {
  if (
    !hasOnlyKeys(recipe, [
      'id',
      'name',
      'description',
      'serviceTypes',
      'minGuests',
      'maxGuests',
      'cateringSetupPrice',
      'components',
      'optionalAddonIds'
    ]) ||
    typeof recipe.id !== 'string' ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(recipe.id) ||
    recipe.id.length > 32 ||
    !shortText(recipe.name, 100) ||
    (recipe.description != null && (typeof recipe.description !== 'string' || recipe.description.length > 1000))
  )
    fail('Give each approved recipe a short unique ID, a name and a readable description.');
  if (
    !Array.isArray(recipe.serviceTypes) ||
    !recipe.serviceTypes.length ||
    new Set(recipe.serviceTypes).size !== recipe.serviceTypes.length ||
    recipe.serviceTypes.some((s) => !SERVICE_TYPES.includes(s))
  )
    fail('Choose supported catering service types for each recipe.');
  if (
    !bounded(recipe.minGuests, RULES.minGuests, RULES.maxGuests) ||
    !bounded(recipe.maxGuests, recipe.minGuests, RULES.maxGuests)
  )
    fail('Choose an approved guest range within the booking limits.');
  if (
    (recipe.serviceTypes.includes('Catering only') || recipe.cateringSetupPrice != null) &&
    !bounded(recipe.cateringSetupPrice, 0, 10000000)
  )
    fail('Catering-only recipes need an approved fixed setup price in whole pesos.');
  if (!Array.isArray(recipe.components) || !recipe.components.length || recipe.components.length > 40)
    fail('Choose between 1 and 40 required setup items for the complete recipe.');
  const names = new Set();
  for (const item of recipe.components) {
    if (
      !hasOnlyKeys(item, ['packageId', 'itemIndex', 'itemName', 'mode', 'qty', 'perGuests', 'optional', 'unitPrice']) ||
      (item.optional != null && typeof item.optional !== 'boolean') ||
      (item.unitPrice != null && !bounded(item.unitPrice, 0, 10000000)) ||
      typeof item.packageId !== 'string' ||
      !Number.isInteger(item.itemIndex) ||
      item.itemIndex < 0 ||
      !shortText(item.itemName, 200)
    )
      fail('Pin each setup item to an active source package, item position and name.');
    const pkg = catalog?.packages?.find(
      (p) => p.id === item.packageId && !p.archived && p.visible !== false && p.kind !== 'rental'
    );
    const source = pkg?.items?.[item.itemIndex];
    const key = item.itemName.trim().toLowerCase();
    if (!source || source.name !== item.itemName || source.archived || names.has(key))
      fail('A required setup item changed, is listed twice, or is no longer offered. Review the approved recipe.');
    names.add(key);
    if (
      !bounded(item.qty, 1, ITEM_COUNT_MAX) ||
      !['fixed', 'perGuests'].includes(item.mode) ||
      (item.mode === 'fixed' ? item.perGuests !== undefined : !bounded(item.perGuests, 1, RULES.maxGuests)) ||
      componentQuantity(item, recipe.maxGuests) > ITEM_COUNT_MAX
    )
      fail('Enter supported whole quantities and an explicit fixed or per-guests rule for each item.');
  }
  const ids = recipe.optionalAddonIds;
  if (!Array.isArray(ids) || ids.length > 99 || new Set(ids).size !== ids.length)
    fail('Choose distinct available optional services for each recipe.');
  for (const id of ids) {
    const addon = addons.byId.get(id);
    if (!addon) fail('A recipe references a service that is no longer bookable.');
    const { problem, policy } = addons.readPolicy(addon);
    if (problem) fail(problem);
    if (policy.requires.some((required) => !ids.includes(required)))
      fail('Approve the required supporting services for this recipe.');
  }
  return {
    ...recipe,
    name: recipe.name.trim(),
    description: recipe.description?.trim() || '',
    serviceTypes: [...recipe.serviceTypes],
    components: recipe.components.map((c) => ({ ...c })),
    optionalAddonIds: [...ids]
  };
}

/** An invalid setting confers no recipe permissions, including when a referenced catalog item is edited later. */
export function validatePackageProposalRules(raw, catalog, addons = proposalAddonLookup(catalog)) {
  if (raw == null) return { rules: defaultPackageProposalRules() };
  try {
    if (
      !hasOnlyKeys(raw, ['enabled', 'recipes']) ||
      typeof raw.enabled !== 'boolean' ||
      !Array.isArray(raw.recipes) ||
      raw.recipes.length > 24 ||
      (raw.enabled && !raw.recipes.length)
    )
      fail('Configure up to 24 approved recipes. At least one is required to enable recommendations.');
    const recipes = raw.recipes.map((r) => validatedRecipe(r, catalog, addons));
    if (new Set(recipes.map((r) => r.id)).size !== recipes.length) fail('Each recipe needs its own ID.');
    return { rules: { enabled: raw.enabled, recipes } };
  } catch (err) {
    return { problem: err.message, field: 'packageProposalRules' };
  }
}
