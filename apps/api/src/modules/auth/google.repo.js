import { pool } from '../../db.js';
import { toCustomer, findCustomerByEmail, insertCustomer } from './auth.repo.js';

export { findCustomerByEmail, insertCustomer };

export async function findGoogleCustomer(subject, conn = pool) {
  const [[row]] = await conn.query(
    `SELECT c.* FROM customer_google_accounts g JOIN customers c ON c.id = g.customer_id WHERE g.google_subject = ?`,
    [subject]
  );
  return toCustomer(row);
}

export async function findCustomerForUpdate(id, conn) {
  const [[row]] = await conn.query('SELECT * FROM customers WHERE id = ? FOR UPDATE', [id]);
  return toCustomer(row);
}

export async function linkGoogle(subject, customerId, conn) {
  await conn.query('INSERT INTO customer_google_accounts (google_subject, customer_id) VALUES (?, ?)', [
    subject,
    customerId
  ]);
}

const toSignInChallenge = (row) =>
  row && {
    id: row.id,
    customerId: row.customer_id,
    googleSubject: row.google_subject,
    email: row.email,
    passwordChangedAt: row.password_changed_at ?? null,
    remember: Boolean(row.remember),
    codeHash: row.code_hash,
    expiresAt: row.expires_at,
    resendAt: row.resend_at,
    usedAt: row.used_at,
    createdAt: row.created_at
  };

export async function insertSignInChallenge(request, conn = pool) {
  await conn.query(
    `INSERT INTO customer_google_signins
       (id, customer_id, google_subject, email, password_changed_at, remember, code_hash, expires_at, resend_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      request.id,
      request.customerId,
      request.googleSubject,
      request.email,
      request.passwordChangedAt,
      request.remember,
      request.codeHash,
      request.expiresAt,
      request.resendAt,
      request.createdAt
    ]
  );
}

export async function findSignInChallenge(id, conn = pool) {
  const [[row]] = await conn.query('SELECT * FROM customer_google_signins WHERE id = ?', [id]);
  return toSignInChallenge(row);
}

export async function findSignInChallengeForUpdate(id, conn) {
  const [[row]] = await conn.query('SELECT * FROM customer_google_signins WHERE id = ? FOR UPDATE', [id]);
  return toSignInChallenge(row);
}

export async function deleteSignInChallenge(id) {
  await pool.query('DELETE FROM customer_google_signins WHERE id = ?', [id]);
}

export async function replaceSignInCode(id, { codeHash, expiresAt, resendAt }, conn) {
  await conn.query('UPDATE customer_google_signins SET code_hash = ?, expires_at = ?, resend_at = ? WHERE id = ?', [
    codeHash,
    expiresAt,
    resendAt,
    id
  ]);
}

export async function setSignInResendAt(id, resendAt, codeHash) {
  await pool.query(
    'UPDATE customer_google_signins SET resend_at = ? WHERE id = ? AND code_hash = ? AND used_at IS NULL',
    [resendAt, id, codeHash]
  );
}

export async function markSignInUsed(conn, id, at) {
  const [result] = await conn.query('UPDATE customer_google_signins SET used_at = ? WHERE id = ? AND used_at IS NULL', [
    at,
    id
  ]);
  return result.affectedRows === 1;
}
