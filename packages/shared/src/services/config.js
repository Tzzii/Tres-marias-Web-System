/**
 * Business rules and settings shared by both portals and the API server, which imports this same
 * file: a form and the server check the same rule with the same numbers, and the server's check is
 * the one that counts (docs §3 rule 3). Settings the admin changes in the app (the buffet price per
 * person, the minimum downpayment, the daily capacity) live in the database instead.
 */
// Company contact and payment details shown on the site, footer and payment page. There is no GCash
// number: customers pay GCash through the PayMongo QR only (Phase 8B); the bank account is for transfers.
export const BUSINESS = {
  name: 'Tres Marias Catering Services',
  shortName: 'Tres Marias',
  phone: '0951 562 1060',
  email: 'emmamariaobet@gmail.com',
  serviceArea: 'Malvar, Batangas and nearby towns',
  address: 'Magapi, Malvar, Batangas',
  hours: 'Open 24/7 · Monday to Sunday',
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
  /** Hours kept free between two events (tear-down of one, setup of the next); no event may run into them. */
  eventBufferHours: 2,
  /**
   * How long an event may run: the customer picks an end time from minEventHours to maxEventHours after
   * the start (the owner's rule, 2026-10-03). An event may end after midnight, e.g. 10:00 pm to 2:00 am.
   * defaultEventHours is only for bookings made before end times existed (no end time saved).
   */
  minEventHours: 2,
  maxEventHours: 6,
  defaultEventHours: 4,
  /** Guest counts the business accepts (the owner's rule, 2026-10-03); forms keep the number inside this range. */
  minGuests: 50,
  maxGuests: 700,
  /** The largest bank-receipt photo a customer can upload, in MB (the API's MAX_UPLOAD_MB defaults to it). */
  proofMaxMb: 20,
  /** Days after approval the downpayment (at least the booking's minimum, see DEFAULT_MIN_DOWNPAYMENT) falls due. */
  downpaymentDueDays: 7,
  /**
   * Online cancellation of a PAID booking (domain/cancellation.js): open for this share of the days from
   * the day the request was sent to the event day (0.25 = the first quarter), or `cancelWindowShareLong`
   * (the first half) when the event is `cancelWindowLongMonths` or more calendar months after the request.
   * An unpaid booking can be cancelled online any time before the event day.
   */
  cancelWindowShare: 0.25,
  cancelWindowShareLong: 0.5,
  cancelWindowLongMonths: 6,
  /** Failed password attempts before a lockout, and its length. */
  maxLoginAttempts: 5,
  loginLockMinutes: 5,
  /** One-time codes, all sent by email (the admin's sign-in and contact-change codes and, since Phase 12, the
   *  customer's sign-up, password-reset and password-change codes): length, attempts, lockout, resend cooldown, validity. */
  codeLength: 6,
  maxCodeAttempts: 5,
  codeLockMinutes: 2,
  codeResendSeconds: 60,
  codeValidMinutes: 5,
  /**
   * After this much inactivity a customer is signed out, and an admin's screen locks: the admin unlocks it
   * with the password alone (no emailed code) until the session itself runs out (JWT_ADMIN_TTL).
   */
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

/**
 * The drinks served with every buffet, as one phrase for every page and document ("Unlimited water and
 * juice for every guest"). Both are always included and unlimited; the customer does not choose.
 */
export const BUFFET_DRINKS = 'Unlimited water and juice';

/** Starting buffet price per person. The admin changes it on the Packages page, and it is stored with the data. */
export const DEFAULT_PRICE_PER_PLATE = 600;

/** The range the admin's buffet price per person has to stay inside. */
export const PRICE_PER_PLATE_RANGE = { min: 100, max: 5000 };

/**
 * Starting minimum downpayment: the least a customer pays first to secure a date. The customer chooses
 * how much to pay first, from this up to the full amount, and a booking whose total is below it is paid
 * in full. The admin changes it on the Payments tab; every booking keeps the amount in force when it was
 * made (its own `minDownpayment`), so a change never moves an existing booking.
 */
export const DEFAULT_MIN_DOWNPAYMENT = 3000;

/** The range the admin's minimum downpayment has to stay inside (whole pesos). */
export const MIN_DOWNPAYMENT_RANGE = { min: 1000, max: 100000 };

/**
 * The range an additional charge's own price has to stay inside (whole pesos; for a charge counted by
 * the piece, the price of one). The price is optional: a charge without one is priced in each quotation.
 */
export const ADDON_PRICE_RANGE = { min: 1, max: 1000000 };

// Reasons an admin can pick when blocking dates. "Holiday" is not one: catering is allowed on holidays.
// The admin may add a short note for customers too (BLOCK_NOTE_MAX characters), e.g. "Staff outing";
// customers see the reason and the note when they tap the date.
export const BLOCK_REASONS = ['Fully booked', 'Private event', 'Maintenance'];
export const BLOCK_NOTE_MAX = 120;

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
