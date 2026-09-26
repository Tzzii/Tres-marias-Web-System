import { addDays, parseISODate } from '../utils/format.js';
import { buildSnapshot, dateUnavailableReason, timeUnavailableReason } from '../domain/availability.js';
import { ApiError, latency, read, write } from './store.js';

/**
 * Availability: blocked dates, the daily event capacity, how many reservations
 * already hold each date, and the times those events take up. Drives the public
 * booking bar, the reservation date picker and the admin calendar.
 *
 * This is the browser-store version. The rules themselves (which reservations take a slot, why a
 * date or start time is unavailable) live in domain/availability.js, shared with the API version
 * (remote/calendar.js) and the server, and are re-exported here for reservationService.js.
 */

export { dateUnavailableReason, timeUnavailableReason, daySchedule, earliestBookableDate } from '../domain/availability.js';

/** The availability map, returned right away (no waiting) so date pickers can grey out days while rendering. */
export function availabilitySnapshot() {
  const data = read();
  return buildSnapshot({ capacity: data.calendar.dailyCapacity, blocked: data.calendar.blocked, reservations: data.reservations });
}

/**
 * Is this date, and start time if given, free to reserve? Used by the home page booking bar.
 * `timeConflict` is true when the date itself is open but the chosen time is not.
 */
export async function checkAvailability(iso, startTime) {
  await latency(300, 650);
  const snapshot = availabilitySnapshot();
  const dateReason = dateUnavailableReason(iso, snapshot);
  if (dateReason) return { date: iso, startTime, available: false, reason: dateReason, timeConflict: false };
  const timeReason = startTime ? timeUnavailableReason(iso, startTime, snapshot) : '';
  return { date: iso, startTime, available: !timeReason, reason: timeReason, timeConflict: Boolean(timeReason) };
}

/** Capacity, blocked dates and booked counts for calendar pages. */
export async function getCalendar() {
  await latency(150, 350);
  return availabilitySnapshot();
}

/** Admin: block every date from `from` to `to` (max 60 days). Already-blocked dates get the new reason. */
export async function blockDates({ from, to, reason }) {
  await latency(300, 550);
  if (!from || !to) throw new ApiError('INVALID', 'Choose the first and last date to block.');
  if (parseISODate(to) < parseISODate(from)) throw new ApiError('INVALID', 'The end date must be on or after the start date.');
  // Number of days in the range, counting both ends
  const span = Math.round((parseISODate(to) - parseISODate(from)) / 86400000) + 1;
  if (span > 60) throw new ApiError('INVALID', 'Block at most 60 days at a time.');

  return write((data) => {
    const added = [];
    for (let i = 0; i < span; i += 1) {
      const date = addDays(from, i);
      const existing = data.calendar.blocked.find((b) => b.date === date);
      if (existing) existing.reason = reason;
      else {
        data.calendar.blocked.push({ date, reason });
        added.push(date);
      }
    }
    data.calendar.blocked.sort((a, b) => a.date.localeCompare(b.date));
    return { added: added.length, total: span };
  });
}

/** Admin: open a blocked date again. */
export async function unblockDate(date) {
  await latency(200, 400);
  return write((data) => {
    data.calendar.blocked = data.calendar.blocked.filter((b) => b.date !== date);
    return { ok: true };
  });
}

/** Admin: set how many events can be booked on one day (1–10). */
export async function setDailyCapacity(value) {
  await latency(250, 450);
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 10) throw new ApiError('INVALID', 'Capacity must be between 1 and 10 events.');
  return write((data) => {
    data.calendar.dailyCapacity = n;
    return { capacity: n };
  });
}
