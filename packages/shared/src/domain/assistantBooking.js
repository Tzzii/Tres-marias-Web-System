import { OCCASIONS, RULES, RENTAL, DISH_CATEGORIES, includesFood, isRental } from '../services/config.js';
import { cleanMenu, menuProblem, DESSERT_ADDON_ID } from './menu.js';
import { cleanStyling, stylingProblem, themeLabel } from './styling.js';
import { endTimeProblem } from './availability.js';
import { cleanSetupPreferences } from './packageSetup.js';

const object = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const word = (v, max) =>
  typeof v === 'string'
    ? v
        .toWellFormed()
        .replace(/[\u0000-\u001f]/g, ' ')
        .trim()
        .slice(0, max)
    : '';
const id = (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v);
export function proposalOccasionFields(value) {
  const occasion = word(value, 80);
  if (!occasion) return {};
  return OCCASIONS.includes(occasion) && occasion !== 'Other'
    ? { occasion, occasionOther: '' }
    : { occasion: 'Other', occasionOther: occasion.slice(0, ASSISTANT_BOOKING_TEXT.occasionOther) };
}

/** Preserve saved nonfinancial answers while applying the selected server-owned option. */
export function assistantPackageProposalDraft(previous, context, option, reference) {
  return cleanAssistantBooking({
    ...previous,
    ...context,
    eventName: previous?.eventName || context.eventName,
    ...proposalOccasionFields(context.occasion),
    budgetNotes: context.preferences,
    packageSlug: undefined,
    planningMode: 'custom',
    packageProposalRef: reference,
    menu: option.menu,
    styling: option.styling,
    addonIds: option.addonIds,
    addonQty: option.addonQty
  });
}
const date = (v) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(`${v}T00:00:00Z`)) &&
  new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const time = (v) => typeof v === 'string' && /^(?:[01]\d|2[0-3]):[03]0$/.test(v);
export const ASSISTANT_BOOKING_TEXT = Object.freeze({
  eventName: 120,
  occasionOther: 40,
  venueName: 160,
  venueAddress: 255,
  city: 120,
  accessNotes: 2000,
  foodNotes: 2000,
  budgetNotes: 500
});
export const ASSISTANT_BOOKING_TOPICS = Object.freeze([
  'styling',
  'menu',
  'addons',
  'notes',
  'budget',
  'colors',
  'photos',
  'design',
  'access'
]);
export const ASSISTANT_BOOKING_FIELDS = Object.freeze([
  ...Object.keys(ASSISTANT_BOOKING_TEXT),
  'packageSlug',
  'packageProposalRef',
  'planningMode',
  'setupPreferences',
  'serviceType',
  'occasion',
  'guests',
  'date',
  'startTime',
  'endTime',
  'fulfilment',
  'budget',
  'planningStarted',
  'menu',
  'styling',
  'addonIds',
  'addonQty',
  'rentalQty'
]);

export function cleanPackageProposalRef(raw) {
  if (
    !raw ||
    !id(raw.proposalId) ||
    raw.proposalId.length > 40 ||
    typeof raw.optionId !== 'string' ||
    !raw.optionId.trim() ||
    raw.optionId.length > 255 ||
    !Number.isSafeInteger(raw.revision) ||
    raw.revision < 1
  )
    return null;
  return { proposalId: raw.proposalId, optionId: raw.optionId, revision: raw.revision };
}

