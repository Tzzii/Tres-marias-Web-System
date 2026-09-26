import { usesApi } from '../backend.js';
import { ApiError } from '../errors.js';
import { emitChange } from '../events.js';
import { http } from '../http.js';
import { getCalendar } from './calendar.js';

/**
 * The reservation service on the API (apps/api/src/modules/reservations, endpoint map in
 * docs/backend-development-phases.md §9.4). Same function names, arguments, return shapes and
 * ApiError codes as the browser version (reservationService.js), so no page changes when
 * VITE_API_SERVICES includes "reservations" (see facade/reservation.js).
 *
 * - The customer id the pages pass is only used to pick the address (/reservations for a customer,
 *   /admin/reservations for the admin); the server always takes the customer from the token.
 * - One difference on purpose: answers to a customer never carry the admin's private `notes`.
 * - A cancellation can free the event's slot, so it is saved quietly, the availability map is
 *   reloaded (when the calendar is on the API too), and then one change event goes out, so every
 *   page that reloads already reads the new map. Creating a booking takes no slot (a pending request
 *   holds none), so it only sends the usual change event.
 * - Phase 6A: the nine admin actions and edits (quotation, approve, decline, confirm, complete,
 *   logistics, menu, notes, rented items) reach the server in Phase 6B. Until then they answer with
 *   an INVALID_STATE error, so the whole service can already be switched on to try the customer side.
 */

// A reservation ref in a URL path (never trust a path segment)
const segment = (ref) => encodeURIComponent(String(ref || ''));

// The fields the booking form sends (the page also keeps drafts and typed quantities in its form state)
const BOOKING_FIELDS = ['packageId', 'serviceType', 'eventName', 'occasion', 'date', 'startTime', 'guests', 'menu', 'foodNotes', 'addonIds', 'addonQty', 'venueName', 'venueAddress', 'city', 'accessNotes', 'fulfilment', 'rentalItems'];

// Reload the availability map after a write that can change it (no change event of its own). The
// write is saved either way, so a failed reload is not an error: the map catches up on its next load.
async function refreshAvailability() {
  if (usesApi('calendar')) await getCalendar().catch(() => {});
}

/* ---------------- Reads ---------------- */

/** All reservations (admin) or the signed-in customer's own, newest request first. */
export const listReservations = ({ customerId } = {}) => http.get(customerId ? '/reservations' : '/admin/reservations');

/**
 * Full detail: summary plus the package, menu, add-ons, payments, customer and review. NOT_FOUND for
 * another customer's booking, and for no ref at all (its address would otherwise be the list's).
 */
export async function getReservation(ref, { customerId } = {}) {
  if (!ref) throw new ApiError('NOT_FOUND', 'We could not find this reservation.');
  return http.get(`${customerId ? '' : '/admin'}/reservations/${segment(ref)}`);
}

/**
 * How many of each rentable item are free on a date: { itemId: { left, status } }. `excludeRef` (the
 * admin's rental edit dialog) leaves that booking's own pieces free; the server ignores it for a customer.
 */
export async function getRentalAvailability(date, { excludeRef } = {}) {
  if (!date) return {};
  const query = new URLSearchParams({ date });
  if (excludeRef) query.set('excludeRef', excludeRef);
  return http.get(`/rentals/availability?${query}`);
}

/* ---------------- Customer actions ---------------- */

/** Submit the booking form (an event, or an equipment rental). Returns the new reservation's summary. */
export function createReservation(customerId, form = {}) {
  const body = Object.fromEntries(BOOKING_FIELDS.filter((field) => form[field] !== undefined).map((field) => [field, form[field]]));
  return http.post('/reservations', body);
}

/** Cancel the customer's own reservation (while Pending or Approved), with a reason. Returns its summary. */
export async function cancelReservation(ref, customerId, reason) {
  const result = await http.post(`/reservations/${segment(ref)}/cancel`, { reason }, { quiet: true });
  await refreshAvailability(); // a cancelled approved booking frees its slot
  emitChange();
  return result;
}

/** Ask for a change: posted in the customer's chat, tagged with the reservation. Returns { threadId }. */
export const requestChange = (ref, customerId, message) => http.post(`/reservations/${segment(ref)}/change-request`, { message });

/* ---------------- Admin actions and edits (Phase 6B) ---------------- */

// Until Phase 6B these stay on the browser version only; on the API they answer with this error
const notOnServerYet = async () => {
  throw new ApiError('INVALID_STATE', 'This action is not on the server yet (Phase 6B).');
};

export const sendQuotation = notOnServerYet;
export const approveReservation = notOnServerYet;
export const declineReservation = notOnServerYet;
export const confirmReservation = notOnServerYet;
export const completeReservation = notOnServerYet;
export const updateLogistics = notOnServerYet;
export const updateMenu = notOnServerYet;
export const saveNotes = notOnServerYet;
export const updateRentalItems = notOnServerYet;

// Pure money rule, the same code as the browser version and the server
export { financials } from '../../domain/money.js';
