import { toPayment, toRefund } from '../reservations/reservations.repo.js';

const first = ([rows]) => rows[0] || null;

export async function getBankDetails(db) {
  const row = first(
    await db.query('SELECT bank_name, bank_account_name, bank_account_number FROM catalog_settings WHERE id = 1')
  );
  if (!row) throw new Error('The catalog_settings row is missing. Run the database migration and seed setup.');
  return {
    bankName: row.bank_name,
    bankAccountName: row.bank_account_name,
    bankAccountNumber: row.bank_account_number
  };
}

export async function saveBankDetails(db, details, at) {
  const [result] = await db.query(
    'UPDATE catalog_settings SET bank_name = ?, bank_account_name = ?, bank_account_number = ?, updated_at = ? WHERE id = 1',
    [details.bankName, details.bankAccountName, details.bankAccountNumber, at]
  );
  if (!result.affectedRows)
    throw new Error('The catalog_settings row is missing. Run the database migration and seed setup.');
}

const PAYMENT_COLUMNS = `pay.id, pay.ref, pay.customer_id, pay.amount, pay.kind, pay.method, pay.reference_no, pay.proof_name, pay.status,
       pay.submitted_at, pay.verified_at, pay.receipt_no, pay.reject_reason,
       r.event_name, r.date AS event_date, c.name AS customer_name`;

const withNames = (row) => ({
  payment: toPayment(row),
  eventName: row.event_name ?? '',
  eventDate: row.event_date ?? '',
  customerName: row.customer_name ?? ''
});

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

export async function findPaymentRef(db, id) {
  const row = first(await db.query('SELECT id, ref, status FROM payments WHERE id = ?', [id]));
  return row && { id: row.id, ref: row.ref, status: row.status };
}

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

export async function insertPayment(conn, p, proof = null, verifiedBy = null) {
  await conn.query(
    `INSERT INTO payments (id, ref, customer_id, amount, kind, method, reference_no, proof_key, proof_name, proof_mime, proof_size,
                           status, submitted_at, verified_at, verified_by, receipt_no, reject_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      p.id,
      p.ref,
      p.customerId,
      p.amount,
      p.kind,
      p.method,
      p.referenceNo,
      proof ? proof.key : null,
      p.proofName,
      proof ? proof.mime : null,
      proof ? proof.size : null,
      p.status,
      p.submittedAt,
      p.verifiedAt,
      verifiedBy,
      p.receiptNo || null,
      p.rejectReason
    ]
  );
}

export async function markVerified(conn, id, { kind, receiptNo, verifiedAt, verifiedBy }) {
  await conn.query(
    "UPDATE payments SET status = 'verified', kind = ?, receipt_no = ?, verified_at = ?, verified_by = ? WHERE id = ?",
    [kind, receiptNo, verifiedAt, verifiedBy, id]
  );
}

export async function markRejected(conn, id, reason) {
  await conn.query("UPDATE payments SET status = 'rejected', reject_reason = ? WHERE id = ?", [reason, id]);
}

export async function findProof(db, id) {
  const row = first(
    await db.query('SELECT id, customer_id, proof_key, proof_mime, proof_name FROM payments WHERE id = ?', [id])
  );
  return (
    row && { id: row.id, customerId: row.customer_id, key: row.proof_key, mime: row.proof_mime, name: row.proof_name }
  );
}

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
  return rows.map((row) => ({
    refund: toRefund(row),
    eventName: row.event_name ?? '',
    eventDate: row.event_date ?? '',
    customerName: row.customer_name ?? ''
  }));
}

export async function insertRefund(conn, f, recordedBy) {
  await conn.query(
    `INSERT INTO refunds (id, ref, customer_id, kind, amount, due, method, reference_no, sent_on, reason, recorded_at, recorded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      f.id,
      f.ref,
      f.customerId,
      f.kind,
      f.amount,
      f.due,
      f.method,
      f.referenceNo,
      f.sentOn,
      f.reason,
      f.recordedAt,
      recordedBy
    ]
  );
}