/** A booking draft can carry selections only. Prices, ownership, uploads, terms and status never cross this boundary. */
export function cleanAssistantBooking(value) {
  const raw = object(value),
    clean = {};
  if (typeof raw.planningStarted === 'boolean') clean.planningStarted = raw.planningStarted;
  if (Array.isArray(raw.clearedFields))
    clean.clearedFields = [...new Set(raw.clearedFields.filter((key) => ASSISTANT_BOOKING_FIELDS.includes(key)))];
  for (const [key, max] of Object.entries(ASSISTANT_BOOKING_TEXT))
    if (typeof raw[key] === 'string') clean[key] = word(raw[key], max);
  if (typeof raw.packageSlug === 'string' && /^[a-z0-9-]{1,160}$/.test(raw.packageSlug))
    clean.packageSlug = raw.packageSlug;
  if (['Buffet and Catering', 'Catering only', 'Equipment rental'].includes(raw.serviceType))
    clean.serviceType = raw.serviceType;
  if (['catalog', 'custom'].includes(raw.planningMode)) clean.planningMode = raw.planningMode;
  if (raw.setupPreferences != null) clean.setupPreferences = cleanSetupPreferences(raw.setupPreferences);
  const reference = cleanPackageProposalRef(raw.packageProposalRef);
  if (reference && clean.planningMode !== 'catalog' && !isRental(clean.serviceType)) {
    clean.packageProposalRef = reference;
    clean.planningMode = 'custom';
  }
  if (clean.planningMode === 'custom' && !isRental(clean.serviceType)) delete clean.packageSlug;
  if (isRental(clean.serviceType)) delete clean.planningMode;
  if (OCCASIONS.includes(raw.occasion)) clean.occasion = raw.occasion;
  if (Number.isInteger(raw.guests) && raw.guests >= RULES.minGuests && raw.guests <= RULES.maxGuests)
    clean.guests = raw.guests;
  if (date(raw.date)) clean.date = raw.date;
  for (const key of ['startTime', 'endTime']) if (time(raw[key])) clean[key] = raw[key];
  if (['pickup', 'delivery'].includes(raw.fulfilment)) clean.fulfilment = raw.fulfilment;
  if (Number.isInteger(raw.budget) && raw.budget >= 1 && raw.budget <= 10000000) clean.budget = raw.budget;
  if (raw.menu && typeof raw.menu === 'object')
    clean.menu = cleanMenu(raw.menu, { buffet: true, dessert: Boolean(raw.menu.dessert) });
  if (raw.styling && typeof raw.styling === 'object') {
    const { theme, themeOther, colors, notes } = object(cleanStyling(raw.styling));
    clean.styling = {
      theme: theme || '',
      themeOther: word(themeOther, 60),
      colors: (colors || []).slice(0, 5),
      notes: word(notes, 1000)
    };
  }
  if (Array.isArray(raw.addonIds)) clean.addonIds = [...new Set(raw.addonIds.filter(id))].slice(0, 20);
  if (raw.addonQty)
    clean.addonQty = Object.fromEntries(
      Object.entries(object(raw.addonQty))
        .filter(([key, n]) => id(key) && Number.isInteger(n) && n >= 1 && n <= 99)
        .slice(0, 20)
    );
  if (raw.rentalQty)
    clean.rentalQty = Object.fromEntries(
      Object.entries(object(raw.rentalQty))
        .filter(([key, n]) => id(key) && Number.isInteger(n) && n >= 1 && n <= RENTAL.maxQty)
        .slice(0, 40)
    );
  if (Array.isArray(raw.discussed))
    clean.discussed = [...new Set(raw.discussed.filter((v) => ASSISTANT_BOOKING_TOPICS.includes(v)))];
  if (isRental(clean.serviceType))
    for (const key of ['guests', 'menu', 'styling', 'addonIds', 'addonQty', 'endTime']) delete clean[key];
  else if (clean.serviceType === 'Catering only' && clean.menu)
    clean.menu = cleanMenu(clean.menu, { buffet: false, dessert: clean.addonIds?.includes(DESSERT_ADDON_ID) });
  return clean;
}

