import { pool } from '../../db.js';

/**
 * SQL for accounts, emailed one-time codes and failed-attempt counters (docs §7.1: the repo holds SQL
 * only; the rules are in auth.service.js and lockout.js). Rows come back as camelCase records (e.g.
 * password_hash -> passwordHash), the shape auth.service.js works with. Functions that must run inside
 * a transaction take its connection (`conn`, from tx()); the rest use the pool.
 */

/* ============================ Accounts ============================ */

// customers row -> customer record (null stays null)
const toCustomer = (row) =>
  row && {
    id: row.id,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    name: row.name,
    email: row.email,
    mobile: row.mobile,
    passwordHash: row.password_hash,
    company: row.company,
    createdAt: row.created_at,
    passwordChangedAt: row.password_changed_at,
    // The Terms version the customer last agreed to ('' = not yet), and when
    termsVersion: row.terms_version || '',
    termsAcceptedAt: row.terms_accepted_at ?? null
  };

// admins row -> admin record (null stays null)
const toAdmin = (row) =>
  row && {
    id: row.id,
    name: row.name,
    email: row.email,
    mobile: row.mobile,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
    passwordChangedAt: row.password_changed_at,
    sessionId: row.session_id, // the sign-in allowed now (newest sign-in wins); null before the first one
    lastSignInAt: row.last_sign_in_at,
    lastSignInDevice: row.last_sign_in_device,
    previousSignInAt: row.previous_sign_in_at,
    failedAttempts: row.failed_attempts,
    failedSinceLastSignIn: row.failed_since_last_sign_in
  };

// First row of a SELECT, or null
const first = ([rows]) => rows[0] || null;

/** The customer with this email (stored lower-case; the collation ignores case anyway), or null. */
export const findCustomerByEmail = async (email) => toCustomer(first(await pool.query('SELECT * FROM customers WHERE email = ?', [email])));

/** The customer with this id, or null. */
export const findCustomerById = async (id) => toCustomer(first(await pool.query('SELECT * FROM customers WHERE id = ?', [id])));

/**
 * Save a new customer (from a sign-up whose emailed code was right, so it runs inside that transaction:
 * pass its `conn`). A second account with the same email fails with ER_DUP_ENTRY (UNIQUE email).
 */
