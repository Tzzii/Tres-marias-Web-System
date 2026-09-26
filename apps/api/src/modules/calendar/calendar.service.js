import { buildSnapshot, dateUnavailableReason, timeUnavailableReason } from '@tm/shared/src/domain/availability.js';
import { BLOCK_REASONS } from '@tm/shared/src/services/config.js';
import { addDays } from '@tm/shared/src/utils/format.js';
import { tx } from '../../db.js';
import { ApiError } from '../../lib/ApiError.js';
import { isClockTime, isISODate, now } from '../../lib/time.js';
import * as repo from './calendar.repo.js';

/**
 * The calendar rules on the server (docs/backend-development-phases.md Phase 5, §9.3): blocked
 * dates, the daily event capacity and availability. Same return shapes, error codes and messages as
 * the browser version (calendarService.js). The availability rules themselves (which reservations
 * take a slot, why a date or a start time is unavailable) come from
 * @tm/shared/src/domain/availability.js, the same code the portals run.
 *
 * Differences from the browser version, on purpose:
 * - The public map has no events[].ref: anyone can read it, and it must not show which booking holds a time.
 * - Every date must be a real "YYYY-MM-DD" day, a start time must be "HH:MM", and a block's reason
 *   must be one of BLOCK_REASONS (the admin page only offers those).
 * Every write (block, unblock, capacity) also moves calendar_settings.updated_at, in the same
 * transaction (the change stamp of Phase 7). The calendar keeps no audit trail, in the browser
 * version or in the schema, so none is written here.
 */

// Most dates one block request may cover (the browser version's limit)
const MAX_BLOCK_DAYS = 60;

const invalid = (message, field) => new ApiError('INVALID', message, { field });

// A number sent by the page (a number, or digits as text: the capacity box sends text); anything else is NaN
const toNumber = (value) => (typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN);

/**
 * The availability map from the database, built by the shared buildSnapshot(). Its events keep their
 * refs, for checks made on the server (the reservations module leaves the booking being edited out of
 * its own check); getCalendar() removes them before the map leaves the server. Reads through the pool,
 * or through `db`, a transaction's connection, so a reservation write checks the map it locked.
 */
export async function availabilityMap(db) {
  const [capacity, blocked, reservations] = await Promise.all([repo.getDailyCapacity(db), repo.listBlocks(db), repo.listSlotHolders(db)]);
  return buildSnapshot({ capacity, blocked, reservations });
}

/** The public availability map: { capacity, blocked, booked, events: [{ date, startTime, hours }] }. */
export async function getCalendar() {
  const map = await availabilityMap();
  return { ...map, events: map.events.map(({ date, startTime, hours }) => ({ date, startTime, hours })) };
}

/**
 * Is this date, and start time if given, free to reserve? Returns { date, startTime, available,
 * reason, timeConflict }, the browser version's answer (startTime is '' when none was given).
 * `timeConflict` is true when the date itself is open but the chosen time is not.
 */
export async function checkAvailability(date, time) {
  if (!isISODate(date)) throw invalid('Choose your event date.', 'date');
  const startTime = time ?? '';
  if (startTime !== '' && !isClockTime(startTime)) throw invalid('Enter the start time as HH:MM, e.g. 18:00.', 'time');
  const map = await availabilityMap();
  const dateReason = dateUnavailableReason(date, map);
  if (dateReason) return { date, startTime, available: false, reason: dateReason, timeConflict: false };
  const timeReason = startTime ? timeUnavailableReason(date, startTime, map) : '';
  return { date, startTime, available: !timeReason, reason: timeReason, timeConflict: Boolean(timeReason) };
}

/**
 * Admin: block every date from `from` to `to` (both included, at most 60), with a reason from
 * BLOCK_REASONS. A date already blocked gets the new reason. Returns { added, total }: the dates newly
 * blocked, and the dates in the range. Dates that already have bookings may be blocked too (the
 * admin page warns about them); their bookings are not changed.
 */
export async function blockDates({ from, to, reason }) {
  if (!isISODate(from)) throw invalid('Choose the first and last date to block.', 'from');
  if (!isISODate(to)) throw invalid('Choose the first and last date to block.', 'to');
  if (to < from) throw invalid('The end date must be on or after the start date.', 'to');
  // Number of days in the range, counting both ends (both dates are read as UTC midnight, so always whole days)
  const total = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (total > MAX_BLOCK_DAYS) throw invalid(`Block at most ${MAX_BLOCK_DAYS} days at a time.`, 'to');
  if (!BLOCK_REASONS.includes(reason)) throw invalid('Choose a reason from the list.', 'reason');

  const dates = Array.from({ length: total }, (_, i) => addDays(from, i));
  return tx(async (conn) => {
    await repo.touchSettings(conn, now()); // first: calendar writes run one at a time
    const already = await repo.countBlocked(conn, from, to);
    await repo.upsertBlocks(conn, dates, reason);
    return { added: total - already, total };
  });
}

/** Admin: open a blocked date again. { ok: true } even when it was not blocked, like the browser version. */
export async function unblockDate(date) {
  if (!isISODate(date)) throw invalid('Choose the date to unblock.', 'date');
  await tx(async (conn) => {
    await repo.touchSettings(conn, now());
    await repo.deleteBlock(conn, date);
  });
  return { ok: true };
}

/**
 * Admin: set how many events can be booked on one day, a whole number from 1 to 10 (the admin page
 * sends it as text, e.g. "3"). A capacity below what a date already holds is allowed: that date
 * simply shows as fully booked, and no booking changes. Returns { capacity }.
 */
export async function setDailyCapacity(value) {
  const capacity = toNumber(value);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10) throw invalid('Capacity must be between 1 and 10 events.', 'value');
  await repo.setDailyCapacity(capacity, now());
  return { capacity };
}
