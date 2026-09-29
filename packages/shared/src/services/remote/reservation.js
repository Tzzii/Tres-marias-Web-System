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
 * - Until refunds reach the server (Phase 8), a detail's `refunds` is [] and the money figures leave
 *   refunds out (the server passes [] to financials).
 * - A write that can take, free or move an event's slot (a cancellation by either side, an approval,
 *   marking an event completed, a new date or start time) is saved quietly, the availability map is
 *   reloaded (when the calendar is on the API too), and then one change event goes out, so every page
 *   that reloads already reads the new map. Creating a booking takes no slot (a pending request holds
 *   none), so it only sends the usual change event, like the other admin actions and edits.
 * - The admin's actions and edits (Phase 6B) answer like the browser version: the booking's summary,
 *   { changed } for logistics and rented items, { ok: true } for the menu and notes.
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

// A write that can change the availability map, e.g. slotWrite((options) => http.post(path, body, options)):
// sent quietly, then the map is reloaded, then one change event, and the write's answer is returned
async function slotWrite(send) {
  const result = await send({ quiet: true });
  await refreshAvailability();
  emitChange();
  return result;
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

/**
 * Cancel the customer's own reservation online, with a reason, when the rules allow it (the summary's
 * `onlineCancel`; the server checks them again). A cancelled approved booking frees its slot. Returns its summary.
 */
export const cancelReservation = (ref, customerId, reason) => slotWrite((options) => http.post(`/reservations/${segment(ref)}/cancel`, { reason }, options));

/** Ask for a change: posted in the customer's chat, tagged with the reservation. Returns { threadId }. */
export const requestChange = (ref, customerId, message) => http.post(`/reservations/${segment(ref)}/change-request`, { message });

/* ---------------- Admin actions and edits (Phase 6B) ---------------- */

// An admin action on one booking, e.g. adminPath('RES-2026-1020-01', 'approve') -> "/admin/reservations/RES-2026-1020-01/approve"
const adminPath = (ref, action) => `/admin/reservations/${segment(ref)}/${action}`;

/** Price and send the quotation: { addonPrices, otherCharges, otherLabel, discount, deliveryFee, note }. Returns the summary. */
export const sendQuotation = (ref, values) => http.post(adminPath(ref, 'quotation'), values);

/** Approve a pending request (it takes its slot). Returns the summary. */
export const approveReservation = (ref) => slotWrite((options) => http.post(adminPath(ref, 'approve'), {}, options));

/** Decline a pending request with a reason shown to the customer. Returns the summary. */
export const declineReservation = (ref, reason) => http.post(adminPath(ref, 'decline'), { reason });

/** Confirm a booking once its downpayment is verified. Returns the summary. */
export const confirmReservation = (ref) => http.post(adminPath(ref, 'confirm'), {});

/** Mark a confirmed event completed (its slot is freed). Returns the summary. */
export const completeReservation = (ref) => slotWrite((options) => http.post(adminPath(ref, 'complete'), {}, options));

/** Cancel an approved to confirmed booking with a reason shown to the customer (its slot is freed). Returns the summary. */
export const cancelReservationByAdmin = (ref, reason) => slotWrite((options) => http.post(adminPath(ref, 'cancel'), { reason }, options));

/** Mark "Started preparing": the customer can no longer cancel online. Returns the summary. */
export const startPreparing = (ref) => http.post(adminPath(ref, 'preparing'), {});

/** Take back "Started preparing" (marked by mistake). Returns the summary. */
export const undoPreparing = (ref) => http.delete(adminPath(ref, 'preparing'));

/** Edit date, time, guests and venue (pick up or delivery for a rental): a new date or time moves the slot. Returns { changed }. */
export const updateLogistics = (ref, patch) => slotWrite((options) => http.patch(adminPath(ref, 'logistics'), patch, options));

/** Change the service type, the menu and the food notes. Returns { ok: true }. */
export const updateMenu = (ref, values) => http.put(adminPath(ref, 'menu'), values);

/** Save the admin's private notes. Returns { ok: true }. */
export const saveNotes = (ref, notes) => http.put(adminPath(ref, 'notes'), { notes });

/** A rental's whole new list of items: { items: [{ itemId, qty }] }. Returns { changed }. */
export const updateRentalItems = (ref, values) => http.put(adminPath(ref, 'rental-items'), values);

// Pure money rule, the same code as the browser version and the server
export { financials } from '../../domain/money.js';
