import { toPayment, toRefund } from '../reservations/reservations.repo.js';

/**
 * SQL for payments and refunds (docs §7.1: the repo holds SQL only; the rules are in payments.service.js).
 * Records come back in the shape the pages use; the reservation, its payments and
 * its refunds for the money figures come from reservations.repo.js (findReservations).
 *
 * The proof file's storage columns (proof_key, proof_mime, proof_size) are read only by findProof, for
 * the file route: no other answer carries them, so the path on the server never reaches a browser.
 * Every function takes `db`: the pool, or a transaction's connection.
 */

// First row of a SELECT, or null
const first = ([rows]) => rows[0] || null;

// The columns toPayment reads, plus the event and customer names every payment answer carries
const PAYMENT_COLUMNS = `pay.id, pay.ref, pay.customer_id, pay.amount, pay.kind, pay.method, pay.reference_no, pay.proof_name, pay.status,
       pay.submitted_at, pay.verified_at, pay.receipt_no, pay.reject_reason,
       r.event_name, r.date AS event_date, c.name AS customer_name`;

// A payment with the names the answers need: { payment, eventName, eventDate, customerName }
const withNames = (row) => ({
  payment: toPayment(row),
  eventName: row.event_name ?? '',
  eventDate: row.event_date ?? '',
  customerName: row.customer_name ?? ''
});

/**
 * Payments with their event and customer names, newest first (ties in the order they were made):
 * every one, one customer's (`customerId`), or one payment (`id`).
 */
export async function findPayments(db, { customerId, id } = {}) {
  const conditions = [];
  const params = [];
  if (customerId != null) {
    conditions.push('pay.customer_id = ?');
    params.push(customerId);
  }
  if (id != null) {
    conditions.push('pay.id = ?');
    params.push(id);
  }
  const [rows] = await db.query(
    `SELECT ${PAYMENT_COLUMNS}
       FROM payments pay
       LEFT JOIN reservations r ON r.ref = pay.ref
       LEFT JOIN customers c ON c.id = pay.customer_id
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY pay.submitted_at DESC, CAST(SUBSTRING(pay.id, 5) AS UNSIGNED), pay.id`,
    params
  );
  return rows.map(withNames);
}

/** A payment's id, reservation and status as stored, or null (the lookup ignores case, so callers compare the id). */
export async function findPaymentRef(db, id) {
  const row = first(await db.query('SELECT id, ref, status FROM payments WHERE id = ?', [id]));
  return row && { id: row.id, ref: row.ref, status: row.status };
}

/**
 * The payment with its row locked until the transaction ends, as a record, or null. Taken after the
 * reservation's row (lockOwner), so two admins verifying the same payment run one after the other and
 * the second sees it verified.
 */
export async function lockPayment(conn, id) {
  const row = first(
    await conn.query(
      `SELECT id, ref, customer_id, amount, kind, method, reference_no, proof_name, status, submitted_at, verified_at, receipt_no, reject_reason
         FROM payments WHERE id = ? FOR UPDATE`,
      [id]
    )
  );
  return row && toPayment(row);
}

/**
 * True when another payment that is waiting or verified has the same reference number, compared without
 * spaces, dashes or underscores and ignoring capitals (referenceKey in @tm/shared/src/domain/payment.js).
 * Rejected payments don't count, so a receipt can be sent again after a rejection.
 */
export async function referenceTaken(db, key) {
  const row = first(
    await db.query(
      `SELECT 1 AS taken FROM payments
        WHERE status IN ('awaiting', 'verified')
          AND UPPER(REPLACE(REPLACE(REPLACE(reference_no, ' ', ''), '-', ''), '_', '')) = ?
        LIMIT 1`,
      [key]
    )
  );
  return Boolean(row);
}

/**
 * Save a new payment. `proof` is { key, mime, size } for an uploaded file, or null (cash; the PayMongo QR
 * in Phase 8B). receipt_no stays NULL until verified (the UNIQUE index allows many NULLs); verified_by is
 * the admin who recorded or verified it, NULL for the customer's own upload.
 */
