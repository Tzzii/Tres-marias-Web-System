import crypto from 'node:crypto';
import { financials, statusForPayments } from '@tm/shared/src/domain/money.js';
import { QR_GRACE_MS, kindOf, paymentAmountProblem, proofFileName, referenceKey, referenceProblem } from '@tm/shared/src/domain/payment.js';
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

/**
 * Payments and refunds on the server (Phase 8, docs/backend-development-phases.md): the rules,
 * messages, audit-trail entries and chat messages of bank transfers, cash, the GCash QR (Phase 8B) and
 * refunds. Until Phase 12 a browser copy of these rules existed, and the Phase 8 tests compared the two
 * step by step; the shared rules now live in @tm/shared/src/domain/payment.js and money.js.
 *
 * Three ways to pay (owner's decision, 2026-09-30): a bank transfer the customer sends with its reference
 * number and a photo of the receipt (verified here by the admin), cash the admin records, and the GCash /
 * e-wallet QR through PayMongo (Phase 8B). There is no manual GCash payment.
 *
 * Every write runs in one transaction and locks in the order of Phase 6: the reservation's row first
 * (lockOwner, exact ref), then the payment's or QR's row, then the counters (payment, receipt, refund),
 * and the chat thread last (postAdminMessage); a webhook event's row comes before all of them. There is
 * no availability lock: approved, downpayment_paid and confirmed all hold the date, so a payment never
 * frees or takes a slot.
 * The customer is always req.user (from the token); so is the admin named in the audit trail and chat.
 * PayMongo is never called while a transaction is open: a QR is made before its row is saved, and a
 * webhook's payment is read from PayMongo before it is recorded.
 *
 * Customer emails (Phase 13A, modules/notify): a payment received, a bank transfer rejected, a QR Ph
 * payment that failed and the payment reminder also go to the customer by email, queued in the same
 * transaction after every check passed and the change is written (queueCustomerEmail, after the chat
 * message), and sent only after the commit, so a refused or rolled-back action sends nothing. The
 * recipient is always the booking's customer (reservation.customerId, from the database).
 */

// Reservation statuses that can take payments (approved and later, but not declined or cancelled)
const PAYABLE = ['approved', 'downpayment_paid', 'confirmed', 'completed'];
// The statuses in which the customer can pay online (a completed event is settled on site)
const CUSTOMER_PAYABLE = ['approved', 'downpayment_paid', 'confirmed'];
// Proof files the form accepts, by what their first bytes say they are (never by the name or the browser's word).
// Photos only since 2026-10-03 (owner: a customer could tap a document by mistake); PDF receipts sent
// before then are still stored and shown to the admin as they are.
const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// A GCash QR still counts as open for QR_GRACE_MS (2 minutes, domain/payment.js, which the pages share)
// after PayMongo's expiry: a payment started in its last seconds may still be on its way, so no other
// payment or new QR may start before it is settled. PayMongo's own qr.expired event closes it at once
// instead (handlePaymongoEvent), since PayMongo then says the code can no longer be paid.
// How often a waiting QR is checked with PayMongo when its page asks (in case the webhook is late or
// never comes), and how often once it is past its time
const QR_CHECK_MS = 60 * 1000;
const QR_CHECK_LATE_MS = 10 * 1000;
// Most QRs past their time one list read checks with PayMongo (listQrPayments); the rest wait for the next read
const QR_SETTLE_MAX = 5;
// How long a list read waits for those checks before answering; a slower check goes on by itself and
// tells the pages through the change stamp when it records something
const QR_SETTLE_WAIT_MS = 3000;
// QRs a list read is checking with PayMongo right now, so overlapping reads don't ask about them twice
const settling = new Set();
// Who PayMongo's confirmations are from in the audit trail, and who the automatic chat messages are from
const PAYMONGO_NAME = 'PayMongo';
const TEAM_NAME = 'Tres Marias team';
// At most one payment reminder EMAIL per booking in this time (the chat reminder is posted every time)
const REMINDER_EMAIL_GAP_MS = 12 * 60 * 60 * 1000;

// "₱1,200"
const pesoText = (value) => `₱${Number(value).toLocaleString('en-PH')}`;
// "3:45 PM" on the business's clock
const clockText = (ms) => new Date(ms).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: config.timeZone });
const invalid = (message, field) => new ApiError('INVALID', message, field ? { field } : {});

// Payment plus event name/date, customer name and readable method label (what the payment lists show)
const enrich = ({ payment, eventName, eventDate, customerName }) => ({ ...payment, eventName, eventDate, customerName, methodLabel: PAYMENT_METHODS[payment.method] });

// Refund plus event name/date, customer name and method label ('' for a refund of ₱0, which was never sent)
const enrichRefund = ({ refund, eventName, eventDate, customerName }) => ({ ...refund, eventName, eventDate, customerName, methodLabel: REFUND_METHODS[refund.method] || '' });

// A booking's payments in the order they were made (pay-0001 before pay-0002)
const inMadeOrder = (payments) => [...payments].sort((a, b) => Number(a.id.slice(4)) - Number(b.id.slice(4)) || a.id.localeCompare(b.id));

