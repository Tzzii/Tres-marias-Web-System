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
  hours: 'Mon–Sat, 8:00 am – 6:00 pm',
  gcashName: 'TRES MARIAS CATERING',
  gcashNumber: '0951 562 1060',
  bankName: 'BPI',
  bankAccountName: 'Tres Marias Catering Services',
  bankAccountNumber: '4471 0839 26'
};

// Booking, payment and sign-in rules used by forms and services
export const RULES = {
  /** Days of notice needed before an event date can be reserved. */
  leadDays: 3,
  /** Start times customers can choose (24-hour "HH:MM"). */
  earliestStart: '06:00',
  latestStart: '23:30',
  /** Hours kept free before and after every event for setup, travel and clean-up. */
  eventBufferHours: 2,
  /** Event length used to check that start times on the same day don't overlap (packages don't set their own hours). */
  defaultEventHours: 4,
  /** Guest counts the venue accepts; forms clamp to this range. */
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
  idleMinutes: 1
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

export const SETUP_STYLES = ['Buffet', 'Plated', 'Family style', 'Packed meals', 'Cocktail'];

/**
 * The setup styles a package can be booked with, in SETUP_STYLES order.
 * Each package lists its own `setups`; a package without the list falls back to Buffet.
 */
export function setupsFor(pkg) {
  const allowed = pkg && Array.isArray(pkg.setups) && pkg.setups.length ? pkg.setups : ['Buffet'];
  return SETUP_STYLES.filter((s) => allowed.includes(s));
}

// Reasons an admin can pick when blocking dates. "Holiday" is not one: catering is allowed on holidays.
export const BLOCK_REASONS = ['Fully booked', 'Private event', 'Maintenance'];

// Equipment inventory categories, in display order
export const INVENTORY_CATEGORIES = ['Furniture', 'Linens', 'Serving ware', 'Tableware', 'Kitchen', 'Lights and sound', 'Decor'];

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
