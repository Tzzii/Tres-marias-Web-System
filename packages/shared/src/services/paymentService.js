import { daysFromToday, formatDate } from '../utils/format.js';
import { PAYMENT_METHODS, statusLabel } from '../utils/status.js';
import { financials, postAdminMessage, syncPaymentStatus } from './reservationService.js';
import { ApiError, clone, latency, read, write } from './store.js';

/**
 * Payments: customer proof uploads, admin verification and receipts.
 * Verifying a payment advances the reservation: 50% → Downpayment paid,
 * paid in full → Confirmed.
 */

// Reservation statuses that can take payments (approved and later, but not declined or cancelled)
const PAYABLE = ['approved', 'downpayment_paid', 'confirmed', 'completed'];

// What a payment is for, from what was paid before it: "full" when it is the first payment and covers the
// total, "downpayment" while the 50% downpayment isn't reached yet, and "balance" after that
const kindOf = (money, amount) => (money.paid === 0 && amount >= money.total ? 'full' : money.paid < money.downpayment ? 'downpayment' : 'balance');

// Name of the signed-in admin, for the activity log and chat messages
const ADMIN_NAME = () => {
  try {
    const session = JSON.parse(sessionStorage.getItem('tm.admin.session') || localStorage.getItem('tm.admin.session'));
    return (session && session.user && session.user.name) || 'Billing team';
  } catch (e) {
    return 'Billing team';
  }
};

/** Payment plus event name/date, customer name and readable method label. */
function enrich(payment, data) {
  const reservation = data.reservations.find((r) => r.ref === payment.ref);
  const customer = data.customers.find((c) => c.id === payment.customerId);
  return {
    ...clone(payment),
    eventName: reservation ? reservation.eventName : '',
    eventDate: reservation ? reservation.date : '',
    customerName: customer ? customer.name : '',
    methodLabel: PAYMENT_METHODS[payment.method]
  };
}

/** All payments (admin) or one customer's, newest first. */
export async function listPayments({ customerId } = {}) {
  await latency(180, 420);
  const data = read();
  return data.payments
    .filter((p) => !customerId || p.customerId === customerId)
    .map((p) => enrich(p, data))
    .sort((a, b) => b.submittedAt - a.submittedAt);
}

