import { normalizeBudgetSelection } from './budget.js';
import { budgetBookableAddons, isBudgetFoodAddon, readBudgetPolicy } from './budgetPolicy.js';

/** Check an atomic admin revision against the saved recipe and current explicit service permissions.
 * The original snapshot is read-only; current is the reservation's actual working selection.
 * Dated stock and checked-out equipment remain the reservation transaction's responsibility.
 */
export function validateCustomServiceRevision({ current, selection, snapshot, catalog }) {
  const fail = (problem, field = 'addonIds') => ({
    valid: false,
    problem: `${problem} Review an updated package proposal for a different arrangement.`,
    field
  });
  const byId = new Map(budgetBookableAddons(catalog).map((addon) => [addon.id, addon]));
  let before, after;
  try {
    before = normalizeBudgetSelection(current, catalog, byId);
    after = normalizeBudgetSelection(selection, catalog, byId);
  } catch (error) {
    return fail(error.message);
  }
  if (!Array.isArray(snapshot?.recipe?.optionalAddonIds))
    return fail('The approved custom service list is unavailable.');
  const allowed = new Set(snapshot.recipe.optionalAddonIds);
  const protectedIds = new Set(snapshot.context?.protectedAddonIds || []);
  const protectedService = (addon) => protectedIds.has(addon.id) || protectedIds.has(addon.parentId);
  const beforeIds = new Set(before.addonIds),
    afterIds = new Set(after.addonIds);
  const policies = new Map();
  for (const id of new Set([...before.addonIds, ...after.addonIds])) {
    const addon = byId.get(id);
    if (!allowed.has(id)) return fail(`${addon.name} is outside this setup's approved services.`);
    const { policy, problem } = readBudgetPolicy(addon.budgetPolicy, addon, catalog, byId);
    if (problem) return fail(problem);
    policies.set(id, policy);
    const oldQty = before.addonQty[id] || 0,
      newQty = after.addonQty[id] || 0;
    if (oldQty !== newQty && isBudgetFoodAddon(addon))
      return fail('Keep food selections unchanged in the service editor.');
    if (newQty && policy.minQty !== null && newQty < policy.minQty)
      return fail(`${addon.name} needs at least ${policy.minQty} units.`, 'addonQty');
    if (newQty && policy.requires.some((required) => !afterIds.has(required)))
      return fail(`${addon.name} needs its required supporting services.`);
    if (oldQty > newQty && protectedService(addon)) return fail(`${addon.name} is protected by the reviewed request.`);
    if (newQty && oldQty > newQty && (!addon.hasQuantity || policy.minQty === null))
      return fail(`${addon.name} has no approved quantity reduction.`, 'addonQty');
  }

  const removed = before.addonIds.filter((id) => !afterIds.has(id));
  const added = after.addonIds.filter((id) => !beforeIds.has(id));
  const knownPrice = (price) => typeof price === 'number' && Number.isFinite(price) && price >= 0;
  const canReplace = (sourceId, targetId) => {
    const source = byId.get(sourceId),
      target = byId.get(targetId);
    const qty = before.addonQty[sourceId];
    return (
      policies.get(sourceId).replacementIds.includes(targetId) &&
      !isBudgetFoodAddon(target) &&
      after.addonQty[targetId] === qty &&
      (target.hasQuantity || qty === 1) &&
      knownPrice(source.price) &&
      knownPrice(target.price) &&
      target.price * qty < source.price * qty
    );
  };

  // Mixed remove/add requests are replacements, not independent permission bypasses.
  // Match the smaller side fully, prioritizing sources that cannot be removed outright.
  // Augmenting paths support valid multi-service swaps without a fragile greedy ordering.
  const targetToSource = new Map();
  function match(sourceId, seen) {
    for (const targetId of added) {
      if (seen.has(targetId) || !canReplace(sourceId, targetId)) continue;
      seen.add(targetId);
      const prior = targetToSource.get(targetId);
      if (!prior || match(prior, seen)) {
        targetToSource.set(targetId, sourceId);
        return true;
      }
    }
    return false;
  }
  const ordered = [...removed].sort(
    (a, b) => Number(policies.get(a).allowRemove) - Number(policies.get(b).allowRemove)
  );
  for (const id of ordered) match(id, new Set());
  if (targetToSource.size < Math.min(removed.length, added.length))
    return fail(
      'Use approved replacements with the current quantity and a verified lower price; revise unrelated additions separately.'
    );
  const replaced = new Set(targetToSource.values());
  for (const id of removed) {
    if (!replaced.has(id) && !policies.get(id).allowRemove)
      return fail(`${byId.get(id).name} cannot be removed from this customized setup.`);
  }
  return { valid: true };
}
