/**
 * Rules of the payment and refund forms that need no stored data: what a payment is for, whether an
 * amount may be paid, what a reference number looks like, and where a QR Ph code stands (qrState).
 *
 * Pure (no database, no localStorage, no React), so the API server (apps/api/src/modules/payments, the
 * QR payments of Phase 8B included) and the pages give the same answer (docs/backend-development-phases.md §7.8). `money` is financials() from domain/money.js.
 */

// "₱1,200"
const pesoText = (value) => `₱${Number(value).toLocaleString('en-PH')}`;

/**
 * What a payment of `amount` is for, from what was paid before it: "full" when it is the first payment
 * and covers the total, "downpayment" while the booking's minimum downpayment isn't reached yet, and
 * "balance" after that. Worked out when the payment is recorded or verified, so a receipt can't carry a
 * label that no longer fits (e.g. after a lower quotation).
 */
export const kindOf = (money, amount) => (money.paid === 0 && amount >= money.total ? 'full' : money.paid < money.downpayment ? 'downpayment' : 'balance');

/**
 * What is wrong with paying `value` (whole pesos) now, or '' when it is fine. It must be more than 0 and
 * at most the balance; until the booking's minimum downpayment is reached it must also be at least the
 * rest of that minimum (the whole balance when that is less), so the first payment always secures the
 * date. After that the balance can be paid in parts, any amount from ₱1. The customer's bank transfer
 * and the GCash QR (Phase 8B) both use it; the admin's cash is exempt from the minimum.
 */
export function paymentAmountProblem(money, value) {
  if (!Number.isFinite(value) || value <= 0) return 'Enter the amount you paid.';
  const least = Math.min(money.downpayment - money.paid, money.balance);
  if (!money.downpaymentPaid && value < least) {
    return money.paid > 0 ? `Pay at least ${pesoText(least)} to complete your downpayment.` : `Pay at least ${pesoText(least)} as your downpayment.`;
  }
  if (value > money.balance) return 'The amount is more than the remaining balance.';
  return '';
}

/**
 * A reference number: 6–30 letters, numbers, spaces, dashes or underscores. The same for the customer's
 * bank transfer and the admin's refund, where a PayMongo refund id (ref_…) must fit too.
 */
export const REFERENCE_FORMAT = /^[A-Za-z0-9 _-]{6,30}$/;

/** What is wrong with a reference number (already trimmed), or '' when it is fine. */
export function referenceProblem(text) {
  if (!text) return 'Enter the transaction reference number.';
  if (!REFERENCE_FORMAT.test(text)) return 'Use 6–30 letters, numbers, spaces, dashes or underscores.';
  return '';
}

/**
 * A reference number reduced to what identifies it, for spotting one receipt used twice: no spaces,
 * dashes or underscores, capital letters. "bpi-2026 0914" and "BPI20260914" are the same key.
 */
export const referenceKey = (text) => String(text || '').replace(/[\s_-]/g, '').toUpperCase();

// Longest file name kept for an uploaded proof (payments.proof_name is VARCHAR(255))
const MAX_FILE_NAME = 255;

/**
 * The name an uploaded proof is kept under: the customer's file name, trimmed, with any broken
 * character pairs replaced (MySQL refuses them) and cut to 255 characters without splitting an emoji.
 */
export function proofFileName(name) {
  const text = String(name || '').trim();
  const whole = typeof text.toWellFormed === 'function' ? text.toWellFormed() : text;
  return Array.from(whole).slice(0, MAX_FILE_NAME).join('');
}

/**
 * How long a QR Ph code (Phase 8B) still counts as open after PayMongo's expiry: a payment started in
 * its last seconds may still be on its way, so the server keeps checking for that long before it calls
 * the code expired (payments.service.js), and the pages show it as "Checking payment" meanwhile.
 */
export const QR_GRACE_MS = 2 * 60 * 1000;

/**
 * Where a QR Ph code stands for the pages, from its stored status and the time `at` (QR_STATUS in
 * utils/status.js has the words and colours):
 *   'waiting'   still marked pending and within its time: the customer can scan and pay it
 *   'checking'  still marked pending but past its time: a payment made in its last seconds may still
 *               arrive, so the server checks with PayMongo until it is paid or expired
 *   'paid', 'expired', 'failed'  as stored
 * An unpaid QR is never money received: only a paid one has a payment row (with its receipt), so no
 * total or balance ever counts a waiting QR.
 */
export const qrState = (qr, at = Date.now()) => (qr.status === 'pending' ? (at < qr.expiresAt ? 'waiting' : 'checking') : qr.status);