/** One row per reservation with money attached, for the admin Payments ledger. */
export async function listBalances() {
  await latency(200, 450);
  const data = read();
  return data.reservations
    .filter((r) => !['pending', 'declined', 'cancelled'].includes(r.status))
    .map((r) => {
      const customer = data.customers.find((c) => c.id === r.customerId);
      return {
        ref: r.ref,
        eventName: r.eventName,
        date: r.date,
        status: r.status,
        downpaymentDue: r.downpaymentDue,
        customerId: r.customerId,
        customerName: customer ? customer.name : '',
        ...financials(r, data.payments),
        payments: data.payments.filter((p) => p.ref === r.ref).map((p) => enrich(p, data))
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Customer submits a GCash / bank payment with proof. What the payment is for (downpayment, full or
 * balance) is worked out here from the amount, the same way as for cash, so a receipt can't carry the wrong label.
 */
export async function submitPayment(customerId, { ref, method, amount, referenceNo, proofName }) {
  await latency(600, 1000);
  return write((data) => {
    const reservation = data.reservations.find((r) => r.ref === ref && r.customerId === customerId);
    if (!reservation) throw new ApiError('NOT_FOUND', 'We could not find this reservation.');
    if (!['approved', 'downpayment_paid', 'confirmed'].includes(reservation.status)) {
      throw new ApiError('INVALID_STATE', 'Payments open once your reservation is approved.');
    }
    if (method === 'cash') throw new ApiError('INVALID', 'Cash payments are paid on site and recorded by Tres Marias.');
    if (!['gcash', 'bank'].includes(method)) throw new ApiError('INVALID', 'Choose how you paid.', { field: 'method' });
    // Only one payment can wait for verification at a time, and it can't go over the balance
    const money = financials(reservation, data.payments);
    if (money.awaitingCount > 0) {
      throw new ApiError('PENDING_PAYMENT', 'A payment for this reservation is still being verified.');
    }
    const value = Math.round(Number(amount));
    if (!value || value <= 0) throw new ApiError('INVALID', 'Enter the amount you paid.', { field: 'amount' });
    if (value > money.balance) throw new ApiError('INVALID', 'The amount is more than the remaining balance.', { field: 'amount' });
    if (!referenceNo || !referenceNo.trim()) throw new ApiError('INVALID', 'Enter the transaction reference number.', { field: 'referenceNo' });
    if (!proofName) throw new ApiError('INVALID', 'Upload a screenshot or receipt of your payment.', { field: 'proof' });

    data.counters.payment = (data.counters.payment || 0) + 1;
    const customer = data.customers.find((c) => c.id === customerId);
    const kind = kindOf(money, value);
    const payment = {
      id: `pay-${String(data.counters.payment).padStart(4, '0')}`,
      ref,
      customerId,
      amount: value,
      kind,
      method,
      referenceNo: referenceNo.trim(),
      proofName,
      status: 'awaiting',
      submittedAt: Date.now(),
      verifiedAt: null,
      receiptNo: '',
      rejectReason: ''
    };
    data.payments.push(payment);
    reservation.activity.push({
      at: Date.now(),
      actor: customer.name,
      text: `Submitted a ${kind} payment of ₱${value.toLocaleString('en-PH')} via ${PAYMENT_METHODS[method]}.`
    });
    return enrich(payment, data);
  });
}

/**
 * After a payment is verified: move the status forward (full payment -> Confirmed,
 * downpayment reached -> Downpayment paid; see syncPaymentStatus), log it, and send the receipt in the customer's chat.
 */
function applyVerifiedPayment(data, reservation, payment) {
  const before = reservation.status;
  syncPaymentStatus(data, reservation);
  const actor = ADMIN_NAME();
  reservation.activity.push({
    at: Date.now(),
    actor,
    text: `Verified a ${payment.kind} payment of ₱${payment.amount.toLocaleString('en-PH')} (${payment.receiptNo}).`
  });
  if (before !== reservation.status) {
    reservation.activity.push({
      at: Date.now(),
      actor,
      text: reservation.status === 'confirmed' ? 'Booking confirmed after full payment.' : 'Status moved to Downpayment paid.'
    });
  }
  postAdminMessage(
    data,
    reservation,
    `We received your payment of ₱${payment.amount.toLocaleString('en-PH')} for ${reservation.eventName}. Receipt ${payment.receiptNo} is now in Documents.`,
    { name: `Receipt-${payment.receiptNo}.pdf`, kind: 'receipt', ref: reservation.ref, paymentId: payment.id }
  );
}

/**
 * Admin: accept an uploaded payment and issue the next receipt number.
 * Refused when the reservation was declined or cancelled, or when the amount is more than what is
 * still owed (e.g. a cash payment was recorded meanwhile): reject it instead, with the reason.
 */
export async function verifyPayment(paymentId) {
  await latency(450, 800);
  return write((data) => {
    const payment = data.payments.find((p) => p.id === paymentId);
    if (!payment) throw new ApiError('NOT_FOUND', 'Payment not found.');
    if (payment.status !== 'awaiting') throw new ApiError('INVALID_STATE', 'This payment has already been processed.');
    const reservation = data.reservations.find((r) => r.ref === payment.ref);
    if (!reservation) throw new ApiError('NOT_FOUND', 'Reservation not found.');
    if (!PAYABLE.includes(reservation.status)) {
      throw new ApiError('INVALID_STATE', `This reservation is ${statusLabel(reservation.status).toLowerCase()}. Reject the payment and arrange any refund with the customer.`);
    }
    // The awaiting payment itself isn't counted in `paid` yet, so the balance is what it may cover
    const money = financials(reservation, data.payments);
    if (payment.amount > money.balance) {
      throw new ApiError('OVER_BALANCE', `This payment of ₱${payment.amount.toLocaleString('en-PH')} is more than the remaining balance of ₱${money.balance.toLocaleString('en-PH')}. Reject it and ask the customer to send the correct amount.`);
    }
    payment.status = 'verified';
    payment.verifiedAt = Date.now();
    payment.receiptNo = `OR-${data.counters.receipt++}`;
    applyVerifiedPayment(data, reservation, payment);
    return enrich(payment, data);
  });
}

/** Admin: reject an uploaded payment; the reason is sent to the customer's chat. */
export async function rejectPayment(paymentId, reason) {
  await latency(400, 700);
  if (!reason || !reason.trim()) throw new ApiError('INVALID', 'A reason is required.', { field: 'reason' });
  return write((data) => {
    const payment = data.payments.find((p) => p.id === paymentId);
    if (!payment) throw new ApiError('NOT_FOUND', 'Payment not found.');
    if (payment.status !== 'awaiting') throw new ApiError('INVALID_STATE', 'This payment has already been processed.');
    const reservation = data.reservations.find((r) => r.ref === payment.ref);
    payment.status = 'rejected';
    payment.rejectReason = reason.trim();
    reservation.activity.push({ at: Date.now(), actor: ADMIN_NAME(), text: `Rejected a payment of ₱${payment.amount.toLocaleString('en-PH')}. Reason: ${reason.trim()}` });
    postAdminMessage(
      data,
      reservation,
      `We could not verify your payment of ₱${payment.amount.toLocaleString('en-PH')} for ${reservation.eventName}. ${reason.trim()} Please submit it again from Payments.`
    );
    return enrich(payment, data);
  });
}

/**
 * Admin: record a cash payment collected on site (no proof upload).
 * Not while a customer payment is waiting for verification: verify or reject that one first,
 * so the two together can't come to more than the balance.
 */
export async function recordCashPayment(ref, amount) {
  await latency(450, 800);
  return write((data) => {
    const reservation = data.reservations.find((r) => r.ref === ref);
    if (!reservation) throw new ApiError('NOT_FOUND', 'Reservation not found.');
    if (!PAYABLE.includes(reservation.status)) {
      throw new ApiError('INVALID_STATE', 'Payments can be recorded once the reservation is approved.');
    }
    const money = financials(reservation, data.payments);
    if (money.awaitingCount > 0) {
      throw new ApiError('PENDING_PAYMENT', 'A customer payment for this reservation is waiting for verification. Verify or reject it first.', { field: 'amount' });
    }
    const value = Math.round(Number(amount));
    if (!value || value <= 0) throw new ApiError('INVALID', 'Enter the amount received.', { field: 'amount' });
    if (value > money.balance) throw new ApiError('INVALID', `The remaining balance is ₱${money.balance.toLocaleString('en-PH')}.`, { field: 'amount' });

    data.counters.payment = (data.counters.payment || 0) + 1;
    const payment = {
      id: `pay-${String(data.counters.payment).padStart(4, '0')}`,
      ref,
      customerId: reservation.customerId,
      amount: value,
      // "full", "downpayment" or "balance" (see kindOf)
      kind: kindOf(money, value),
      method: 'cash',
      referenceNo: '',
      proofName: '',
      status: 'verified',
      submittedAt: Date.now(),
      verifiedAt: Date.now(),
      receiptNo: `OR-${data.counters.receipt++}`,
      rejectReason: ''
    };
    data.payments.push(payment);
    applyVerifiedPayment(data, reservation, payment);
    return enrich(payment, data);
  });
}

/**
 * Admin: message the customer about the downpayment or the remaining balance (approved bookings only).
 * The wording follows the date: "is due on" while it is still ahead, "was due on" once it has passed.
 */
export async function sendPaymentReminder(ref) {
  await latency(350, 650);
  return write((data) => {
    const reservation = data.reservations.find((r) => r.ref === ref);
    if (!reservation) throw new ApiError('NOT_FOUND', 'Reservation not found.');
    if (!PAYABLE.includes(reservation.status)) throw new ApiError('INVALID_STATE', 'Reminders can be sent once the reservation is approved.');
    const money = financials(reservation, data.payments);
    if (money.balance <= 0) throw new ApiError('INVALID_STATE', 'This reservation is already fully paid.');
    const tense = (iso) => (daysFromToday(iso) < 0 ? 'was' : 'is');
    const due = !money.downpaymentPaid && reservation.downpaymentDue
      ? `The downpayment of ₱${(money.downpayment - money.paid).toLocaleString('en-PH')} ${tense(reservation.downpaymentDue)} due on ${formatDate(reservation.downpaymentDue)}.`
      : `The remaining balance of ₱${money.balance.toLocaleString('en-PH')} ${tense(reservation.date)} due on the event day, ${formatDate(reservation.date)}.`;
    postAdminMessage(data, reservation, `A friendly reminder for ${reservation.eventName}: ${due}`);
    reservation.activity.push({ at: Date.now(), actor: ADMIN_NAME(), text: 'Sent a payment reminder.' });
    return { ok: true };
  });
}
