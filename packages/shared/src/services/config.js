/**
 * Business rules shared by both portals. When the real backend arrives these
 * move server-side; the front-end keeps reading them from here.
 */
// Company contact and payment details shown on the site, footer and payment page
export const BUSINESS = {
  name: 'Tres Marias Catering Services',
  shortName: 'Tres Marias',
  phone: '0951 562 1060',
  email: 'emmamariaobet@gmail.com',
  serviceArea: 'Malvar, Batangas and nearby towns',
  address: '48 Kalayaan Avenue, Diliman, Quezon City',
  hours: 'Open 24/7 · Monday to Sunday',
  gcashName: 'TRES MARIAS CATERING',
  gcashNumber: '0951 562 1060',
  bankName: 'BPI',
  bankAccountName: 'Tres Marias Catering Services',
  bankAccountNumber: '4471 0839 26'
};

// Booking, payment and sign-in rules used by forms and services
export const RULES = {
  /** Days of notice needed before an event date can be reserved. */
  leadDays: 2,
  /** Start times customers can choose (24-hour "HH:MM"). The kitchen runs 24/7, so every
   *  half hour of the day is offered; 23:30 is simply the last one that starts before midnight. */
  earliestStart: '00:00',
  latestStart: '23:30',
  /** Hours kept free before and after every event for setup, travel and clean-up. */
  eventBufferHours: 2,
  /** Event length used to check that start times on the same day don't overlap (packages don't set their own hours). */
  defaultEventHours: 4,
  /** Guest counts the venue accepts; forms keep the number inside this range. */
  minGuests: 50,
  maxGuests: 2000,
  /** Share of the total due as downpayment (0.5 = 50%). */
  downpaymentRate: 0.5,
  /** Days after approval the downpayment falls due. */
  downpaymentDueDays: 7,
  /** Failed password attempts before a lockout, and its length. */
  maxLoginAttempts: 5,
  loginLockMinutes: 5,
  /** Admin verification code: length, attempts, lockout, resend cooldown, validity. */
  codeLength: 6,
  maxCodeAttempts: 5,
  codeLockMinutes: 2,
  codeResendSeconds: 45,
  codeValidMinutes: 5,
  /** Sessions end after this much inactivity, then the user is sent back to the logo screen. */
  idleMinutes: 15
};

// Dropdown options used across the forms
export const OCCASIONS = [
  'Wedding',
  'Debut',
  'Birthday',
  'Anniversary',
  'Christening',
  'Corporate',
  'Reunion',
  'Graduation',
  'Other'
];

/**
 * What the customer is booking, chosen before the package:
 *   Buffet         the package's equipment plus plated food we cook, charged per person
 *   Catering only  the package's equipment alone (tables, linens, warmers, tableware), no food
 * Our buffet is served plated, so there is no separate "plated" style. Every package can be
 * booked either way, which is why this is not restricted per package.
 */
export const SERVICE_TYPES = ['Buffet and Catering', 'Catering only'];

/** True when this service type includes food, and so a menu and a per-person charge. */
export const includesFood = (serviceType) => serviceType === 'Buffet and Catering';

/**
 * The third kind of booking, made through the Equipment Rental package: the customer picks
 * inventory items one by one and pays per piece. There is no guest count, no menu and no setup
 * crew, so it is kept out of SERVICE_TYPES (the admin can't switch a buffet into a rental).
 */
export const RENTAL_SERVICE = 'Equipment rental';

/** True when this service type is an equipment rental. */
export const isRental = (serviceType) => serviceType === RENTAL_SERVICE;

/**
 * Equipment rental rules:
 *   pickupAddress  where the customer collects the items when they pick up themselves (free)
 *   pickupPlace    the same place as a reservation's `venue`, stored on pick-up rentals
 *   deliveryFee    standard delivery charge; for a big order the admin sets another amount in the quotation
 *   maxQty         the most pieces of one item a single line can ask for
 */
export const RENTAL = {
  pickupAddress: 'Magapi, Malvar, Batangas',
  pickupPlace: { name: 'Tres Marias pick-up point', address: 'Magapi', city: 'Malvar, Batangas' },
  deliveryFee: 100,
  maxQty: 2000
};

/** How a rental gets to the customer: picked up at our place, or delivered by us. */
export const RENTAL_FULFILMENT = [
  { value: 'pickup', label: 'Pick up' },
  { value: 'delivery', label: 'Delivery' }
];

/**
 * A buffet menu has one line for each of these categories, in this order. The customer types the
 * line, so it can name more than one dish. The admin's dish list (see catalogService) is offered
 * underneath each box as a suggestion, never as the only choice.
 */
export const DISH_CATEGORIES = [
  { key: 'pork', label: 'Pork dish' },
  { key: 'chicken', label: 'Chicken dish' },
  { key: 'fish', label: 'Fish dish' },
  { key: 'vegetable', label: 'Vegetable dish' }
];

/**
 * How long one menu line can be. The customer writes each line themselves, so a line can name more
 * than one dish ("Lechon Kawali and Crispy Pata") - this only stops a very long paste by mistake.
 */
export const MENU_LINE_MAX = 200;

/** The drinks served with every buffet. Both are always included; the customer does not choose. */
export const BUFFET_DRINKS = ['Water', 'Juice'];

/** Starting buffet price per person. The admin changes it on the Packages page, and it is stored with the data. */
export const DEFAULT_PRICE_PER_PLATE = 600;

/** The range the admin's buffet price per person has to stay inside. */
export const PRICE_PER_PLATE_RANGE = { min: 100, max: 5000 };

// Reasons an admin can pick when blocking dates. "Holiday" is not one: catering is allowed on holidays.
export const BLOCK_REASONS = ['Fully booked', 'Private event', 'Maintenance'];

// Equipment inventory categories, in display order. Lights and sound are not owned: they come
// from an outsourcing partner (see OUTSOURCE_SERVICES), so they have no category here.
export const INVENTORY_CATEGORIES = ['Furniture', 'Linens', 'Serving ware', 'Tableware', 'Kitchen', 'Tents and stage', 'Decor'];

// What an outsourcing partner can supply, in display order. "Other" keeps the list open for
// one-off arrangements without adding a category nobody else will use.
export const OUTSOURCE_SERVICES = [
  'Chairs and tables',
  'Tents and canopies',
  'Lights and sound',
  'Linens and covers',
  'Tableware',
  'Cooking equipment',
  'Transport',
  'Extra staff',
  'Styling and flowers',
  'Other'
];

// The parts of the service a customer rates one by one in a feedback, in display order.
// `key` is what a feedback's `categories` object stores; the overall star rating is separate.
export const FEEDBACK_CATEGORIES = [
  { key: 'food', label: 'Food quality' },
  { key: 'service', label: 'Service' },
  { key: 'punctuality', label: 'Punctuality' },
  { key: 'setup', label: 'Setup and ambiance' }
];
