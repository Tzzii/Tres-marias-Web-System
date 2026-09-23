import { addDays, daysFromToday, formatTime, parseISODate, toISODate } from '../utils/format.js';
import { HOLDS_DATE } from '../utils/status.js';
import { RULES, isRental } from './config.js';
import { ApiError, clone, latency, read, write } from './store.js';

/**
 * Availability: blocked dates, the daily event capacity, how many reservations
 * already hold each date, and the times those events take up. Drives the public
 * booking bar, the reservation date picker and the admin calendar.
 */

/**
 * True for a reservation that takes one of the day's event slots: approved to confirmed, and not an
 * equipment rental. A rental only hands over equipment (no crew at an event), so it never fills a
 * date or blocks a start time.
 */
const holdsSlot = (r) => HOLDS_DATE.includes(r.status) && !isRental(r.serviceType);

/** Count reservations holding each date, e.g. { '2026-10-03': 2 }. Pending/declined/cancelled and rentals don't count. */
function bookedCounts(data) {
  return data.reservations
    .filter(holdsSlot)
    .reduce((counts, r) => {
      counts[r.date] = (counts[r.date] || 0) + 1;
      return counts;
    }, {});
}

/**
 * Time taken by each reservation that holds its date, for the start-time check:
 * [{ ref: 'RES-…', date: '2026-10-03', startTime: '18:00', hours: 4 }]. Packages don't set their own hours,
 * so every event uses RULES.defaultEventHours. `ref` lets an event being edited leave itself out of the check.
 */
function scheduledEvents(data) {
  return data.reservations
    .filter((r) => holdsSlot(r) && r.startTime)
    .map((r) => ({ ref: r.ref, date: r.date, startTime: r.startTime, hours: RULES.defaultEventHours }));
}

/** The availability map, returned right away (no waiting) so date pickers can grey out days while rendering. */
export function availabilitySnapshot() {
  const data = read();
  return {
    capacity: data.calendar.dailyCapacity,
    blocked: clone(data.calendar.blocked),
    booked: bookedCounts(data),
    events: scheduledEvents(data)
  };
}

// "18:30" -> 1110 (minutes after midnight)
const toMinutes = (time) => {
  const [h, m] = String(time).split(':').map(Number);
  return h * 60 + (m || 0);
};

/**
 * Why a start time on a date cannot be reserved, or '' when it can. Check the date first
 * with dateUnavailableReason. Start times are on the hour or half hour (the booking form
 * only offers those; a typed time like 10:15 is refused). Every existing event blocks a window:
 * RULES.eventBufferHours of setup before it, its service hours, then RULES.eventBufferHours of
 * tear-down after it. A start time inside that window is refused; any time outside it is open.
 * e.g. an 11:00 am – 3:00 pm event blocks 9:00 am – 5:00 pm, so 8:30 am and 5:00 pm are both open.
 * Events on the day before and the day after are checked too, so a late event that runs past
 * midnight still blocks the early hours of the next day (and the other way round).
 */
export function timeUnavailableReason(iso, time, snapshot) {
  if (!time) return 'Choose a start time';
  const start = toMinutes(time);
  if (start < toMinutes(RULES.earliestStart) || start > toMinutes(RULES.latestStart)) {
    return `Events can start between ${formatTime(RULES.earliestStart)} and ${formatTime(RULES.latestStart)}`;
  }
  if (start % 30 !== 0) return 'Start times are on the hour or half hour, e.g. 6:00 or 6:30';
  const buffer = RULES.eventBufferHours * 60;
  // Minutes to add to an event's times so they count from midnight of `iso` (-1440 for the day before)
  const dayShift = iso ? { [addDays(iso, -1)]: -1440, [iso]: 0, [addDays(iso, 1)]: 1440 } : {};
  const clash = snapshot.events.some((e) => {
    if (!(e.date in dayShift)) return false;
    const from = toMinutes(e.startTime) + dayShift[e.date];
    const busyFrom = from - buffer;
    const busyTo = from + e.hours * 60 + buffer;
    return start >= busyFrom && start < busyTo; // the start falls inside the blocked window
  });
  return clash ? 'Another event is already booked around that time' : '';
}

// 1110 -> "18:30" (wraps past midnight, so an event ending at 26:00 shows as "02:00")
const toHHMM = (minutes) => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * One date's schedule for the customer date picker. Times only, never who booked:
 *   booked:     [{ from: '18:00', to: '22:00' }]  events already holding the date, earliest first
 *   openStarts: [{ from: '00:00', to: '09:00' }, { from: '17:00', to: '23:59' }]  free stretches of the day
 *               a new event can start in. `to` is where the next event's setup begins (so 09:00 itself is
 *               taken; 8:30 is the last start), or '23:59' when the stretch runs to the end of the day.
 *               Empty when nothing is left that day.
 */
export function daySchedule(iso, snapshot) {
  const booked = snapshot.events
    .filter((e) => e.date === iso)
    .map((e) => ({ from: e.startTime, to: toHHMM(toMinutes(e.startTime) + e.hours * 60) }))
    .sort((a, b) => a.from.localeCompare(b.from));

  // Walk every start time (30-minute steps) from earliest to latest; join neighbouring open times into one
  // stretch that ends 30 minutes after its last open start, i.e. where the blocked window begins
  const openStarts = [];
  let lastOpen = null; // minutes of the previous open start, to tell if this one continues the stretch
  for (let t = toMinutes(RULES.earliestStart); t <= toMinutes(RULES.latestStart); t += 30) {
    if (timeUnavailableReason(iso, toHHMM(t), snapshot)) continue;
    if (lastOpen === t - 30) openStarts[openStarts.length - 1].to = t + 30;
    else openStarts.push({ from: t, to: t + 30 });
    lastOpen = t;
  }
  // Minutes -> "HH:MM"; a stretch that reaches midnight shows as 11:59 pm, not 12:00 am
  const ranges = openStarts.map(({ from, to }) => ({ from: toHHMM(from), to: to >= 1440 ? '23:59' : toHHMM(to) }));
  return { booked, openStarts: ranges };
}

/**
 * Why a date cannot be reserved, or '' when it can.
 * `snapshot` comes from availabilitySnapshot(). `rental: true` checks a date for an equipment
 * rental, which only needs the notice and an open (not blocked) day: it takes no event slot.
 */
export function dateUnavailableReason(iso, snapshot, { enforceLeadTime = true, rental = false } = {}) {
  if (!iso) return '';
  // Checks in order: past or too soon -> blocked by the admin -> capacity reached -> no start time left between the booked events
  // (events on the day before or after count too, since a late event can run past midnight)
  if (enforceLeadTime && daysFromToday(iso) < RULES.leadDays) {
    return daysFromToday(iso) < 0 ? 'Past date' : `Needs ${RULES.leadDays} days' notice`;
  }
  const blocked = snapshot.blocked.find((b) => b.date === iso);
  if (blocked) return blocked.reason;
  if (rental) return '';
  if ((snapshot.booked[iso] || 0) >= snapshot.capacity) return 'Fully booked';
  const [dayBefore, dayAfter] = [addDays(iso, -1), addDays(iso, 1)];
  const eventsNearby = snapshot.events.some((e) => e.date >= dayBefore && e.date <= dayAfter);
  if (eventsNearby && !daySchedule(iso, snapshot).openStarts.length) return 'Fully booked';
  return '';
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

/** The first date that can be reserved, for date-picker defaults. */
export const earliestBookableDate = () => addDays(toISODate(new Date()), RULES.leadDays);
