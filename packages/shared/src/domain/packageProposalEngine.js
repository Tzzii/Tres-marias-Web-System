import { DISH_CATEGORIES, MENU_LINE_MAX, RULES, SERVICE_TYPES, includesFood } from '../services/config.js';
import { computeQuote, INCLUSIVE_PRICING_MODEL, LEGACY_PRICING_MODEL } from '../services/pricing.js';
import { endTimeProblem, eventMinutes } from './availability.js';
import { actionSelection, normalizeBudgetSelection } from './budget.js';
import { isBudgetFoodAddon } from './budgetPolicy.js';
import { DESSERT_ADDON_ID, cleanMenu, menuCount, menuProblem } from './menu.js';
import { cleanStyling, stylingProblem } from './styling.js';
import { componentQuantity, hasOnlyKeys, proposalAddonLookup } from './packageProposalPolicy.js';

const fail = (message) => {
  throw new Error(message);
};
const text = (value, max, label) => {
  if (value == null) return '';
  if (typeof value !== 'string' || value.trim().length > max) fail(`Enter ${label} using at most ${max} characters.`);
  return value.toWellFormed().trim();
};
const offeredDishes = (catalog, { key, label }) =>
  (catalog?.dishes || [])
    .filter(
      (d) =>
        !d.archived &&
        [key, label].includes(d.category) &&
        typeof d.name === 'string' &&
        d.name.trim().length >= 2 &&
        d.name.length <= MENU_LINE_MAX
    )
    .map((d) => d.name.trim());
const dishKey = (name) => name.trim().toLowerCase();

function requestedMenu(raw, catalog, buffet, dessert) {
  const menu = cleanMenu(raw, { buffet, dessert });
  if (buffet) {
    const rawProblem = menuProblem(raw, { buffet, dessert: false });
    if (rawProblem && rawProblem.field !== 'menu.total') fail(rawProblem.message);
    if (menu.juice.length > 120) fail('Keep your juice preference to 120 characters.');
    if (menuCount(menu) > 4) fail('Choose at most four buffet dishes.');
    const seen = new Set();
    for (const category of DISH_CATEGORIES) {
      const offered = offeredDishes(catalog, category);
      menu[category.key] = menu[category.key].map((name) => {
        const match = offered.find((choice) => choice.toLowerCase() === name.toLowerCase());
        if (!match) fail(`${name} is not currently offered in the ${category.key} category.`);
        if (seen.has(dishKey(match))) fail('Choose four different buffet dishes across all categories.');
        seen.add(dishKey(match));
        return match;
      });
    }
  }
  const dessertProblem = menuProblem(menu, { buffet: false, dessert });
  if (dessertProblem) fail(dessertProblem.message);
  return menu;
}

export function cleanPackageProposalContext(raw, catalog, addons = proposalAddonLookup(catalog)) {
  if (!raw || !SERVICE_TYPES.includes(raw.serviceType)) fail('Choose Buffet and Catering or Catering only.');
  if (!Number.isInteger(raw.guests) || raw.guests < RULES.minGuests || raw.guests > RULES.maxGuests)
    fail(`Enter a guest count between ${RULES.minGuests} and ${RULES.maxGuests}.`);
  if (!Number.isInteger(raw.budget) || raw.budget < 1 || raw.budget > 10000000)
    fail('Enter a positive budget in whole pesos up to 10,000,000.');
  if (
    typeof raw.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(raw.date) ||
    !Number.isFinite(Date.parse(raw.date)) ||
    new Date(raw.date).toISOString().slice(0, 10) !== raw.date
  )
    fail('Choose a valid event date.');
  if (typeof raw.startTime !== 'string' || !/^([01]\d|2[0-3]):(00|30)$/.test(raw.startTime))
    fail('Choose a start time on the hour or half hour.');
  if (typeof raw.endTime !== 'string') fail('Choose a valid end time.');
  const timeIssue = endTimeProblem(raw.startTime, raw.endTime);
  if (timeIssue) fail(timeIssue);
  const selection = normalizeBudgetSelection(
    { addonIds: raw.addonIds ?? [], addonQty: raw.addonQty ?? {} },
    catalog,
    addons.byId
  );
  const selected = selection.addonIds.map((id) => addons.byId.get(id));
  const protectedIds = raw.protectedAddonIds ?? [];
  if (
    !Array.isArray(protectedIds) ||
    protectedIds.some((id) => typeof id !== 'string' || !selected.some((a) => a.id === id || a.parentId === id))
  )
    fail('Protect only services included in your selection.');
  // Reference photos belong to the authenticated draft/upload flow. A proposal never accepts a photo storage key.
  const styling = cleanStyling(
    raw.styling && {
      theme: raw.styling.theme,
      themeOther: raw.styling.themeOther,
      colors: raw.styling.colors,
      notes: raw.styling.notes
    }
  );
  const stylingIssue = stylingProblem(styling);
  if (stylingIssue) fail(stylingIssue.message);
  const dessert = selected.some((a) => a.id === DESSERT_ADDON_ID || a.parentId === DESSERT_ADDON_ID);
  return {
    serviceType: raw.serviceType,
    guests: raw.guests,
    budget: raw.budget,
    date: raw.date,
    startTime: raw.startTime,
    endTime: raw.endTime,
    occasion: text(raw.occasion, 80, 'the occasion'),
    preferences: text(raw.preferences, 1000, 'setup preferences'),
    foodNotes: text(raw.foodNotes, 1000, 'food notes'),
    menu: requestedMenu(raw.menu, catalog, includesFood(raw.serviceType), dessert),
    styling,
    ...selection,
    protectedAddonIds: [...new Set(protectedIds)].sort()
  };
}

