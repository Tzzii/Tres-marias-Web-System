import { pool } from '../../db.js';



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
    termsVersion: row.terms_version || '',
    termsAcceptedAt: row.terms_accepted_at ?? null
  };

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
    sessionId: row.session_id,
    lastSignInAt: row.last_sign_in_at,
    lastSignInDevice: row.last_sign_in_device,
    previousSignInAt: row.previous_sign_in_at,
    failedAttempts: row.failed_attempts,
    failedSinceLastSignIn: row.failed_since_last_sign_in
  };

const first = ([rows]) => rows[0] || null;

export const findCustomerByEmail = async (email) =>
  toCustomer(first(await pool.query('SELECT * FROM customers WHERE email = ?', [email])));

export const findCustomerById = async (id) =>
  toCustomer(first(await pool.query('SELECT * FROM customers WHERE id = ?', [id])));

export async function insertCustomer(c, conn = pool) {
  await conn.query(
    `INSERT INTO customers (id, first_name, middle_name, last_name, name, email, mobile, password_hash, company, created_at, password_changed_at,
                            terms_version, terms_accepted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    [
      c.id,
      c.firstName,
      c.middleName,
      c.lastName,
      c.name,
      c.email,
      c.mobile,
      c.passwordHash,
      c.company,
      c.createdAt,
      c.termsVersion || '',
      c.termsAcceptedAt ?? null
    ]
  );
}

export async function setCustomerTerms(id, version, at) {
  await pool.query('UPDATE customers SET terms_version = ?, terms_accepted_at = ? WHERE id = ?', [version, at, id]);
}

export async function updateCustomerProfile(id, { firstName, middleName, lastName, name, mobile, company }) {
  await pool.query(
    'UPDATE customers SET first_name = ?, middle_name = ?, last_name = ?, name = ?, mobile = ?, company = ? WHERE id = ?',
    [firstName, middleName, lastName, name, mobile, company, id]
  );
}

export async function emailUsedByOtherCustomer(email, customerId) {
  const [rows] = await pool.query('SELECT 1 FROM customers WHERE email = ? AND id <> ? LIMIT 1', [email, customerId]);
  return rows.length > 0;
}

export async function updateCustomerEmail(conn, id, email) {
  await conn.query('UPDATE customers SET email = ? WHERE id = ?', [email, id]);
}

export async function updateCustomerPassword(id, passwordHash, at, conn = pool) {
  await conn.query('UPDATE customers SET password_hash = ?, password_changed_at = ? WHERE id = ?', [
    passwordHash,
    at,
    id
  ]);
}

export const findAdminByEmail = async (email) =>
  toAdmin(first(await pool.query('SELECT * FROM admins WHERE email = ?', [email])));

export const findAdminById = async (id) => toAdmin(first(await pool.query('SELECT * FROM admins WHERE id = ?', [id])));

export async function emailUsedByOtherAdmin(email, adminId) {
  const [rows] = await pool.query('SELECT 1 FROM admins WHERE email = ? AND id <> ? LIMIT 1', [email, adminId]);
  return rows.length > 0;
}

export async function addAdminFailedAttempt(id) {
  await pool.query('UPDATE admins SET failed_attempts = failed_attempts + 1 WHERE id = ?', [id]);
}

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

export async function updateAdminName(id, name) {
  await pool.query('UPDATE admins SET name = ? WHERE id = ?', [name, id]);
}

export async function updateAdminPassword(id, passwordHash, at) {
  await pool.query('UPDATE admins SET password_hash = ?, password_changed_at = ? WHERE id = ?', [passwordHash, at, id]);
}

export async function updateAdminContact(conn, id, field, value) {
  if (field !== 'email' && field !== 'mobile') throw new Error(`updateAdminContact: unknown field "${field}".`);
  await conn.query('UPDATE ?? SET ?? = ? WHERE id = ?', ['admins', field, value, id]);
}

export async function findSessionAccount(role, id) {
  if (role === 'admin') {
    const row = first(await pool.query('SELECT name, password_changed_at, session_id FROM admins WHERE id = ?', [id]));
    return row && { name: row.name, passwordChangedAt: row.password_changed_at, sessionId: row.session_id };
  }
  const row = first(await pool.query('SELECT name, password_changed_at FROM customers WHERE id = ?', [id]));
  return row && { name: row.name, passwordChangedAt: row.password_changed_at };
}


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

export const findChallenge = async (id) =>
  toChallenge(first(await pool.query('SELECT * FROM auth_challenges WHERE id = ?', [id])));

export async function insertChallenge(c) {
  await pool.query(
    `INSERT INTO auth_challenges (id, purpose, admin_id, code_hash, field, new_value, expires_at, resend_at, attempts, used_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)`,
    [c.id, c.purpose, c.adminId, c.codeHash, c.field || null, c.value || null, c.expiresAt, c.resendAt, c.createdAt]
  );
}

export async function deleteChallengesFor(adminId, purpose) {
  await pool.query('DELETE FROM auth_challenges WHERE admin_id = ? AND purpose = ?', [adminId, purpose]);
}

export async function deleteChallenge(id) {
  await pool.query('DELETE FROM auth_challenges WHERE id = ?', [id]);
}

export async function replaceChallengeCode(id, { codeHash, expiresAt, resendAt }) {
  await pool.query('UPDATE auth_challenges SET code_hash = ?, expires_at = ?, resend_at = ? WHERE id = ?', [
    codeHash,
    expiresAt,
    resendAt,
    id
  ]);
}

export async function setChallengeResendAt(id, resendAt) {
  await pool.query('UPDATE auth_challenges SET resend_at = ? WHERE id = ?', [resendAt, id]);
}

export async function addChallengeAttempt(id) {
  await pool.query('UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = ?', [id]);
}

export async function markChallengeUsed(conn, id, at) {
  const [result] = await conn.query('UPDATE auth_challenges SET used_at = ? WHERE id = ? AND used_at IS NULL', [
    at,
    id
  ]);
  return result.affectedRows === 1;
}


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

export const findReset = async (id) =>
  toReset(first(await pool.query('SELECT * FROM password_resets WHERE id = ?', [id])));

export async function insertReset(r) {
  await pool.query(
    `INSERT INTO password_resets (id, customer_id, code_hash, expires_at, resend_at, attempts, verified_at, used_at, created_at)
     VALUES (?, ?, ?, ?, ?, 0, NULL, NULL, ?)`,
    [r.id, r.customerId, r.codeHash, r.expiresAt, r.resendAt, r.createdAt]
  );
}

export async function deleteResetsFor(customerId) {
  await pool.query('DELETE FROM password_resets WHERE customer_id = ?', [customerId]);
}

export async function deleteReset(id) {
  await pool.query('DELETE FROM password_resets WHERE id = ?', [id]);
}

export async function replaceResetCode(id, { codeHash, expiresAt, resendAt }) {
  await pool.query('UPDATE password_resets SET code_hash = ?, expires_at = ?, resend_at = ? WHERE id = ?', [
    codeHash,
    expiresAt,
    resendAt,
    id
  ]);
}

export async function setResetResendAt(id, resendAt) {
  await pool.query('UPDATE password_resets SET resend_at = ? WHERE id = ?', [resendAt, id]);
}

export async function addResetAttempt(id) {
  await pool.query('UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?', [id]);
}

export async function markResetVerified(id, { at, expiresAt }) {
  await pool.query('UPDATE password_resets SET verified_at = ?, expires_at = ? WHERE id = ?', [at, expiresAt, id]);
}

export async function markResetUsed(conn, id, at) {
  const [result] = await conn.query('UPDATE password_resets SET used_at = ? WHERE id = ? AND used_at IS NULL', [
    at,
    id
  ]);
  return result.affectedRows === 1;
}


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

export const findSignup = async (id) =>
  toSignup(first(await pool.query('SELECT * FROM signup_requests WHERE id = ?', [id])));

export async function insertSignup(r) {
  await pool.query(
    `INSERT INTO signup_requests (id, email, first_name, middle_name, last_name, mobile, password_hash, code_hash, expires_at, resend_at, attempts, used_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)`,
    [
      r.id,
      r.email,
      r.firstName,
      r.middleName,
      r.lastName,
      r.mobile,
      r.passwordHash,
      r.codeHash,
      r.expiresAt,
      r.resendAt,
      r.createdAt
    ]
  );
}

export async function deleteSignupsFor(email) {
  await pool.query('DELETE FROM signup_requests WHERE email = ? AND used_at IS NULL', [email]);
}

export async function deleteSignup(id) {
  await pool.query('DELETE FROM signup_requests WHERE id = ?', [id]);
}

export async function replaceSignupCode(id, { codeHash, expiresAt, resendAt }) {
  await pool.query('UPDATE signup_requests SET code_hash = ?, expires_at = ?, resend_at = ? WHERE id = ?', [
    codeHash,
    expiresAt,
    resendAt,
    id
  ]);
}

export async function setSignupResendAt(id, resendAt) {
  await pool.query('UPDATE signup_requests SET resend_at = ? WHERE id = ?', [resendAt, id]);
}

export async function addSignupAttempt(id) {
  await pool.query('UPDATE signup_requests SET attempts = attempts + 1 WHERE id = ?', [id]);
}

export async function markSignupUsed(conn, id, at) {
  const [result] = await conn.query('UPDATE signup_requests SET used_at = ? WHERE id = ? AND used_at IS NULL', [
    at,
    id
  ]);
  return result.affectedRows === 1;
}


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

export const findChange = async (id) =>
  toChange(first(await pool.query('SELECT * FROM password_changes WHERE id = ?', [id])));

export async function insertChange(r) {
  await pool.query(
    `INSERT INTO password_changes (id, customer_id, new_password_hash, code_hash, expires_at, resend_at, attempts, used_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?)`,
    [r.id, r.customerId, r.newPasswordHash, r.codeHash, r.expiresAt, r.resendAt, r.createdAt]
  );
}

export async function deleteChangesFor(customerId) {
  await pool.query('DELETE FROM password_changes WHERE customer_id = ? AND used_at IS NULL', [customerId]);
}

export async function deleteChange(id) {
  await pool.query('DELETE FROM password_changes WHERE id = ?', [id]);
}

export async function replaceChangeCode(id, { codeHash, expiresAt, resendAt }) {
  await pool.query('UPDATE password_changes SET code_hash = ?, expires_at = ?, resend_at = ? WHERE id = ?', [
    codeHash,
    expiresAt,
    resendAt,
    id
  ]);
}

export async function setChangeResendAt(id, resendAt) {
  await pool.query('UPDATE password_changes SET resend_at = ? WHERE id = ?', [resendAt, id]);
}

export async function addChangeAttempt(id) {
  await pool.query('UPDATE password_changes SET attempts = attempts + 1 WHERE id = ?', [id]);
}

export async function markChangeUsed(conn, id, at) {
  const [result] = await conn.query('UPDATE password_changes SET used_at = ? WHERE id = ? AND used_at IS NULL', [
    at,
    id
  ]);
  return result.affectedRows === 1;
}


const toEmailChange = (row) =>
  row && {
    id: row.id,
    customerId: row.customer_id,
    newEmail: row.new_email,
    codeHash: row.code_hash,
    expiresAt: row.expires_at,
    resendAt: row.resend_at,
    attempts: row.attempts,
    usedAt: row.used_at,
    createdAt: row.created_at
  };

export const findEmailChange = async (id) =>
  toEmailChange(first(await pool.query('SELECT * FROM customer_email_changes WHERE id = ?', [id])));

export async function insertEmailChange(change) {
  await pool.query(
    `INSERT INTO customer_email_changes (id, customer_id, new_email, code_hash, expires_at, resend_at, attempts, used_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?)`,
    [
      change.id,
      change.customerId,
      change.newEmail,
      change.codeHash,
      change.expiresAt,
      change.resendAt,
      change.createdAt
    ]
  );
}

export async function deleteEmailChangesFor(customerId) {
  await pool.query('DELETE FROM customer_email_changes WHERE customer_id = ? AND used_at IS NULL', [customerId]);
}

export async function deleteEmailChange(id) {
  await pool.query('DELETE FROM customer_email_changes WHERE id = ?', [id]);
}

export async function replaceEmailChangeCode(id, { codeHash, expiresAt, resendAt }) {
  await pool.query('UPDATE customer_email_changes SET code_hash = ?, expires_at = ?, resend_at = ? WHERE id = ?', [
    codeHash,
    expiresAt,
    resendAt,
    id
  ]);
}

export async function setEmailChangeResendAt(id, resendAt) {
  await pool.query('UPDATE customer_email_changes SET resend_at = ? WHERE id = ?', [resendAt, id]);
}

export async function addEmailChangeAttempt(id) {
  await pool.query('UPDATE customer_email_changes SET attempts = attempts + 1 WHERE id = ?', [id]);
}

export async function markEmailChangeUsed(conn, id, at) {
  const [result] = await conn.query('UPDATE customer_email_changes SET used_at = ? WHERE id = ? AND used_at IS NULL', [
    at,
    id
  ]);
  return result.affectedRows === 1;
}

export async function deleteWaitingPasswordRequests(customerId, conn) {
  await conn.query('DELETE FROM password_changes WHERE customer_id = ? AND used_at IS NULL', [customerId]);
  await conn.query('DELETE FROM password_resets WHERE customer_id = ? AND used_at IS NULL', [customerId]);
}


const toAttempt = (row) => row && { count: row.count, lockedUntil: row.locked_until, updatedAt: row.updated_at };

export const findAttempts = async (scope, identifier) =>
  toAttempt(
    first(
      await pool.query(
        'SELECT count, locked_until, updated_at FROM login_attempts WHERE scope = ? AND identifier = ?',
        [scope, identifier]
      )
    )
  );

export async function ensureAttempts(scope, identifier, at) {
  await pool.query(
    'INSERT INTO login_attempts (scope, identifier, count, locked_until, updated_at) VALUES (?, ?, 0, NULL, ?) ON DUPLICATE KEY UPDATE count = count',
    [scope, identifier, at]
  );
}

export const lockAttempts = async (conn, scope, identifier) =>
  toAttempt(
    first(
      await conn.query(
        'SELECT count, locked_until, updated_at FROM login_attempts WHERE scope = ? AND identifier = ? FOR UPDATE',
        [scope, identifier]
      )
    )
  );

export async function saveAttempts(conn, scope, identifier, { count, lockedUntil, at }) {
  await conn.query(
    `INSERT INTO login_attempts (scope, identifier, count, locked_until, updated_at) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE count = ?, locked_until = ?, updated_at = ?`,
    [scope, identifier, count, lockedUntil, at, count, lockedUntil, at]
  );
}

export async function deleteAttempts(scope, identifier) {
  await pool.query('DELETE FROM login_attempts WHERE scope = ? AND identifier = ?', [scope, identifier]);
}
