import { RULES } from '@tm/shared/src/services/config.js';
import { cleanMobile, cleanName, describeDevice, fullNameProblem, normaliseEmail } from '@tm/shared/src/domain/account.js';
import { maskEmail } from '@tm/shared/src/utils/format.js';
import { validateAdminPassword, validateEmail, validateMobile, validatePassword } from '@tm/shared/src/utils/validation.js';
import { config } from '../../config.js';
import { tx } from '../../db.js';
import { ApiError } from '../../lib/ApiError.js';
import { newId } from '../../lib/ids.js';
import { checkSecret, hashSecret, newCode } from '../../lib/passwords.js';
import { now } from '../../lib/time.js';
import { signToken } from '../../lib/tokens.js';
import * as messages from './auth.messages.js';
import * as repo from './auth.repo.js';
import { assertNotLocked, clearAttempts, reserveAttempt, wrongAnswer } from './lockout.js';

/**
 * Authentication for both portals (docs/backend-development-phases.md §9.1):
 * - a session is a signed JWT (lib/tokens.js), sent by the page as a Bearer token;
 * - passwords and codes are stored only as bcrypt hashes (lib/passwords.js);
 * - failed attempts and lockouts live in the database (lockout.js), so clearing the browser's data
 *   unlocks nothing;
 * - codes are 6 random digits sent by EMAIL, never by SMS (auth.messages.js), and never appear in a
 *   response. Since Phase 12 that includes every customer code: a customer account is created only
 *   after the code emailed to its address comes back, a forgotten password is reset with an emailed
 *   code, and a password changed in My profile needs the current password AND an emailed code;
 * - the signed-in account always comes from the token (req.user, passed in by auth.routes.js),
 *   never from an id the page sends.
 * Pure rules (email/mobile/name cleaning, the field checks, device names) come from @tm/shared, the
 * same files the pages use for their form checks (§7.8), so a form and the server say the same thing.
 */

const minutes = (n) => n * 60000;

// A code request (admin sign-in, contact change, and the customer's sign-up, password reset and
// password change) can be resent and used for at most this long after it was made; then the user
// starts again. Each code itself expires sooner (RULES.codeValidMinutes); a resend gives a new one.
const REQUEST_LIFETIME = minutes(30);

// When a code sent at `at` expires, and when another may be requested
const codeTimes = (at) => ({ expiresAt: at + minutes(RULES.codeValidMinutes), resendAt: at + RULES.codeResendSeconds * 1000 });

// True when a code request can no longer be used: missing, already spent, or older than REQUEST_LIFETIME
const isDead = (request, at) => !request || Boolean(request.usedAt) || request.createdAt + REQUEST_LIFETIME < at;

// Customer details safe to send to the page (never the password hash). firstName / middleName /
// lastName are '' for accounts whose parts were never saved or were cleared by a name edit.
const publicCustomer = (c) => ({
  id: c.id,
  name: c.name,
  firstName: c.firstName || '',
  middleName: c.middleName || '',
  lastName: c.lastName || '',
  email: c.email,
  mobile: c.mobile,
  company: c.company || '',
  createdAt: c.createdAt,
  role: 'customer'
});

// Admin details for the session. `role` here is the job title shown in the UI (e.g. "Administrator").
const publicAdmin = (a) => ({ id: a.id, name: a.name, email: a.email, mobile: a.mobile, role: a.role });

// Everything My account shows. The password itself never leaves the service; only when it last changed.
const adminProfile = (a) => ({
  ...publicAdmin(a),
  createdAt: a.createdAt || null,
  passwordChangedAt: a.passwordChangedAt || null,
  lastSignInAt: a.lastSignInAt || null,
  lastSignInDevice: a.lastSignInDevice || '',
  previousSignInAt: a.previousSignInAt || null,
  failedSinceLastSignIn: a.failedSinceLastSignIn || 0,
  failedAttempts: a.failedAttempts || 0
});

/**
 * A signed-in customer session, { token, user }: the shape createAuth saves. "Remember me" gets the
 * longer token (JWT_CUSTOMER_REMEMBER_TTL, 7 days), otherwise JWT_CUSTOMER_TTL (12 hours).
 */
function customerSession(customer, remember = false) {
  const token = signToken(
    { id: customer.id, role: 'customer', name: customer.name, passwordChangedAt: customer.passwordChangedAt },
    { ttl: remember ? config.jwt.customerRememberTtl : config.jwt.customerTtl }
  );
  return { token, user: publicCustomer(customer) };
}