/** Match distinct dishes to category slots, keeping explicit choices fixed and preferring empty categories. */
export function completeProposalMenu(context, catalog) {
  if (!includesFood(context.serviceType)) return context.menu;
  const menu = cleanMenu(context.menu, { buffet: true, dessert: Boolean(context.menu.dessert) });
  const explicit = new Set(DISH_CATEGORIES.flatMap(({ key }) => menu[key].map(dishKey)));
  const offered = new Map(DISH_CATEGORIES.map((category) => [category.key, offeredDishes(catalog, category)]));
  const slots = [1, 2].flatMap((limit) =>
    DISH_CATEGORIES.filter(({ key }) => menu[key].length < limit).map(({ key }) => key)
  );
  const matched = new Map();
  function assign(slot, visited) {
    for (const name of offered.get(slots[slot])) {
      const key = dishKey(name);
      if (explicit.has(key) || visited.has(key)) continue;
      visited.add(key);
      const previous = matched.get(key);
      if (!previous || assign(previous.slot, visited)) {
        matched.set(key, { slot, name });
        return true;
      }
    }
    return false;
  }
  for (let slot = 0; slot < slots.length && explicit.size + matched.size < 4; slot++) assign(slot, new Set());
  for (const { slot, name } of [...matched.values()].sort((a, b) => a.slot - b.slot)) menu[slots[slot]].push(name);
  const issue = menuProblem(menu, { dessert: Boolean(menu.dessert) });
  if (issue)
    fail('The currently offered menu cannot supply four distinct buffet selections within the category limits.');
  return menu;
}

export function recipeFor(reference, context, rules) {
  if (!hasOnlyKeys(reference, ['recipeId', 'change'])) fail('Choose a server-approved package recipe.');
  const recipe = rules.recipes.find((r) => r.id === reference.recipeId);
  if (
    !recipe ||
    !recipe.serviceTypes.includes(context.serviceType) ||
    context.guests < recipe.minGuests ||
    context.guests > recipe.maxGuests
  )
    fail('No approved setup in this recipe covers the requested service and guest count.');
  if (context.addonIds.some((id) => !recipe.optionalAddonIds.includes(id)))
    fail('The required setup is not approved with all of your selected services.');
  return recipe;
}

function serviceSelection(reference, recipe, context, inputs, checkStock, addons) {
  const { byId } = addons;
  const change = reference.change;
  let selection = { addonIds: context.addonIds, addonQty: context.addonQty };
  if (change != null) {
    const keysByType = {
      add: ['type', 'addonId'],
      remove: ['type', 'addonId'],
      replace: ['type', 'addonId', 'replacementId'],
      reduce: ['type', 'addonId', 'quantity']
    };
    if (
      !Object.hasOwn(keysByType, change?.type) ||
      !hasOnlyKeys(change, keysByType[change.type]) ||
      !recipe.optionalAddonIds.includes(change.addonId)
    )
      fail('The proposed service change is not approved for this setup.');
    const addon = byId.get(change.addonId);
    if (change.type === 'add') {
      if (isBudgetFoodAddon(addon) || context.addonIds.includes(addon.id))
        fail('Only unselected optional non-food services can be added.');
      const min = addon.budgetPolicy?.minQty ?? 1;
      selection = normalizeBudgetSelection(
        {
          addonIds: [...context.addonIds, addon.id],
          addonQty: { ...context.addonQty, [addon.id]: min }
        },
        inputs.catalog,
        byId
      );
      const stock = inputs.stock?.[addon.inventoryItemId] ?? inputs.stock?.[addon.id];
      if (checkStock && addon.inventoryItemId && !Number.isInteger(stock?.left))
        fail('Optional service stock needs confirmation.');
    } else {
      if (change.type === 'replace' && !recipe.optionalAddonIds.includes(change.replacementId))
        fail('That replacement is not approved for this setup.');
      selection = actionSelection(context, selection, change, inputs, { checkStock, addons });
    }
  }
  const inventoryDemand = new Map();
  for (const id of selection.addonIds) {
    const addon = byId.get(id);
    const { policy, problem } = addons.readPolicy(addon);
    if (problem) fail(problem);
    if (policy.requires.some((required) => !selection.addonIds.includes(required)))
      fail(`${addon.name} requires another supporting service.`);
    if (policy.minQty !== null && selection.addonQty[id] < policy.minQty)
      fail(`${addon.name} needs at least ${policy.minQty} units.`);
    const key = addon.inventoryItemId || id;
    const demand = (inventoryDemand.get(key) || 0) + selection.addonQty[id];
    inventoryDemand.set(key, demand);
    const stock = inputs.stock?.[key] ?? inputs.stock?.[id];
    if (checkStock && Number.isInteger(stock?.left) && stock.left < demand)
      fail(`The requested quantity of ${addon.name} is not available for this date.`);
  }
  return selection;
}

