/** Currency, date and text formatting used by both portals. */

// Adds thousands separators in Philippine format, no decimals
const pesoFormatter = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 });

/** Number -> "₱12,500". Invalid values show as ₱0. */
export const peso = (amount) => `₱${pesoFormatter.format(Math.round(Number(amount) || 0))}`;

/** One item included in a package, as text: { qty: 100, name: 'Porcelain Plates' } -> "100 Porcelain Plates"; no qty -> just the name. */
export const formatPackageItem = (item) => (item.qty ? `${item.qty} ${item.name}` : item.name);

/**
 * A reservation's head count for lists: "150 guests" (or "150 pax" with `word`), and "Equipment rental"
 * for a rental, which has no guests. Same test as isRental in services/config.js.
 */
export const headcount = (reservation, word = 'guests') => (reservation.serviceType === 'Equipment rental' ? 'Equipment rental' : `${reservation.guests} ${word}`);

/** The rented items of a rental as one line: [{ qty: 100, name: 'Monobloc chair' }] -> "100 × Monobloc chair". */
export const formatRentalItems = (lines = []) => lines.map((line) => `${line.qty} × ${line.name}`).join(', ');

// 5 -> "05"
const pad = (n) => String(n).padStart(2, '0');

/** Local YYYY-MM-DD for a Date (never UTC, so dates do not shift by timezone). */
export const toISODate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Parse a YYYY-MM-DD string as a local date at midnight. */
export const parseISODate = (iso) => {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Today's date as "YYYY-MM-DD". */
export const todayISO = () => toISODate(new Date());

/** Add (or subtract, if negative) days to a "YYYY-MM-DD" date. */
export const addDays = (iso, days) => {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
};

/** Whole days from today to the given date (negative when in the past). */
export const daysFromToday = (iso) => {
  const today = parseISODate(todayISO());
  const target = parseISODate(iso);
  return Math.round((target - today) / 86400000);
};

/** "Saturday, 14 March 2026" */
export const formatDateLong = (iso) =>
  iso
    ? parseISODate(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

/** Day of the week: "Saturday", or "Sat" with style 'short' */
export const formatWeekday = (iso, style = 'long') => (iso ? parseISODate(iso).toLocaleDateString('en-GB', { weekday: style }) : '—');

/** "14 Mar 2026" */
export const formatDate = (iso) =>
  iso ? parseISODate(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/** "Sat, 14 Mar 2026" */
export const formatDateShort = (iso) =>
  iso
    ? parseISODate(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

/** "18:00" -> "6:00 pm" */
export const formatTime = (hhmm) => {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${pad(m)} ${suffix}`;
};

/** Timestamp (ms or ISO) -> "12 Dec 2025, 9:41 am" */
export const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  return `${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${time}`;
};

/** Timestamp -> "9:41 am" */
export const formatClock = (value) =>
  new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();

/** Relative label for message lists and activity feeds. */
export const formatRelative = (value) => {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(toISODate(new Date(value)));
};

/** "Maria Santos" -> "MS" (first letters of the first two words). */
export const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

/** "Maria Santos" -> "Maria". */
export const firstName = (name = '') => name.split(' ')[0] || '';

/** (1, 'day') -> "1 day", (3, 'day') -> "3 days". */
export const pluralize = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

/** "0917 123 4567" from any 11-digit PH mobile input. */
export const formatMobile = (value = '') => {
  const digits = String(value).replace(/\D/g, ''); // keep digits only
  if (digits.length !== 11) return value; // not a standard number: leave as typed
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
};

/** Hide the middle of an email for on-screen confirmations: "emmamariaobet@gmail.com" -> "em•••et@gmail.com". */
export const maskEmail = (value = '') => {
  const [local = '', domain = ''] = String(value).split('@');
  if (!domain) return '•••';
  // Short names keep only the first letter, so the mask never gives the whole name away
  const head = local.slice(0, local.length > 5 ? 2 : 1);
  const tail = local.length > 5 ? local.slice(-2) : '';
  return `${head}•••${tail}@${domain}`;
};

/** Hide the middle of a mobile number for on-screen confirmations: "09259012345" -> "0925 ••• 2345". */
export const maskMobile = (value = '') => {
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 8) return '•••';
  return `${digits.slice(0, 4)} ••• ${digits.slice(-4)}`;
};

// Month names, index 0 = January (matches Date.getMonth())
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