/**
 * Check the current password before a sensitive change. Wrong guesses count toward a lockout, so a
 * session left open can't be used to guess the password. `scope` keeps the counters apart:
 * 'customer-reauth' for customers, 'admin-reauth' for admins (both keyed by account id).
 */
async function assertCurrentPassword(scope, account, password) {
  const attempt = await reserveAttempt(scope, account.id);
  if (await checkSecret(password, account.passwordHash)) {
    await clearAttempts(scope, account.id);
    return;
  }
  throw wrongAnswer(scope, attempt, new ApiError('INVALID_CREDENTIALS', 'Your current password is incorrect.', { field: 'current' }));
}

/* ============================ Customers ============================ */

/**
 * Customer log in: stop if locked, check email + password, count failures, return a session.
 * `remember` ("Remember me") only decides how long the token lasts.
 */
export async function customerLogin({ email, password, remember = false }) {
  const address = normaliseEmail(email);
  const attempt = await reserveAttempt('customer', address);
  const customer = await repo.findCustomerByEmail(address);
  // Same message for an unknown email and a wrong password, so emails can't be guessed
  if (!(await checkSecret(password, customer && customer.passwordHash))) {
    throw wrongAnswer('customer', attempt, new ApiError('INVALID_CREDENTIALS', 'Incorrect email or password.'));
  }
  await clearAttempts('customer', address);
  return customerSession(customer, remember);
}

/* ---------------- Sign-up: form → code emailed to the new address → account ---------------- */

/**
 * Sign-up, step 1 (Phase 12): check the form (the same checks as the page: first and last name
 * required, email and mobile format, password rules), make sure no account uses the email, then save
 * the request and email a 6-digit code to that address. No account exists yet: confirmSignUp creates
 * it once the code comes back, which proves the customer owns the address. The password is kept only
 * as a hash. A newer request for the same email replaces an older one, and at most 5 code emails an
 * hour go to one address (code-email), so the form cannot be used to flood someone's inbox.
 * Returns what the code step needs: { challengeId, maskedEmail, expiresAt, resendAt }.
 */
export async function startSignUp({ firstName = '', middleName = '', lastName = '', email = '', mobile = '', password = '' }) {
  const first = firstName.trim();
  const middle = middleName.trim();
  const last = lastName.trim();
  if (!first) throw new ApiError('INVALID', 'First name is required.', { field: 'firstName' });
  if (!last) throw new ApiError('INVALID', 'Last name is required.', { field: 'lastName' });
  const address = normaliseEmail(email);
  const problem =
    (validateEmail(address) && { field: 'email', message: validateEmail(address) }) ||
    (validateMobile(mobile) && { field: 'mobile', message: validateMobile(mobile) }) ||
    (validatePassword(password) && { field: 'password', message: validatePassword(password) });
  if (problem) throw new ApiError('INVALID', problem.message, { field: problem.field });
  if (await repo.findCustomerByEmail(address)) throw new ApiError('EMAIL_TAKEN', 'An account with this email already exists.', { field: 'email' });
  await reserveAttempt('code-email', address);

  const at = now();
  const code = newCode(RULES.codeLength);
  const request = {
    id: newId('sgn'),
    email: address,
    firstName: first,
    middleName: middle,
    lastName: last,
    mobile: cleanMobile(mobile),
    passwordHash: await hashSecret(password),
    codeHash: await hashSecret(code),
    ...codeTimes(at),
    createdAt: at
  };
  await repo.deleteSignupsFor(address);
  await repo.insertSignup(request);
  try {
    await messages.sendSignUpCode(request, code);
  } catch (err) {
    await repo.deleteSignup(request.id); // nobody received this code
    throw err;
  }
  return { challengeId: request.id, maskedEmail: maskEmail(address), expiresAt: request.expiresAt, resendAt: request.resendAt };
}