// Reservations by event date; the same date in the order they were requested
const byEventDate = (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt || a.ref.localeCompare(b.ref);

/**
 * The reservation `ref` with its payments and refunds (findReservations' row), read inside the
 * transaction after lockOwner, or a NOT_FOUND with `message` when there is none (or the ref differs in
 * case or trailing spaces from the stored one).
 */
async function lockedReservation(conn, ref, message) {
  const owner = await reservationsRepo.lockOwner(conn, ref);
  if (!owner || owner.ref !== ref) throw new ApiError('NOT_FOUND', message);
  const [row] = await reservationsRepo.findReservations(conn, { ref });
  return row;
}

/**
 * What an uploaded file really is, from its first bytes: { mime, ext } for a JPG, PNG or WebP photo, or
 * null for anything else (a PDF or other document, or an .exe renamed .jpg).
 */
function detectProof(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const ascii = (from, to) => buffer.subarray(from, to).toString('latin1');
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buffer[0] === 0x89 && ascii(1, 4) === 'PNG') return { mime: 'image/png', ext: 'png' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/* ============================ Reads ============================ */

/** All payments (admin) or one customer's, newest first, with event name/date, customer name and method label. */
export async function listPayments({ customerId } = {}) {
  return (await repo.findPayments(pool, { customerId })).map(enrich);
}

/**
 * One row per reservation with money attached, for the admin Payments ledger: every booking except
 * pending, declined and cancelled ones (a cancelled booking with money to return is in listRefundsDue),
 * by event date, with financials() (refunds taken off), its payments in the order they were made, and
 * `openQr`: the customer's QR Ph code still open { id, amount, expiresAt } or null (not money received,
 * so the figures leave it out; the ledger only says it is waiting).
 */
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
        payments: inMadeOrder(payments).map((payment) => enrich({ payment, eventName: r.eventName, eventDate: r.date, customerName: customerName ?? '' })),
        openQr: open ? { id: open.id, amount: open.amount, expiresAt: open.expiresAt } : null
      };
    });
}

/**
 * What the Payments page can offer: { qr } is whether the GCash / e-wallet QR can be used: true once
 * PayMongo's secret key and the webhook's signing secret are both set (Phase 8B).
 */
export async function paymentOptions() {
  return { qr: qrReady() };
}

/**
 * The uploaded proof of a payment, for streaming: { key, mime, name }. The owner (`customerId`) or any
 * admin (no customerId); another customer's payment is 404, the same as one that does not exist.
 * A payment with nothing uploaded (cash, a sample payment, a QR payment) is 404 with its own message.
 */
export async function getProof(id, { customerId } = {}) {
  const proof = await repo.findProof(pool, id);
  if (!proof || proof.id !== id || (customerId != null && proof.customerId !== customerId)) throw new ApiError('NOT_FOUND', 'Payment not found.');
  if (!proof.key) throw new ApiError('NOT_FOUND', 'No file was uploaded for this payment.');
  return { key: proof.key, mime: proof.mime, name: proof.name };
}

/* ============================ Customer ============================ */

/**
 * Customer sends a bank transfer: { ref, method: 'bank', amount, referenceNo, proofName } and the file
 * (multer's req.file). The checks and messages are the Payments page's, in its order; the file is
 * checked where the page checks proofName, by its first bytes. The file is saved only after every
 * check passes, under a random name in uploads/proofs, and removed again if the transaction then fails,
 * so no file is left without its payment. Returns the payment with names and method label.
 */
