import crypto from 'node:crypto';
import { financials, statusForPayments } from '@tm/shared/src/domain/money.js';
import {
  QR_GRACE_MS,
  kindOf,
  paymentAmountProblem,
  proofFileName,
  referenceKey,
  referenceProblem
} from '@tm/shared/src/domain/payment.js';
import { daysFromToday, formatDate } from '@tm/shared/src/utils/format.js';
import { PAYMENT_METHODS, REFUND_METHODS, statusLabel } from '@tm/shared/src/utils/status.js';
import { config } from '../../config.js';
import { pool, tx } from '../../db.js';
import { createQrPh, getIntent, qrReady } from '../../integrations/paymongo/index.js';
import { storage } from '../../integrations/storage/index.js';
import { ApiError } from '../../lib/ApiError.js';
import { newId, nextCounter } from '../../lib/ids.js';
import { isISODate, now, todayISO } from '../../lib/time.js';
import { bumpStamp } from '../changes/changes.repo.js';
import { postAdminMessage } from '../messages/messages.repo.js';
import { emailedRecently, queueCustomerEmail } from '../notify/notify.service.js';
import * as reservationsRepo from '../reservations/reservations.repo.js';
import * as repo from './payments.repo.js';


const PAYABLE = ['approved', 'downpayment_paid', 'confirmed', 'completed'];
const CUSTOMER_PAYABLE = ['approved', 'downpayment_paid', 'confirmed'];
const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const QR_CHECK_MS = 60 * 1000;
const QR_CHECK_LATE_MS = 10 * 1000;
const QR_SETTLE_MAX = 5;
const QR_SETTLE_WAIT_MS = 3000;
const settling = new Set();
const PAYMONGO_NAME = 'PayMongo';
const TEAM_NAME = 'Tres Marias team';
const REMINDER_EMAIL_GAP_MS = 12 * 60 * 60 * 1000;

const pesoText = (value) => `₱${Number(value).toLocaleString('en-PH')}`;
const clockText = (ms) =>
  new Date(ms).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: config.timeZone });
const invalid = (message, field) => new ApiError('INVALID', message, field ? { field } : {});

const enrich = ({ payment, eventName, eventDate, customerName }) => ({
  ...payment,
  eventName,
  eventDate,
  customerName,
  methodLabel: PAYMENT_METHODS[payment.method]
});

const enrichRefund = ({ refund, eventName, eventDate, customerName }) => ({
  ...refund,
  eventName,
  eventDate,
  customerName,
  methodLabel: REFUND_METHODS[refund.method] || ''
});

const inMadeOrder = (payments) =>
  [...payments].sort((a, b) => Number(a.id.slice(4)) - Number(b.id.slice(4)) || a.id.localeCompare(b.id));

