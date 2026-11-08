import { componentQuantity, validatePackageProposalRules } from './packageProposalPolicy.js';

const key = (name) => name.trim().toLowerCase();
export const isGuestChair = (name) =>
  /\bchairs?\b/i.test(name) && !/\b(?:cover|sash|cloth)s?\b/i.test(name.replace(/with\s+cloth/gi, ''));
const perGuest = (name) =>
  isGuestChair(name) ||
  /^(?:(?:porcelain|ceramic|dinner|dining|water|drinking|stainless(?:\s+steel)?)\s+)*(?:plates?|glasses|goblets?|spoons?(?:\s*(?:and|&|\/)\s*forks?)?|forks?|cutlery|utensils)(?:\s+sets?)?$/i.test(
    name.trim()
  );
export const optionalSetupItem = (item) =>
  !perGuest(item.itemName) &&
  (item.optional === true ||
    (item.optional !== false &&
      /\b(?:water|cake|gift|souvenir)\s+(?:station|tables?)\b|\b(?:backdrop|centerpieces?|decorations?)\b/i.test(
        item.itemName
      )));

export function setupQuestions(catalog, context, rules = catalog?.packageProposalRules) {
  const checked = validatePackageProposalRules(rules, catalog);
  const recipes = (checked.rules?.enabled ? checked.rules.recipes : []).filter(
    (r) =>
      r.serviceTypes.includes(context.serviceType) &&
      Number(context.guests) >= r.minGuests &&
      Number(context.guests) <= r.maxGuests
  );
  const byName = new Map();
  for (const c of recipes.flatMap((r) => r.components))
    if (!byName.has(key(c.itemName))) byName.set(key(c.itemName), c);
  const components = [...byName.values()];
  return {
    chairs: components.filter((c) => isGuestChair(c.itemName)),
    optional: components.filter(optionalSetupItem),
    essentials: components.filter((c) => !isGuestChair(c.itemName) && !optionalSetupItem(c)),
    recipes
  };
}

export function cleanSetupPreferences(raw) {
  if (raw == null) return undefined;
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    raw.reviewed !== true ||
    typeof raw.chairName !== 'string' ||
    raw.chairName.length > 200 ||
    !Array.isArray(raw.items) ||
    raw.items.length > 40 ||
    raw.items.some(
      (i) =>
        !i ||
        typeof i.itemName !== 'string' ||
        !i.itemName.trim() ||
        i.itemName.length > 200 ||
        typeof i.included !== 'boolean'
    ) ||
    new Set(raw.items.map((i) => key(i.itemName))).size !== raw.items.length
  )
    throw new Error('Review the chair choice and optional setup equipment first.');
  return {
    reviewed: true,
    chairName: raw.chairName.trim(),
    items: raw.items.map((i) => ({ itemName: i.itemName.trim(), included: i.included }))
  };
}

export function validateSetupAnswers(answers, questions) {
  if (!answers) return;
  if (
    (questions.chairs.length && !questions.chairs.some((c) => c.itemName === answers.chairName)) ||
    (!questions.chairs.length && answers.chairName)
  )
    throw new Error('Choose an offered guest chair for this setup.');
  if (answers.items.some((i) => !questions.optional.some((c) => c.itemName === i.itemName)))
    throw new Error(
      'Only offered optional equipment can be included or excluded; essential dining items are retained.'
    );
  if (questions.optional.some((c) => !answers.items.some((i) => i.itemName === c.itemName)))
    throw new Error('Answer each optional setup question before generating packages.');
}

/** Reference packages supply approved components; customer answers determine the resulting snapshot. */
export function resolveCustomSetup(recipe, context, menu, catalog, rules) {
  if (!context.setupPreferences) return null;
  const questions = setupQuestions(catalog, context, rules);
  const answers = context.setupPreferences;
  validateSetupAnswers(answers, questions);
  const quantity = (c) =>
    perGuest(c.itemName)
      ? context.guests
      : /\b(?:food\s*warmers?|chafing\s*dishes?)\b/i.test(c.itemName) && context.serviceType === 'Buffet and Catering'
        ? Object.values(menu)
            .filter(Array.isArray)
            .reduce((n, dishes) => n + dishes.length, 0)
        : componentQuantity(c, context.guests);
  const included = new Map(answers.items.map((i) => [i.itemName, i.included]));
  const wanted = recipe.components.filter((c) =>
    isGuestChair(c.itemName) ? c.itemName === answers.chairName : !optionalSetupItem(c) || included.get(c.itemName)
  );
  for (const c of [
    ...questions.chairs.filter((c) => c.itemName === answers.chairName),
    ...questions.optional.filter((c) => included.get(c.itemName))
  ])
    if (!wanted.some((i) => key(i.itemName) === key(c.itemName))) wanted.push(c);
  // The inclusive buffet rate has one standard reference baseline. A premium recipe must never
  // create a discount simply because the customer selected the same standard chairs as another option.
  const baseline = context.serviceType === 'Buffet and Catering' ? questions.recipes[0] : recipe;
  const old = new Map(baseline.components.map((c) => [key(c.itemName), c]));
  const prices = new Map(
    [...questions.chairs, ...questions.optional, ...questions.essentials].map((c) => [key(c.itemName), c.unitPrice])
  );
  const next = new Map(wanted.map((c) => [key(c.itemName), c]));
  const changes = [],
    unknownCharges = [];
  let adjustment = 0;
  for (const name of new Set([...old.keys(), ...next.keys()])) {
    const before = old.get(name),
      after = next.get(name),
      item = after || before;
    const delta = (after ? quantity(after) : 0) - (before ? componentQuantity(before, context.guests) : 0);
    if (!delta) continue;
    changes.push(`${delta > 0 ? 'Adds' : 'Removes'} ${Math.abs(delta)} × ${item.itemName} from the reference setup.`);
    const unitPrice = prices.get(name);
    if (Number.isSafeInteger(unitPrice) && unitPrice >= 0) adjustment += delta * unitPrice;
    else unknownCharges.push({ id: `setup-${encodeURIComponent(name)}`, label: `${item.itemName} setup adjustment` });
  }
  return {
    items: wanted.map((c) => ({ name: c.itemName, qty: quantity(c), grows: false })),
    adjustment,
    unknownCharges,
    changes
  };
}