export async function submitPayment(customer, { ref, method, amount, referenceNo, proofName }, file) {
  let savedKey = null;
  try {
    return await tx(async (conn) => {
      const owner = await reservationsRepo.lockOwner(conn, ref);
      if (!owner || owner.ref !== ref || owner.customerId !== customer.id) throw new ApiError('NOT_FOUND', 'We could not find this reservation.');
      const [row] = await reservationsRepo.findReservations(conn, { ref });
      const reservation = row.reservation;
      if (!CUSTOMER_PAYABLE.includes(reservation.status)) throw new ApiError('INVALID_STATE', 'Payments open once your reservation is approved.');
      if (method === 'cash') throw invalid('Cash payments are paid on site and recorded by Tres Marias.');
      if (method === 'gcash') throw invalid('GCash, Maya and bank apps pay by scanning the QR Ph code.', 'method');
      if (method !== 'bank') throw invalid('Choose how you paid.', 'method');
      // Only one payment can wait for verification at a time, and it can't go over the balance
      const money = financials(reservation, row.payments, row.refunds);
      if (money.awaitingCount > 0) throw new ApiError('PENDING_PAYMENT', 'A payment for this reservation is still being verified.');
      const open = await openQrOf(conn, ref);
      if (open) throw openQrError(open, 'customer');
      const value = Math.round(Number(amount));
      const amountProblem = paymentAmountProblem(money, value);
      if (amountProblem) throw invalid(amountProblem, 'amount');
      const reference = String(referenceNo || '').trim();
      const referenceIssue = referenceProblem(reference);
      if (referenceIssue) throw invalid(referenceIssue, 'referenceNo');
      if (await repo.referenceTaken(conn, referenceKey(reference))) {
        throw invalid('This reference number was already used for another payment. Check the number on your receipt.', 'referenceNo');
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
      return enrich({ payment, eventName: reservation.eventName, eventDate: reservation.date, customerName: customer.name });
    });
  } catch (err) {
    // The payment was not saved: take its file away again (a failed removal is only logged, the error that matters is err)
    if (savedKey) await storage.remove(savedKey).catch((removeErr) => console.error('[payments] could not remove', savedKey, removeErr.message));
    throw err;
  }
}

/* ============================ Admin ============================ */

/**
 * After a payment is verified (or recorded verified): move the status forward (statusForPayments: full
 * payment -> Confirmed, downpayment reached -> Downpayment paid), log it, send the receipt in the
 * customer's chat, and queue the 'payment_received' email (Phase 13A) with what was paid so far and the
 * balance left, both counting this payment, and the status before and after. `row` is the reservation as
 * read before this payment counted; `payment` the verified record; `actorName` the admin, or PayMongo for
 * a GCash QR; `senderName` who the chat message is from (the admin, or the Tres Marias team for
 * PayMongo's confirmations).
 * It covers a bank transfer the admin verified, cash the admin recorded (also after the event) and a
 * QR Ph payment (settleQr). It runs once per payment, so the email goes once: verifyPayment refuses a
 * payment already handled, and settleQr calls it only when it really records the QR payment (a paid QR
 * is left alone), so the webhook, its retries and the page's polling never send a second email.
 */
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
      payment: { amount: payment.amount, method: payment.method, receiptNo: payment.receiptNo, verifiedAt: payment.verifiedAt },
      paidSoFar: money.paid,
      balance: money.balance,
      statusBefore: reservation.status,
      statusAfter: status
    }
  });
}

/**
 * The payment `id` and its reservation, both locked: the payment's ref is read first without a lock,
 * then the reservation's row is locked, then the payment's row, and the payment is read again locked
 * (another admin may have handled it meanwhile). NOT_FOUND "Payment not found." when there is none.
 */
async function lockedPayment(conn, id) {
  const found = await repo.findPaymentRef(conn, id);
  if (!found || found.id !== id) throw new ApiError('NOT_FOUND', 'Payment not found.');
  const owner = await reservationsRepo.lockOwner(conn, found.ref);
  const payment = await repo.lockPayment(conn, id);
  if (!payment) throw new ApiError('NOT_FOUND', 'Payment not found.');
  return { owner, payment };
}

/**
 * Admin: accept a waiting bank transfer and issue the next receipt number (OR-####). Refused when it was
 * already handled (so two admins can't verify it twice), when the booking can no longer take payments,
 * or when it is more than what is still owed (OVER_BALANCE; e.g. cash recorded meanwhile). What it is
 * for (kindOf) is worked out again from what is paid now, so the receipt's label fits even when the
 * quotation changed after it was sent.
 */
export async function verifyPayment(id, admin) {
  return tx(async (conn) => {
    const { owner, payment } = await lockedPayment(conn, id);
    if (payment.status !== 'awaiting') throw new ApiError('INVALID_STATE', 'This payment has already been processed.');
    if (!owner) throw new ApiError('NOT_FOUND', 'Reservation not found.');
    const [row] = await reservationsRepo.findReservations(conn, { ref: owner.ref });
    const reservation = row.reservation;
    if (!PAYABLE.includes(reservation.status)) {
      throw new ApiError('INVALID_STATE', `This reservation is ${statusLabel(reservation.status).toLowerCase()}. Reject the payment and arrange any refund with the customer.`);
    }
    // The waiting payment itself isn't counted in `paid` yet, so the balance is what it may cover
    const money = financials(reservation, row.payments, row.refunds);
    if (payment.amount > money.balance) {
      throw new ApiError('OVER_BALANCE', `This payment of ₱${payment.amount.toLocaleString('en-PH')} is more than the remaining balance of ₱${money.balance.toLocaleString('en-PH')}. Reject it and ask the customer to send the correct amount.`);
    }
    const verified = {
      ...payment,
      kind: kindOf(money, payment.amount),
      status: 'verified',
      verifiedAt: now(),
      receiptNo: `OR-${await nextCounter(conn, 'receipt')}`
    };
    await repo.markVerified(conn, id, { kind: verified.kind, receiptNo: verified.receiptNo, verifiedAt: verified.verifiedAt, verifiedBy: admin.id });
    await applyVerifiedPayment(conn, row, verified, admin.name);
    return enrich({ payment: verified, eventName: reservation.eventName, eventDate: reservation.date, customerName: row.customerName ?? '' });
  });
}

/**
 * Admin: turn down a waiting bank transfer with a reason (at least 5 characters) the customer sees in
 * the payment history, in their chat and in the 'payment_rejected' email (Phase 13A), which is queued
 * only once the payment is marked rejected (a payment already handled is refused and sends nothing).
 */
