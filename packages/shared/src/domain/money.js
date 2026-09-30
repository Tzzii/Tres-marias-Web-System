import { DEFAULT_MIN_DOWNPAYMENT, RULES } from '../services/config.js';
import { addDays, daysFromToday, todayISO } from '../utils/format.js';

/**
 * Money rules for a reservation that need no stored data: what is owed, paid and returned, where the
 * booking should stand for what has been paid, and when the downpayment falls due.
 *
 * Pure (no store.js, no localStorage, no React), so the browser service (reservationService.js), the
 * pages and the API server (apps/api/src/modules/reservations) work out the same figures
 * (docs/backend-development-phases.md §7.8).
 */

// A cancelled or declined booking owes nothing more, and everything paid on it is returned
const ENDED_EARLY = ['cancelled', 'declined'];

/**
 * Money and payment status for one reservation, from its payments and the refunds sent back on it:
 *   total            the sent quotation's net, or the estimate's before any quotation
 *   refunded         what was returned to the customer (this booking's refunds)
 *   paid             verified payments less refunded (net); payments waiting for verification don't count
 *   balance          total − paid, never below 0, and 0 for a cancelled or declined booking
 *   downpayment      the least to pay first: the booking's own minimum (copied when it was made; bookings
 *                    saved before there was one use DEFAULT_MIN_DOWNPAYMENT), or the whole total when that
 *                    is lower, e.g. minimum ₱3,000 on a ₱2,400 total -> 2,400 (paid in full)
 *   downpaymentPaid  paid has reached the downpayment
 *   overpaid         paid above the total (after a lower revised quotation); 0 for cancelled or declined
 *   refundDue        what still has to be returned: on a cancelled or declined booking everything paid,
 *                    until its one cancellation refund is recorded (then 0); on any other, the overpayment
 *   awaitingAmount / awaitingCount   payments waiting for verification
 *   balanceState     'full', 'overdue' (approved, due date passed, downpayment not reached), 'partial' or 'unpaid'
 * `refunds` are refund records ({ ref, kind, amount }); the API passes [] until refunds reach the server in Phase 8.
 */
export function financials(reservation, payments, refunds = []) {
  // Use the sent quotation's total, or the estimate if no quotation yet
  const total = reservation.quotation ? reservation.quotation.net : reservation.estimate.net;
  const mine = payments.filter((p) => p.ref === reservation.ref);
  const returned = refunds.filter((r) => r.ref === reservation.ref);
  const refunded = returned.reduce((sum, r) => sum + r.amount, 0);
  // Only verified payments count as paid, less what was given back
  const paid = mine.filter((p) => p.status === 'verified').reduce((sum, p) => sum + p.amount, 0) - refunded;
  const awaiting = mine.filter((p) => p.status === 'awaiting');
  const endedEarly = ENDED_EARLY.includes(reservation.status);
  const balance = endedEarly ? 0 : Math.max(0, total - paid);
  const downpayment = Math.min(reservation.minDownpayment ?? DEFAULT_MIN_DOWNPAYMENT, total);
  const overpaid = endedEarly ? 0 : Math.max(0, paid - total);
  // A cancelled booking gets one cancellation refund, which settles it even when part was kept
  const refundDue = endedEarly ? (returned.some((r) => r.kind === 'cancellation') ? 0 : paid) : overpaid;

  // full = paid everything; overdue = approved, due date passed, downpayment not reached; partial = some paid
  let balanceState = 'unpaid';
  if (paid >= total && total > 0) balanceState = 'full';
  else if (
    reservation.status === 'approved' &&
    reservation.downpaymentDue &&
    daysFromToday(reservation.downpaymentDue) < 0 &&
    paid < downpayment
  )
    balanceState = 'overdue';
  else if (paid > 0) balanceState = 'partial';

  return {
    total,
    paid,
    refunded,
    balance,
    downpayment,
    downpaymentPaid: paid >= downpayment,
    overpaid,
    refundDue,
    awaitingAmount: awaiting.reduce((sum, p) => sum + p.amount, 0),
    awaitingCount: awaiting.length,
    balanceState
  };
}

/**
 * The status an approved booking should have for what has been paid (`money` is financials(), so
 * `paid` is net of refunds):
 *   paid in full        -> Confirmed
 *   downpayment reached -> Downpayment paid
 *   below the downpayment again -> back to Approved (a safeguard: the downpayment is now the booking's
 *                          fixed minimum, so a higher quotation no longer raises it)
 * Statuses only move forward when something has been paid, and Confirmed or later never moves back.
 * Returns the status unchanged when nothing moves (any status other than Approved or Downpayment paid).
 */
export function statusForPayments(status, money) {
  if (['approved', 'downpayment_paid'].includes(status) && money.paid > 0 && money.paid >= money.total) return 'confirmed';
  if (status === 'approved' && money.paid > 0 && money.downpaymentPaid) return 'downpayment_paid';
  if (status === 'downpayment_paid' && !money.downpaymentPaid) return 'approved';
  return status;
}

/**
 * Downpayment due date for an event: `due` (by default RULES.downpaymentDueDays from today),
 * but no later than 3 days before the event and never before today.
 */
export function downpaymentDueFor(eventDate, due = addDays(todayISO(), RULES.downpaymentDueDays)) {
  const latest = addDays(eventDate, -3);
  const capped = due < latest ? due : latest;
  return capped < todayISO() ? todayISO() : capped;
}

/**
 * The downpayment due date of a booking whose event moves to `date` (the admin's logistics edit):
 * { due, moved }. An approved booking must still pay at least 3 days before the event, so a due date
 * later than that is brought forward to it (downpaymentDueFor, so never before today) and `moved` is
 * true, for the audit trail to list it. Any other booking, a due date already early enough, or the
 * same date keeps its due date, with `moved` false.
 */
export function dueAfterMove(reservation, date) {
  const due = reservation.downpaymentDue;
  if (reservation.status !== 'approved' || !due || date === reservation.date || due <= addDays(date, -3)) return { due, moved: false };
  return { due: downpaymentDueFor(date, due), moved: true };
}
