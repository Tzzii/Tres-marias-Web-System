import { daysFromToday, formatDate, parseISODate, toISODate, todayISO } from '../utils/format.js';
import { PAYMENT_METHODS, REFUND_METHODS, statusLabel } from '../utils/status.js';
import { financials, postAdminMessage, syncPaymentStatus } from './reservationService.js';
import { ApiError, clone, latency, nextId, read, write } from './store.js';

/**
 * Payments: customer proof uploads, admin verification and receipts, and refunds.
 * The customer pays at least the booking's minimum downpayment first (or more, up to the full amount),
 * then the balance in parts. Verifying a payment advances the reservation: minimum downpayment reached
 * → Downpayment paid, paid in full → Confirmed.
 * Refunds record money returned for a cancelled booking or an overpayment (recordRefund). Like the
 * payments, they stay in the browser store until Phase 8 (docs/backend-development-phases.md).
 */

// Reservation statuses that can take payments (approved and later, but not declined or cancelled)
const PAYABLE = ['approved', 'downpayment_paid', 'confirmed', 'completed'];

// What a payment is for, from what was paid before it: "full" when it is the first payment and covers the
// total, "downpayment" while the booking's minimum downpayment isn't reached yet, and "balance" after that
const kindOf = (money, amount) => (money.paid === 0 && amount >= money.total ? 'full' : money.paid < money.downpayment ? 'downpayment' : 'balance');

// "₱1,200"
const pesoText = (value) => `₱${Number(value).toLocaleString('en-PH')}`;

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

/**
 * One row per reservation with money attached, for the admin Payments ledger. Cancelled bookings are
 * left out: the ones with money to return are listed by listRefundsDue ("Refunds to send").
 */
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
        ...financials(r, data.payments, data.refunds),
        payments: data.payments.filter((p) => p.ref === r.ref).map((p) => enrich(p, data))
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Customer submits a GCash / bank payment with proof. The amount is whole pesos, at most the balance.
 * Until the booking's minimum downpayment is reached, it must also be at least the rest of that
 * minimum (the whole balance when that is less), so the first payment always secures the date; after
 * that the balance can be paid in parts, any amount from ₱1. What the payment is for (downpayment, full
 * or balance) is worked out here from the amount, the same way as for cash, so a receipt can't carry
 * the wrong label.
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
    const money = financials(reservation, data.payments, data.refunds);
    if (money.awaitingCount > 0) {
      throw new ApiError('PENDING_PAYMENT', 'A payment for this reservation is still being verified.');
    }
    const value = Math.round(Number(amount));
    if (!value || value <= 0) throw new ApiError('INVALID', 'Enter the amount you paid.', { field: 'amount' });
    // Below the minimum downpayment: this payment has to reach it (or pay off a smaller balance)
    const least = Math.min(money.downpayment - money.paid, money.balance);
    if (!money.downpaymentPaid && value < least) {
      throw new ApiError('INVALID', money.paid > 0 ? `Pay at least ${pesoText(least)} to complete your downpayment.` : `Pay at least ${pesoText(least)} as your downpayment.`, { field: 'amount' });
    }
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
    const money = financials(reservation, data.payments, data.refunds);
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

/**
 * Admin: reject an uploaded payment with a reason shown to the customer (at least 5 characters, like
 * every reason box in the admin); the reason goes to the customer's chat.
 */
export async function rejectPayment(paymentId, reason) {
  await latency(400, 700);
  const text = String(reason || '').trim();
  if (text.length < 5) throw new ApiError('INVALID', 'Please give a short reason (at least 5 characters).', { field: 'reason' });
  return write((data) => {
    const payment = data.payments.find((p) => p.id === paymentId);
    if (!payment) throw new ApiError('NOT_FOUND', 'Payment not found.');
    if (payment.status !== 'awaiting') throw new ApiError('INVALID_STATE', 'This payment has already been processed.');
    const reservation = data.reservations.find((r) => r.ref === payment.ref);
    payment.status = 'rejected';
    payment.rejectReason = text;
    reservation.activity.push({ at: Date.now(), actor: ADMIN_NAME(), text: `Rejected a payment of ₱${payment.amount.toLocaleString('en-PH')}. Reason: ${text}` });
    postAdminMessage(
      data,
      reservation,
      `We could not verify your payment of ₱${payment.amount.toLocaleString('en-PH')} for ${reservation.eventName}. ${text} Please submit it again from Payments.`
    );
    return enrich(payment, data);
  });
}

/**
 * Admin: record a cash payment collected on site (no proof upload): any amount from ₱1 to the balance,
 * even below the minimum downpayment (the booking moves to Downpayment paid once what was paid reaches
 * it). Not while a customer payment is waiting for verification: verify or reject that one first,
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
    const money = financials(reservation, data.payments, data.refunds);
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
 * Before the minimum downpayment is reached it asks for at least the rest of it (they may pay more, up to
 * the whole balance); after that, for the balance, which can be paid in parts before the event day.
 * The wording follows the date: "is due on" while it is still ahead, "was due on" once it has passed.
 */