export async function rejectPayment(id, reason, admin) {
  const text = String(reason || '').trim();
  if (text.length < 5) throw invalid('Please give a short reason (at least 5 characters).', 'reason');
  return tx(async (conn) => {
    const { owner, payment } = await lockedPayment(conn, id);
    if (payment.status !== 'awaiting') throw new ApiError('INVALID_STATE', 'This payment has already been processed.');
    const [row] = await reservationsRepo.findReservations(conn, { ref: owner.ref });
    const reservation = row.reservation;
    await repo.markRejected(conn, id, text);
    await reservationsRepo.insertActivity(conn, reservation.ref, { at: now(), actor: admin.name, text: `Rejected a payment of ₱${payment.amount.toLocaleString('en-PH')}. Reason: ${text}` });
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
      data: { reservation, payment: { amount: payment.amount, method: payment.method, submittedAt: payment.submittedAt }, reason: text }
    });
    return enrich({ payment: { ...payment, status: 'rejected', rejectReason: text }, eventName: reservation.eventName, eventDate: reservation.date, customerName: row.customerName ?? '' });
  });
}

/**
 * Admin: record cash collected on site, verified at once with a receipt: any amount from ₱1 to the
 * balance, even below the minimum downpayment (the booking moves to Downpayment paid once what was paid
 * reaches it). Not while a customer payment is waiting for verification or a GCash QR is open, so the two
 * can't come to more than the balance.
 */
export async function recordCashPayment(ref, amount, admin) {
  return tx(async (conn) => {
    const row = await lockedReservation(conn, ref, 'Reservation not found.');
    const reservation = row.reservation;
    if (!PAYABLE.includes(reservation.status)) throw new ApiError('INVALID_STATE', 'Payments can be recorded once the reservation is approved.');
    const money = financials(reservation, row.payments, row.refunds);
    if (money.awaitingCount > 0) {
      throw new ApiError('PENDING_PAYMENT', 'A customer payment for this reservation is waiting for verification. Verify or reject it first.', { field: 'amount' });
    }
    const open = await openQrOf(conn, ref);
    if (open) {
      const refusal = openQrError(open, 'admin');
      refusal.meta.field = 'amount'; // the cash dialog shows it under the amount, like the waiting-payment refusal
      throw refusal;
    }
    const value = Math.round(Number(amount));
    if (!value || value <= 0) throw invalid('Enter the amount received.', 'amount');
    if (value > money.balance) throw invalid(`The remaining balance is ₱${money.balance.toLocaleString('en-PH')}.`, 'amount');

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
    return enrich({ payment, eventName: reservation.eventName, eventDate: reservation.date, customerName: row.customerName ?? '' });
  });
}

/**
 * The sentence of a payment reminder that says what is due, for the chat message and the reminder email
 * alike (sendPaymentReminder). `money` is financials() of the booking. Before the minimum downpayment is
 * reached it asks for at least the rest of it (they may pay more, up to the whole balance); after that,
 * for the balance, which can be paid in parts before the event day. "is due on" while the date is ahead,
 * "was due on" once it has passed.
 */
function reminderDue(reservation, money) {
  const tense = (iso) => (daysFromToday(iso) < 0 ? 'was' : 'is');
  const least = Math.min(money.downpayment - money.paid, money.balance);
  return !money.downpaymentPaid && reservation.downpaymentDue
    ? `${money.paid > 0 ? `The rest of your downpayment, at least ${pesoText(least)},` : `A downpayment of at least ${pesoText(least)}`} ${tense(reservation.downpaymentDue)} due on ${formatDate(reservation.downpaymentDue)}.${least < money.balance ? ` You can pay more, up to the full balance of ${pesoText(money.balance)}.` : ''}`
    : `The remaining balance of ${pesoText(money.balance)} ${tense(reservation.date)} due on the event day, ${formatDate(reservation.date)}. You can pay it in parts before then.`;
}

/**
 * Admin: remind the customer about the downpayment or the remaining balance (approved bookings and
 * later), in their chat and by email (Phase 13A, 'payment_reminder'), both with reminderDue's sentence.
 * The chat message is posted every time; the email goes at most once per booking every 12 hours
 * (REMINDER_EMAIL_GAP_MS, counted from the outbox by emailedRecently), so repeated clicks don't flood the
 * customer's inbox. Two reminders at once wait for each other on the booking's lock, so the second sees
 * the first one's email. -> { ok: true, emailed }: `emailed` is true when the email was queued, false
 * when one already went out in the last 12 hours or none could be queued (e.g. no email address).
 */
