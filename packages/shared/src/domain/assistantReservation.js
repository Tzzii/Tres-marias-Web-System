import { cleanAssistantBooking } from './assistantBooking.js';
import { endTimeProblem } from './availability.js';
import { menuProblem, DESSERT_ADDON_ID } from './menu.js';
import { stylingProblem, THEME_OTHER, THEME_OTHER_RANGE } from './styling.js';
import { bookableAddons } from './catalog.js';
import { includesFood, isRental } from '../services/config.js';

export const ASSISTANT_RESERVATION_STEPS = Object.freeze({
  start: 'Would you like me to guide you through a reservation?',
  eventName: 'What name should we use for your event?',
  occasion: 'What occasion are you celebrating?',
  service: 'Which service would you like to book?',
  date: 'What is your preferred date?',
  schedule: 'What time will you need the service? I will check your schedule before we continue.',
  guests: 'How many guests are you expecting?',
  package: 'Choose the package you like. You can ask me to compare the options.',
  customPackage:
    'Review the custom package options prepared from your guest count, budget and event preferences, then choose the setup you prefer.',
  menu: 'Which dishes would you like? Choose four in total, up to two per category.',
  theme: 'What theme would you like for the setup?',
  colors: 'What colors would you like? You can use a suggested palette or choose your own.',
  photos: 'Do you have reference photos for your design? You can upload them here or skip.',
  design: 'Tell me about the design details you have in mind.',
  venueName: 'What is the name of your venue?',
  venueAddress: 'What is the venue address?',
  city: 'In which city or municipality is the venue?',
  access: 'Are there any venue access notes, such as stairs or delivery instructions?',
  addons: 'Would you like any additional services?',
  foodNotes: 'Do you have any dietary needs or other food requests?',
  budget: 'Do you have a target budget or budget preferences for us to consider?',
  rentalItems: 'Which equipment would you like to rent, and how many of each?',
  fulfilment: 'Will you pick up the equipment, or would you like delivery?',
  review: 'Please review your reservation before sending it to the team.'
});

/** One visible question at a time; explicit saved answers and skips survive reloads and chat edits. */
export function assistantReservationStep(value, { schedule, photos = [], catalog = {} } = {}) {
  const d = cleanAssistantBooking(value),
    rental = isRental(d.serviceType);
  const discussed = new Set(d.discussed || []);
  const result = (key) => ({ key, question: ASSISTANT_RESERVATION_STEPS[key] });
  if (!d.planningStarted) return result('start');
  if (!d.eventName) return result('eventName');
  if (!d.occasion || (d.occasion === 'Other' && !d.occasionOther)) return result('occasion');
  if (!d.serviceType) return result('service');
  if (!d.date) return result('date');
  if (
    !d.startTime ||
    (!rental && (!d.endTime || endTimeProblem(d.startTime, d.endTime))) ||
    !schedule ||
    schedule.date !== d.date ||
    schedule.startTime !== d.startTime ||
    (!rental && schedule.endTime !== d.endTime) ||
    (schedule.serviceType && schedule.serviceType !== d.serviceType) ||
    !schedule.available
  )
    return result('schedule');
  if (rental) {
    if (
      !Object.keys(d.rentalQty || {}).length ||
      Object.keys(d.rentalQty || {}).some((id) => !catalog.rentals?.some((item) => item.id === id && !item.archived))
    )
      return result('rentalItems');
    if (!d.fulfilment) return result('fulfilment');
  } else {
    if (!d.guests) return result('guests');
    if (d.planningMode === 'custom' && (!d.packageProposalRef || catalog.packageProposalIssue))
      return result(d.budget ? 'customPackage' : 'budget');
    const pkg = catalog.packages?.find(
      (p) => p.slug === d.packageSlug && p.visible !== false && !p.archived && p.kind !== 'rental'
    );
    if ((!d.packageProposalRef || catalog.packageProposalIssue) && !pkg) return result('package');
    if (menuProblem(d.menu, { buffet: includesFood(d.serviceType), dessert: d.addonIds?.includes(DESSERT_ADDON_ID) }))
      return result('menu');
    if (
      (!d.styling?.theme && !discussed.has('styling')) ||
      (d.styling?.theme === THEME_OTHER &&
        (!d.styling.themeOther || d.styling.themeOther.length < THEME_OTHER_RANGE.min))
    )
      return result('theme');
    if (
      (d.styling?.colors?.length && stylingProblem({ ...d.styling, theme: '' })) ||
      (!d.styling?.colors?.length && !discussed.has('colors'))
    )
      return result('colors');
    if (!discussed.has('photos')) return result('photos');
    if (!d.styling?.notes && !discussed.has('design')) return result('design');
  }
  if (!rental || d.fulfilment === 'delivery') {
    for (const field of ['venueName', 'venueAddress', 'city']) if (!d[field]) return result(field);
    if (!d.accessNotes && !discussed.has('access')) return result('access');
  }
  if (!rental) {
    if (!Object.hasOwn(d, 'addonIds') && !discussed.has('addons')) return result('addons');
    if (d.addonIds?.some((id) => !bookableAddons(catalog.addons || []).some((a) => a.id === id)))
      return result('addons');
    if (
      bookableAddons(catalog.addons || []).some(
        (a) => d.addonIds?.includes(a.id) && a.hasQuantity && !d.addonQty?.[a.id]
      )
    )
      return result('addons');
    if (includesFood(d.serviceType) && !d.foodNotes && !discussed.has('notes')) return result('foodNotes');
  }
  if (!d.budget && !d.budgetNotes && !discussed.has('budget')) return result('budget');
  return result('review');
}