const toQr = (row) => ({
  id: row.id,
  ref: row.ref,
  customerId: row.customer_id,
  amount: row.amount,
  intentId: row.intent_id,
  codeId: row.code_id ?? '',
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

const QR_COLUMNS = `q.id, q.ref, q.customer_id, q.amount, q.intent_id, q.code_id, q.status, q.expires_at, q.created_at, q.last_checked_at,
       q.paid_at, q.payment_id, q.provider_payment_id, q.failure_reason`;

export async function insertQr(conn, qr) {
  await conn.query(
    `INSERT INTO qr_payments (id, ref, customer_id, amount, intent_id, code_id, qr_image, status, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [qr.id, qr.ref, qr.customerId, qr.amount, qr.intentId, qr.codeId || null, qr.qrImage, qr.expiresAt, qr.createdAt]
  );
}

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

export async function findQrs(db, { customerId, ref, status } = {}) {
  const conditions = [];
  const params = [];
  for (const [column, value] of [
    ['q.customer_id', customerId],
    ['q.ref', ref],
    ['q.status', status]
  ]) {
    if (value == null) continue;
    conditions.push(`${column} = ?`);
    params.push(value);
  }
  const [rows] = await db.query(
    `SELECT ${QR_COLUMNS}, pay.receipt_no, r.event_name, r.date AS event_date, c.name AS customer_name
       FROM qr_payments q
       LEFT JOIN payments pay ON pay.id = q.payment_id
       LEFT JOIN reservations r ON r.ref = q.ref
       LEFT JOIN customers c ON c.id = q.customer_id
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY q.created_at DESC, q.id`,
    params
  );
  return rows.map((row) => ({
    qr: { ...toQr(row), receiptNo: row.receipt_no ?? '' },
    eventName: row.event_name ?? '',
    eventDate: row.event_date ?? '',
    customerName: row.customer_name ?? ''
  }));
}

export async function findQrByIntent(db, intentId) {
  const row = first(await db.query(`SELECT ${QR_COLUMNS} FROM qr_payments q WHERE q.intent_id = ?`, [intentId]));
  return row && toQr(row);
}

export async function findQrByCode(db, codeId) {
  const row = first(await db.query(`SELECT ${QR_COLUMNS} FROM qr_payments q WHERE q.code_id = ?`, [codeId]));
  return row && toQr(row);
}

export async function findPendingQrs(db, ref) {
  const [rows] = await db.query(
    `SELECT ${QR_COLUMNS} FROM qr_payments q WHERE q.ref = ? AND q.status = 'pending' ORDER BY q.created_at DESC`,
    [ref]
  );
  return rows.map(toQr);
}

export async function lockQr(conn, id) {
  const row = first(await conn.query(`SELECT ${QR_COLUMNS} FROM qr_payments q WHERE q.id = ? FOR UPDATE`, [id]));
  return row && toQr(row);
}

const QR_FIELDS = {
  status: 'status',
  lastCheckedAt: 'last_checked_at',
  paidAt: 'paid_at',
  paymentId: 'payment_id',
  providerPaymentId: 'provider_payment_id',
  failureReason: 'failure_reason'
};

export async function updateQr(db, id, changes) {
  const entries = Object.entries(changes);
  entries.forEach(([field]) => {
    if (!QR_FIELDS[field]) throw new Error(`updateQr: "${field}" is not a field it can save.`);
  });
  if (!entries.length) return;
  await db.query(
    `UPDATE qr_payments SET ${entries.map(([field]) => `${QR_FIELDS[field]} = ?`).join(', ')} WHERE id = ?`,
    [...entries.map(([, value]) => value), id]
  );
}

export async function insertWebhookEvent(conn, { id, type, livemode, receivedAt }) {
  await conn.query('INSERT INTO webhook_events (id, type, livemode, received_at) VALUES (?, ?, ?, ?)', [
    id,
    type,
    livemode,
    receivedAt
  ]);
}
