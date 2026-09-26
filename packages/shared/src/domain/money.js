import { RULES } from '../services/config.js';
import { addDays, daysFromToday, todayISO } from '../utils/format.js';

/**
 * Money rules for a reservation that need no stored data: what is owed and paid, where the booking
 * should stand for what has been paid, and when the downpayment falls due.
 *
 * Pure (no store.js, no localStorage, no React), so the browser service (reservationService.js), the
 * pages and the API server (apps/api/src/modules/reservations) work out the same figures
 * (docs/backend-development-phases.md §7.8).
 */

/** Money and payment status for one reservation, worked out from its verified payments. */
export function financials(reservation, payments) {
  // Use the sent quotation's total, or the estimate if no quotation yet
  const total = reservation.quotation ? reservation.quotation.net : reservation.estimate.net;
  const mine = payments.filter((p) => p.ref === reservation.ref);
  // Only verified payments count as paid
  const paid = mine.filter((p) => p.status === 'verified').reduce((sum, p) => sum + p.amount, 0);
  const awaiting = mine.filter((p) => p.status === 'awaiting');
  const balance = Math.max(0, total - paid);
  const downpayment = Math.round(total * RULES.downpaymentRate);

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
    balance,
    downpayment,
    downpaymentPaid: paid >= downpayment,
    awaitingAmount: awaiting.reduce((sum, p) => sum + p.amount, 0),
    awaitingCount: awaiting.length,
    balanceState
  };
}

/**
 * The status an approved booking should have for what has been paid (`money` is financials()):
 *   paid in full        -> Confirmed
 *   downpayment reached -> Downpayment paid
 *   below the downpayment again (a new, higher quotation) -> back to Approved
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
