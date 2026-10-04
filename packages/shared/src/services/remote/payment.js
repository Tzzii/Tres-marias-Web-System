import { ApiError } from '../errors.js';
import { fetchFileUrl, http, sessionSide } from '../http.js';

/**
 * Payments and refunds (paymentApi in @tm/shared; apps/api/src/modules/payments, endpoint map in
 * docs/backend-development-phases.md §9.6).
 *
 * - The customer comes from the session, so the page's `customerId` is not sent; the signed-in portal
 *   picks the address (/payments and /refunds for a customer, /admin/… for the admin).
 * - submitPayment() sends the bank transfer as multipart FormData with the receipt photo (`file`);
 *   http.js leaves the Content-Type to the browser for FormData.
 * - Every write is one request, which emits one change event (http.js): a payment never frees or takes
 *   a date, so the calendar has nothing to reload.
 * - The uploaded receipt itself is fetched with the token by fetchFileUrl (http.js), see proofUrl().
 */

// A payment id or reservation ref in a URL path (never trust a path segment)
const segment = (value) => encodeURIComponent(String(value || ''));
// True in the admin portal
const isAdmin = () => sessionSide() === 'admin';

/** All payments (admin) or the signed-in customer's, newest first, with event name/date, customer name and method label. */
export const listPayments = () => http.get(isAdmin() ? '/admin/payments' : '/payments');

/** Admin: one row per booking with money attached (not pending, declined or cancelled), by event date, with its payments. */
export const listBalances = () => http.get('/admin/balances');

/** What the Payments page can offer: { qr } is whether the QR Ph code (GCash, Maya or a bank app) can be used (true once PayMongo's keys are set on the server). */
export const paymentOptions = () => http.get('/payments/options');

/**
 * Customer opens a QR Ph code (GCash, Maya or a bank app) for { ref, amount } (Phase 8B): { id, ref, amount, expiresAt,
 * status, receiptNo, qrImage }. The same amount again, while it is open, gives the same QR back.
 */
export const startQrPayment = (customerId, { ref, amount } = {}) => http.post('/payments/qr', { ref, amount });

/**
 * One of the customer's GCash QRs as it stands ({ id, ref, amount, expiresAt, status, receiptNo }), and
 * its image too with { image: true }. The page asks every few seconds while it shows the QR.
 */
export async function getQrPayment(customerId, id, { image = false } = {}) {
  if (!id) throw new ApiError('NOT_FOUND', 'We could not find this QR payment.');
  return http.get(`/payments/qr/${segment(id)}${image ? '?image=1' : ''}`);
}

/**
 * Customer sends a bank transfer: { ref, method: 'bank', amount, referenceNo, proofName, file }. The
 * server checks every payment rule (domain/payment.js) and the file's real type. Returns the payment.
 */
export async function submitPayment(customerId, { ref, method, amount, referenceNo, proofName, file } = {}) {
  const form = new FormData();
  form.append('ref', String(ref || ''));
  form.append('method', String(method || ''));
  form.append('amount', String(amount ?? ''));
  form.append('referenceNo', String(referenceNo || ''));
  form.append('proofName', String(proofName || (file && file.name) || ''));
  if (file) form.append('proof', file, file.name);
  return http.post('/payments', form);
}

/** Admin: accept a waiting bank transfer; returns the payment with its receipt number. */
export async function verifyPayment(paymentId) {
  if (!paymentId) throw new ApiError('NOT_FOUND', 'Payment not found.');
  return http.post(`/admin/payments/${segment(paymentId)}/verify`, {});
}

/** Admin: turn down a waiting bank transfer with a reason (at least 5 characters) the customer sees. */
export async function rejectPayment(paymentId, reason) {
  if (String(reason || '').trim().length < 5) throw new ApiError('INVALID', 'Please give a short reason (at least 5 characters).', { field: 'reason' });
  if (!paymentId) throw new ApiError('NOT_FOUND', 'Payment not found.');
  return http.post(`/admin/payments/${segment(paymentId)}/reject`, { reason });
}

/** Admin: record cash collected on site (₱1 up to the balance); returns the verified payment. */
export const recordCashPayment = (ref, amount) => http.post(`/admin/reservations/${segment(ref)}/cash-payments`, { amount });

/** Admin: remind the customer in their chat about the downpayment or the balance -> { ok: true }. */
export const sendPaymentReminder = (ref) => http.post(`/admin/reservations/${segment(ref)}/payment-reminder`, {});

/** Admin: record money returned to the customer: { amount, method, referenceNo, sentOn, reason } -> the refund. */
export const recordRefund = (ref, values = {}) => http.post(`/admin/reservations/${segment(ref)}/refunds`, values);

/** Refunds (admin) or the signed-in customer's, newest recorded first. */
export const listRefunds = () => http.get(isAdmin() ? '/admin/refunds' : '/refunds');

/** Admin: the bookings with money still to return, oldest event first. */
export const listRefundsDue = () => http.get('/admin/refunds/due');

/**
 * A payment's uploaded receipt as a local object URL for <img> / <iframe> (they can't send the token
 * themselves): the admin's view, or the customer's own. The caller revokes it (URL.revokeObjectURL).
 * NOT_FOUND when nothing was uploaded (cash, a sample payment, a QR payment) or it is not theirs.
 */
export const proofUrl = (paymentId) => fetchFileUrl(`${isAdmin() ? '/admin/payments' : '/payments'}/${segment(paymentId)}/proof`);