export async function sendPaymentReminder(ref, admin) {
  return tx(async (conn) => {
    const row = await lockedReservation(conn, ref, 'Reservation not found.');
    const reservation = row.reservation;
    if (!PAYABLE.includes(reservation.status)) throw new ApiError('INVALID_STATE', 'Reminders can be sent once the reservation is approved.');
    const money = financials(reservation, row.payments, row.refunds);
    if (money.balance <= 0) throw new ApiError('INVALID_STATE', 'This reservation is already fully paid.');
    const due = reminderDue(reservation, money);
    await postAdminMessage(conn, reservation, `A friendly reminder for ${reservation.eventName}: ${due}`, null, admin.name);
    await reservationsRepo.insertActivity(conn, ref, { at: now(), actor: admin.name, text: 'Sent a payment reminder.' });
    const recent = await emailedRecently(conn, { purpose: 'payment_reminder', ref: reservation.ref, withinMs: REMINDER_EMAIL_GAP_MS });
    const outboxId = recent
      ? null
      : await queueCustomerEmail(conn, { customerId: reservation.customerId, ref: reservation.ref, purpose: 'payment_reminder', data: { reservation, dueText: due } });
    return { ok: true, emailed: Boolean(outboxId) };
  });
}

/* ============================ Refunds ============================ */

/**
 * Admin: record money returned to the customer after it was sent outside the system (the admin's
 * RefundDialog): { amount, method, referenceNo, sentOn, reason }.
 * A cancellation refund (cancelled or declined booking) is ₱0 up to what is due, with a reason when
 * part is kept; an overpayment refund is the whole overpayment. A refund of ₱0 sends nothing: saved with
 * method '', no reference and today's date. One transaction saves it (rf-####), adds the audit entry and
 * tells the customer in their chat. Answers with the refund, its names and the admin's name.
 */
export async function recordRefund(ref, { amount, method, referenceNo = '', sentOn, reason = '' }, admin) {
  return tx(async (conn) => {
    const row = await lockedReservation(conn, ref, 'Reservation not found.');
    const reservation = row.reservation;
    const money = financials(reservation, row.payments, row.refunds);
    if (money.refundDue <= 0) throw new ApiError('INVALID_STATE', 'Nothing to refund on this reservation.');
    const kind = ['cancelled', 'declined'].includes(reservation.status) ? 'cancellation' : 'overpayment';

    // A cancellation may return nothing (everything kept, with a reason); an overpayment is always returned
    const least = kind === 'cancellation' ? 0 : 1;
    const value = typeof amount === 'number' ? amount : NaN;
    if (!Number.isInteger(value) || value < least || value > money.refundDue) {
      throw invalid(`Enter a whole amount from ${pesoText(least)} to ${pesoText(money.refundDue)}.`, 'amount');
    }
    if (kind === 'overpayment' && value !== money.refundDue) throw invalid(`Return the whole overpayment of ${pesoText(money.refundDue)}.`, 'amount');
    const why = String(reason || '').trim();
    if (value < money.refundDue && why.length < 5) {
      throw invalid(`Tell the customer why ${value > 0 ? 'part of ' : ''}the payment is kept (at least 5 characters).`, 'reason');
    }
    // How the money went back; nothing to check when nothing was sent
    const sent = value > 0;
    if (sent && !['gcash', 'bank', 'cash'].includes(method)) throw invalid('Choose how the refund was sent.', 'method');
    const reference = !sent || method === 'cash' ? '' : String(referenceNo || '').trim();
    if (sent && method !== 'cash' && !reference) throw invalid('Enter the reference number of the refund.', 'referenceNo');
    if (sent && method !== 'cash' && referenceProblem(reference)) throw invalid(referenceProblem(reference), 'referenceNo');
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

    // "GCash (Ref 5021 884 3317)" or "Cash"; nothing when nothing was sent
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
    return enrichRefund({ refund, eventName: reservation.eventName, eventDate: reservation.date, customerName: row.customerName ?? '' });
  });
}

/** Refunds (admin) or one customer's, newest recorded first, with event name/date, customer name and method label. */
export async function listRefunds({ customerId } = {}) {
  return (await repo.findRefunds(pool, { customerId })).map(enrichRefund);
}

/**
 * Admin: the bookings with money still to return (refundDue in financials), for "Refunds to Send":
 * cancelled or declined ones until their refund is recorded (and again if money arrives after it), and
 * overpaid ones. Oldest event date first. `why` is 'customer' (cancelled by the customer; older records
 * without cancelledBy count as theirs), 'admin', 'declined' or 'overpaid'.
 */
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
        why: r.status === 'cancelled' ? (r.cancelledBy === 'admin' ? 'admin' : 'customer') : r.status === 'declined' ? 'declined' : 'overpaid',
        refundDue: money.refundDue,
        paid: money.paid,
        total: money.total
      };
    });
}

/* ============================ GCash / e-wallet QR (Phase 8B) ============================ */

// A QR that still counts as open at `at`: waiting, and not yet past its expiry and the grace after it
const isOpen = (qr, at = now()) => qr.status === 'pending' && at < qr.expiresAt + QR_GRACE_MS;

/**
 * The open one among a booking's pending QRs (findReservations' pendingQrs), or null: for the summaries
 * (openQr) and the cancel rules, without another query per booking. `openUntil` is when it stops counting
 * as open (its expiry plus the grace).
 */