export async function sendPaymentReminder(ref) {
  await latency(350, 650);
  return write((data) => {
    const reservation = data.reservations.find((r) => r.ref === ref);
    if (!reservation) throw new ApiError('NOT_FOUND', 'Reservation not found.');
    if (!PAYABLE.includes(reservation.status)) throw new ApiError('INVALID_STATE', 'Reminders can be sent once the reservation is approved.');
    const money = financials(reservation, data.payments, data.refunds);
    if (money.balance <= 0) throw new ApiError('INVALID_STATE', 'This reservation is already fully paid.');
    const tense = (iso) => (daysFromToday(iso) < 0 ? 'was' : 'is');
    const least = Math.min(money.downpayment - money.paid, money.balance);
    const due = !money.downpaymentPaid && reservation.downpaymentDue
      ? `${money.paid > 0 ? `The rest of your downpayment, at least ${pesoText(least)},` : `A downpayment of at least ${pesoText(least)}`} ${tense(reservation.downpaymentDue)} due on ${formatDate(reservation.downpaymentDue)}.${least < money.balance ? ` You can pay more, up to the full balance of ${pesoText(money.balance)}.` : ''}`
      : `The remaining balance of ${pesoText(money.balance)} ${tense(reservation.date)} due on the event day, ${formatDate(reservation.date)}. You can pay it in parts before then.`;
    postAdminMessage(data, reservation, `A friendly reminder for ${reservation.eventName}: ${due}`);
    reservation.activity.push({ at: Date.now(), actor: ADMIN_NAME(), text: 'Sent a payment reminder.' });
    return { ok: true };
  });
}

/* ============================ Refunds ============================ */

// A refund's reference number: 6–30 letters, numbers, spaces or dashes (the same format as the customer's payment form)
const REFERENCE_FORMAT = /^[A-Za-z0-9 -]{6,30}$/;

// True for a real calendar day written "YYYY-MM-DD" (so 2026-02-30 is not)
const isRealDate = (iso) => typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) && toISODate(parseISODate(iso)) === iso;

/** Refund plus event name/date, customer name and readable method label ('' for a refund of ₱0, which was never sent). */
function enrichRefund(refund, data) {
  const reservation = data.reservations.find((r) => r.ref === refund.ref);
  const customer = data.customers.find((c) => c.id === refund.customerId);
  return {
    ...clone(refund),
    eventName: reservation ? reservation.eventName : '',
    eventDate: reservation ? reservation.date : '',
    customerName: customer ? customer.name : '',
    methodLabel: REFUND_METHODS[refund.method] || ''
  };
}

/**
 * Admin: record money returned to the customer, after it was sent outside the system (GCash, bank transfer
 * or cash). There must be something owed (refundDue in financials): on a cancelled or declined booking,
 * what was paid (one cancellation refund per booking, after which nothing more is due); on any other
 * booking, what was paid above a lower revised quotation (an overpayment refund, always the whole of it,
 * after which the booking's paid equals its total and the balance is 0; the status stays as it is).
 *   amount       whole pesos, up to what is due. A cancellation refund may be less, even ₱0 when everything
 *                paid is kept, with a `reason` (5+ characters) the customer sees; the rest is kept. An
 *                overpayment refund is the whole overpayment.
 *   method       'gcash', 'bank' or 'cash'; `referenceNo` is required for GCash and bank (6–30 letters,
 *                numbers, spaces or dashes) and '' for cash
 *   sentOn       the day it was sent, "YYYY-MM-DD", not after today (reports count it in that month)
 * A refund of ₱0 sends nothing, so it takes no method, reference or date: it is saved with method '',
 * referenceNo '' and sentOn today (the day it was recorded), and it settles the booking like any other
 * cancellation refund.
 * One write saves the refund (rf-0001, rf-0002… from counters.refund), adds an audit-trail entry with the
 * old and new amounts (paid, returned, kept) and tells the customer in their chat. No slip or document is
 * made: the payment-history line and the chat message are the record. Returns the refund with event
 * name and date, customer name and method label.
 */
