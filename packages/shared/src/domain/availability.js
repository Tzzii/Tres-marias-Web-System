import { HOLDS_DATE } from '../utils/status.js';
import { addDays, daysFromToday, formatTime, toISODate } from '../utils/format.js';
import { RULES, isRental } from '../services/config.js';

/**
 * Availability rules that need no stored data: which reservations take a date's event slots, the
 * availability map built from them, and why a date or a start time cannot be reserved.
 *
 * Pure (no database, no localStorage, no React), so the portals (services/remote/calendar.js and the
 * date pickers) and the API server (apps/api/src/modules/calendar) give the same answers
 * (docs/backend-development-phases.md §7.8).
 *
 * The availability map ("snapshot") that every check below takes:
 *   { capacity: 2,                                         events allowed per date
 *     blocked: [{ date: '2026-10-10', reason: 'Fully booked' }],   dates the admin closed
 *     booked:  { '2026-10-03': 2 },                        reservations holding each date
 *     events:  [{ ref, date: '2026-10-03', startTime: '18:00', hours: 4 }] }   the times they take
 * The API's public map has no `ref` in events (it does not show which booking holds a time); the
 * checks here never read it.
 *
 * Event times: the customer picks a start and an end time. An event runs RULES.minEventHours to
 * RULES.maxEventHours (2 to 6 hours) and may end after midnight: 22:00 to 02:00 is a 4-hour event that
 * ends the next day. A booking saved before end times existed has none and counts as
 * RULES.defaultEventHours long.
 */

// "18:30" -> 1110 (minutes after midnight)
const toMinutes = (time) => {
  const [h, m] = String(time).split(':').map(Number);
  return h * 60 + (m || 0);
};

// 1110 -> "18:30" (wraps past midnight, so an event ending at 26:00 shows as "02:00")
const toHHMM = (minutes) => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * Minutes from a start time to an end time, counting past midnight when the end is earlier on the clock:
 * ('18:00', '22:00') -> 240, ('22:00', '02:00') -> 240, ('18:00', '18:00') -> 0.
 */
export const eventMinutes = (startTime, endTime) => (((toMinutes(endTime) - toMinutes(startTime)) % 1440) + 1440) % 1440;

/**
 * How many hours an event runs: from its end time, or RULES.defaultEventHours for a booking saved before
 * end times existed (endTime empty or null). ('18:00', '22:30') -> 4.5.
 */
export const eventHours = (startTime, endTime) => (endTime ? eventMinutes(startTime, endTime) / 60 : RULES.defaultEventHours);

/** True when an event from startTime to endTime ends on the next day (it runs past midnight). */
export const endsNextDay = (startTime, endTime) => Boolean(startTime && endTime) && toMinutes(endTime) <= toMinutes(startTime);

/**
 * The end times a start time allows, every 30 minutes from RULES.minEventHours to RULES.maxEventHours
 * after it, for the end-time dropdown: [{ value: '20:00', hours: 2, nextDay: false }, …]. Empty without
 * a start time. e.g. '22:00' -> 00:00 (2 h, next day) … 04:00 (6 h, next day).
 */
export function endTimeOptions(startTime) {
  if (!startTime) return [];
  const start = toMinutes(startTime);
  const options = [];
  for (let length = RULES.minEventHours * 60; length <= RULES.maxEventHours * 60; length += 30) {
    options.push({ value: toHHMM(start + length), hours: length / 60, nextDay: start + length >= 1440 });
  }
  return options;
}

/**
 * Why an end time cannot go with this start time, or '' when it can: it must be on the hour or half hour,
 * and the event must run RULES.minEventHours to RULES.maxEventHours. Whether another event is in the way
 * is timeUnavailableReason's job.
 */
export function endTimeProblem(startTime, endTime) {
  if (!endTime) return 'Choose an end time';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) return 'Enter the end time as HH:MM, e.g. 22:00';
  if (toMinutes(endTime) % 30 !== 0) return 'End times are on the hour or half hour, e.g. 10:00 or 10:30';
  if (!startTime) return '';
  const length = eventMinutes(startTime, endTime);
  if (length < RULES.minEventHours * 60 || length > RULES.maxEventHours * 60) {
    return `Events run ${RULES.minEventHours} to ${RULES.maxEventHours} hours: pick an end time from ${formatTime(toHHMM(toMinutes(startTime) + RULES.minEventHours * 60))} to ${formatTime(toHHMM(toMinutes(startTime) + RULES.maxEventHours * 60))}`;
  }
  return '';
}

/**
 * The end time that keeps an event's length when its start moves, e.g. ('18:00', '22:00', '19:00') -> '23:00',
 * so changing the start never leaves an end time that no longer fits. '' when there was no end time.
 */
export const shiftEndTime = (oldStart, oldEnd, newStart) => (oldStart && oldEnd && newStart ? toHHMM(toMinutes(newStart) + eventMinutes(oldStart, oldEnd)) : oldEnd || '');

/**
 * True for a reservation that takes one of the day's event slots: approved to confirmed, and not an
 * equipment rental. A rental only hands over equipment (no crew at an event), so it never fills a
 * date or blocks a start time. A pending request takes no slot either.
 */
const holdsSlot = (r) => HOLDS_DATE.includes(r.status) && !isRental(r.serviceType);