export function openQrIn(pendingQrs = [], at = now()) {
  const open = pendingQrs.find((qr) => isOpen(qr, at));
  return open ? { id: open.id, amount: open.amount, expiresAt: open.expiresAt, openUntil: open.expiresAt + QR_GRACE_MS } : null;
}

/**
 * The refusal while a booking's GCash QR is open (PENDING_PAYMENT, with meta.expiresAt): for the customer
 * (their bank transfer) or the admin (cash, cancelling the booking), in their own words.
 */
export function openQrError(open, side) {
  return side === 'admin'
    ? new ApiError('PENDING_PAYMENT', `The customer has a QR Ph payment open until ${clockText(open.expiresAt)}. Try again after it expires.`, { expiresAt: open.expiresAt })
    : new ApiError('PENDING_PAYMENT', `Your QR Ph payment of ${pesoText(open.amount)} is still open. Pay it, or wait until it expires at ${clockText(open.expiresAt)}.`, { expiresAt: open.expiresAt });
}

/** The booking's open GCash QR, or null (a bank transfer, cash or a new QR waits until it is settled). */
async function openQrOf(db, ref) {
  return (await repo.findPendingQrs(db, ref)).find((qr) => isOpen(qr)) || null;
}

// What the customer's page sees of a QR (with the image only when asked)
const qrView = (qr) => ({
  id: qr.id,
  ref: qr.ref,
  amount: qr.amount,
  expiresAt: qr.expiresAt,
  status: qr.status,
  receiptNo: qr.receiptNo || '',
  ...(qr.qrImage !== undefined ? { qrImage: qr.qrImage } : {})
});

/**
 * Note a webhook event as handled, in the transaction of what it changes; false when it was handled
 * before (a retry or a resend), so the caller stops.
 */
async function noteEvent(conn, event) {
  try {
    await repo.insertWebhookEvent(conn, { id: event.id, type: event.attributes.type, livemode: Boolean(event.attributes.livemode), receivedAt: now() });
    return true;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return false;
    throw err;
  }
}

/**
 * Record a GCash QR that PayMongo says was paid (`intent` from getIntent: succeeded, with its payment):
 * a verified payment (method 'qrph', PayMongo's pay_… as the reference, no proof, the next receipt
 * number), the status moved like any verified payment, the receipt in the customer's chat and the
 * 'payment_received' email (applyVerifiedPayment), and the QR marked paid. Money received can't be
 * refused: on a cancelled booking, or above the balance (e.g. a lower quotation meanwhile), it is still
 * recorded, with an audit entry asking for a refund; it then shows under "Refunds to Send". Safe to run
 * twice (the webhook, a retry, and the page's own check can meet): the QR's row is locked and a paid QR
 * is left alone, before applyVerifiedPayment, so the chat message and the email go only once. `event`
 * is the webhook event, noted in the same transaction. Returns true when this call recorded it.
 */
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
    await repo.updateQr(conn, qr.id, { status: 'paid', paidAt: intent.paid.paidAt, paymentId: payment.id, providerPaymentId: intent.paid.id, lastCheckedAt: at });
    settled = true;
  });
  // The webhook and this GET answer outside the change-stamp middleware, so the portals are told here
  if (settled) await bumpStamp().catch((err) => console.error('[payments] change stamp:', err.message));
  return settled;
}

/**
 * Close a waiting QR as 'expired' (past its time and the grace and PayMongo says unpaid, or PayMongo's
 * qr.expired event) or 'failed' (PayMongo reported the payment failed), with an audit entry. `event` is the webhook event when there is one.
 * A QR that is no longer pending is left alone. Returns true when this call changed it.
 * A 'failed' close this call made also queues the 'qr_payment_failed' email (Phase 13A) with the booking
 * and the amount, never PayMongo's reason (that stays in the audit entry and the admin's QR list). Only
 * the call that closes the QR sends it, so a resent payment.failed event (which finds it closed) sends
 * nothing. The customer is told by email only: closeQr posts no chat message. An expired QR sends no email.
 */