function priceProposal(context, catalog, snapshot, selection, addons) {
  const known = (price) => Number.isSafeInteger(price) && price >= 0;
  const unknownCharges = addons.filter((a) => !known(a.price)).map((a) => ({ id: a.id, label: a.name }));
  const buffet = includesFood(context.serviceType);
  const rateKnown = known(catalog.pricePerPlate) && catalog.pricePerPlate > 0;
  if (buffet && !rateKnown) unknownCharges.push({ id: 'buffet-rate', label: 'Buffet rate per guest' });
  if (eventMinutes(context.startTime, context.endTime) === 360 && !known(catalog.sixHourFee))
    unknownCharges.push({ id: 'duration', label: 'Six-hour event fee' });
  const quote = computeQuote({
    pkg: snapshot,
    pricingModel: buffet ? INCLUSIVE_PRICING_MODEL : LEGACY_PRICING_MODEL,
    serviceType: context.serviceType,
    guests: context.guests,
    pricePerPlate: rateKnown ? catalog.pricePerPlate : 0,
    startTime: context.startTime,
    endTime: context.endTime,
    sixHourFee: known(catalog.sixHourFee) ? catalog.sixHourFee : 0,
    ...selection,
    addonPrices: Object.fromEntries(addons.filter((a) => known(a.price)).map((a) => [a.id, a.price]))
  });
  return {
    pricingModel: quote.pricingModel,
    budget: context.budget,
    baseTotal: quote.food + quote.packageTotal + quote.durationCharge,
    knownTotal: quote.net,
    knownAddonsTotal: quote.addons,
    unknownCharges,
    budgetStatus: unknownCharges.length ? 'incomplete' : quote.net > context.budget ? 'over' : 'within',
    difference: unknownCharges.length ? null : quote.net - context.budget,
    knownOverBudget: Math.max(0, quote.net - context.budget),
    quote
  };
}

export function resolveProposal(reference, recipe, context, menu, inputs, lookup, checkStock = true) {
  const { byId } = lookup;
  const selection = serviceSelection(reference, recipe, context, inputs, checkStock, lookup);
  const buffet = includesFood(context.serviceType);
  const packageSnapshot = {
    id: `custom-${recipe.id}`,
    slug: `custom-${recipe.id}`,
    name: recipe.name,
    kind: 'package',
    price: buffet ? 0 : recipe.cateringSetupPrice,
    guests: context.guests,
    description: recipe.description || `${recipe.name} for ${context.guests} guests.`,
    items: recipe.components.map((c) => ({ name: c.itemName, qty: componentQuantity(c, context.guests), grows: false }))
  };
  const addons = selection.addonIds.map((id) => {
    const a = byId.get(id);
    return { id, name: a.name, qty: selection.addonQty[id], price: a.price ?? null };
  });
  const estimate = priceProposal(context, inputs.catalog, packageSnapshot, selection, addons);
  const pending = ['The team will confirm setup equipment, staffing and the event schedule.'];
  if (context.foodNotes) pending.push('The catering team must confirm the food notes and dietary requests.');
  for (const addon of addons) {
    const inventoryId = byId.get(addon.id).inventoryItemId;
    if (inventoryId && !Number.isInteger((inputs.stock?.[inventoryId] ?? inputs.stock?.[addon.id])?.left))
      pending.push(`${addon.name} stock for this date needs confirmation.`);
  }
  const tradeoffs = [
    buffet
      ? `Includes four buffet dishes and the required setup for all ${context.guests} guests.`
      : `Includes the required catering setup for ${context.guests} guests.`
  ];
  const change = reference.change;
  if (change) {
    const name = byId.get(change.addonId).name;
    if (change.type === 'remove') tradeoffs.push(`Leaves out ${name}.`);
    if (change.type === 'add') tradeoffs.push(`Adds ${name} (${selection.addonQty[change.addonId]}).`);
    if (change.type === 'replace') tradeoffs.push(`Replaces ${name} with ${byId.get(change.replacementId).name}.`);
    if (change.type === 'reduce')
      tradeoffs.push(`Reduces ${name} from ${context.addonQty[change.addonId]} to ${change.quantity}.`);
  }
  const id = [recipe.id, change?.type || 'base', change?.addonId, change?.replacementId, change?.quantity]
    .filter((v) => v != null)
    .map(encodeURIComponent)
    .join('/');
  return {
    id,
    recipe: { recipeId: recipe.id, change: change || null },
    packageSnapshot,
    menu,
    styling: context.styling,
    ...selection,
    addons,
    estimate,
    tradeoffs,
    pending
  };
}
