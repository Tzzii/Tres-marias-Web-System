import { RULES } from '../services/config.js';
import { addDays, addMonths, formatDate, parseISODate, toISODate, todayISO } from '../utils/format.js';
import { statusLabel } from '../utils/status.js';

/**
 * When a customer may cancel a booking online:
 *   - unpaid: any time before the event day;
 *   - paid: only during the first quarter of the days from the day the request was sent to the event
 *     day, or the first half when the event is 6 or more calendar months after the request
 *     (RULES.cancelWindowShare, cancelWindowShareLong, cancelWindowLongMonths), and never once the admin
 *     has marked the booking "Started preparing" (`preparingAt`);
 *   - never while equipment is checked out for it, while a payment is waiting for verification, or while a
 *     GCash QR for it is open (Phase 8B: the payment may still arrive).
 * Otherwise the customer cancels by messaging us in their chat or calling the business number.
 *
 * Pure (no store.js, no localStorage, no React): the browser service (reservationService.js), the API
 * server (apps/api/src/modules/reservations) and the pages all use it, so every side gives the same
 * answer (docs/backend-development-phases.md §7.8).
 */

// Whole days from one "YYYY-MM-DD" date to another, rounded like daysFromToday in utils/format.js
const daysBetween = (from, to) => Math.round((parseISODate(to) - parseISODate(from)) / 86400000);

/**
 * The last day a PAID booking can be cancelled online, "YYYY-MM-DD": the day the request was sent plus a
 * quarter of the days to the event (rounded down), or half when the event is 6 or more months after the
 * request. Worked out each time, never stored, so moving the event date moves it too. For a request sent
 * on 2026-09-26:
 *   event 2026-09-28 (2 days)    -> 0 days in  -> 2026-09-26
 *   event 2026-10-27 (31 days)   -> 7 days in  -> 2026-10-03
 *   event 2027-03-25 (180 days, under 6 months) -> 45 days in -> 2026-11-10
 *   event 2027-03-26 (181 days, 6 months away)  -> half, 90 days in -> 2026-12-25
 */
export function cancelDeadline(reservation) {
  const requested = toISODate(new Date(reservation.createdAt));
  const days = daysBetween(requested, reservation.date);
  const long = reservation.date >= addMonths(requested, RULES.cancelWindowLongMonths);
  const windowDays = Math.floor(days * (long ? RULES.cancelWindowShareLong : RULES.cancelWindowShare));
  return addDays(requested, windowDays);
}

/**
 * Whether the customer can cancel online, and if not, why: { allowed, deadline, reason, code }.
 * `reason` and `code` are '' when allowed; otherwise `code` is the ApiError code cancelReservation
 * throws with `reason` as its message. `money` is financials() for the booking (domain/money.js);
 * `piecesOut` is how many inventory pieces are checked out for it (an event's equipment or a rental's
 * items, from the inventory's allocations; the services read it), `openQrUntil` is when its open GCash QR
 * stops counting as open (milliseconds; the API passes it, the browser store has no QRs) and `today` is
 * "YYYY-MM-DD".
 * Checked in this order:
 *   1. cancelled, declined or completed               -> INVALID_STATE
 *   2. the event day has come (or passed)             -> INVALID_STATE
 *   3. paid, and the admin has started preparing      -> INVALID_STATE
 *   4. paid, and the deadline (cancelDeadline) passed -> INVALID_STATE
 *   5. equipment is checked out for it                -> INVALID_STATE (the team records the return first)
 *   6. a payment is waiting for verification          -> PENDING_PAYMENT
 *   7. a GCash QR for it is open                       -> PENDING_PAYMENT (wait until it is paid or expires)
 * An unpaid booking with nothing checked out is always allowed before the event day.
 */
export function onlineCancellation(reservation, money, { piecesOut = 0, openQrUntil = 0, today = todayISO() } = {}) {
  const deadline = cancelDeadline(reservation);
  const refuse = (code, reason) => ({ allowed: false, deadline, reason, code });
  if (['cancelled', 'declined', 'completed'].includes(reservation.status)) {
    return refuse('INVALID_STATE', reservation.status === 'cancelled' ? 'This reservation is already cancelled.' : `A ${statusLabel(reservation.status).toLowerCase()} reservation can no longer be cancelled.`);
  }
  if (today >= reservation.date) return refuse('INVALID_STATE', 'The event day has come, so this reservation can no longer be cancelled online.');
  if (money.paid > 0 && reservation.preparingAt) return refuse('INVALID_STATE', "We've started preparing for your event, so it can no longer be cancelled online.");
  if (money.paid > 0 && today > deadline) return refuse('INVALID_STATE', `Online cancellation ended on ${formatDate(deadline)}.`);
  if (piecesOut > 0) return refuse('INVALID_STATE', 'Some of the equipment for this booking is already out, so it can no longer be cancelled online.');
  if (money.awaitingCount > 0) {
    return refuse('PENDING_PAYMENT', 'A payment for this reservation is still being verified. Please wait until our team checks it, or message us to cancel.');
  }
  if (openQrUntil) {
    return refuse('PENDING_PAYMENT', 'A GCash QR payment for this reservation is still open. Please wait until it is paid or expires, or message us to cancel.');
  }
  return { allowed: true, deadline, reason: '', code: '' };
}

// A share of the window in words: 0.25 -> "quarter", 0.5 -> "half", anything else as a percentage
const shareName = (share) => ({ 0.25: 'quarter', 0.5: 'half' })[share] || `${Math.round(share * 100)}%`;

/**
 * The paid-booking cancellation window in words, from RULES, for the contract and the website: "the first
 * quarter of the time between your request and the event, or the first half when the event is 6 or more
 * months away".
 */
export const cancelWindowText = () =>
  `the first ${shareName(RULES.cancelWindowShare)} of the time between your request and the event, or the first ${shareName(RULES.cancelWindowShareLong)} when the event is ${RULES.cancelWindowLongMonths} or more months away`;