/**
 * The availability map from the calendar settings and the reservations:
 *   capacity      the daily event capacity
 *   blocked       [{ date, reason }], copied so the caller's list is never shared
 *   reservations  records with { ref, date, startTime, endTime, status, serviceType }; any others are ignored
 * `booked` counts the reservations holding each date, e.g. { '2026-10-03': 2 }, and `events` lists the
 * time each one with a start time takes: [{ ref, date, startTime, hours }], `hours` from its end time
 * (eventHours: RULES.defaultEventHours for one saved without an end time). `ref` lets an event being
 * edited leave itself out of the time check. `blocked` keeps each block's reason and the admin's note
 * for customers ('' when none), so a date picker can say why the date is closed.
 */
export function buildSnapshot({ capacity, blocked, reservations }) {
  const holding = reservations.filter(holdsSlot);
  return {
    capacity,
    blocked: blocked.map(({ date, reason, note }) => ({ date, reason, note: note || '' })),
    booked: holding.reduce((counts, r) => {
      counts[r.date] = (counts[r.date] || 0) + 1;
      return counts;
    }, {}),
    events: holding
      .filter((r) => r.startTime)
      .map((r) => ({ ref: r.ref, date: r.date, startTime: r.startTime, hours: eventHours(r.startTime, r.endTime) }))
  };
}

/**
 * Why an event starting at `time` on a date and running `hours` cannot be reserved, or '' when it can.
 * Check the date first with dateUnavailableReason. Start times are on the hour or half hour (the
 * booking form only offers those; a typed time like 10:15 is refused).
 * Every existing event blocks a window: RULES.eventBufferHours of setup before it, its own hours, then
 * RULES.eventBufferHours of tear-down after it. The new event may not START inside that window, and may
 * not RUN into it either (its end must come before the next window begins). e.g. an 11:00 am – 3:00 pm
 * event blocks 9:00 am – 5:00 pm: a 5:00 pm start is open, and a 6:00 am start can run until 9:00 am.
 * Without `hours` the shortest event (RULES.minEventHours) is checked, which is what "is this start time
 * open?" means before an end time is chosen.
 * Events on the day before and the day after are checked too, so a late event that runs past
 * midnight still blocks the early hours of the next day (and the other way round).
 * The answers: 'Another event is already booked around that time' (the start is taken), 'There isn't
 * enough time before the next booked event' (even the shortest event would run into it), or 'Another
 * event is booked after yours: end by 3:00 pm at the latest' (only the chosen end time is too late).
 */
export function timeUnavailableReason(iso, time, snapshot, hours = RULES.minEventHours) {
  if (!time) return 'Choose a start time';
  const start = toMinutes(time);
  if (start < toMinutes(RULES.earliestStart) || start > toMinutes(RULES.latestStart)) {
    return `Events can start between ${formatTime(RULES.earliestStart)} and ${formatTime(RULES.latestStart)}`;
  }
  if (start % 30 !== 0) return 'Start times are on the hour or half hour, e.g. 6:00 or 6:30';
  const buffer = RULES.eventBufferHours * 60;
  // Minutes to add to an event's times so they count from midnight of `iso` (-1440 for the day before)
  const dayShift = iso ? { [addDays(iso, -1)]: -1440, [iso]: 0, [addDays(iso, 1)]: 1440 } : {};
  // Each nearby event's blocked window, in minutes from midnight of `iso`
  const windows = snapshot.events
    .filter((e) => e.date in dayShift)
    .map((e) => {
      const from = toMinutes(e.startTime) + dayShift[e.date];
      return { busyFrom: from - buffer, busyTo: from + e.hours * 60 + buffer };
    });
  if (windows.some((w) => start >= w.busyFrom && start < w.busyTo)) return 'Another event is already booked around that time';
  // The new event has to end by the time the next window begins
  const nextBusy = Math.min(...windows.filter((w) => w.busyFrom > start).map((w) => w.busyFrom));
  if (nextBusy < start + RULES.minEventHours * 60) return "There isn't enough time before the next booked event";
  if (nextBusy < start + hours * 60) return `Another event is booked after yours: end by ${formatTime(toHHMM(nextBusy))} at the latest`;
  return '';
}

/**
 * One date's schedule for the customer date picker. Times only, never who booked:
 *   booked:     [{ from: '18:00', to: '22:00' }]  events already holding the date, earliest first
 *   openStarts: [{ from: '00:00', to: '07:30' }, { from: '17:00', to: '23:59' }]  free stretches of the day
 *               a new event can start in: a start is open when at least the shortest event
 *               (RULES.minEventHours) fits before the next event's setup. `to` is 30 minutes after the last
 *               open start (with a 9:00 setup, 7:00 is the last start and `to` is 07:30), or '23:59' when the
 *               stretch runs to the end of the day. Empty when nothing is left that day.
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
 * Why a date cannot be reserved, or '' when it can: 'Past date', "Needs 2 days' notice", the admin's block
 * reason (e.g. 'Private event'; blockNote() gives the note that may come with it) or 'Fully booked'.
 * `snapshot` is the availability map (availabilitySnapshot() in the portals). `rental: true` checks a
 * date for an equipment rental, which only needs the notice and an open (not blocked) day: it takes
 * no event slot.
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

/** The admin's note for customers on a blocked date (e.g. 'Staff outing'), or '' when it has none or is not blocked. */
export const blockNote = (iso, snapshot) => {
  const block = snapshot.blocked.find((b) => b.date === iso);
  return (block && block.note) || '';
};

/** The first date that can be reserved, for date-picker defaults. */
export const earliestBookableDate = () => addDays(toISODate(new Date()), RULES.leadDays);
