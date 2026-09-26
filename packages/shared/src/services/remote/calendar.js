import { emitChange } from '../events.js';
import { http } from '../http.js';

/**
 * The calendar service on the API (apps/api/src/modules/calendar, endpoint map in
 * docs/backend-development-phases.md §9.3): blocked dates, the daily event capacity and the times
 * booked events take. Same function names, arguments, return shapes and ApiError codes as the
 * browser version (calendarService.js), so no page changes when VITE_API_SERVICES includes
 * "calendar" (see facade/calendar.js). Two differences on purpose: the server's map has no
 * events[].ref (it never shows which booking holds a time), and until the first map arrives,
 * availabilitySnapshot() answers with one marked `loading: true`.
 *
 * availabilitySnapshot() must answer right away (date pickers read it while rendering), so it returns
 * the last map the server gave (the kept map):
 * - Before the first map: LOADING. The first read starts the load, shared by every date picker on the
 *   page, and the first map kept sends one change event so the pickers read it. A failed first load
 *   is tried again after 5 s, then 10, 20, 40 and every 60 s until a map arrives.
 * - After that: the kept map. A read more than a minute after the last load was sent also reloads it
 *   in the background (e.g. opening the date picker), with a change event only when the map changed.
 * - getCalendar() (the calendar pages' loader) keeps its answer too, with no change event (that event
 *   would run the same loader again, for ever), except when its answer is the first map and a date
 *   picker is still showing LOADING.
 * - Loads are numbered, and an answer older than the kept map is never kept.
 * - Admin writes are sent quietly; the map is reloaded, then one change event goes out, so every page
 *   that reloads already reads the new map. A failed reload never turns a saved change into an error.
 * primeAvailability() (reload, with a change event only when the map changed) is not in the facade.
 * The other API services' writes that can move a slot (remote/reservation.js, since Phase 6A) reload
 * with getCalendar() instead and then send their own single change event, so a write never sends two.
 */

// Until the first map: nothing can be picked yet (DateField shows "Loading available dates…").
// Not an empty map with capacity 0 alone, which would grey out every date as "Fully booked".
const LOADING = Object.freeze({ capacity: 0, blocked: Object.freeze([]), booked: Object.freeze({}), events: Object.freeze([]), loading: true });

const MAX_AGE_MS = 60 * 1000; // a read reloads the kept map in the background once the last load is this old
const FIRST_RETRY_MS = 5 * 1000; // wait before trying a failed first load again; doubles after each failure…
const MAX_RETRY_MS = 60 * 1000; // …up to this

let cache = null; // the kept map; null until the first one arrives
let sent = 0; // number given to each load, in the order sent
let kept = 0; // number of the load whose answer is the kept map
let lastSent = 0; // when the last load was sent (ms), for the one-minute background reload
let waiting = false; // a read got LOADING, so the first map must be announced with a change event
let background = null; // the background load on its way, shared by every read until it settles
let retryTimer = null; // the planned retry of a failed first load
let retryDelay = FIRST_RETRY_MS;

/**
 * GET the map and keep it, unless a newer answer is already kept. Returns this request's own answer
 * (so a page never gets null), whether it was the first map kept, and whether the kept map changed.
 */
async function fetchMap() {
  const request = ++sent;
  lastSent = Date.now();
  const snapshot = await http.get('/calendar');
  if (request < kept) return { snapshot, first: false, changed: false };
  const first = cache === null;
  const changed = first || JSON.stringify(snapshot) !== JSON.stringify(cache);
  kept = request;
  cache = snapshot;
  return { snapshot, first, changed };
}

/** Reload the map, and send a change event only when it changed. Returns the server's map. */
export async function primeAvailability() {
  const { snapshot, changed } = await fetchMap();
  if (changed) emitChange();
  return snapshot;
}

// Plan the next try of a failed first load (one at a time), each wait twice the last, up to a minute
function retryLater() {
  if (retryTimer) return;
  const delay = retryDelay;
  retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (cache === null) reloadInBackground();
  }, delay);
}

// The reload started by availabilitySnapshot(): one at a time. A failed first load is tried again
// later; a failed reload of a kept map just waits for a read after the next minute.
function reloadInBackground() {
  if (background) return;
  background = primeAvailability()
    .catch(() => {
      if (cache === null) retryLater();
    })
    .finally(() => {
      background = null;
    });
}

/**
 * The availability map, returned right away: the kept map, or LOADING before the first one. Also
 * starts the first load, or a background reload once the kept map is a minute old.
 */
export function availabilitySnapshot() {
  if (cache === null) {
    waiting = true;
    if (!retryTimer) reloadInBackground(); // after a failure, wait for the planned retry instead
    return LOADING;
  }
  if (Date.now() - lastSent >= MAX_AGE_MS) reloadInBackground();
  return cache;
}

/** Capacity, blocked dates and booked counts for calendar pages (their useResource loader). */
export async function getCalendar() {
  const { snapshot, first } = await fetchMap();
  if (first && waiting) emitChange(); // a date picker is still showing LOADING
  return snapshot;
}

/**
 * Is this date, and start time if given, free to reserve? Used by the home page booking bar.
 * Returns { date, startTime, available, reason, timeConflict } like the browser version.
 */
export function checkAvailability(iso, startTime) {
  const query = new URLSearchParams({ date: iso || '' });
  if (startTime) query.set('time', startTime);
  return http.get(`/calendar/check?${query}`);
}

// An admin write: sent quietly, then the map is reloaded and one change event goes out. Returns the write's answer.
async function save(send) {
  const result = await send();
  await fetchMap().catch(() => {}); // the change is saved; a failed reload only leaves the older map until the next load
  emitChange();
  return result;
}

/** Admin: block every date from `from` to `to` (max 60 days). Already-blocked dates get the new reason. Returns { added, total }. */
export const blockDates = ({ from, to, reason } = {}) => save(() => http.post('/admin/calendar/blocks', { from, to, reason }, { quiet: true }));

/** Admin: open a blocked date again. Returns { ok: true }. */
export const unblockDate = (date) => save(() => http.delete(`/admin/calendar/blocks/${encodeURIComponent(String(date || ''))}`, { quiet: true }));

/** Admin: set how many events can be booked on one day (1–10). Returns { capacity }. */
export const setDailyCapacity = (value) => save(() => http.put('/admin/calendar/capacity', { value }, { quiet: true }));

// Pure rules that take the map as an argument: the same code as the browser version and the server
export { dateUnavailableReason, timeUnavailableReason, daySchedule, earliestBookableDate } from '../../domain/availability.js';
