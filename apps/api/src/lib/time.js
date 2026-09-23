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