async function closeQr(qr, status, { reason = '', event = null } = {}) {
  let closed = false;
  await tx(async (conn) => {
    if (event && !(await noteEvent(conn, event))) return;
    await reservationsRepo.lockOwner(conn, qr.ref);
    const locked = await repo.lockQr(conn, qr.id);
    if (!locked || locked.status !== 'pending') return;
    await repo.updateQr(conn, qr.id, { status, failureReason: reason ? reason.slice(0, 500) : null, lastCheckedAt: now() });
    await reservationsRepo.insertActivity(conn, qr.ref, {
      at: now(),
      actor: PAYMONGO_NAME,
      text: status === 'expired'
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

/**
 * Bring a waiting QR up to date with PayMongo when it is time to ask (every minute, every 10 seconds once
 * past its expiry, or at once with `force`): paid there -> recorded (settleQr); past its expiry and the
 * grace and not being processed -> expired; otherwise only the time of the check is kept. PayMongo being
 * unreachable changes nothing (asked again next time). This is what records a payment when the webhook is
 * late or never comes.
 */
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

/**
 * Check the rules for a GCash QR of `value` pesos on the customer's booking, in the order of
 * submitPayment: { existing } is the open QR to hand back when one for the same amount is already open.
 * Refused: another customer's booking (NOT_FOUND), not approved yet (INVALID_STATE), a bank transfer
 * waiting for verification or a QR for another amount open (PENDING_PAYMENT, with meta.expiresAt), an
 * amount the booking can't take (INVALID, paymentAmountProblem: the minimum downpayment first).
 * `lock` takes the booking's row first (inside a transaction).
 */
async function qrRules(db, customer, ref, value, { lock = false } = {}) {
  if (lock) await reservationsRepo.lockOwner(db, ref);
  const [row] = await reservationsRepo.findReservations(db, { ref });
  if (!row || row.reservation.ref !== ref || row.reservation.customerId !== customer.id) throw new ApiError('NOT_FOUND', 'We could not find this reservation.');
  const reservation = row.reservation;
  if (!CUSTOMER_PAYABLE.includes(reservation.status)) throw new ApiError('INVALID_STATE', 'Payments open once your reservation is approved.');
  const money = financials(reservation, row.payments, row.refunds);
  if (money.awaitingCount > 0) throw new ApiError('PENDING_PAYMENT', 'A payment for this reservation is still being verified.');
  const open = await openQrOf(db, ref);
  if (open) {
    if (open.amount === value) return { existing: open };
    throw new ApiError('PENDING_PAYMENT', `You have a QR Ph code for ${pesoText(open.amount)} open until ${clockText(open.expiresAt)}. Pay that one, or wait until it expires to choose another amount.`, { field: 'amount', expiresAt: open.expiresAt });
  }
  const problem = paymentAmountProblem(money, value);
  if (problem) throw invalid(problem, 'amount');
  return { existing: null };
}

/**
 * Customer opens a GCash / e-wallet QR for `amount` whole pesos on their booking: { ref, amount } ->
 * { id, ref, amount, expiresAt, status: 'pending', receiptNo: '', qrImage }. One open QR per booking: the
 * same amount again gives the same QR back; another amount waits until it expires (there is no cancel:
 * a saved QR image could still be paid). The booking's older QRs are settled with PayMongo first, so a
 * payment made in a QR's last seconds is recorded before a new QR opens. The rules are checked before
 * PayMongo is called (nothing is made for a request that can't be paid) and again under the booking's
 * lock afterwards, when a second request may have opened a QR meanwhile (a double tap, two tabs): that
 * one is given back and the new PayMongo QR is left unused to expire.
 */
export async function startQrPayment(customer, { ref, amount }) {
  if (!qrReady()) throw new ApiError('INVALID_STATE', 'QR Ph payments are not available right now.');
  const value = Math.round(Number(amount));
  // The customer's own booking only; its QRs past their time are settled with PayMongo before the rules look at them
  const [own] = await reservationsRepo.findReservations(pool, { ref });
  if (!own || own.reservation.ref !== ref || own.reservation.customerId !== customer.id) throw new ApiError('NOT_FOUND', 'We could not find this reservation.');
  for (const qr of await repo.findPendingQrs(pool, ref)) {
    if (now() >= qr.expiresAt) await refreshQr(qr, { force: true });
  }
  const checked = await qrRules(pool, customer, ref, value);
  if (checked.existing) return qrView(await repo.findQr(pool, checked.existing.id, { image: true }));

  const made = await createQrPh({ amount: value, description: `Tres Marias ${ref}`, metadata: { ref, customer_id: customer.id } });
  const answer = await tx(async (conn) => {
    const again = await qrRules(conn, customer, ref, value, { lock: true });
    if (again.existing) return { existingId: again.existing.id };
    const qr = { id: newId('qr'), ref, customerId: customer.id, amount: value, intentId: made.intentId, codeId: made.codeId, qrImage: made.qrImage, expiresAt: made.expiresAt, createdAt: now() };
    await repo.insertQr(conn, qr);
    await reservationsRepo.insertActivity(conn, ref, { at: now(), actor: customer.name, text: `Opened a QR Ph payment of ${pesoText(value)}.` });
    return qrView({ ...qr, status: 'pending', receiptNo: '' });
  });
  if (answer.existingId) return qrView(await repo.findQr(pool, answer.existingId, { image: true }));
  // Test mode: the link that simulates paying this QR, printed only once the QR is saved (like the log mail driver's codes)
  if (made.testUrl) console.log(`\n[PAYMONGO TEST] ${ref} · ${pesoText(value)} · simulate paying or failing: ${made.testUrl}\n`);
  return answer;
}

/**
 * Customer: one of their QRs as it stands, { id, ref, amount, expiresAt, status, receiptNo } (and
 * qrImage with `image`, for a page coming back to an open QR). The page asks every few seconds while it
 * shows the QR; a waiting QR is checked with PayMongo from time to time (refreshQr), so a payment is
 * recorded even when the webhook is late. Another customer's QR is 404.
 */
export async function getQrPayment(customer, id, { image = false } = {}) {
  const qr = await repo.findQr(pool, id);
  if (!qr || qr.id !== id || qr.customerId !== customer.id) throw new ApiError('NOT_FOUND', 'We could not find this QR payment.');
  await refreshQr(qr);
  return qrView(await repo.findQr(pool, id, { image }));
}

// What the QR lists show of each code (no image, no PayMongo ids): where it stands and when, for whom
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

/**
 * The record of every QR Ph code opened, newest first: one customer's (`customerId`, their Payment
 * History), one booking's (`ref`, the admin's reservation page; spelled exactly as stored), or every
 * one (the admin's Reports > Payments > QR Ph Codes). Each code shows where it stands: pending (the
 * pages call it Waiting for payment, or Checking payment once past its time), paid (with its receipt
 * number), expired or failed (with PayMongo's reason). Kept apart from listPayments: an unpaid QR is not
 * money received, and a paid one is also a payment row of its own.
 * A QR still pending past its time is first checked with PayMongo (refreshQr: paid -> recorded, past
 * the grace and unpaid -> expired), at most QR_SETTLE_MAX per read, none already being checked by
 * another read, and only while PayMongo is set up, so a code nobody looked at again is not left
 * "pending" for ever. The read waits for those checks up to QR_SETTLE_WAIT_MS: when PayMongo is slow
 * the list answers anyway and the check finishes on its own (a code it records reaches the pages
 * through the change stamp). PayMongo being unreachable leaves the code as it is (shown as Checking
 * payment) until a later read.
 */
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
      await Promise.race([Promise.all(checks), new Promise((resolve) => (timer = setTimeout(resolve, QR_SETTLE_WAIT_MS)))]);
      clearTimeout(timer);
    }
  }
  const rows = await repo.findQrs(pool, filter);
  return rows.filter(({ qr }) => ref == null || qr.ref === ref).map(qrRecord);
}

// PayMongo's events for a QR Ph code that ended unpaid: qr.expired is what it sends, qrph.expired what older docs name
const EXPIRY_EVENTS = ['qr.expired', 'qrph.expired'];

/**
 * A webhook event from PayMongo, already checked for its signature (paymongo.webhook.js):
 *   payment.paid    the QR's intent is read back from PayMongo (the event alone is never trusted) and,
 *                   once it says succeeded for the QR's amount, the payment is recorded (settleQr)
 *   payment.failed  the QR is marked failed with PayMongo's reason, so the customer can open a new one
 *                   (they are told by email, without the reason: closeQr)
 *   qr.expired      PayMongo ended the QR Ph code unpaid: its time ran out, or "Expire Test Payment" on a
 *                   test QR's page (2026-10-09). The event names the code (qr_…), not the intent, so the
 *                   QR is found by its code id; QRs made before then have none and are ignored, and their
 *                   own time closes them (refreshQr). The intent is still read first: paid -> recorded;
 *                   a payment being processed -> left open for payment.paid or payment.failed; otherwise
 *                   the QR closes as expired at once, without the 2-minute grace, because PayMongo itself
 *                   says the code can no longer be paid (a payment it still reported later would be
 *                   recorded all the same: settleQr takes an expired QR).
 *   qrph.expired    the name in PayMongo's older docs, handled like qr.expired (found by intent or code)
 * Any other event, or one for a QR we don't have, is ignored. Throws when the work could not be done
 * (PayMongo or the database unreachable, or the intent not yet succeeded), so the webhook answers 500
 * and PayMongo sends it again. Returns what happened, for the log.
 */
export async function handlePaymongoEvent(event) {
  const type = event.attributes && event.attributes.type;
  const resource = (event.attributes && event.attributes.data) || {};
  const attrs = resource.attributes || {};
  if (!['payment.paid', 'payment.failed', ...EXPIRY_EVENTS].includes(type)) return 'ignored';
  const intentId = attrs.payment_intent_id;
  const codeId = EXPIRY_EVENTS.includes(type) && typeof resource.id === 'string' && resource.id.startsWith('qr_') ? resource.id : '';
  const qr = intentId ? await repo.findQrByIntent(pool, intentId) : codeId ? await repo.findQrByCode(pool, codeId) : null;
  if (!qr) return 'ignored';
  if (type === 'payment.paid') {
    const intent = await getIntent(qr.intentId);
    if (intent.status !== 'succeeded' || !intent.paid) throw new Error(`intent ${qr.intentId} is ${intent.status}, not succeeded yet`);
    return (await settleQr(qr, intent, event)) ? 'paid' : 'already recorded';
  }
  if (type === 'payment.failed') {
    return (await closeQr(qr, 'failed', { reason: String(attrs.failed_message || attrs.failed_code || ''), event })) ? 'failed' : 'already closed';
  }
  if (qr.status !== 'pending') return 'already closed';
  const intent = await getIntent(qr.intentId);
  if (intent.status === 'succeeded' && intent.paid) return (await settleQr(qr, intent, event)) ? 'paid' : 'already recorded';
  if (intent.status === 'processing') return 'still processing';
  return (await closeQr(qr, 'expired', { event })) ? 'expired' : 'already closed';
}