/** Explicit edits replace collections; changing service removes selections from the previous service. */
export function mergeAssistantBooking(previous, patch, clearFields = []) {
  const base = cleanAssistantBooking(previous);
  const next = cleanAssistantBooking(patch);
  const reviewedValue = (key, value) =>
    key === 'menu'
      ? cleanMenu(value, {
          buffet: includesFood(next.serviceType || base.serviceType),
          dessert: Boolean(value?.dessert)
        })
      : value;
  const differs = (key) =>
    JSON.stringify(reviewedValue(key, next[key])) !== JSON.stringify(reviewedValue(key, base[key]));
  const cleared = new Set([
    ...(base.clearedFields || []),
    ...(next.clearedFields || []),
    ...clearFields.filter((key) => ASSISTANT_BOOKING_FIELDS.includes(key))
  ]);
  const reviewed = [
    'serviceType',
    'guests',
    'date',
    'startTime',
    'endTime',
    'menu',
    'styling',
    'addonIds',
    'addonQty',
    'foodNotes',
    'budget',
    'budgetNotes',
    'setupPreferences'
  ];
  const changed = reviewed.some(
    (key) =>
      (Object.hasOwn(next, key) && differs(key)) ||
      (cleared.has(key) && Object.hasOwn(base, key) && !Object.hasOwn(next, key))
  );
  if (
    base.packageProposalRef &&
    !next.packageProposalRef &&
    (changed || next.packageSlug || next.planningMode === 'catalog')
  )
    delete base.packageProposalRef;
  if (next.packageSlug && !next.packageProposalRef) base.planningMode = 'catalog';
  if (next.serviceType && base.serviceType && next.serviceType !== base.serviceType) {
    delete base.setupPreferences;
    delete base.menu;
    delete base.discussed;
    if (isRental(next.serviceType) !== isRental(base.serviceType))
      for (const key of ['packageSlug', 'guests', 'styling', 'addonIds', 'addonQty', 'rentalQty', 'fulfilment'])
        delete base[key];
  }
  if (['guests', 'menu'].some((key) => Object.hasOwn(next, key) && differs(key)) && !next.setupPreferences)
    delete base.setupPreferences;
  for (const key of cleared) delete base[key];
  for (const key of Object.keys(next)) if (key !== 'clearedFields') cleared.delete(key);
  const combined = { ...base, ...next };
  if (cleared.size) combined.clearedFields = [...cleared];
  else delete combined.clearedFields;
  if (patch?.menu) combined.menu = { ...base.menu, ...patch.menu };
  if (patch?.styling) combined.styling = { ...base.styling, ...patch.styling };
  if (next.discussed) combined.discussed = [...new Set([...(base.discussed || []), ...next.discussed])];
  return cleanAssistantBooking(combined);
}