export async function insertPayment(conn, p, proof = null, verifiedBy = null) {
  await conn.query(
    `INSERT INTO payments (id, ref, customer_id, amount, kind, method, reference_no, proof_key, proof_name, proof_mime, proof_size,
                           status, submitted_at, verified_at, verified_by, receipt_no, reject_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      p.id, p.ref, p.customerId, p.amount, p.kind, p.method, p.referenceNo, proof ? proof.key : null, p.proofName,
      proof ? proof.mime : null, proof ? proof.size : null, p.status, p.submittedAt, p.verifiedAt, verifiedBy, p.receiptNo || null, p.rejectReason
    ]
  );
}

/** Mark a waiting payment verified: what it is for (worked out again), the receipt number, when and by which admin. */
export async function markVerified(conn, id, { kind, receiptNo, verifiedAt, verifiedBy }) {
  await conn.query("UPDATE payments SET status = 'verified', kind = ?, receipt_no = ?, verified_at = ?, verified_by = ? WHERE id = ?", [
    kind, receiptNo, verifiedAt, verifiedBy, id
  ]);
}

/** Mark a waiting payment rejected, with the reason the customer sees. */
export async function markRejected(conn, id, reason) {
  await conn.query("UPDATE payments SET status = 'rejected', reject_reason = ? WHERE id = ?", [reason, id]);
}

/**
 * The uploaded file behind a payment, for the proof route: { id, customerId, key, mime, name } with key
 * null when nothing was uploaded (cash, a sample payment, a QR payment), or null when there is no such payment.
 */
export async function findProof(db, id) {
  const row = first(await db.query('SELECT id, customer_id, proof_key, proof_mime, proof_name FROM payments WHERE id = ?', [id]));
  return row && { id: row.id, customerId: row.customer_id, key: row.proof_key, mime: row.proof_mime, name: row.proof_name };
}

/* ============================ Refunds ============================ */

/**
 * Refunds with their event and customer names, newest recorded first (ties in the order they were made):
 * every one, or one customer's. The recording admin comes back as a name (recordedBy).
 */
export async function findRefunds(db, { customerId } = {}) {
  const [rows] = await db.query(
    `SELECT f.*, a.name AS admin_name, r.event_name, r.date AS event_date, c.name AS customer_name
       FROM refunds f
       LEFT JOIN admins a ON a.id = f.recorded_by
       LEFT JOIN reservations r ON r.ref = f.ref
       LEFT JOIN customers c ON c.id = f.customer_id
      ${customerId != null ? 'WHERE f.customer_id = ?' : ''}
      ORDER BY f.recorded_at DESC, CAST(SUBSTRING(f.id, 4) AS UNSIGNED), f.id`,
    customerId != null ? [customerId] : []
  );
  return rows.map((row) => ({ refund: toRefund(row), eventName: row.event_name ?? '', eventDate: row.event_date ?? '', customerName: row.customer_name ?? '' }));
}

/** Save a refund; `recordedBy` is the admin's id (the record itself carries the admin's name). */
export async function insertRefund(conn, f, recordedBy) {
  await conn.query(
    `INSERT INTO refunds (id, ref, customer_id, kind, amount, due, method, reference_no, sent_on, reason, recorded_at, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [f.id, f.ref, f.customerId, f.kind, f.amount, f.due, f.method, f.referenceNo, f.sentOn, f.reason, f.recordedAt, recordedBy]
  );
}

/* ============================ GCash QR payments (Phase 8B) ============================ */

// qr_payments row -> QR record (the image only when it was read)
const toQr = (row) => ({
  id: row.id,
  ref: row.ref,
  customerId: row.customer_id,
  amount: row.amount,
  intentId: row.intent_id,
  ...(row.qr_image !== undefined ? { qrImage: row.qr_image } : {}),
  status: row.status,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  lastCheckedAt: row.last_checked_at,
  paidAt: row.paid_at,
  paymentId: row.payment_id,
  providerPaymentId: row.provider_payment_id,
  failureReason: row.failure_reason ?? ''
});

// Every column but the image (a base64 PNG of about 14 KB), which only the first display needs
const QR_COLUMNS = `q.id, q.ref, q.customer_id, q.amount, q.intent_id, q.status, q.expires_at, q.created_at, q.last_checked_at,
       q.paid_at, q.payment_id, q.provider_payment_id, q.failure_reason`;

/** Save a new QR, pending until PayMongo reports it paid. */
export async function insertQr(conn, qr) {
  await conn.query(
    `INSERT INTO qr_payments (id, ref, customer_id, amount, intent_id, qr_image, status, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [qr.id, qr.ref, qr.customerId, qr.amount, qr.intentId, qr.qrImage, qr.expiresAt, qr.createdAt]
  );
}

/** One QR as a record (with its image when `image` is true), and the receipt number once paid; or null. */
export async function findQr(db, id, { image = false } = {}) {
  const row = first(
    await db.query(
      `SELECT ${QR_COLUMNS}${image ? ', q.qr_image' : ''}, pay.receipt_no
         FROM qr_payments q LEFT JOIN payments pay ON pay.id = q.payment_id
        WHERE q.id = ?`,
      [id]
    )
  );
  return row && { ...toQr(row), receiptNo: row.receipt_no ?? '' };
}

/** The QR of a PayMongo Payment Intent (pi_…), or null: how a webhook finds its QR. */
export async function findQrByIntent(db, intentId) {
  const row = first(await db.query(`SELECT ${QR_COLUMNS} FROM qr_payments q WHERE q.intent_id = ?`, [intentId]));
  return row && toQr(row);
}

/** A booking's QRs still marked pending (open, or past their time and not yet checked with PayMongo), newest first. */
export async function findPendingQrs(db, ref) {
  const [rows] = await db.query(`SELECT ${QR_COLUMNS} FROM qr_payments q WHERE q.ref = ? AND q.status = 'pending' ORDER BY q.created_at DESC`, [ref]);
  return rows.map(toQr);
}

/** The QR with its row locked until the transaction ends (taken after the booking's row, lockOwner), or null. */
export async function lockQr(conn, id) {
  const row = first(await conn.query(`SELECT ${QR_COLUMNS} FROM qr_payments q WHERE q.id = ? FOR UPDATE`, [id]));
  return row && toQr(row);
}

// QR record fields updateQr may change -> column
const QR_FIELDS = {
  status: 'status',
  lastCheckedAt: 'last_checked_at',
  paidAt: 'paid_at',
  paymentId: 'payment_id',
  providerPaymentId: 'provider_payment_id',
  failureReason: 'failure_reason'
};

/** Save changed fields of a QR, e.g. { status: 'expired' }. Any other field name is a programming error. */
export async function updateQr(db, id, changes) {
  const entries = Object.entries(changes);
  entries.forEach(([field]) => {
    if (!QR_FIELDS[field]) throw new Error(`updateQr: "${field}" is not a field it can save.`);
  });
  if (!entries.length) return;
  await db.query(`UPDATE qr_payments SET ${entries.map(([field]) => `${QR_FIELDS[field]} = ?`).join(', ')} WHERE id = ?`, [
    ...entries.map(([, value]) => value),
    id
  ]);
}

/**
 * Note a PayMongo webhook event as handled, inside the transaction of what it changes. A retried event
 * fails here with ER_DUP_ENTRY (the id is the primary key), so it is never handled twice.
 */
export async function insertWebhookEvent(conn, { id, type, livemode, receivedAt }) {
  await conn.query('INSERT INTO webhook_events (id, type, livemode, received_at) VALUES (?, ?, ?, ?)', [id, type, livemode, receivedAt]);
}
