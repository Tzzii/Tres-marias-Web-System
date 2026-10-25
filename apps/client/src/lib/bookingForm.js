import { cleanStyling, initialEndTime } from '@tm/shared';

export const SECTIONS = [
  ['details', 'Event Details', 'Event'],
  ['service', 'What You Are Booking', 'Service'],
  ['package', 'Package', 'Package'],
  ['styling', 'Theme and Colors', 'Styling'],
  ['items', 'Items to Rent', 'Items'],
  ['food', 'Your Menu', 'Menu'],
  ['venue', 'Venue and Logistics', 'Venue'],
  ['addons', 'Additional Charges', 'Add-ons'],
  ['review', 'Review and Submit', 'Review']
];

const FIELD_SECTION = {
  eventName: 'details',
  occasion: 'details',
  occasionOther: 'details',
  date: 'details',
  startTime: 'details',
  endTime: 'details',
  agreeTerms: 'review',
  guests: 'details',
  serviceType: 'service',
  packageId: 'package',
  rentalItems: 'items',
  foodNotes: 'food',
  fulfilment: 'venue',
  venueName: 'venue',
  venueAddress: 'venue',
  city: 'venue'
};

export const sectionForField = (field) => {
  if (field.startsWith('menu.dessert.')) return 'addons';
  if (field.startsWith('menu.')) return 'food';
  if (field.startsWith('styling.')) return 'styling';
  if (field.startsWith('addonQty.')) return 'addons';
  if (field.startsWith('rental.')) return 'items';
  return FIELD_SECTION[field] || 'details';
};

export const hasSizes = (addon) => Boolean(addon && addon.sizes && addon.sizes.length);

export const lowestPackagePrice = (addon) => {
  const prices = addon.sizes.map((s) => s.price).filter((price) => price > 0);
  return prices.length ? Math.min(...prices) : null;
};

const EMPTY_STYLING = { theme: '', themeOther: '', colors: [], notes: '' };

export const EMPTY = {
  eventName: '',
  occasion: '',
  occasionOther: '',
  date: '',
  startTime: '18:00',
  endTime: initialEndTime('18:00'),
  guests: '',
  serviceType: '',
  packageId: '',
  menu: {},
  foodNotes: '',
  styling: EMPTY_STYLING,
  referencePhotos: [],
  venueName: '',
  venueAddress: '',
  city: '',
  accessNotes: '',
  addonIds: [],
  addonQty: {},
  fulfilment: 'pickup',
  rentalQty: {}
};

export const draftStyling = (value) => ({ ...EMPTY_STYLING, ...(cleanStyling(value) || {}) });

export const wordList = (words) =>
  words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0];

export const DATES_LOADING = 'The available dates are still loading. Please try again in a moment.';