export function assistantBookingProgress(value) {
  const draft = cleanAssistantBooking(value),
    missing = [];
  const need = (field, label, question) => missing.push({ field, label, question });
  if (!draft.serviceType)
    need(
      'serviceType',
      'Service type',
      'Would you like a buffet with food, catering equipment only, or equipment rental?'
    );
  if (!draft.occasion || (draft.occasion === 'Other' && !draft.occasionOther))
    need('occasion', 'Occasion', 'What occasion are you celebrating?');
  if (!draft.date) need('date', 'Event date', 'What is your preferred event date?');
  if (
    isRental(draft.serviceType)
      ? !draft.startTime
      : !draft.startTime || !draft.endTime || endTimeProblem(draft.startTime, draft.endTime)
  )
    need(
      'schedule',
      isRental(draft.serviceType) ? 'Pickup or delivery time' : 'Start and end time',
      isRental(draft.serviceType)
        ? 'What time will you need the items for pickup or delivery?'
        : 'What time will the event start and end? Events last two to six hours.'
    );
  if (!draft.eventName) need('eventName', 'Event name', 'What name should we use for this event?');
  if (isRental(draft.serviceType)) {
    if (!Object.keys(draft.rentalQty || {}).length)
      need('rentalQty', 'Rental items and quantities', 'Which items would you like to rent, and how many of each?');
    if (!draft.fulfilment)
      need('fulfilment', 'Pickup or delivery', 'Will you pick up the equipment, or would you like delivery?');
  } else {
    if (!draft.guests) need('guests', 'Guest count', 'How many guests are you expecting?');
    if (draft.planningMode === 'custom' && !draft.packageProposalRef)
      need(
        'packageProposalRef',
        'Custom package',
        draft.budget
          ? 'Review your custom package options and choose the setup you prefer.'
          : 'What budget should I use to prepare your custom package options?'
      );
    else if (!draft.packageSlug && !draft.packageProposalRef)
      need('packageSlug', 'Package', 'Have you chosen a package, or would you like help comparing options?');
    const menuIssue =
      draft.serviceType &&
      menuProblem(draft.menu, {
        buffet: includesFood(draft.serviceType),
        dessert: draft.addonIds?.includes(DESSERT_ADDON_ID)
      });
    if (menuIssue)
      need(
        menuIssue.field,
        menuIssue.field.startsWith('menu.dessert') ? 'Dessert details' : 'Four-dish menu',
        menuIssue.field.startsWith('menu.dessert')
          ? 'Which dessert would you like, and are there any dessert requests?'
          : 'Which four dishes would you like? You can choose up to two per category.'
      );
  }
  if (!isRental(draft.serviceType) || draft.fulfilment === 'delivery')
    for (const [field, label] of [
      ['venueName', 'Venue name'],
      ['venueAddress', 'Venue address'],
      ['city', 'City or municipality']
    ])
      if (!draft[field]) need(field, label, `What is the ${label.toLowerCase()}?`);
  if (draft.styling && stylingProblem(draft.styling))
    need('styling', 'Theme or motif details', stylingProblem(draft.styling).message);
  const optional = [];
  const provided = {
    styling: Boolean(
      draft.styling &&
      (draft.styling.theme || draft.styling.themeOther || draft.styling.colors?.length || draft.styling.notes)
    ),
    addons: Object.hasOwn(draft, 'addonIds'),
    notes: Boolean(draft.accessNotes || draft.foodNotes),
    budget: Boolean(draft.budget || draft.budgetNotes)
  };
  for (const [topic, question] of [
    ['styling', 'Do you have a theme or color motif? It is fine to leave it undecided.'],
    ['addons', 'Would you like any additional services?'],
    ['notes', 'Any dietary needs, venue access details or special requests?'],
    ['budget', 'Do you have a budget you would like us to consider?']
  ]) {
    if (
      !provided[topic] &&
      !draft.discussed?.includes(topic) &&
      (!isRental(draft.serviceType) || ['notes', 'budget'].includes(topic))
    )
      optional.push({ topic, question });
  }
  return {
    missing,
    optional,
    nextQuestions: (missing.length ? missing : optional).slice(0, 2).map((v) => v.question),
    complete: missing.length === 0,
    canReview: Object.keys(draft).some((k) => k !== 'discussed')
  };
}

export function assistantBookingSummary(value, catalog = {}) {
  const d = cleanAssistantBooking(value),
    rows = [];
  const add = (label, value) => {
    if (value) rows.push({ label, value: String(value) });
  };
  add('Event', d.eventName);
  add('Occasion', d.occasion === 'Other' ? d.occasionOther : d.occasion);
  add('Service', d.serviceType);
  add('Guests', d.guests);
  add('Date', d.date);
  add('Time', d.startTime && `${d.startTime}${d.endTime ? `–${d.endTime}` : ''} (Asia/Manila)`);
  if (d.packageProposalRef)
    add('Custom package', catalog.selectedPackageProposal?.packageSnapshot.name || 'Custom package selection');
  else if (d.packageSlug)
    add('Package', catalog.packages?.find((p) => p.slug === d.packageSlug)?.name || 'Package needs review');
  add('Venue', [d.venueName, d.venueAddress, d.city].filter(Boolean).join(', '));
  add('Menu', DISH_CATEGORIES.flatMap(({ key }) => d.menu?.[key] || []).join(', '));
  add('Dessert', d.menu?.dessert?.name);
  add('Theme', d.styling && themeLabel(d.styling));
  add('Colors', d.styling?.colors?.map((c) => c.name).join(', '));
  add('Styling requests', d.styling?.notes);
  const names = (ids, entries, quantities) =>
    (ids || [])
      .map(
        (key) => `${entries?.find((p) => p.id === key)?.name || 'Selection needs review'} × ${quantities?.[key] || 1}`
      )
      .join(', ');
  add('Additional services', names(d.addonIds, catalog.addons, d.addonQty));
  add('Rental items', names(Object.keys(d.rentalQty || {}), catalog.rentals, d.rentalQty));
  add('Fulfilment', d.fulfilment === 'delivery' ? 'Delivery' : d.fulfilment === 'pickup' ? 'Pickup' : '');
  add('Budget', d.budget && `₱${d.budget.toLocaleString('en-PH')} (target)`);
  add('Budget preferences', d.budgetNotes);
  add('Food requests', d.foodNotes);
  add('Venue / special requests', d.accessNotes);
  add('Remove from saved form', d.clearedFields?.join(', '));
  return rows;
}