/** Only supported selections cross into reservation creation. Identity, prices, uploads and consent never do. */
export function assistantReservationForm(value, catalog = {}) {
  const d = cleanAssistantBooking(value),
    rental = isRental(d.serviceType);
  const pkg = catalog.packages?.find(
    (p) =>
      (p.slug === d.packageSlug || (rental && !d.packageSlug)) &&
      p.visible !== false &&
      !p.archived &&
      (p.kind === 'rental') === rental
  );
  const form = {
    packageId: pkg?.id || '',
    serviceType: d.serviceType,
    eventName: d.eventName || '',
    occasion: d.occasion || '',
    occasionOther: d.occasionOther || '',
    date: d.date,
    startTime: d.startTime,
    venueName: d.venueName || '',
    venueAddress: d.venueAddress || '',
    city: d.city || '',
    accessNotes: d.accessNotes || '',
    fulfilment: d.fulfilment,
    foodNotes: rental ? '' : d.foodNotes || '',
    addonIds: rental ? [] : d.addonIds || [],
    addonQty: rental ? {} : d.addonQty || {}
  };
  if (rental) form.rentalItems = Object.entries(d.rentalQty || {}).map(([itemId, qty]) => ({ itemId, qty }));
  else Object.assign(form, { guests: d.guests, endTime: d.endTime, menu: d.menu || {}, styling: d.styling });
  if (!rental && d.packageProposalRef) {
    form.packageId = '';
    form.packageProposalRef = d.packageProposalRef;
  }
  return form;
}

/** Explicit repair offered by the controls; reading a stale draft never mutates it. */
export function assistantUnavailableSelections(value, catalog = {}) {
  const d = cleanAssistantBooking(value),
    patch = {},
    clearFields = [],
    removed = [];
  if (d.packageSlug && !catalog.packages?.some((p) => p.slug === d.packageSlug && p.visible !== false && !p.archived)) {
    clearFields.push('packageSlug');
    removed.push(d.packageSlug);
  }
  const addons = bookableAddons(catalog.addons || []);
  if (d.addonIds?.some((id) => !addons.some((a) => a.id === id))) {
    removed.push(...d.addonIds.filter((id) => !addons.some((a) => a.id === id)));
    patch.addonIds = d.addonIds.filter((id) => addons.some((a) => a.id === id));
    patch.addonQty = Object.fromEntries(Object.entries(d.addonQty || {}).filter(([id]) => patch.addonIds.includes(id)));
  }
  if (Object.keys(d.rentalQty || {}).some((id) => !catalog.rentals?.some((a) => a.id === id && !a.archived))) {
    removed.push(...Object.keys(d.rentalQty).filter((id) => !catalog.rentals?.some((a) => a.id === id && !a.archived)));
    patch.rentalQty = Object.fromEntries(
      Object.entries(d.rentalQty).filter(([id]) => catalog.rentals?.some((a) => a.id === id && !a.archived))
    );
  }
  return { patch, clearFields, removed };
}
