import { config } from '../config.js';

// Year, month and day as the business time zone sees them (en-CA orders them year-month-day)
const dateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: config.timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

/** The current instant in milliseconds: the same unit as Date.now() on the frontend and the BIGINT time columns. */
export const now = () => Date.now();

/**
 * Today's date as "YYYY-MM-DD" in config.timeZone (Asia/Manila), for "is this date in the past?" and
 * lead-time checks. Formats with the time zone written out, so it stays right even if the process runs on UTC.
 * Built from formatToParts so a locale-data update that changes en-CA's separators cannot change the result.
 */
export function todayISO() {
  const parts = Object.fromEntries(dateParts.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * True for a calendar date written "YYYY-MM-DD" that names a real day, in the years a MySQL DATE
 * column holds (1000–9999). Read as UTC midnight, so no time zone can move it; the round trip catches
 * days that do not exist, which JavaScript would roll over (2026-02-30 would become 2026-03-02).
 */
export function isISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1000) return false;
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value;
}

/**
 * True for a time of day written "HH:MM" on a 24-hour clock, e.g. "18:00" (the CHAR(5) start_time
 * column). Whether it is a start time the business takes (the hours, the half-hour steps, other events)
 * is timeUnavailableReason's answer (@tm/shared/src/domain/availability.js), not this check's.
 */
export const isClockTime = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
