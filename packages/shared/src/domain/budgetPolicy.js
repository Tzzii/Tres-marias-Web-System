import { bookableAddons } from './catalog.js';
import { DESSERT_ADDON_ID } from './menu.js';

export const disabledBudgetPolicy = () => ({ allowRemove: false, minQty: null, replacementIds: [], requires: [] });
export const isBudgetFoodAddon = (addon) =>
  addon?.id === DESSERT_ADDON_ID || addon?.parentId === DESSERT_ADDON_ID || addon?.food === true;
export const budgetBookableAddons = (catalog) =>
  bookableAddons(
    (Array.isArray(catalog) ? catalog : catalog?.addons || [])
      .filter((a) => !a.archived)
      .map((a) => ({
        ...a,
        sizes: (a.sizes || [])
          .filter((s) => !s.archived)
          .map((s) => ({ ...s, ...(isBudgetFoodAddon(a) ? { food: true } : {}) }))
      }))
  );

/** Validate permissions explicitly supplied by an administrator, never inferred from names/prices. */
export function readBudgetPolicy(raw, addon, catalog, bookableById) {
  if (raw == null) return { policy: disabledBudgetPolicy() };
  const fail = (problem) => ({ problem, field: 'budgetPolicy' });
  if (
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    Object.keys(raw).some((k) => !['allowRemove', 'minQty', 'replacementIds', 'requires'].includes(k))
  )
    return fail('Enter a valid budget adjustment policy.');
  const policy = { ...disabledBudgetPolicy(), ...raw };
  if (
    typeof policy.allowRemove !== 'boolean' ||
    (policy.minQty !== null && (!Number.isInteger(policy.minQty) || policy.minQty < 1 || policy.minQty > 99)) ||
    [policy.replacementIds, policy.requires].some(
      (ids) =>
        !Array.isArray(ids) ||
        ids.length > 99 ||
        ids.some((id) => typeof id !== 'string') ||
        new Set(ids).size !== ids.length
    )
  )
    return fail('Use explicit removal permission, a whole minimum of 1–99, and distinct catalog choices.');
  const byId = bookableById ?? new Map(budgetBookableAddons(catalog).map((a) => [a.id, a]));
  addon = byId.get(addon?.id);
  if (!addon) return fail('Choose an available bookable additional charge.');
  if (policy.minQty !== null && !addon.hasQuantity)
    return fail('Only quantity-based services can have a minimum quantity.');
  if (isBudgetFoodAddon(addon) && (policy.allowRemove || policy.minQty !== null || policy.replacementIds.length))
    return fail('Food is excluded from budget adjustments.');
  for (const id of [...policy.replacementIds, ...policy.requires]) {
    const target = byId.get(id);
    if (!target || id === addon.id || (policy.replacementIds.includes(id) && isBudgetFoodAddon(target)))
      return fail('Choose active, different bookable services; food cannot be a replacement.');
  }
  const visited = new Set();
  const visiting = new Set();
  const dependencies = (id) => (id === addon.id ? policy.requires : byId.get(id)?.budgetPolicy?.requires || []);
  function visit(id) {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    for (const next of dependencies(id)) if (!visit(next)) return false;
    visiting.delete(id);
    visited.add(id);
    return true;
  }
  if (!visit(addon.id)) return fail('Service dependencies cannot contain a cycle.');
  const required = [
    addon,
    ...[...visited]
      .filter((id) => id !== addon.id)
      .map((id) => byId.get(id))
      .filter(Boolean)
  ];
  const packageParents = new Set();
  for (const item of required) {
    if (!item.isPackage) continue;
    if (packageParents.has(item.parentId)) return fail('Dependencies cannot require mutually exclusive packages.');
    packageParents.add(item.parentId);
  }
  return { policy };
}