const byEventDate = (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt || a.ref.localeCompare(b.ref);

async function lockedReservation(conn, ref, message) {
  const owner = await reservationsRepo.lockOwner(conn, ref);
  if (!owner || owner.ref !== ref) throw new ApiError('NOT_FOUND', message);
  const [row] = await reservationsRepo.findReservations(conn, { ref });
  return row;
}

function detectProof(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const ascii = (from, to) => buffer.subarray(from, to).toString('latin1');
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buffer[0] === 0x89 && ascii(1, 4) === 'PNG') return { mime: 'image/png', ext: 'png' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}


export async function listPayments({ customerId } = {}) {
  return (await repo.findPayments(pool, { customerId })).map(enrich);
}

export async function listBalances() {
  const rows = await reservationsRepo.findReservations(pool);
  return rows
    .filter(({ reservation }) => !['pending', 'declined', 'cancelled'].includes(reservation.status))
    .sort((a, b) => byEventDate(a.reservation, b.reservation))
    .map(({ reservation: r, customerName, payments, refunds, pendingQrs }) => {
      const open = openQrIn(pendingQrs);
      return {
        ref: r.ref,
        eventName: r.eventName,
        date: r.date,
        status: r.status,
        downpaymentDue: r.downpaymentDue,
        customerId: r.customerId,
        customerName: customerName ?? '',
        ...financials(r, payments, refunds),
        payments: inMadeOrder(payments).map((payment) =>
          enrich({ payment, eventName: r.eventName, eventDate: r.date, customerName: customerName ?? '' })
        ),
        openQr: open ? { id: open.id, amount: open.amount, expiresAt: open.expiresAt } : null
      };
    });
}

export async function paymentOptions() {
  return { qr: qrReady() };
}

export async function getProof(id, { customerId } = {}) {
  const proof = await repo.findProof(pool, id);
  if (!proof || proof.id !== id || (customerId != null && proof.customerId !== customerId))
    throw new ApiError('NOT_FOUND', 'Payment not found.');
  if (!proof.key) throw new ApiError('NOT_FOUND', 'No file was uploaded for this payment.');
  return { key: proof.key, mime: proof.mime, name: proof.name };
}


export async function submitPayment(customer, { ref, method, amount, referenceNo, proofName }, file) {
  let savedKey = null;
  try {
    return await tx(async (conn) => {
      const owner = await reservationsRepo.lockOwner(conn, ref);
      if (!owner || owner.ref !== ref || owner.customerId !== customer.id)
        throw new ApiError('NOT_FOUND', 'We could not find this reservation.');
      const [row] = await reservationsRepo.findReservations(conn, { ref });
      const reservation = row.reservation;
      if (!CUSTOMER_PAYABLE.includes(reservation.status))
        throw new ApiError('INVALID_STATE', 'Payments open once your reservation is approved.');
      if (method === 'cash') throw invalid('Cash payments are paid on site and recorded by Tres Marias.');
      if (method === 'gcash') throw invalid('GCash, Maya and bank apps pay by scanning the QR Ph code.', 'method');
      if (method !== 'bank') throw invalid('Choose how you paid.', 'method');
      const money = financials(reservation, row.payments, row.refunds);
      if (money.awaitingCount > 0)
        throw new ApiError('PENDING_PAYMENT', 'A payment for this reservation is still being verified.');
      const open = await openQrOf(conn, ref);
      if (open) throw openQrError(open, 'customer');
      const value = Math.round(Number(amount));
      const amountProblem = paymentAmountProblem(money, value);
      if (amountProblem) throw invalid(amountProblem, 'amount');
      const reference = String(referenceNo || '').trim();
      const referenceIssue = referenceProblem(reference);
      if (referenceIssue) throw invalid(referenceIssue, 'referenceNo');
      if (await repo.referenceTaken(conn, referenceKey(reference))) {
        throw invalid(
          'This reference number was already used for another payment. Check the number on your receipt.',
          'referenceNo'
        );
      }
      if (!file) throw invalid('Upload a photo or screenshot of your bank receipt.', 'proof');
      const type = PROOF_TYPES.includes(file.mimetype) ? detectProof(file.buffer) : null;
      if (!type) throw invalid('Upload a photo or screenshot of your receipt (JPG, PNG or WebP).', 'proof');
      const fileName = proofFileName(proofName || file.originalname) || `receipt.${type.ext}`;

      const kind = kindOf(money, value);
      const payment = {
        id: `pay-${String(await nextCounter(conn, 'payment')).padStart(4, '0')}`,
        ref,
        customerId: customer.id,
        amount: value,
        kind,
        method,
        referenceNo: reference,
        proofName: fileName,
        status: 'awaiting',
        submittedAt: now(),
        verifiedAt: null,
        receiptNo: '',
        rejectReason: ''
      };
      savedKey = await storage.put(`proofs/${crypto.randomUUID()}.${type.ext}`, file.buffer);
      await repo.insertPayment(conn, payment, { key: savedKey, mime: type.mime, size: file.buffer.length });
      await reservationsRepo.insertActivity(conn, ref, {
        at: now(),
        actor: customer.name,
        text: `Submitted a ${kind} payment of ₱${value.toLocaleString('en-PH')} via ${PAYMENT_METHODS[method]}.`
      });
      return enrich({
        payment,
        eventName: reservation.eventName,
        eventDate: reservation.date,
        customerName: customer.name
      });
    });
  } catch (err) {
    if (savedKey)
      await storage
        .remove(savedKey)
        .catch((removeErr) => console.error('[payments] could not remove', savedKey, removeErr.message));
    throw err;
  }
}


async function applyVerifiedPayment(conn, row, payment, actorName, senderName = actorName) {
  const reservation = row.reservation;
  const payments = [...row.payments.filter((p) => p.id !== payment.id), payment];
  const money = financials(reservation, payments, row.refunds);
  const status = statusForPayments(reservation.status, money);
  await reservationsRepo.insertActivity(conn, reservation.ref, {
    at: now(),
    actor: actorName,
    text: `Verified a ${payment.kind} payment of ₱${payment.amount.toLocaleString('en-PH')} (${payment.receiptNo}).`
  });
  if (status !== reservation.status) {
    await reservationsRepo.updateReservation(conn, reservation.ref, { status });
    await reservationsRepo.insertActivity(conn, reservation.ref, {
      at: now(),
      actor: actorName,
      text: status === 'confirmed' ? 'Booking confirmed after full payment.' : 'Status moved to Downpayment paid.'
    });
  }
  await postAdminMessage(
    conn,
    reservation,
    `We received your payment of ₱${payment.amount.toLocaleString('en-PH')} for ${reservation.eventName}. Receipt ${payment.receiptNo} is now in Documents.`,
    { name: `Receipt-${payment.receiptNo}.pdf`, kind: 'receipt', ref: reservation.ref, paymentId: payment.id },
    senderName
  );
  await queueCustomerEmail(conn, {
    customerId: reservation.customerId,
    ref: reservation.ref,
    purpose: 'payment_received',
    data: {
      reservation,
      payment: {
        amount: payment.amount,
        method: payment.method,
        receiptNo: payment.receiptNo,
        verifiedAt: payment.verifiedAt
      },
      paidSoFar: money.paid,
      balance: money.balance,
      statusBefore: reservation.status,
      statusAfter: status
    }
  });
}

async function lockedPayment(conn, id) {
  const found = await repo.findPaymentRef(conn, id);
  if (!found || found.id !== id) throw new ApiError('NOT_FOUND', 'Payment not found.');
  const owner = await reservationsRepo.lockOwner(conn, found.ref);
  const payment = await repo.lockPayment(conn, id);
  if (!payment) throw new ApiError('NOT_FOUND', 'Payment not found.');
  return { owner, payment };
}

export async function verifyPayment(id, admin) {
  return tx(async (conn) => {
    const { owner, payment } = await lockedPayment(conn, id);
    if (payment.status !== 'awaiting') throw new ApiError('INVALID_STATE', 'This payment has already been processed.');
    if (!owner) throw new ApiError('NOT_FOUND', 'Reservation not found.');
    const [row] = await reservationsRepo.findReservations(conn, { ref: owner.ref });
    const reservation = row.reservation;
    if (!PAYABLE.includes(reservation.status)) {
      throw new ApiError(
        'INVALID_STATE',
        `This reservation is ${statusLabel(reservation.status).toLowerCase()}. Reject the payment and arrange any refund with the customer.`
      );
    }
    const money = financials(reservation, row.payments, row.refunds);
    if (payment.amount > money.balance) {
      throw new ApiError(
        'OVER_BALANCE',
        `This payment of ₱${payment.amount.toLocaleString('en-PH')} is more than the remaining balance of ₱${money.balance.toLocaleString('en-PH')}. Reject it and ask the customer to send the correct amount.`
      );
    }
    const verified = {
      ...payment,
      kind: kindOf(money, payment.amount),
      status: 'verified',
      verifiedAt: now(),
      receiptNo: `OR-${await nextCounter(conn, 'receipt')}`
    };
    await repo.markVerified(conn, id, {
      kind: verified.kind,
      receiptNo: verified.receiptNo,
      verifiedAt: verified.verifiedAt,
      verifiedBy: admin.id
    });
    await applyVerifiedPayment(conn, row, verified, admin.name);
    return enrich({
      payment: verified,
      eventName: reservation.eventName,
      eventDate: reservation.date,
      customerName: row.customerName ?? ''
    });
  });
}

export async function rejectPayment(id, reason, admin) {
  const text = String(reason || '').trim();
  if (text.length < 5) throw invalid('Please give a short reason (at least 5 characters).', 'reason');
  return tx(async (conn) => {
    const { owner, payment } = await lockedPayment(conn, id);
    if (payment.status !== 'awaiting') throw new ApiError('INVALID_STATE', 'This payment has already been processed.');
    const [row] = await reservationsRepo.findReservations(conn, { ref: owner.ref });
    const reservation = row.reservation;
    await repo.markRejected(conn, id, text);
    await reservationsRepo.insertActivity(conn, reservation.ref, {
      at: now(),
      actor: admin.name,
      text: `Rejected a payment of ₱${payment.amount.toLocaleString('en-PH')}. Reason: ${text}`
    });
    await postAdminMessage(
      conn,
      reservation,
      `We could not verify your payment of ₱${payment.amount.toLocaleString('en-PH')} for ${reservation.eventName}. ${text} Please submit it again from Payments.`,
      null,
      admin.name
    );
    await queueCustomerEmail(conn, {
      customerId: reservation.customerId,
      ref: reservation.ref,
      purpose: 'payment_rejected',
      data: {
        reservation,
        payment: { amount: payment.amount, method: payment.method, submittedAt: payment.submittedAt },
        reason: text
      }
    });
    return enrich({
      payment: { ...payment, status: 'rejected', rejectReason: text },
      eventName: reservation.eventName,
      eventDate: reservation.date,
      customerName: row.customerName ?? ''
    });
  });
}

export async function recordCashPayment(ref, amount, admin) {
  return tx(async (conn) => {
    const row = await lockedReservation(conn, ref, 'Reservation not found.');
    const reservation = row.reservation;
    if (!PAYABLE.includes(reservation.status))
      throw new ApiError('INVALID_STATE', 'Payments can be recorded once the reservation is approved.');
    const money = financials(reservation, row.payments, row.refunds);
    if (money.awaitingCount > 0) {
      throw new ApiError(
        'PENDING_PAYMENT',
        'A customer payment for this reservation is waiting for verification. Verify or reject it first.',
        { field: 'amount' }
      );
    }
    const open = await openQrOf(conn, ref);
    if (open) {
      const refusal = openQrError(open, 'admin');
      refusal.meta.field = 'amount';
      throw refusal;
    }
    const value = Math.round(Number(amount));
    if (!value || value <= 0) throw invalid('Enter the amount received.', 'amount');
    if (value > money.balance)
      throw invalid(`The remaining balance is ₱${money.balance.toLocaleString('en-PH')}.`, 'amount');

    const id = `pay-${String(await nextCounter(conn, 'payment')).padStart(4, '0')}`;
    const at = now();
    const payment = {
      id,
      ref,
      customerId: reservation.customerId,
      amount: value,
      kind: kindOf(money, value),
      method: 'cash',
      referenceNo: '',
      proofName: '',
      status: 'verified',
      submittedAt: at,
      verifiedAt: at,
      receiptNo: `OR-${await nextCounter(conn, 'receipt')}`,
      rejectReason: ''
    };
    await repo.insertPayment(conn, payment, null, admin.id);
    await applyVerifiedPayment(conn, row, payment, admin.name);
    return enrich({
      payment,
      eventName: reservation.eventName,
      eventDate: reservation.date,
      customerName: row.customerName ?? ''
    });
  });
}

function reminderDue(reservation, money) {
  const tense = (iso) => (daysFromToday(iso) < 0 ? 'was' : 'is');
  const least = Math.min(money.downpayment - money.paid, money.balance);
  return !money.downpaymentPaid && reservation.downpaymentDue
    ? `${money.paid > 0 ? `The rest of your downpayment, at least ${pesoText(least)},` : `A downpayment of at least ${pesoText(least)}`} ${tense(reservation.downpaymentDue)} due on ${formatDate(reservation.downpaymentDue)}.${least < money.balance ? ` You can pay more, up to the full balance of ${pesoText(money.balance)}.` : ''}`
    : `The remaining balance of ${pesoText(money.balance)} ${tense(reservation.date)} due on the event day, ${formatDate(reservation.date)}. You can pay it in parts before then.`;
}

export async function sendPaymentReminder(ref, admin) {
  return tx(async (conn) => {
    const row = await lockedReservation(conn, ref, 'Reservation not found.');
    const reservation = row.reservation;
    if (!PAYABLE.includes(reservation.status))
      throw new ApiError('INVALID_STATE', 'Reminders can be sent once the reservation is approved.');
    const money = financials(reservation, row.payments, row.refunds);
    if (money.balance <= 0) throw new ApiError('INVALID_STATE', 'This reservation is already fully paid.');
    const due = reminderDue(reservation, money);
    await postAdminMessage(
      conn,
      reservation,
      `A friendly reminder for ${reservation.eventName}: ${due}`,
      null,
      admin.name
    );
    await reservationsRepo.insertActivity(conn, ref, {
      at: now(),
      actor: admin.name,
      text: 'Sent a payment reminder.'
    });
    const recent = await emailedRecently(conn, {
      purpose: 'payment_reminder',
      ref: reservation.ref,
      withinMs: REMINDER_EMAIL_GAP_MS
    });
    const outboxId = recent
      ? null
      : await queueCustomerEmail(conn, {
          customerId: reservation.customerId,
          ref: reservation.ref,
          purpose: 'payment_reminder',
          data: { reservation, dueText: due }
        });
    return { ok: true, emailed: Boolean(outboxId) };
  });
}


export async function recordRefund(ref, { amount, method, referenceNo = '', sentOn, reason = '' }, admin) {
  return tx(async (conn) => {
    const row = await lockedReservation(conn, ref, 'Reservation not found.');
    const reservation = row.reservation;
    const money = financials(reservation, row.payments, row.refunds);
    if (money.refundDue <= 0) throw new ApiError('INVALID_STATE', 'Nothing to refund on this reservation.');
    const kind = ['cancelled', 'declined'].includes(reservation.status) ? 'cancellation' : 'overpayment';

    const least = kind === 'cancellation' ? 0 : 1;
    const value = typeof amount === 'number' ? amount : NaN;
    if (!Number.isInteger(value) || value < least || value > money.refundDue) {
      throw invalid(`Enter a whole amount from ${pesoText(least)} to ${pesoText(money.refundDue)}.`, 'amount');
    }
    if (kind === 'overpayment' && value !== money.refundDue)
      throw invalid(`Return the whole overpayment of ${pesoText(money.refundDue)}.`, 'amount');
    const why = String(reason || '').trim();
    if (value < money.refundDue && why.length < 5) {
      throw invalid(
        `Tell the customer why ${value > 0 ? 'part of ' : ''}the payment is kept (at least 5 characters).`,
        'reason'
      );
    }
    const sent = value > 0;
    if (sent && !['gcash', 'bank', 'cash'].includes(method)) throw invalid('Choose how the refund was sent.', 'method');
    const reference = !sent || method === 'cash' ? '' : String(referenceNo || '').trim();
    if (sent && method !== 'cash' && !reference)
      throw invalid('Enter the reference number of the refund.', 'referenceNo');
    if (sent && method !== 'cash' && referenceProblem(reference))
      throw invalid(referenceProblem(reference), 'referenceNo');
    if (sent && !isISODate(sentOn)) throw invalid('Enter the date the refund was sent.', 'sentOn');
    if (sent && sentOn > todayISO()) throw invalid('The date sent cannot be later than today.', 'sentOn');

    const kept = money.refundDue - value;
    const refund = {
      id: `rf-${String(await nextCounter(conn, 'refund')).padStart(4, '0')}`,
      ref,
      customerId: reservation.customerId,
      kind,
      amount: value,
      due: money.refundDue,
      method: sent ? method : '',
      referenceNo: reference,
      sentOn: sent ? sentOn : todayISO(),
      reason: kept > 0 ? why : '',
      recordedAt: now(),
      recordedBy: admin.name
    };
    await repo.insertRefund(conn, refund, admin.id);

    const via = sent ? `${REFUND_METHODS[method]}${reference ? ` (Ref ${reference})` : ''}` : '';
    let logText;
    let chatText;
    if (kind === 'overpayment') {
      logText = `Recorded a refund of the overpayment, ${pesoText(value)} via ${via}, sent ${formatDate(sentOn)}. Paid from ${pesoText(money.paid)} to ${pesoText(money.paid - value)}, the total of ${pesoText(money.total)}.`;
      chatText = `We returned ${pesoText(value)} for ${reservation.eventName} on ${formatDate(sentOn)} via ${via}: the amount you paid above your new total.`;
    } else if (sent) {
      logText = `Recorded a refund of ${pesoText(value)} via ${via}, sent ${formatDate(sentOn)}. Paid ${pesoText(money.refundDue)}, returned ${pesoText(value)}, kept ${pesoText(kept)}.${kept > 0 ? ` Reason: ${why}` : ''}`;
      chatText = `We returned ${pesoText(value)} for ${reservation.eventName} on ${formatDate(sentOn)} via ${via}.${kept > 0 ? ` We kept ${pesoText(kept)}: ${why}` : ''}`;
    } else {
      logText = `Recorded that nothing is returned. Paid ${pesoText(money.refundDue)}, returned ₱0, kept ${pesoText(kept)}. Reason: ${why}`;
      chatText = `We kept the ${pesoText(kept)} paid for ${reservation.eventName}: ${why}`;
    }
    await reservationsRepo.insertActivity(conn, ref, { at: now(), actor: admin.name, text: logText });
    await postAdminMessage(conn, reservation, chatText, null, admin.name);
    return enrichRefund({
      refund,
      eventName: reservation.eventName,
      eventDate: reservation.date,
      customerName: row.customerName ?? ''
    });
  });
}

export async function listRefunds({ customerId } = {}) {
  return (await repo.findRefunds(pool, { customerId })).map(enrichRefund);
}

export async function listRefundsDue() {
  const rows = await reservationsRepo.findReservations(pool);
  return rows
    .map((row) => ({ row, money: financials(row.reservation, row.payments, row.refunds) }))
    .filter(({ money }) => money.refundDue > 0)
    .sort((a, b) => byEventDate(a.row.reservation, b.row.reservation))
    .map(({ row, money }) => {
      const r = row.reservation;
      return {
        ref: r.ref,
        eventName: r.eventName,
        date: r.date,
        status: r.status,
        customerId: r.customerId,
        customerName: row.customerName ?? '',
        why:
          r.status === 'cancelled'
            ? r.cancelledBy === 'admin'
              ? 'admin'
              : 'customer'
            : r.status === 'declined'
              ? 'declined'
              : 'overpaid',
        refundDue: money.refundDue,
        paid: money.paid,
        total: money.total
      };
    });
}


const isOpen = (qr, at = now()) => qr.status === 'pending' && at < qr.expiresAt + QR_GRACE_MS;

export function openQrIn(pendingQrs = [], at = now()) {
  const open = pendingQrs.find((qr) => isOpen(qr, at));
  return open
    ? { id: open.id, amount: open.amount, expiresAt: open.expiresAt, openUntil: open.expiresAt + QR_GRACE_MS }
    : null;
}

export function openQrError(open, side) {
  return side === 'admin'
    ? new ApiError(
        'PENDING_PAYMENT',
        `The customer has a QR Ph payment open until ${clockText(open.expiresAt)}. Try again after it expires.`,
        { expiresAt: open.expiresAt }
      )
    : new ApiError(
        'PENDING_PAYMENT',
        `Your QR Ph payment of ${pesoText(open.amount)} is still open. Pay it, or wait until it expires at ${clockText(open.expiresAt)}.`,
        { expiresAt: open.expiresAt }
      );
}

async function openQrOf(db, ref) {
  return (await repo.findPendingQrs(db, ref)).find((qr) => isOpen(qr)) || null;
}

const qrView = (qr) => ({
  id: qr.id,
  ref: qr.ref,
  amount: qr.amount,
  expiresAt: qr.expiresAt,
  status: qr.status,
  receiptNo: qr.receiptNo || '',
  ...(qr.qrImage !== undefined ? { qrImage: qr.qrImage } : {})
});

async function noteEvent(conn, event) {
  try {
    await repo.insertWebhookEvent(conn, {
      id: event.id,
      type: event.attributes.type,
      livemode: Boolean(event.attributes.livemode),
      receivedAt: now()
    });
    return true;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return false;
    throw err;
  }
}

async function settleQr(qr, intent, event = null) {
  if (intent.amount !== qr.amount * 100) {
    console.error('[paymongo] amount does not match for', qr.id, intent.id);
    return false;
  }
  let settled = false;
  await tx(async (conn) => {
    if (event && !(await noteEvent(conn, event))) return;
    const owner = await reservationsRepo.lockOwner(conn, qr.ref);
    const locked = await repo.lockQr(conn, qr.id);
    if (!owner || !locked || locked.status === 'paid') return;
    const [row] = await reservationsRepo.findReservations(conn, { ref: owner.ref });
    const reservation = row.reservation;
    const money = financials(reservation, row.payments, row.refunds);
    const at = now();
    const payment = {
      id: `pay-${String(await nextCounter(conn, 'payment')).padStart(4, '0')}`,
      ref: reservation.ref,
      customerId: reservation.customerId,
      amount: locked.amount,
      kind: kindOf(money, locked.amount),
      method: 'qrph',
      referenceNo: intent.paid.id,
      proofName: '',
      status: 'verified',
      submittedAt: intent.paid.paidAt,
      verifiedAt: at,
      receiptNo: `OR-${await nextCounter(conn, 'receipt')}`,
      rejectReason: ''
    };
    await repo.insertPayment(conn, payment);
    await applyVerifiedPayment(conn, row, payment, PAYMONGO_NAME, TEAM_NAME);
    const extra = PAYABLE.includes(reservation.status) ? Math.max(0, locked.amount - money.balance) : locked.amount;
    if (extra > 0) {
      await reservationsRepo.insertActivity(conn, reservation.ref, {
        at: now(),
        actor: PAYMONGO_NAME,
        text: PAYABLE.includes(reservation.status)
          ? `Received ${pesoText(extra)} more than the balance — refund it and record the refund.`
          : `Received ${pesoText(extra)} after the reservation was ${statusLabel(reservation.status).toLowerCase()} — refund it and record the refund.`
      });
    }
    await repo.updateQr(conn, qr.id, {
      status: 'paid',
      paidAt: intent.paid.paidAt,
      paymentId: payment.id,
      providerPaymentId: intent.paid.id,
      lastCheckedAt: at
    });
    settled = true;
  });
  if (settled) await bumpStamp().catch((err) => console.error('[payments] change stamp:', err.message));
  return settled;
}

async function closeQr(qr, status, { reason = '', event = null } = {}) {
  let closed = false;
  await tx(async (conn) => {
    if (event && !(await noteEvent(conn, event))) return;
    await reservationsRepo.lockOwner(conn, qr.ref);
    const locked = await repo.lockQr(conn, qr.id);
    if (!locked || locked.status !== 'pending') return;
    await repo.updateQr(conn, qr.id, {
      status,
      failureReason: reason ? reason.slice(0, 500) : null,
      lastCheckedAt: now()
    });
    await reservationsRepo.insertActivity(conn, qr.ref, {
      at: now(),
      actor: PAYMONGO_NAME,
      text:
        status === 'expired'
          ? `The QR Ph payment of ${pesoText(qr.amount)} expired without being paid.`
          : `The QR Ph payment of ${pesoText(qr.amount)} did not go through${reason ? `: ${reason}` : '.'}`
    });
    if (status === 'failed') {
      const [row] = await reservationsRepo.findReservations(conn, { ref: qr.ref });
      if (row) {
        await queueCustomerEmail(conn, {
          customerId: row.reservation.customerId,
          ref: row.reservation.ref,
          purpose: 'qr_payment_failed',
          data: { reservation: row.reservation, amount: qr.amount }
        });
      }
    }
    closed = true;
  });
  if (closed) await bumpStamp().catch((err) => console.error('[payments] change stamp:', err.message));
  return closed;
}

async function refreshQr(qr, { force = false } = {}) {
  if (qr.status !== 'pending') return;
  const at = now();
  const late = at >= qr.expiresAt;
  if (!force && at - (qr.lastCheckedAt || qr.createdAt) < (late ? QR_CHECK_LATE_MS : QR_CHECK_MS)) return;
  let intent;
  try {
    intent = await getIntent(qr.intentId);
  } catch {
    return;
  }
  if (intent.status === 'succeeded' && intent.paid) await settleQr(qr, intent);
  else if (at >= qr.expiresAt + QR_GRACE_MS && intent.status !== 'processing') await closeQr(qr, 'expired');
  else await repo.updateQr(pool, qr.id, { lastCheckedAt: at });
}

async function qrRules(db, customer, ref, value, { lock = false } = {}) {
  if (lock) await reservationsRepo.lockOwner(db, ref);
  const [row] = await reservationsRepo.findReservations(db, { ref });
  if (!row || row.reservation.ref !== ref || row.reservation.customerId !== customer.id)
    throw new ApiError('NOT_FOUND', 'We could not find this reservation.');
  const reservation = row.reservation;
  if (!CUSTOMER_PAYABLE.includes(reservation.status))
    throw new ApiError('INVALID_STATE', 'Payments open once your reservation is approved.');
  const money = financials(reservation, row.payments, row.refunds);
  if (money.awaitingCount > 0)
    throw new ApiError('PENDING_PAYMENT', 'A payment for this reservation is still being verified.');
  const open = await openQrOf(db, ref);
  if (open) {
    if (open.amount === value) return { existing: open };
    throw new ApiError(
      'PENDING_PAYMENT',
      `You have a QR Ph code for ${pesoText(open.amount)} open until ${clockText(open.expiresAt)}. Pay that one, or wait until it expires to choose another amount.`,
      { field: 'amount', expiresAt: open.expiresAt }
    );
  }
  const problem = paymentAmountProblem(money, value);
  if (problem) throw invalid(problem, 'amount');
  return { existing: null };
}

export async function startQrPayment(customer, { ref, amount }) {
  if (!qrReady()) throw new ApiError('INVALID_STATE', 'QR Ph payments are not available right now.');
  const value = Math.round(Number(amount));
  const [own] = await reservationsRepo.findReservations(pool, { ref });
  if (!own || own.reservation.ref !== ref || own.reservation.customerId !== customer.id)
    throw new ApiError('NOT_FOUND', 'We could not find this reservation.');
  for (const qr of await repo.findPendingQrs(pool, ref)) {
    if (now() >= qr.expiresAt) await refreshQr(qr, { force: true });
  }
  const checked = await qrRules(pool, customer, ref, value);
  if (checked.existing) return qrView(await repo.findQr(pool, checked.existing.id, { image: true }));

  const made = await createQrPh({
    amount: value,
    description: `Tres Marias ${ref}`,
    metadata: { ref, customer_id: customer.id }
  });
  const answer = await tx(async (conn) => {
    const again = await qrRules(conn, customer, ref, value, { lock: true });
    if (again.existing) return { existingId: again.existing.id };
    const qr = {
      id: newId('qr'),
      ref,
      customerId: customer.id,
      amount: value,
      intentId: made.intentId,
      codeId: made.codeId,
      qrImage: made.qrImage,
      expiresAt: made.expiresAt,
      createdAt: now()
    };
    await repo.insertQr(conn, qr);
    await reservationsRepo.insertActivity(conn, ref, {
      at: now(),
      actor: customer.name,
      text: `Opened a QR Ph payment of ${pesoText(value)}.`
    });
    return qrView({ ...qr, status: 'pending', receiptNo: '' });
  });
  if (answer.existingId) return qrView(await repo.findQr(pool, answer.existingId, { image: true }));
  if (made.testUrl)
    console.log(`\n[PAYMONGO TEST] ${ref} · ${pesoText(value)} · simulate paying or failing: ${made.testUrl}\n`);
  return answer;
}

export async function getQrPayment(customer, id, { image = false } = {}) {
  const qr = await repo.findQr(pool, id);
  if (!qr || qr.id !== id || qr.customerId !== customer.id)
    throw new ApiError('NOT_FOUND', 'We could not find this QR payment.');
  await refreshQr(qr);
  return qrView(await repo.findQr(pool, id, { image }));
}

const qrRecord = ({ qr, eventName, eventDate, customerName }) => ({
  id: qr.id,
  ref: qr.ref,
  amount: qr.amount,
  status: qr.status,
  expiresAt: qr.expiresAt,
  createdAt: qr.createdAt,
  paidAt: qr.paidAt ?? null,
  receiptNo: qr.receiptNo || '',
  failureReason: qr.failureReason || '',
  eventName,
  eventDate,
  customerName
});

export async function listQrPayments({ customerId, ref } = {}) {
  const filter = { customerId, ref };
  if (qrReady()) {
    const stale = (await repo.findQrs(pool, { ...filter, status: 'pending' }))
      .filter(({ qr }) => now() >= qr.expiresAt && !settling.has(qr.id))
      .slice(0, QR_SETTLE_MAX);
    const checks = stale.map(({ qr }) => {
      settling.add(qr.id);
      return refreshQr(qr)
        .catch((err) => console.error('[payments] QR check:', qr.id, err.message))
        .finally(() => settling.delete(qr.id));
    });
    if (checks.length) {
      let timer;
      await Promise.race([
        Promise.all(checks),
        new Promise((resolve) => (timer = setTimeout(resolve, QR_SETTLE_WAIT_MS)))
      ]);
      clearTimeout(timer);
    }
  }
  const rows = await repo.findQrs(pool, filter);
  return rows.filter(({ qr }) => ref == null || qr.ref === ref).map(qrRecord);
}

const EXPIRY_EVENTS = ['qr.expired', 'qrph.expired'];

export async function handlePaymongoEvent(event) {
  const type = event.attributes && event.attributes.type;
  const resource = (event.attributes && event.attributes.data) || {};
  const attrs = resource.attributes || {};
  if (!['payment.paid', 'payment.failed', ...EXPIRY_EVENTS].includes(type)) return 'ignored';
  const intentId = attrs.payment_intent_id;
  const codeId =
    EXPIRY_EVENTS.includes(type) && typeof resource.id === 'string' && resource.id.startsWith('qr_') ? resource.id : '';
  const qr = intentId
    ? await repo.findQrByIntent(pool, intentId)
    : codeId
      ? await repo.findQrByCode(pool, codeId)
      : null;
  if (!qr) return 'ignored';
  if (type === 'payment.paid') {
    const intent = await getIntent(qr.intentId);
    if (intent.status !== 'succeeded' || !intent.paid)
      throw new Error(`intent ${qr.intentId} is ${intent.status}, not succeeded yet`);
    return (await settleQr(qr, intent, event)) ? 'paid' : 'already recorded';
  }
  if (type === 'payment.failed') {
    return (await closeQr(qr, 'failed', { reason: String(attrs.failed_message || attrs.failed_code || ''), event }))
      ? 'failed'
      : 'already closed';
  }
  if (qr.status !== 'pending') return 'already closed';
  const intent = await getIntent(qr.intentId);
  if (intent.status === 'succeeded' && intent.paid)
    return (await settleQr(qr, intent, event)) ? 'paid' : 'already recorded';
  if (intent.status === 'processing') return 'still processing';
  return (await closeQr(qr, 'expired', { event })) ? 'expired' : 'already closed';
}