/** Sign-up: email a new code (only after the resend cooldown). The old code stops working, and the expiry and resend timers restart. */
export async function resendSignUpCode(challengeId) {
  const at = now();
  const request = await repo.findSignup(challengeId);
  if (isDead(request, at)) throw new ApiError('CHALLENGE_EXPIRED', 'Your sign-up request expired. Please start again.');
  if (request.resendAt > at) throw new ApiError('TOO_SOON', 'Please wait before requesting another code.');
  await reserveAttempt('code-email', request.email);

  const code = newCode(RULES.codeLength);
  const times = codeTimes(at);
  await repo.replaceSignupCode(request.id, { codeHash: await hashSecret(code), ...times });
  try {
    await messages.sendSignUpCode(request, code);
  } catch (err) {
    await repo.setSignupResendAt(request.id, at); // let the customer ask again at once
    throw err;
  }
  return times;
}

/**
 * Sign-up, step 2: check the emailed code, then create the account and sign the customer in.
 * Wrong codes count toward a short lockout (5 in a row, then a pause), like every other code. The
 * request is spent and the account made in one transaction; someone else may have signed up with the
 * same email while the code was on its way, so the UNIQUE email index is the last guard (EMAIL_TAKEN).
 * The account's `name` ("First Middle Last") is built from the parts, because the rest of the system
 * (admin lists, reservations, profile) displays `name`. Returns the session { token, user }.
 */