export async function insertCustomer(c, conn = pool) {
  await conn.query(
    `INSERT INTO customers (id, first_name, middle_name, last_name, name, email, mobile, password_hash, company, created_at, password_changed_at,
                            terms_version, terms_accepted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    [c.id, c.firstName, c.middleName, c.lastName, c.name, c.email, c.mobile, c.passwordHash, c.company, c.createdAt, c.termsVersion || '', c.termsAcceptedAt ?? null]
  );
}

/** Record that a customer agreed to a Terms version (the sign-up tick, or the "We updated our terms" prompt). */
export async function setCustomerTerms(id, version, at) {
  await pool.query('UPDATE customers SET terms_version = ?, terms_accepted_at = ? WHERE id = ?', [version, at, id]);
}

/** Save the profile form: name (and its three parts), mobile and company. */
export async function updateCustomerProfile(id, { firstName, middleName, lastName, name, mobile, company }) {
  await pool.query(
    'UPDATE customers SET first_name = ?, middle_name = ?, last_name = ?, name = ?, mobile = ?, company = ? WHERE id = ?',
    [firstName, middleName, lastName, name, mobile, company, id]
  );
}

/**
 * Save a new password hash and when it changed (tokens made before `at` stop working). Pass `conn`
 * to make it part of a transaction (a finished password reset); by default it uses the pool.
 */
export async function updateCustomerPassword(id, passwordHash, at, conn = pool) {
  await conn.query('UPDATE customers SET password_hash = ?, password_changed_at = ? WHERE id = ?', [passwordHash, at, id]);
}

/** The admin with this email, or null. */
export const findAdminByEmail = async (email) => toAdmin(first(await pool.query('SELECT * FROM admins WHERE email = ?', [email])));

/** The admin with this id, or null. */
export const findAdminById = async (id) => toAdmin(first(await pool.query('SELECT * FROM admins WHERE id = ?', [id])));

/** True when an admin other than `adminId` already signs in with this email. */
export async function emailUsedByOtherAdmin(email, adminId) {
  const [rows] = await pool.query('SELECT 1 FROM admins WHERE email = ? AND id <> ? LIMIT 1', [email, adminId]);
  return rows.length > 0;
}

/** One more wrong password or code for this admin, shown on My account ("failed attempts since this session started"). */
export async function addAdminFailedAttempt(id) {
  await pool.query('UPDATE admins SET failed_attempts = failed_attempts + 1 WHERE id = ?', [id]);
}

/**
 * Record a completed sign-in: the old "last sign-in" becomes the previous one, and the failures
 * counted since then move to failed_since_last_sign_in before the counter restarts at 0.
 * `sessionId` becomes the only sign-in allowed (newest sign-in wins): tokens of the earlier sign-in
 * stop working (middleware/auth.js).
 * MySQL runs a single-table UPDATE's assignments left to right, each seeing the ones before it, so
 * every column is copied before it is overwritten: keep this order.
 */
export async function recordAdminSignIn(conn, id, { at, device, sessionId }) {
  await conn.query(
    `UPDATE admins
        SET previous_sign_in_at = last_sign_in_at,
            last_sign_in_at = ?,
            last_sign_in_device = ?,
            failed_since_last_sign_in = failed_attempts,
            failed_attempts = 0,
            session_id = ?
      WHERE id = ?`,
    [at, device, sessionId, id]
  );
}

/** Save the admin's display name. */
export async function updateAdminName(id, name) {
  await pool.query('UPDATE admins SET name = ? WHERE id = ?', [name, id]);
}

/** Save a new admin password hash and when it changed (tokens made before `at` stop working). */
export async function updateAdminPassword(id, passwordHash, at) {
  await pool.query('UPDATE admins SET password_hash = ?, password_changed_at = ? WHERE id = ?', [passwordHash, at, id]);
}

/** Save a confirmed new email or mobile number. `field` is 'email' or 'mobile' (the column name). */
export async function updateAdminContact(conn, id, field, value) {
  if (field !== 'email' && field !== 'mobile') throw new Error(`updateAdminContact: unknown field "${field}".`);
  await conn.query('UPDATE ?? SET ?? = ? WHERE id = ?', ['admins', field, value, id]);
}

/**
 * What middleware/auth.js needs to accept a token: the account's current name, when its password
 * last changed and, for an admin, the sign-in allowed now (sessionId; customers have none), or null
 * when the account no longer exists. `role` picks the table.
 */
export async function findSessionAccount(role, id) {
  if (role === 'admin') {
    const row = first(await pool.query('SELECT name, password_changed_at, session_id FROM admins WHERE id = ?', [id]));
    return row && { name: row.name, passwordChangedAt: row.password_changed_at, sessionId: row.session_id };
  }
  const row = first(await pool.query('SELECT name, password_changed_at FROM customers WHERE id = ?', [id]));
  return row && { name: row.name, passwordChangedAt: row.password_changed_at };
}

/* ============================ Admin codes (auth_challenges) ============================ */

// auth_challenges row -> challenge record
const toChallenge = (row) =>
  row && {
    id: row.id,
    purpose: row.purpose,
    adminId: row.admin_id,
    codeHash: row.code_hash,
    field: row.field,
    value: row.new_value,
    expiresAt: row.expires_at,
    resendAt: row.resend_at,
    attempts: row.attempts,
    usedAt: row.used_at,
    createdAt: row.created_at
  };

/** The code request with this id (any purpose, used or not), or null. */
export const findChallenge = async (id) => toChallenge(first(await pool.query('SELECT * FROM auth_challenges WHERE id = ?', [id])));

/** Save a new code request ('sign_in', or 'contact_change' with the field and new value). */
export async function insertChallenge(c) {
  await pool.query(
    `INSERT INTO auth_challenges (id, purpose, admin_id, code_hash, field, new_value, expires_at, resend_at, attempts, used_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)`,
    [c.id, c.purpose, c.adminId, c.codeHash, c.field || null, c.value || null, c.expiresAt, c.resendAt, c.createdAt]
  );
}

/** Remove this admin's earlier requests of one purpose, so only the newest code works. */
export async function deleteChallengesFor(adminId, purpose) {
  await pool.query('DELETE FROM auth_challenges WHERE admin_id = ? AND purpose = ?', [adminId, purpose]);
}

/** Remove one request (its code could not be sent, or too many wrong codes were entered). */
export async function deleteChallenge(id) {
  await pool.query('DELETE FROM auth_challenges WHERE id = ?', [id]);
}

/** A resend: the new code's hash and fresh expiry / resend times. The old code stops working. */
export async function replaceChallengeCode(id, { codeHash, expiresAt, resendAt }) {
  await pool.query('UPDATE auth_challenges SET code_hash = ?, expires_at = ?, resend_at = ? WHERE id = ?', [codeHash, expiresAt, resendAt, id]);
}

/** Move the resend time (back to now after a failed send, so the admin can ask again at once). */
export async function setChallengeResendAt(id, resendAt) {
  await pool.query('UPDATE auth_challenges SET resend_at = ? WHERE id = ?', [resendAt, id]);
}

/** Count one wrong code on the request itself (the lockout is counted separately, in login_attempts). */
export async function addChallengeAttempt(id) {
  await pool.query('UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = ?', [id]);
}

/**
 * Mark the request used, only if it still was not: returns false when another request used it first
 * (two correct answers sent at the same moment), so a code can be spent only once.
 */
export async function markChallengeUsed(conn, id, at) {
  const [result] = await conn.query('UPDATE auth_challenges SET used_at = ? WHERE id = ? AND used_at IS NULL', [at, id]);
  return result.affectedRows === 1;
}

/* ============================ Customer password resets ============================ */

// password_resets row -> reset record
const toReset = (row) =>
  row && {
    id: row.id,
    customerId: row.customer_id,
    codeHash: row.code_hash,
    expiresAt: row.expires_at,
    resendAt: row.resend_at,
    attempts: row.attempts,
    verifiedAt: row.verified_at,
    usedAt: row.used_at,
    createdAt: row.created_at
  };

/** The reset request with this id (used or not), or null. */
export const findReset = async (id) => toReset(first(await pool.query('SELECT * FROM password_resets WHERE id = ?', [id])));

/** Save a new reset request. */
export async function insertReset(r) {
  await pool.query(
    `INSERT INTO password_resets (id, customer_id, code_hash, expires_at, resend_at, attempts, verified_at, used_at, created_at)
     VALUES (?, ?, ?, ?, ?, 0, NULL, NULL, ?)`,
    [r.id, r.customerId, r.codeHash, r.expiresAt, r.resendAt, r.createdAt]
  );
}

/** Remove the customer's earlier reset requests, so only the newest code works. */
export async function deleteResetsFor(customerId) {
  await pool.query('DELETE FROM password_resets WHERE customer_id = ?', [customerId]);
}

/** Remove one reset request (its code could not be sent). */
export async function deleteReset(id) {
  await pool.query('DELETE FROM password_resets WHERE id = ?', [id]);
}

/** A resend: the new code's hash and fresh expiry / resend times. The old code stops working. */
export async function replaceResetCode(id, { codeHash, expiresAt, resendAt }) {
  await pool.query('UPDATE password_resets SET code_hash = ?, expires_at = ?, resend_at = ? WHERE id = ?', [codeHash, expiresAt, resendAt, id]);
}

/** Move the resend time (back to now after a failed send). */
export async function setResetResendAt(id, resendAt) {
  await pool.query('UPDATE password_resets SET resend_at = ? WHERE id = ?', [resendAt, id]);
}

/** Count one wrong code on the request itself. */
export async function addResetAttempt(id) {
  await pool.query('UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?', [id]);
}

/** The code was right: the new password may be saved until `expiresAt`. */
export async function markResetVerified(id, { at, expiresAt }) {
  await pool.query('UPDATE password_resets SET verified_at = ?, expires_at = ? WHERE id = ?', [at, expiresAt, id]);
}

/** Spend the request, only if it was not spent yet: false when another request got there first. */
export async function markResetUsed(conn, id, at) {
  const [result] = await conn.query('UPDATE password_resets SET used_at = ? WHERE id = ? AND used_at IS NULL', [at, id]);
  return result.affectedRows === 1;
}

/* ============================ Sign-ups waiting for their code (signup_requests, Phase 12) ============================ */

// signup_requests row -> request record (the account-to-be's details, its password hash and the code's hash)
const toSignup = (row) =>
  row && {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    mobile: row.mobile,
    passwordHash: row.password_hash,
    codeHash: row.code_hash,
    expiresAt: row.expires_at,
    resendAt: row.resend_at,
    attempts: row.attempts,
    usedAt: row.used_at,
    createdAt: row.created_at
  };

/** The sign-up request with this id (used or not), or null. */
export const findSignup = async (id) => toSignup(first(await pool.query('SELECT * FROM signup_requests WHERE id = ?', [id])));

/** Save a new sign-up request. */
export async function insertSignup(r) {
  await pool.query(
    `INSERT INTO signup_requests (id, email, first_name, middle_name, last_name, mobile, password_hash, code_hash, expires_at, resend_at, attempts, used_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)`,
    [r.id, r.email, r.firstName, r.middleName, r.lastName, r.mobile, r.passwordHash, r.codeHash, r.expiresAt, r.resendAt, r.createdAt]
  );
}

/** Remove the waiting sign-ups for this email, so only the newest code works. Used ones stay as a record. */
export async function deleteSignupsFor(email) {
  await pool.query('DELETE FROM signup_requests WHERE email = ? AND used_at IS NULL', [email]);
}

/** Remove one sign-up request (its code could not be sent). */
export async function deleteSignup(id) {
  await pool.query('DELETE FROM signup_requests WHERE id = ?', [id]);
}

/** A resend: the new code's hash and fresh expiry / resend times. The old code stops working. */
export async function replaceSignupCode(id, { codeHash, expiresAt, resendAt }) {
  await pool.query('UPDATE signup_requests SET code_hash = ?, expires_at = ?, resend_at = ? WHERE id = ?', [codeHash, expiresAt, resendAt, id]);
}

/** Move the resend time (back to now after a failed send). */
export async function setSignupResendAt(id, resendAt) {
  await pool.query('UPDATE signup_requests SET resend_at = ? WHERE id = ?', [resendAt, id]);
}

/** Count one wrong code on the request itself (the lockout is counted separately, in login_attempts). */
export async function addSignupAttempt(id) {
  await pool.query('UPDATE signup_requests SET attempts = attempts + 1 WHERE id = ?', [id]);
}

/** Spend the request when its account is created, only if it was not spent yet: false when another request got there first. */
export async function markSignupUsed(conn, id, at) {
  const [result] = await conn.query('UPDATE signup_requests SET used_at = ? WHERE id = ? AND used_at IS NULL', [at, id]);
  return result.affectedRows === 1;
}

/* ============================ Password changes waiting for their code (password_changes, Phase 12) ============================ */

// password_changes row -> request record
const toChange = (row) =>
  row && {
    id: row.id,
    customerId: row.customer_id,
    newPasswordHash: row.new_password_hash,
    codeHash: row.code_hash,
    expiresAt: row.expires_at,
    resendAt: row.resend_at,
    attempts: row.attempts,
    usedAt: row.used_at,
    createdAt: row.created_at
  };

/** The password-change request with this id (used or not), or null. */
export const findChange = async (id) => toChange(first(await pool.query('SELECT * FROM password_changes WHERE id = ?', [id])));

/** Save a new password-change request. */
export async function insertChange(r) {
  await pool.query(
    `INSERT INTO password_changes (id, customer_id, new_password_hash, code_hash, expires_at, resend_at, attempts, used_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?)`,
    [r.id, r.customerId, r.newPasswordHash, r.codeHash, r.expiresAt, r.resendAt, r.createdAt]
  );
}

/** Remove the customer's waiting password-change requests, so only the newest code works. */
export async function deleteChangesFor(customerId) {
  await pool.query('DELETE FROM password_changes WHERE customer_id = ? AND used_at IS NULL', [customerId]);
}

/** Remove one request (its code could not be sent). */
export async function deleteChange(id) {
  await pool.query('DELETE FROM password_changes WHERE id = ?', [id]);
}

/** A resend: the new code's hash and fresh expiry / resend times. The old code stops working. */
export async function replaceChangeCode(id, { codeHash, expiresAt, resendAt }) {
  await pool.query('UPDATE password_changes SET code_hash = ?, expires_at = ?, resend_at = ? WHERE id = ?', [codeHash, expiresAt, resendAt, id]);
}

/** Move the resend time (back to now after a failed send). */
export async function setChangeResendAt(id, resendAt) {
  await pool.query('UPDATE password_changes SET resend_at = ? WHERE id = ?', [resendAt, id]);
}

/** Count one wrong code on the request itself. */
export async function addChangeAttempt(id) {
  await pool.query('UPDATE password_changes SET attempts = attempts + 1 WHERE id = ?', [id]);
}

/** Spend the request, only if it was not spent yet: false when another request got there first. */
export async function markChangeUsed(conn, id, at) {
  const [result] = await conn.query('UPDATE password_changes SET used_at = ? WHERE id = ? AND used_at IS NULL', [at, id]);
  return result.affectedRows === 1;
}

/**
 * Remove the customer's password changes and resets that are still waiting for their code. Runs inside
 * the transaction (`conn`) of a finished password change or reset, after that request was marked used
 * (so it stays as a record): a code sent before the password changed can never set it again.
 */
export async function deleteWaitingPasswordRequests(customerId, conn) {
  await conn.query('DELETE FROM password_changes WHERE customer_id = ? AND used_at IS NULL', [customerId]);
  await conn.query('DELETE FROM password_resets WHERE customer_id = ? AND used_at IS NULL', [customerId]);
}

/* ============================ Failed attempts (login_attempts) ============================ */

// login_attempts row -> attempt record
const toAttempt = (row) => row && { count: row.count, lockedUntil: row.locked_until, updatedAt: row.updated_at };

/** The counter for one scope and account, or null when there is none (no failures). */
export const findAttempts = async (scope, identifier) =>
  toAttempt(first(await pool.query('SELECT count, locked_until, updated_at FROM login_attempts WHERE scope = ? AND identifier = ?', [scope, identifier])));

/**
 * Make sure the counter row exists (count 0), so lockAttempts can lock it. Runs on its own, outside
 * the caller's transaction: two transactions that both found no row and both tried to insert one
 * would otherwise deadlock. On an existing row it changes nothing (count = count).
 */
export async function ensureAttempts(scope, identifier, at) {
  await pool.query(
    'INSERT INTO login_attempts (scope, identifier, count, locked_until, updated_at) VALUES (?, ?, 0, NULL, ?) ON DUPLICATE KEY UPDATE count = count',
    [scope, identifier, at]
  );
}

/** Read the counter and lock its row until the transaction ends (SELECT … FOR UPDATE). */
export const lockAttempts = async (conn, scope, identifier) =>
  toAttempt(first(await conn.query('SELECT count, locked_until, updated_at FROM login_attempts WHERE scope = ? AND identifier = ? FOR UPDATE', [scope, identifier])));

/**
 * Save the counter. An upsert, so the count is kept even if a right answer on another request
 * deleted the row in between. The values are passed twice instead of using VALUES() (deprecated
 * since MySQL 8.0.20) or a row alias (needs 8.0.19; the minimum here is 8.0.16).
 */
export async function saveAttempts(conn, scope, identifier, { count, lockedUntil, at }) {
  await conn.query(
    `INSERT INTO login_attempts (scope, identifier, count, locked_until, updated_at) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE count = ?, locked_until = ?, updated_at = ?`,
    [scope, identifier, count, lockedUntil, at, count, lockedUntil, at]
  );
}

/** Remove the counter (and any lock) for one scope and account. */
export async function deleteAttempts(scope, identifier) {
  await pool.query('DELETE FROM login_attempts WHERE scope = ? AND identifier = ?', [scope, identifier]);
}