export async function recordRefund(ref, { amount, method, referenceNo = '', sentOn, reason = '' } = {}) {
  await latency(450, 800);
  return write((data) => {
    const reservation = data.reservations.find((r) => r.ref === ref);
    if (!reservation) throw new ApiError('NOT_FOUND', 'Reservation not found.');
    const money = financials(reservation, data.payments, data.refunds);
    if (money.refundDue <= 0) throw new ApiError('INVALID_STATE', 'Nothing to refund on this reservation.');
    const kind = ['cancelled', 'declined'].includes(reservation.status) ? 'cancellation' : 'overpayment';

    // A cancellation may return nothing (everything kept, with a reason); an overpayment is always returned
    const least = kind === 'cancellation' ? 0 : 1;
    const value = typeof amount === 'number' ? amount : NaN;
    if (!Number.isInteger(value) || value < least || value > money.refundDue) {
      throw new ApiError('INVALID', `Enter a whole amount from ${pesoText(least)} to ${pesoText(money.refundDue)}.`, { field: 'amount' });
    }
    if (kind === 'overpayment' && value !== money.refundDue) {
      throw new ApiError('INVALID', `Return the whole overpayment of ${pesoText(money.refundDue)}.`, { field: 'amount' });
    }
    const why = String(reason || '').trim();
    if (value < money.refundDue && why.length < 5) {
      throw new ApiError('INVALID', `Tell the customer why ${value > 0 ? 'part of ' : ''}the payment is kept (at least 5 characters).`, { field: 'reason' });
    }
    // How the money went back; nothing to check when nothing was sent
    const sent = value > 0;
    if (sent && !['gcash', 'bank', 'cash'].includes(method)) throw new ApiError('INVALID', 'Choose how the refund was sent.', { field: 'method' });
    const reference = !sent || method === 'cash' ? '' : String(referenceNo || '').trim();
    if (sent && method !== 'cash' && !reference) throw new ApiError('INVALID', 'Enter the reference number of the refund.', { field: 'referenceNo' });
    if (sent && method !== 'cash' && !REFERENCE_FORMAT.test(reference)) {
      throw new ApiError('INVALID', 'Use 6–30 letters, numbers, spaces or dashes.', { field: 'referenceNo' });
    }
    if (sent && !isRealDate(sentOn)) throw new ApiError('INVALID', 'Enter the date the refund was sent.', { field: 'sentOn' });
    if (sent && sentOn > todayISO()) throw new ApiError('INVALID', 'The date sent cannot be later than today.', { field: 'sentOn' });

    const kept = money.refundDue - value;
    const refund = {
      id: nextId(data, 'refund', 'rf-'),
      ref,
      customerId: reservation.customerId,
      kind,
      amount: value,
      due: money.refundDue,
      method: sent ? method : '',
      referenceNo: reference,
      sentOn: sent ? sentOn : todayISO(),
      reason: kept > 0 ? why : '',
      recordedAt: Date.now(),
      recordedBy: ADMIN_NAME()
    };
    data.refunds.push(refund);

    // "GCash (Ref 5021 884 3317)" or "Cash"; nothing when nothing was sent
    const via = sent ? `${REFUND_METHODS[method]}${reference ? ` (Ref ${reference})` : ''}` : '';
    let logText;
    let chatText;
    if (kind === 'overpayment') {
      logText = `Recorded a refund of the overpayment, ${pesoText(value)} via ${via}, sent ${formatDate(sentOn)}. Paid from ${pesoText(money.paid)} to ${pesoText(money.paid - value)}, the total of ${pesoText(money.total)}.`;
      chatText = `We returned ${pesoText(value)} for ${reservation.eventName} on ${formatDate(sentOn)} via ${via}: the amount you paid above your new total.`;
    } else if (sent) {
      logText = `Recorded a refund of ${pesoText(value)} via ${via}, sent ${formatDate(sentOn)}. Paid ${pesoText(money.paid)}, returned ${pesoText(value)}, kept ${pesoText(kept)}.${kept > 0 ? ` Reason: ${why}` : ''}`;
      chatText = `We returned ${pesoText(value)} for ${reservation.eventName} on ${formatDate(sentOn)} via ${via}.${kept > 0 ? ` We kept ${pesoText(kept)}: ${why}` : ''}`;
    } else {
      logText = `Recorded that nothing is returned. Paid ${pesoText(money.paid)}, returned ₱0, kept ${pesoText(kept)}. Reason: ${why}`;
      chatText = `We kept the ${pesoText(kept)} paid for ${reservation.eventName}: ${why}`;
    }
    reservation.activity.push({ at: Date.now(), actor: refund.recordedBy, text: logText });
    postAdminMessage(data, reservation, chatText);
    return enrichRefund(refund, data);
  });
}

/** Refunds (admin) or one customer's, newest recorded first, with event name/date, customer name and method label. */
export async function listRefunds({ customerId } = {}) {
  await latency(150, 380);
  const data = read();
  return data.refunds
    .filter((r) => !customerId || r.customerId === customerId)
    .map((r) => enrichRefund(r, data))
    .sort((a, b) => b.recordedAt - a.recordedAt);
}

/**
 * Admin: the bookings with money still to return (refundDue in financials), for "Refunds to send":
 * cancelled or declined bookings until their refund is recorded, and overpaid ones. Oldest event date
 * first. `why` is 'customer' (cancelled by the customer; older records without `cancelledBy` count as
 * theirs), 'admin' (cancelled by the admin), 'declined' or 'overpaid'.
 */
export async function listRefundsDue() {
  await latency(200, 450);
  const data = read();
  return data.reservations
    .map((r) => ({ r, money: financials(r, data.payments, data.refunds) }))
    .filter(({ money }) => money.refundDue > 0)
    .map(({ r, money }) => {
      const customer = data.customers.find((c) => c.id === r.customerId);
      return {
        ref: r.ref,
        eventName: r.eventName,
        date: r.date,
        status: r.status,
        customerId: r.customerId,
        customerName: customer ? customer.name : '',
        why: r.status === 'cancelled' ? (r.cancelledBy === 'admin' ? 'admin' : 'customer') : r.status === 'declined' ? 'declined' : 'overpaid',
        refundDue: money.refundDue,
        paid: money.paid,
        total: money.total
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
