/** Currency, date and text formatting used by both portals. */

// Adds thousands separators in Philippine format, no decimals
const pesoFormatter = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 });

/**
 * Number -> "₱12,500"; a negative one -> "−₱3,000" (e.g. a month with more refunds than payments).
 * Invalid values show as ₱0.
 */
export const peso = (amount) => {
  const value = Math.round(Number(amount) || 0);
  return `${value < 0 ? '−' : ''}₱${pesoFormatter.format(Math.abs(value))}`;
};

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

/**
 * Add calendar months to a "YYYY-MM-DD" date. The day number stays the same, but never runs past the end
 * of the target month: ('2026-09-26', 6) -> "2027-03-26", ('2026-08-31', 6) -> "2027-02-28" (the 29th in a leap year).
 */
export const addMonths = (iso, months) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const first = new Date(y, m - 1 + months, 1); // the 1st of the target month (Date rolls the year over)
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate(); // day 0 of the next month = the last day of this one
  return toISODate(new Date(first.getFullYear(), first.getMonth(), Math.min(d, lastDay)));
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

/**
 * A reservation's time for lists, pages and documents: "6:00 pm – 10:00 pm", or "10:00 pm – 2:00 am (next day)"
 * when it runs past midnight. Only the start for an equipment rental (its pick-up or delivery time) and for a
 * booking saved before end times existed (no endTime).
 */
export const formatEventTime = (reservation) => {
  if (!reservation || !reservation.startTime) return '—';
  const { startTime, endTime } = reservation;
  if (!endTime || reservation.serviceType === 'Equipment rental') return formatTime(startTime);
  // "HH:MM" text sorts like the clock, so an end at or before the start is on the next day
  return `${formatTime(startTime)} – ${formatTime(endTime)}${endTime <= startTime ? ' (next day)' : ''}`;
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

/**
 * "Maria Santos" -> "MS", "Wilma W. Cabiscuelas" -> "WC": first letters of the first and last words,
 * so a middle name or initial is skipped. A one-word name gives one letter.
 */
export const initials = (name = '') => {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length < 2) return parts.map((part) => part[0].toUpperCase()).join('');
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/** "Maria Santos" -> "Maria". */
export const firstName = (name = '') => name.split(' ')[0] || '';

// Short words that stay lowercase inside a heading (never as its first or last word)
const MINOR_WORDS = ['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet', 'as', 'at', 'by', 'in', 'of', 'off', 'on', 'per', 'to', 'via', 'vs'];

/**
 * Heading style for text kept in sentence case because it is stored data (e.g. an inventory category):
 * "Tents and stage" -> "Tents and Stage", "QR Ph (GCash, Maya or bank app)" -> "QR Ph (GCash, Maya or Bank App)".
 * Each word gets a capital first letter (both halves of a hyphenated word); short words like "and", "of"
 * and "to" stay lowercase unless they open or close the heading. Capitals already there are kept.
 */
export const titleCase = (text = '') => {
  const words = String(text).split(' ');
  return words
    .map((word, i) => {
      const bare = word.replace(/[^A-Za-z]/g, '').toLowerCase();
      if (i > 0 && i < words.length - 1 && MINOR_WORDS.includes(bare) && word === word.toLowerCase()) return word;
      return word.replace(/(^|-)([^A-Za-z]*)([a-z])/g, (_, start, lead, letter) => start + lead + letter.toUpperCase());
    })
    .join(' ');
};

/** (1, 'day') -> "1 day", (3, 'day') -> "3 days". */
export const pluralize = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

/**
 * The digits of a PH mobile number after +63 ("9171234567") however it is written: "0917 123 4567",
 * "09171234567", "+63 917 123 4567", "639171234567" or "+63 (0) 917 123 4567". Only the prefix is removed,
 * nothing is cut off, so a valid number gives 10 digits starting with 9. The number box (MobileField)
 * also runs it on every key, which is why a "63" in front is only dropped once there are more than 10 digits.
 */
export const nationalMobile = (value = '') => {
  let digits = String(value || '').replace(/\D/g, ''); // keep digits only
  if (digits.length > 10 && digits.startsWith('63')) digits = digits.slice(2); // the country code
  return digits.replace(/^0+/, ''); // the 0 of "0917…"
};

/** "+63 917 123 4567" from a PH mobile number written any way nationalMobile reads; anything else is left as typed. */
export const formatMobile = (value = '') => {
  const digits = nationalMobile(value);
  if (!/^9\d{9}$/.test(digits)) return value; // not a standard number: leave as typed
  return `+63 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
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

/** Hide the middle of a mobile number for on-screen confirmations: "09259012345" -> "+63 925 ••• 2345". */
export const maskMobile = (value = '') => {
  const digits = nationalMobile(value);
  if (digits.length < 8) return '•••';
  return `+63 ${digits.slice(0, 3)} ••• ${digits.slice(-4)}`;
};

// Month names, index 0 = January (matches Date.getMonth())
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