export async function confirmSignUp({ challengeId, code }) {
  const at = now();
  const expired = new ApiError('CHALLENGE_EXPIRED', 'Your sign-up request expired. Please start again.');
  const request = await repo.findSignup(challengeId);
  if (isDead(request, at)) throw expired;
  await assertNotLocked('signup-code', request.email);
  if (request.expiresAt < at) throw new ApiError('CODE_EXPIRED', 'This code has expired. Request a new one.');

  const attempt = await reserveAttempt('signup-code', request.email);
  if (!(await checkSecret(code, request.codeHash))) {
    await repo.addSignupAttempt(request.id);
    throw wrongAnswer('signup-code', attempt, new ApiError('INVALID_CODE', 'That code is incorrect.'));
  }
  await clearAttempts('signup-code', request.email);

  const customer = {
    id: newId('cus'),
    firstName: request.firstName,
    middleName: request.middleName,
    lastName: request.lastName,
    name: [request.firstName, request.middleName, request.lastName].filter(Boolean).join(' '),
    email: request.email,
    mobile: request.mobile,
    company: '',
    createdAt: at,
    passwordChangedAt: null
  };
  try {
    await tx(async (conn) => {
      if (!(await repo.markSignupUsed(conn, request.id, at))) throw expired;
      await repo.insertCustomer({ ...customer, passwordHash: request.passwordHash }, conn);
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new ApiError('EMAIL_TAKEN', 'An account with this email already exists.', { field: 'email' });
    throw err;
  }
  await clearAttempts('code-email', request.email);
  return customerSession(customer);
}

/* ---------------- Forgot password: email → code emailed → new password ---------------- */

/**
 * Step 1: check that an account uses this email, then email a 6-digit code to it (Phase 12; before,
 * it was texted to the account's mobile). Returns the request ID and the masked address to show.
 * Saying that no account uses the email is the owner's choice; the strict per-IP rate limit on this
 * route (5 a minute) keeps it from being used to test long lists of emails, and at most 5 code emails
 * an hour go to one address (code-email).
 */
export async function startPasswordReset({ email }) {
  const address = normaliseEmail(email);
  const emailError = validateEmail(address);
  if (emailError) throw new ApiError('INVALID', emailError, { field: 'email' });
  const customer = await repo.findCustomerByEmail(address);
  if (!customer) throw new ApiError('NOT_FOUND', 'We could not find an account with this email.', { field: 'email' });
  await reserveAttempt('code-email', address);

  // A new request replaces any earlier one, so only the newest code works
  const at = now();
  const code = newCode(RULES.codeLength);
  const reset = { id: newId('rst'), customerId: customer.id, codeHash: await hashSecret(code), ...codeTimes(at), createdAt: at };
  await repo.deleteResetsFor(customer.id);
  await repo.insertReset(reset);
  try {
    await messages.sendResetCode(customer, code, reset.id);
  } catch (err) {
    await repo.deleteReset(reset.id); // nobody received this code
    throw err;
  }
  return { challengeId: reset.id, maskedEmail: maskEmail(customer.email), expiresAt: reset.expiresAt, resendAt: reset.resendAt };
}

/** Email a new code (only after the resend cooldown): the old code stops working, and the expiry and resend timers restart. */
export async function resendPasswordResetCode(challengeId) {
  const at = now();
  const expired = new ApiError('CHALLENGE_EXPIRED', 'Your reset request expired. Please start again.');
  const reset = await repo.findReset(challengeId);
  if (isDead(reset, at)) throw expired;
  if (reset.resendAt > at) throw new ApiError('TOO_SOON', 'Please wait before requesting another code.');
  const customer = await repo.findCustomerById(reset.customerId);
  if (!customer) throw expired;
  await reserveAttempt('code-email', normaliseEmail(customer.email));

  const code = newCode(RULES.codeLength);
  const times = codeTimes(at);
  await repo.replaceResetCode(reset.id, { codeHash: await hashSecret(code), ...times });
  try {
    await messages.sendResetCode(customer, code, reset.id);
  } catch (err) {
    await repo.setResetResendAt(reset.id, at); // let the customer ask again at once
    throw err;
  }
  return times;
}

/** Step 2: check the emailed code. Wrong codes count toward a short lockout, like the admin code. */
export async function verifyPasswordResetCode({ challengeId, code }) {
  const at = now();
  const expired = new ApiError('CHALLENGE_EXPIRED', 'Your reset request expired. Please start again.');
  const reset = await repo.findReset(challengeId);
  if (isDead(reset, at)) throw expired;
  const customer = await repo.findCustomerById(reset.customerId);
  if (!customer) throw expired;
  await assertNotLocked('reset-code', customer.email);
  if (reset.expiresAt < at) throw new ApiError('CODE_EXPIRED', 'This code has expired. Request a new one.');

  const attempt = await reserveAttempt('reset-code', customer.email);
  if (!(await checkSecret(code, reset.codeHash))) {
    await repo.addResetAttempt(reset.id);
    throw wrongAnswer('reset-code', attempt, new ApiError('INVALID_CODE', 'That code is incorrect.'));
  }
  await clearAttempts('reset-code', customer.email);
  // Give the customer time to choose the new password after verifying
  await repo.markResetVerified(reset.id, { at, expiresAt: at + minutes(RULES.codeValidMinutes) });
  return { ok: true };
}

/**
 * Step 3: save the new password (only after the code was verified). The request is used up, every
 * session made before it ends (password_changed_at moves), the customer's other waiting resets and
 * password changes are removed (a code sent for the old password must not set one later), and any
 * login lockout on the account is lifted so the customer can log in right away.
 *
 * `user` is req.user when the request carries a valid session (the route reads the token without
 * requiring one). When it is this same customer — "Forgot your current password?" in My profile —
 * the answer also carries `token`, a new token for that session that expires when the old one
 * would have, so the page stays signed in, like after a password change. Returns { ok, email[, token] }.
 */
export async function completePasswordReset({ challengeId, password }, user = null) {
  const at = now();
  const expired = new ApiError('CHALLENGE_EXPIRED', 'Your reset request expired. Please start again.');
  const reset = await repo.findReset(challengeId);
  if (isDead(reset, at) || !reset.verifiedAt || reset.expiresAt < at) throw expired;
  const passwordError = validatePassword(password);
  if (passwordError) throw new ApiError('INVALID', passwordError, { field: 'password' });
  const customer = await repo.findCustomerById(reset.customerId);
  if (!customer) throw expired;

  const passwordHash = await hashSecret(password);
  await tx(async (conn) => {
    // Spent by a request sent at the same moment: this one must not change the password again
    if (!(await repo.markResetUsed(conn, reset.id, at))) throw expired;
    await repo.updateCustomerPassword(customer.id, passwordHash, at, conn);
    await repo.deleteWaitingPasswordRequests(customer.id, conn);
  });
  await clearAttempts('customer', customer.email);
  await clearAttempts('code-email', normaliseEmail(customer.email));
  const result = { ok: true, email: customer.email };
  if (user && user.role === 'customer' && user.id === customer.id) {
    result.token = signToken({ id: customer.id, role: 'customer', name: customer.name, passwordChangedAt: at }, { expiresAt: user.exp });
  }
  return result;
}

/** Latest profile details for a customer (the signed-in one: the route passes req.user.id). */
export async function getCustomerProfile(customerId) {
  const customer = await repo.findCustomerById(customerId);
  if (!customer) throw new ApiError('NOT_FOUND', 'Account not found.');
  return publicCustomer(customer);
}

/**
 * Save name, mobile and company (same checks as the profile form: first and last name, a valid mobile number).
 * The profile form edits the full name only, so when the name changes the first / middle / last parts
 * saved at sign-up no longer describe it; they are cleared rather than left showing the old name.
 */
export async function updateCustomerProfile(customerId, { name = '', mobile = '', company = '' }) {
  const clean = cleanName(name);
  const nameError = fullNameProblem(clean);
  if (nameError) throw new ApiError('INVALID', nameError, { field: 'name' });
  const mobileError = validateMobile(mobile);
  if (mobileError) throw new ApiError('INVALID', mobileError, { field: 'mobile' });
  const customer = await repo.findCustomerById(customerId);
  if (!customer) throw new ApiError('NOT_FOUND', 'Account not found.');

  const parts = customer.name === clean ? customer : { firstName: '', middleName: '', lastName: '' };
  const saved = {
    ...customer,
    firstName: parts.firstName,
    middleName: parts.middleName,
    lastName: parts.lastName,
    name: clean,
    mobile: cleanMobile(mobile),
    company: String(company || '').trim()
  };
  await repo.updateCustomerProfile(customerId, saved);
  return publicCustomer(saved);
}

/* ---------------- Change password in My profile: current and new password → emailed code ---------------- */

/**
 * Step 1 (Phase 12): the current password first (wrong guesses count toward a lockout, like the
 * admin's), then the customer password rules, and the new one must differ from the current one.
 * The new password is kept as a hash with the request, and a code is emailed to the account's
 * address: the password changes only when that code comes back, so someone at a computer left
 * signed in cannot change it without the customer's email. A newer request replaces an older one;
 * at most 5 code emails an hour go to one address (code-email).
 * Returns { challengeId, maskedEmail, expiresAt, resendAt }.
 */
export async function startPasswordChange(customerId, { current, next }) {
  const customer = await repo.findCustomerById(customerId);
  if (!customer) throw new ApiError('NOT_FOUND', 'Account not found.');
  await assertCurrentPassword('customer-reauth', customer, current);
  const problem = validatePassword(next);
  if (problem) throw new ApiError('INVALID', problem, { field: 'next' });
  if (next === current) throw new ApiError('INVALID', 'Choose a password different from the current one.', { field: 'next' });
  await reserveAttempt('code-email', normaliseEmail(customer.email));

  const at = now();
  const code = newCode(RULES.codeLength);
  const change = { id: newId('pwc'), customerId: customer.id, newPasswordHash: await hashSecret(next), codeHash: await hashSecret(code), ...codeTimes(at), createdAt: at };
  await repo.deleteChangesFor(customer.id);
  await repo.insertChange(change);
  try {
    await messages.sendPasswordChangeCode(customer, code, change.id);
  } catch (err) {
    await repo.deleteChange(change.id); // nobody received this code
    throw err;
  }
  return { challengeId: change.id, maskedEmail: maskEmail(customer.email), expiresAt: change.expiresAt, resendAt: change.resendAt };
}

// The customer's own live password-change request, or CHALLENGE_EXPIRED. Another customer's request
// counts as expired too, so a request id seen elsewhere cannot be used from this account.
async function ownPasswordChange(customerId, challengeId, at) {
  const change = await repo.findChange(challengeId);
  if (isDead(change, at) || change.customerId !== customerId) throw new ApiError('CHALLENGE_EXPIRED', 'This request expired. Please start again.');
  return change;
}

/** Password change: email a new code (only after the resend cooldown; the old code stops working, the timers restart). */
export async function resendPasswordChangeCode(customerId, challengeId) {
  const at = now();
  const change = await ownPasswordChange(customerId, challengeId, at);
  if (change.resendAt > at) throw new ApiError('TOO_SOON', 'Please wait before requesting another code.');
  const customer = await repo.findCustomerById(customerId);
  if (!customer) throw new ApiError('NOT_FOUND', 'Account not found.');
  await reserveAttempt('code-email', normaliseEmail(customer.email));

  const code = newCode(RULES.codeLength);
  const times = codeTimes(at);
  await repo.replaceChangeCode(change.id, { codeHash: await hashSecret(code), ...times });
  try {
    await messages.sendPasswordChangeCode(customer, code, change.id);
  } catch (err) {
    await repo.setChangeResendAt(change.id, at); // let the customer ask again at once
    throw err;
  }
  return times;
}

/**
 * Step 2: check the emailed code (wrong codes count toward a short lockout), then save the new
 * password. The request is spent, the password saved and the customer's other waiting resets and
 * changes removed in one transaction. Every other session of the customer ends; this one goes on with
 * a new token (returned as `token`, which the page's API client swaps in) that expires when the old
 * one would have. `user` is req.user: the signed-in customer and the expiry of their current token.
 */
export async function confirmPasswordChange(user, { challengeId, code }) {
  const at = now();
  const expired = new ApiError('CHALLENGE_EXPIRED', 'This request expired. Please start again.');
  const change = await ownPasswordChange(user.id, challengeId, at);
  await assertNotLocked('change-code', user.id);
  if (change.expiresAt < at) throw new ApiError('CODE_EXPIRED', 'This code has expired. Request a new one.');

  const attempt = await reserveAttempt('change-code', user.id);
  if (!(await checkSecret(code, change.codeHash))) {
    await repo.addChangeAttempt(change.id);
    throw wrongAnswer('change-code', attempt, new ApiError('INVALID_CODE', 'That code is incorrect.'));
  }
  await clearAttempts('change-code', user.id);
  const customer = await repo.findCustomerById(user.id);
  if (!customer) throw new ApiError('NOT_FOUND', 'Account not found.');

  await tx(async (conn) => {
    // Spent by a request sent at the same moment: this one must not change the password again
    if (!(await repo.markChangeUsed(conn, change.id, at))) throw expired;
    await repo.updateCustomerPassword(customer.id, change.newPasswordHash, at, conn);
    await repo.deleteWaitingPasswordRequests(customer.id, conn);
  });
  await clearAttempts('code-email', normaliseEmail(customer.email));
  const token = signToken({ id: customer.id, role: 'customer', name: customer.name, passwordChangedAt: at }, { expiresAt: user.exp });
  return { ok: true, token };
}

/* ============================ Admin ============================ */

/**
 * Stage 1: check the password and email the verification code to the address on file.
 * Returns what the code pop-up needs, never the code itself.
 */
export async function adminStartSignIn({ email, password }) {
  const address = normaliseEmail(email);
  const attempt = await reserveAttempt('admin', address);
  const admin = await repo.findAdminByEmail(address);
  if (!(await checkSecret(password, admin && admin.passwordHash))) {
    // A wrong password for a real admin is counted on the account, shown later in My account
    if (admin) await repo.addAdminFailedAttempt(admin.id);
    throw wrongAnswer('admin', attempt, new ApiError('INVALID_CREDENTIALS', 'Incorrect username or password.'));
  }
  await clearAttempts('admin', address);

  // Password OK: a new code request (it replaces any earlier one), with an expiry and a resend cooldown
  const at = now();
  const code = newCode(RULES.codeLength);
  const challenge = { id: newId('chl'), purpose: 'sign_in', adminId: admin.id, codeHash: await hashSecret(code), ...codeTimes(at), createdAt: at };
  await repo.deleteChallengesFor(admin.id, 'sign_in');
  await repo.insertChallenge(challenge);
  try {
    await messages.sendSignInCode(admin, code, challenge.id);
  } catch (err) {
    await repo.deleteChallenge(challenge.id); // nobody received this code
    throw err;
  }
  return { challengeId: challenge.id, maskedEmail: maskEmail(admin.email), expiresAt: challenge.expiresAt, resendAt: challenge.resendAt };
}

/** Send a new code (only after the resend cooldown): the old code stops working, and the expiry and resend timers restart. */
export async function adminResendCode(challengeId) {
  const at = now();
  const expired = new ApiError('CHALLENGE_EXPIRED', 'Your sign-in session expired. Please start again.');
  const challenge = await repo.findChallenge(challengeId);
  if (isDead(challenge, at) || challenge.purpose !== 'sign_in') throw expired;
  if (challenge.resendAt > at) throw new ApiError('TOO_SOON', 'Please wait before requesting another code.');
  const admin = await repo.findAdminById(challenge.adminId);
  if (!admin) throw expired;

  const code = newCode(RULES.codeLength);
  const times = codeTimes(at);
  await repo.replaceChallengeCode(challenge.id, { codeHash: await hashSecret(code), ...times });
  try {
    await messages.sendSignInCode(admin, code, challenge.id);
  } catch (err) {
    await repo.setChallengeResendAt(challenge.id, at); // let the admin ask again at once
    throw err;
  }
  return times;
}

/**
 * Stage 2: verify the code and open the admin session. Records the sign-in (previous and last
 * sign-in, the device from the User-Agent header, and the failures since the last sign-in).
 * `signedInAt` and `device` stay with this session so My account can tell it apart from newer
 * sign-ins elsewhere.
 */
export async function adminVerifyCode({ challengeId, code }, userAgent = '') {
  const at = now();
  const expired = new ApiError('CHALLENGE_EXPIRED', 'Your sign-in session expired. Please start again.');
  const challenge = await repo.findChallenge(challengeId);
  if (isDead(challenge, at) || challenge.purpose !== 'sign_in') throw expired;
  const admin = await repo.findAdminById(challenge.adminId);
  if (!admin) throw expired;
  const email = normaliseEmail(admin.email);
  await assertNotLocked('admin-code', email);
  if (challenge.expiresAt < at) throw new ApiError('CODE_EXPIRED', 'This code has expired. Request a new one.');

  // Wrong code: counted separately from password failures (shorter lockout), and on the admin's record
  const attempt = await reserveAttempt('admin-code', email);
  if (!(await checkSecret(code, challenge.codeHash))) {
    await repo.addAdminFailedAttempt(admin.id);
    await repo.addChallengeAttempt(challenge.id);
    throw wrongAnswer('admin-code', attempt, new ApiError('INVALID_CODE', 'That code is incorrect.'));
  }

  // Correct code: clear the counter, spend the request, record the sign-in and return the session
  await clearAttempts('admin-code', email);
  const device = describeDevice(userAgent);
  await tx(async (conn) => {
    if (!(await repo.markChallengeUsed(conn, challenge.id, at))) throw expired;
    await repo.recordAdminSignIn(conn, admin.id, { at, device });
  });
  const token = signToken({ id: admin.id, role: 'admin', name: admin.name, passwordChangedAt: admin.passwordChangedAt }, { ttl: config.jwt.adminTtl });
  return { token, user: { ...publicAdmin(admin), signedInAt: at, device } };
}

/* ============================ Admin account (My account) ============================ */

/** Latest account record for the signed-in admin. NOT_FOUND means the account was removed or reset. */
export async function getAdminProfile(adminId) {
  const admin = await repo.findAdminById(adminId);
  if (!admin) throw new ApiError('NOT_FOUND', 'Account not found.');
  return adminProfile(admin);
}

/** Save the admin's display name (first and last name, up to 80 characters). */
export async function updateAdminProfile(adminId, { name }) {
  const clean = cleanName(name);
  const problem = fullNameProblem(clean, 80);
  if (problem) throw new ApiError('INVALID', problem, { field: 'name' });
  const admin = await repo.findAdminById(adminId);
  if (!admin) throw new ApiError('NOT_FOUND', 'Account not found.');
  await repo.updateAdminName(adminId, clean);
  return adminProfile({ ...admin, name: clean });
}

/**
 * Change the admin password: current password first, then the admin password rules. Every session
 * of this admin ends, this one included (its token carries the old password version); the page
 * signs out and asks for the new password.
 */
export async function changeAdminPassword(adminId, { current, next }) {
  const admin = await repo.findAdminById(adminId);
  if (!admin) throw new ApiError('NOT_FOUND', 'Account not found.');
  await assertCurrentPassword('admin-reauth', admin, current);
  const problem = validateAdminPassword(next);
  if (problem) throw new ApiError('INVALID', problem, { field: 'next' });
  if (next === current) throw new ApiError('INVALID', 'Choose a password different from the current one.', { field: 'next' });
  await repo.updateAdminPassword(adminId, await hashSecret(next), now());
  return { ok: true };
}

/**
 * Email / mobile change, step 1: check the new value and the current password, then email a code.
 * A new email gets the code itself (proves the admin owns it); a mobile change gets it on the
 * email already on file, since codes are never sent by SMS.
 */
export async function adminStartContactChange(adminId, { field, value, password }) {
  if (field !== 'email' && field !== 'mobile') throw new ApiError('INVALID', 'Unknown field.');
  const admin = await repo.findAdminById(adminId);
  if (!admin) throw new ApiError('NOT_FOUND', 'Account not found.');

  const clean = field === 'email' ? normaliseEmail(value) : cleanMobile(value);
  const problem = field === 'email' ? validateEmail(clean) : validateMobile(clean);
  if (problem) throw new ApiError('INVALID', problem, { field: 'value' });
  if (clean === (field === 'email' ? normaliseEmail(admin.email) : admin.mobile)) {
    throw new ApiError('INVALID', `This is already your ${field === 'email' ? 'email' : 'mobile number'}.`, { field: 'value' });
  }
  if (field === 'email' && (await repo.emailUsedByOtherAdmin(clean, adminId))) {
    throw new ApiError('EMAIL_TAKEN', 'Another admin account already uses this email.', { field: 'value' });
  }
  await assertCurrentPassword('admin-reauth', admin, password);

  const at = now();
  const code = newCode(RULES.codeLength);
  const challenge = { id: newId('chc'), purpose: 'contact_change', adminId, codeHash: await hashSecret(code), field, value: clean, ...codeTimes(at), createdAt: at };
  await repo.deleteChallengesFor(adminId, 'contact_change');
  await repo.insertChallenge(challenge);
  try {
    await messages.sendContactCode(admin, { field, value: clean }, code, challenge.id);
  } catch (err) {
    await repo.deleteChallenge(challenge.id); // nobody received this code
    throw err;
  }
  const sentTo = maskEmail(field === 'email' ? clean : admin.email);
  return { challengeId: challenge.id, sentTo, expiresAt: challenge.expiresAt, resendAt: challenge.resendAt };
}

// The admin's own live contact-change request, or CHALLENGE_EXPIRED. Another admin's request counts
// as expired too, so a request id seen elsewhere cannot be used from this account.
async function ownContactChallenge(adminId, challengeId, at) {
  const challenge = await repo.findChallenge(challengeId);
  if (isDead(challenge, at) || challenge.purpose !== 'contact_change' || challenge.adminId !== adminId) {
    throw new ApiError('CHALLENGE_EXPIRED', 'This request expired. Please start again.');
  }
  return challenge;
}

/** Email / mobile change: send a new code (the old one stops working; the expiry and resend timers restart). */
export async function adminResendContactCode(adminId, challengeId) {
  const at = now();
  const challenge = await ownContactChallenge(adminId, challengeId, at);
  if (challenge.resendAt > at) throw new ApiError('TOO_SOON', 'Please wait before requesting another code.');
  const admin = await repo.findAdminById(adminId);
  if (!admin) throw new ApiError('NOT_FOUND', 'Account not found.');

  const code = newCode(RULES.codeLength);
  const times = codeTimes(at);
  await repo.replaceChallengeCode(challenge.id, { codeHash: await hashSecret(code), ...times });
  try {
    await messages.sendContactCode(admin, challenge, code, challenge.id);
  } catch (err) {
    await repo.setChallengeResendAt(challenge.id, at); // let the admin ask again at once
    throw err;
  }
  return times;
}

/** Email / mobile change, step 2: check the code, then save the new value. Returns the updated profile. */
export async function adminConfirmContactChange(adminId, { challengeId, code }) {
  const at = now();
  const challenge = await ownContactChallenge(adminId, challengeId, at);
  await assertNotLocked('admin-contact', adminId);
  if (challenge.expiresAt < at) throw new ApiError('CODE_EXPIRED', 'This code has expired. Request a new one.');

  const attempt = await reserveAttempt('admin-contact', adminId);
  if (!(await checkSecret(code, challenge.codeHash))) {
    await repo.addChallengeAttempt(challenge.id);
    // The last try used up: the request is cancelled, so the admin starts again once the pause ends
    if (attempt.lockedUntil) await repo.deleteChallenge(challenge.id);
    throw wrongAnswer('admin-contact', attempt, new ApiError('INVALID_CODE', 'That code is incorrect.'));
  }
  await clearAttempts('admin-contact', adminId);

  // Check again in case another admin took the email while the code was pending; the UNIQUE email
  // index catches the last-moment tie (ER_DUP_ENTRY), and the rollback leaves the request unspent
  const taken = new ApiError('EMAIL_TAKEN', 'Another admin account already uses this email.');
  if (challenge.field === 'email' && (await repo.emailUsedByOtherAdmin(challenge.value, adminId))) throw taken;
  try {
    await tx(async (conn) => {
      if (!(await repo.markChallengeUsed(conn, challenge.id, at))) throw new ApiError('CHALLENGE_EXPIRED', 'This request expired. Please start again.');
      await repo.updateAdminContact(conn, adminId, challenge.field, challenge.value);
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw taken;
    throw err;
  }
  return getAdminProfile(adminId);
}