/** Apply only explicitly reviewed fields; keep unrelated saved form details and uploads. */
export function applyAssistantBooking(base, intent, catalog) {
  const d = cleanAssistantBooking(intent),
    next = { ...base };
  const resetProposalState = () => {
    if (Object.hasOwn(next, 'packageProposalDisplay')) next.packageProposalDisplay = null;
    if (Object.hasOwn(next, 'packageProposalContext')) next.packageProposalContext = null;
    if (Object.hasOwn(next, 'packageProposalStale')) next.packageProposalStale = false;
  };
  for (const key of d.clearedFields || []) {
    if (key === 'packageSlug') next.packageId = '';
    else if (key === 'packageProposalRef') {
      next.packageProposalRef = null;
      resetProposalState();
    } else if (key === 'budget')
      next.budgetDraft = {
        amount: '',
        preferences: '',
        protectedAddonIds: [],
        baseline: null,
        history: [],
        proposalRef: null
      };
    else if (key === 'styling') next.styling = { theme: '', themeOther: '', colors: [], notes: '' };
    else if (['menu', 'addonQty', 'rentalQty'].includes(key)) next[key] = {};
    else if (key === 'addonIds') next[key] = [];
    else if (Object.hasOwn(next, key)) next[key] = '';
  }
  for (const key of Object.keys(ASSISTANT_BOOKING_TEXT))
    if (Object.hasOwn(d, key) && !['budgetNotes'].includes(key)) next[key] = d[key];
  for (const key of [
    'occasion',
    'date',
    'startTime',
    'endTime',
    'serviceType',
    'fulfilment',
    'menu',
    'styling',
    'addonIds',
    'addonQty',
    'rentalQty'
  ])
    if (Object.hasOwn(d, key)) next[key] = d[key];
  if (d.guests) next.guests = String(d.guests);
  const pkg = catalog?.packages?.find((p) => p.slug === d.packageSlug && p.visible !== false && !p.archived);
  if (pkg) {
    next.packageId = pkg.id;
    next.packageProposalRef = null;
    next.planningMode = 'catalog';
    resetProposalState();
  }
  if (d.planningMode === 'custom') {
    next.packageId = '';
    next.planningMode = 'custom';
    next.packageProposalRef = d.packageProposalRef || null;
    resetProposalState();
  }
  if (isRental(d.serviceType)) {
    const rental = catalog?.packages?.find((p) => p.kind === 'rental' && p.visible !== false && !p.archived);
    next.packageId = rental?.id || '';
    next.packageProposalRef = null;
    next.planningMode = 'catalog';
    resetProposalState();
    next.guests = '';
    next.menu = {};
    next.styling = { theme: '', themeOther: '', colors: [], notes: '' };
    next.addonIds = [];
    next.addonQty = {};
  } else if (d.serviceType) {
    next.rentalQty = {};
    const previousPackage = catalog?.packages?.find((p) => p.id === next.packageId);
    if (previousPackage?.kind === 'rental') next.packageId = '';
    if (!includesFood(d.serviceType) && !Object.hasOwn(d, 'menu')) next.menu = {};
  }
  if (d.budget)
    next.budgetDraft = {
      amount: String(d.budget),
      preferences: d.budgetNotes || '',
      protectedAddonIds: [],
      baseline: null,
      history: [],
      proposalRef: null
    };
  return next;
}
