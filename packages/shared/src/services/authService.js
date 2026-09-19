import { RULES } from './config.js';
import { ApiError, latency, read, write } from './store.js';
import { maskEmail, maskMobile } from '../utils/format.js';
import { validateAdminPassword, validateEmail, validateMobile, validatePassword } from '../utils/validation.js';

/**
 * Authentication for both portals: customer sign-up / log-in with a lockout
 * after repeated failures, the customer's forgot-password flow (a 6-digit code
 * texted to the mobile number on the account), and the two-stage admin sign-in
 * (password, then a 6-digit code emailed to the address on file).
 */

const LOCK_KEY = 'tm.auth.attempts'; // failed-attempt counters and lockouts, per account
const CHALLENGE_KEY = 'tm.auth.challenge'; // the admin sign-in code request in progress
const CONTACT_CHALLENGE_KEY = 'tm.auth.contactChallenge'; // the admin email / mobile change code request in progress
const RESET_CHALLENGE_KEY = 'tm.auth.resetChallenge'; // the customer forgot-password request in progress

// Load / save the failed-attempt records: { 'customer:email': { count, lockedUntil } }
const readAttempts = () => {
  try {
    return JSON.parse(localStorage.getItem(LOCK_KEY)) || {};
  } catch (e) {
    return {};
  }
};
const writeAttempts = (value) => {
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify(value));
  } catch (e) {
    /* ignore */
  }
};

// Compare emails without spaces or upper/lower case differences
const normalise = (email) => String(email || '').trim().toLowerCase();

/** Throws when the account is locked; returns the attempt record otherwise. */
function assertNotLocked(scope, email) {
  const all = readAttempts();
  const record = all[`${scope}:${email}`];
  if (record && record.lockedUntil && record.lockedUntil > Date.now()) {
    throw new ApiError('LOCKED', 'Too many failed attempts. This account is temporarily locked.', {
      lockedUntil: record.lockedUntil
    });
  }
  return record;
}

/**
 * Count one failed attempt. After `max` failures the account is locked for `lockMinutes`.
 * Returns whether it is now locked and how many attempts are left.
 */
function registerFailure(scope, email, max, lockMinutes) {
  const all = readAttempts();
  const key = `${scope}:${email}`;
  let record = all[key] || { count: 0 };
  // An expired lock starts a fresh round of attempts
  if (record.lockedUntil && record.lockedUntil <= Date.now()) record = { count: 0 };
  record.count += 1;
  const remaining = max - record.count;
  if (record.count >= max) {
    record.lockedUntil = Date.now() + lockMinutes * 60000;
    record.count = 0;
    all[key] = record;
    writeAttempts(all);
    return { locked: true, lockedUntil: record.lockedUntil, remaining: 0 };
  }
  delete record.lockedUntil;
  all[key] = record;
  writeAttempts(all);
  return { locked: false, remaining };
}

/** Reset the failure count after a successful sign-in. */
function clearFailures(scope, email) {
  const all = readAttempts();
  delete all[`${scope}:${email}`];
  writeAttempts(all);
}

/** Remaining lock for an email, used to restore the countdown on page load. */
export function getLockout(scope, email) {
  const record = readAttempts()[`${scope}:${normalise(email)}`];
  return record && record.lockedUntil > Date.now() ? record.lockedUntil : null;
}

// User details safe to send to the page (the password is left out)
// firstName / middleName / lastName exist only for accounts created with the split sign-up form
// (older demo accounts have just `name`), so they fall back to ''.
const publicCustomer = (c) => ({ id: c.id, name: c.name, firstName: c.firstName || '', middleName: c.middleName || '', lastName: c.lastName || '', email: c.email, mobile: c.mobile, company: c.company || '', createdAt: c.createdAt, role: 'customer' });
const publicAdmin = (a) => ({ id: a.id, name: a.name, email: a.email, mobile: a.mobile, role: a.role });

// Random session token, e.g. "cus.k3j9x..."
const makeToken = (prefix) => `${prefix}.${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

/* ============================ Customers ============================ */

/** Customer log in: stop if locked, check email + password, count failures, return a session. */
export async function customerLogin({ email, password }) {
  await latency(350, 700);
  const address = normalise(email);
  assertNotLocked('customer', address);

  const customer = read().customers.find((c) => c.email.toLowerCase() === address);
  // Same message for unknown email and wrong password, so emails can't be guessed
  if (!customer || customer.password !== password) {
    const result = registerFailure('customer', address, RULES.maxLoginAttempts, RULES.loginLockMinutes);
    if (result.locked) {
      throw new ApiError('LOCKED', 'Too many failed attempts. This account is temporarily locked.', {
        lockedUntil: result.lockedUntil
      });
    }
    throw new ApiError('INVALID_CREDENTIALS', 'Incorrect email or password.', { remaining: result.remaining });
  }

  clearFailures('customer', address);
  return { token: makeToken('cus'), user: publicCustomer(customer) };
}

/**
 * Create a customer account (email must be unused) and sign them in.
 * First name, last name, email and mobile are required; middle name is optional.
 * The parts are saved separately, and `name` ("First Middle Last") is built from them
 * because the rest of the system (admin lists, reservations, profile) displays `name`.
 */
export async function customerRegister({ firstName = '', middleName = '', lastName = '', email = '', mobile = '', password = '' }) {
  await latency(450, 850);
  const first = firstName.trim();
  const middle = middleName.trim();
  const last = lastName.trim();
  // Same checks as the form (required fields, email and mobile format, password rules), so the account
  // can't be created with blanks or a bad value even if the form is skipped
  if (!first) throw new ApiError('INVALID', 'First name is required.', { field: 'firstName' });
  if (!last) throw new ApiError('INVALID', 'Last name is required.', { field: 'lastName' });
  const address = normalise(email);
  const problem =
    (validateEmail(address) && { field: 'email', message: validateEmail(address) }) ||
    (validateMobile(mobile) && { field: 'mobile', message: validateMobile(mobile) }) ||
    (validatePassword(password) && { field: 'password', message: validatePassword(password) });
  if (problem) throw new ApiError('INVALID', problem.message, { field: problem.field });
  return write((data) => {
    if (data.customers.some((c) => c.email.toLowerCase() === address)) {
      throw new ApiError('EMAIL_TAKEN', 'An account with this email already exists.', { field: 'email' });
    }
    const customer = {
      id: `cus-${String(data.customers.length + 1).padStart(3, '0')}-${Date.now().toString(36).slice(-4)}`,
      firstName: first,
      middleName: middle,
      lastName: last,
      name: [first, middle, last].filter(Boolean).join(' '),
      email: address,
      mobile: mobile.replace(/[\s-]/g, ''),
      password,
      company: '',
      createdAt: Date.now()
    };
    data.customers.push(customer);
    return { token: makeToken('cus'), user: publicCustomer(customer) };
  });
}

/* ---------------- Forgot password: email → code sent by SMS → new password ---------------- */

// Load the saved reset request, only if its ID matches
const readResetChallenge = (challengeId) => {
  try {
    const challenge = JSON.parse(sessionStorage.getItem(RESET_CHALLENGE_KEY));
    return challenge && challenge.id === challengeId ? challenge : null;
  } catch (e) {
    return null;
  }
};
const saveResetChallenge = (challenge) => {
  try {
    sessionStorage.setItem(RESET_CHALLENGE_KEY, JSON.stringify(challenge));
  } catch (e) {
    /* ignore */
  }
};

/**
 * Step 1: check that an account uses this email, then text a 6-digit code to the mobile
 * number on that account. Returns the request ID and the masked number to show.
 */
export async function startPasswordReset({ email }) {
  await latency(500, 900);
  const address = normalise(email);
  const emailError = validateEmail(address);
  if (emailError) throw new ApiError('INVALID', emailError, { field: 'email' });
  const customer = read().customers.find((c) => c.email.toLowerCase() === address);
  if (!customer) throw new ApiError('NOT_FOUND', 'We could not find an account with this email.', { field: 'email' });
  if (!customer.mobile) throw new ApiError('NO_MOBILE', 'This account has no mobile number. Please message us to reset your password.', { field: 'email' });

  const challenge = {
    id: makeToken('rst'),
    customerId: customer.id,
    email: address,
    expiresAt: Date.now() + RULES.codeValidMinutes * 60000,
    resendAt: Date.now() + RULES.codeResendSeconds * 1000,
    verified: false
  };
  saveResetChallenge(challenge);
  return { challengeId: challenge.id, maskedMobile: maskMobile(customer.mobile), expiresAt: challenge.expiresAt, resendAt: challenge.resendAt };
}

/** Text a new code (only after the resend cooldown): restarts the expiry and resend timers. */
export async function resendPasswordResetCode(challengeId) {
  await latency(400, 700);
  const challenge = readResetChallenge(challengeId);
  if (!challenge) throw new ApiError('CHALLENGE_EXPIRED', 'Your reset request expired. Please start again.');
  if (challenge.resendAt > Date.now()) throw new ApiError('TOO_SOON', 'Please wait before requesting another code.');
  challenge.expiresAt = Date.now() + RULES.codeValidMinutes * 60000;
  challenge.resendAt = Date.now() + RULES.codeResendSeconds * 1000;
  saveResetChallenge(challenge);
  return { expiresAt: challenge.expiresAt, resendAt: challenge.resendAt };
}

/** Step 2: check the texted code. Wrong codes count toward a short lockout, like the admin code. */
export async function verifyPasswordResetCode({ challengeId, code }) {
  await latency(450, 800);
  const challenge = readResetChallenge(challengeId);
  if (!challenge) throw new ApiError('CHALLENGE_EXPIRED', 'Your reset request expired. Please start again.');
  assertNotLocked('reset-code', challenge.email);
  if (challenge.expiresAt < Date.now()) throw new ApiError('CODE_EXPIRED', 'This code has expired. Request a new one.');
  if (code !== resetCodeFor()) {
    const result = registerFailure('reset-code', challenge.email, RULES.maxCodeAttempts, RULES.codeLockMinutes);
    if (result.locked) throw new ApiError('LOCKED', 'Too many incorrect codes. Code entry is paused.', { lockedUntil: result.lockedUntil });
    throw new ApiError('INVALID_CODE', 'That code is incorrect.', { remaining: result.remaining });
  }
  clearFailures('reset-code', challenge.email);
  challenge.verified = true;
  // Give the customer time to choose the new password after verifying
  challenge.expiresAt = Date.now() + RULES.codeValidMinutes * 60000;
  saveResetChallenge(challenge);
  return { ok: true };
}

/**
 * Step 3: save the new password (only after the code was verified). The request is used up,
 * and any login lockout on the account is lifted so the customer can log in right away.
 */
export async function completePasswordReset({ challengeId, password }) {
  await latency(450, 800);
  const challenge = readResetChallenge(challengeId);
  if (!challenge || !challenge.verified || challenge.expiresAt < Date.now()) {
    throw new ApiError('CHALLENGE_EXPIRED', 'Your reset request expired. Please start again.');
  }
  const passwordError = validatePassword(password);
  if (passwordError) throw new ApiError('INVALID', passwordError, { field: 'password' });
  const result = write((data) => {
    const customer = data.customers.find((c) => c.id === challenge.customerId);
    if (!customer) throw new ApiError('CHALLENGE_EXPIRED', 'Your reset request expired. Please start again.');
    customer.password = password;
    return { ok: true, email: customer.email };
  });
  sessionStorage.removeItem(RESET_CHALLENGE_KEY);
  clearFailures('customer', challenge.email);
  return result;
}

/**
 * Until SMS sending is connected the reset code is the one configured for the environment
 * (see README, "Customer password reset code").
 */
function resetCodeFor() {
  return import.meta.env?.VITE_CUSTOMER_RESET_CODE || '615204';
}

/** Latest profile details for a customer. */
export async function getCustomerProfile(customerId) {
  await latency(120, 260);
  const customer = read().customers.find((c) => c.id === customerId);
  if (!customer) throw new ApiError('NOT_FOUND', 'Account not found.');
  return publicCustomer(customer);
}

/**
 * Save name, mobile and company (same checks as the profile form: first and last name, a valid mobile number).
 * The profile form edits the full name only, so when the name changes the first / middle / last parts
 * saved at sign-up no longer describe it; they are cleared rather than left showing the old name.
 */
export async function updateCustomerProfile(customerId, { name = '', mobile = '', company = '' }) {
  await latency(350, 650);
  const cleanName = String(name).trim().replace(/\s+/g, ' ');
  if (!cleanName) throw new ApiError('INVALID', 'Full name is required.', { field: 'name' });
  if (cleanName.split(' ').length < 2) throw new ApiError('INVALID', 'Enter your first and last name.', { field: 'name' });
  const mobileError = validateMobile(mobile);
  if (mobileError) throw new ApiError('INVALID', mobileError, { field: 'mobile' });
  return write((data) => {
    const customer = data.customers.find((c) => c.id === customerId);
    if (!customer) throw new ApiError('NOT_FOUND', 'Account not found.');
    if (customer.name !== cleanName) {
      customer.firstName = '';
      customer.middleName = '';
      customer.lastName = '';
    }
    customer.name = cleanName;
    customer.mobile = mobile.replace(/[\s-]/g, '');
    customer.company = (company || '').trim();
    return publicCustomer(customer);
  });
}

/**
 * Change password: the current password first (wrong guesses count toward a lockout, like the
 * admin's), then the customer password rules, and the new one must differ from the current one.
 */
export async function changeCustomerPassword(customerId, { current, next }) {
  await latency(400, 700);
  const customer = read().customers.find((c) => c.id === customerId);
  if (!customer) throw new ApiError('NOT_FOUND', 'Account not found.');
  assertCurrentPassword('customer-reauth', customer, current);
  const problem = validatePassword(next);
  if (problem) throw new ApiError('INVALID', problem, { field: 'next' });
  if (next === current) throw new ApiError('INVALID', 'Choose a password different from the current one.', { field: 'next' });
  return write((data) => {
    const target = data.customers.find((c) => c.id === customerId);
    target.password = next;
    return { ok: true };
  });
}

/* ============================ Admin ============================ */

/**
 * Stage 1: check the password and email the verification code.
 * The code itself is sent by the email provider once the backend is connected.
 */
export async function adminStartSignIn({ email, password }) {
  await latency(450, 800);
  const address = normalise(email);
  assertNotLocked('admin', address);

  const admin = read().admins.find((a) => a.email.toLowerCase() === address);
  if (!admin || admin.password !== password) {
    // A wrong password for a real admin is counted on the account, shown later in My account
    if (admin) countFailedSignIn(admin.id);
    const result = registerFailure('admin', address, RULES.maxLoginAttempts, RULES.loginLockMinutes);
    if (result.locked) {
      throw new ApiError('LOCKED', 'Too many failed attempts. This account is temporarily locked.', {
        lockedUntil: result.lockedUntil
      });
    }
    throw new ApiError('INVALID_CREDENTIALS', 'Incorrect username or password.', { remaining: result.remaining });
  }

  clearFailures('admin', address);
  // Password OK: create a code request that expires, with a resend cooldown.
  // Kept in sessionStorage so it disappears when the tab closes.
  const challenge = {
    id: makeToken('chl'),
    adminId: admin.id,
    email: address,
    expiresAt: Date.now() + RULES.codeValidMinutes * 60000,
    resendAt: Date.now() + RULES.codeResendSeconds * 1000,
    attempts: 0
  };
  try {
    sessionStorage.setItem(CHALLENGE_KEY, JSON.stringify(challenge));
  } catch (e) {
    /* ignore */
  }
  return { challengeId: challenge.id, maskedEmail: maskEmail(admin.email), expiresAt: challenge.expiresAt, resendAt: challenge.resendAt };
}

// Load the saved code request, only if its ID matches
const readChallenge = (challengeId) => {
  try {
    const challenge = JSON.parse(sessionStorage.getItem(CHALLENGE_KEY));
    return challenge && challenge.id === challengeId ? challenge : null;
  } catch (e) {
    return null;
  }
};

/** Send a new code: restarts the expiry and resend timers. */
export async function adminResendCode(challengeId) {
  await latency(400, 700);
  const challenge = readChallenge(challengeId);
  if (!challenge) throw new ApiError('CHALLENGE_EXPIRED', 'Your sign-in session expired. Please start again.');
  challenge.expiresAt = Date.now() + RULES.codeValidMinutes * 60000;
  challenge.resendAt = Date.now() + RULES.codeResendSeconds * 1000;
  sessionStorage.setItem(CHALLENGE_KEY, JSON.stringify(challenge));
  return { expiresAt: challenge.expiresAt, resendAt: challenge.resendAt };
}

/** Stage 2: verify the code and open the admin session. */
export async function adminVerifyCode({ challengeId, code }) {
  await latency(450, 800);
  const challenge = readChallenge(challengeId);
  if (!challenge) throw new ApiError('CHALLENGE_EXPIRED', 'Your sign-in session expired. Please start again.');
  assertNotLocked('admin-code', challenge.email);
  if (challenge.expiresAt < Date.now()) {
    throw new ApiError('CODE_EXPIRED', 'This code has expired. Request a new one.');
  }

  // Wrong code: count it separately from password failures (shorter lockout)
  if (code !== verificationCodeFor(challenge)) {
    countFailedSignIn(challenge.adminId);
    const result = registerFailure('admin-code', challenge.email, RULES.maxCodeAttempts, RULES.codeLockMinutes);
    if (result.locked) {
      throw new ApiError('LOCKED', 'Too many incorrect codes. Code entry is paused.', { lockedUntil: result.lockedUntil });
    }
    throw new ApiError('INVALID_CODE', 'That code is incorrect.', { remaining: result.remaining });
  }

  // Correct code: clear counters, remove the used code request, record the sign-in and return the admin session.
  // `signedInAt` and `device` stay with this session so My account can tell it apart from newer sign-ins elsewhere.
  clearFailures('admin-code', challenge.email);
  sessionStorage.removeItem(CHALLENGE_KEY);
  const now = Date.now();
  const device = describeDevice();
  return write((data) => {
    const admin = data.admins.find((a) => a.id === challenge.adminId);
    if (!admin) throw new ApiError('CHALLENGE_EXPIRED', 'Your sign-in session expired. Please start again.');
    admin.previousSignInAt = admin.lastSignInAt || null;
    admin.lastSignInAt = now;
    admin.lastSignInDevice = device;
    admin.failedSinceLastSignIn = admin.failedAttempts || 0;
    admin.failedAttempts = 0;
    return { token: makeToken('adm'), user: { ...publicAdmin(admin), signedInAt: now, device } };
  });
}

/**
 * Until email sending is connected the admin code is the one configured for
 * the environment (see README, "Admin verification code").
 */
function verificationCodeFor() {
  return import.meta.env?.VITE_ADMIN_VERIFICATION_CODE || '482913';
}

/** Add one failed sign-in (wrong password or wrong code) to the admin's record. */
function countFailedSignIn(adminId) {
  write((data) => {
    const admin = data.admins.find((a) => a.id === adminId);
    if (admin) admin.failedAttempts = (admin.failedAttempts || 0) + 1;
  });
}

/** Browser and system from the user agent, e.g. "Chrome · Windows". The backend will read this from request headers. */
function describeDevice() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const system = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown system';
  return `${browser} · ${system}`;
}

/* ============================ Admin account (My account) ============================ */

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

/** Latest account record for the signed-in admin. NOT_FOUND means the account was removed or reset. */
export async function getAdminProfile(adminId) {
  await latency(120, 260);
  const admin = read().admins.find((a) => a.id === adminId);
  if (!admin) throw new ApiError('NOT_FOUND', 'Account not found.');
  return adminProfile(admin);
}

/** Save the admin's display name (first and last name, up to 80 characters). */
export async function updateAdminProfile(adminId, { name }) {
  await latency(350, 650);
  const clean = String(name || '').trim().replace(/\s+/g, ' ');
  if (!clean) throw new ApiError('INVALID', 'Full name is required.', { field: 'name' });
  if (clean.split(' ').length < 2) throw new ApiError('INVALID', 'Enter your first and last name.', { field: 'name' });
  if (clean.length > 80) throw new ApiError('INVALID', 'Use 80 characters or fewer.', { field: 'name' });
  return write((data) => {
    const admin = data.admins.find((a) => a.id === adminId);
    if (!admin) throw new ApiError('NOT_FOUND', 'Account not found.');
    admin.name = clean;
    return adminProfile(admin);
  });
}

/**
 * Check the current password before a sensitive change. Wrong guesses count toward a
 * lockout, so a session left open can't be used to guess the password.
 */
function assertAdminPassword(admin, password) {
  assertNotLocked('admin-reauth', admin.id);
  if (admin.password === password) {
    clearFailures('admin-reauth', admin.id);
    return;
  }
  const result = registerFailure('admin-reauth', admin.id, RULES.maxLoginAttempts, RULES.loginLockMinutes);
  if (result.locked) {
    throw new ApiError('LOCKED', `Too many incorrect passwords. Try again in ${RULES.loginLockMinutes} minutes.`, { lockedUntil: result.lockedUntil, field: 'current' });
  }
  throw new ApiError('INVALID_CREDENTIALS', 'Your current password is incorrect.', { field: 'current', remaining: result.remaining });
}

/** Change the admin password: current password first, then the admin password rules. */
export async function changeAdminPassword(adminId, { current, next }) {
  await latency(400, 700);
  const admin = read().admins.find((a) => a.id === adminId);
  if (!admin) throw new ApiError('NOT_FOUND', 'Account not found.');
  assertAdminPassword(admin, current);
  const problem = validateAdminPassword(next);
  if (problem) throw new ApiError('INVALID', problem, { field: 'next' });
  if (next === current) throw new ApiError('INVALID', 'Choose a password different from the current one.', { field: 'next' });
  return write((data) => {
    const target = data.admins.find((a) => a.id === adminId);
    target.password = next;
    target.passwordChangedAt = Date.now();
    return { ok: true };
  });
}

/**
 * Email / mobile change, step 1: check the new value and the current password, then email a code.
 * A new email gets the code itself (proves the admin owns it); a mobile change gets it on the
 * email already on file, since codes are never sent by SMS.
 */
export async function adminStartContactChange(adminId, { field, value, password }) {
  await latency(450, 800);
  if (field !== 'email' && field !== 'mobile') throw new ApiError('INVALID', 'Unknown field.');
  const admin = read().admins.find((a) => a.id === adminId);
  if (!admin) throw new ApiError('NOT_FOUND', 'Account not found.');

  const clean = field === 'email' ? normalise(value) : String(value || '').replace(/[\s-]/g, '');
  const problem = field === 'email' ? validateEmail(clean) : validateMobile(clean);
  if (problem) throw new ApiError('INVALID', problem, { field: 'value' });
  if (clean === (field === 'email' ? normalise(admin.email) : admin.mobile)) {
    throw new ApiError('INVALID', `This is already your ${field === 'email' ? 'email' : 'mobile number'}.`, { field: 'value' });
  }
  if (field === 'email' && read().admins.some((a) => a.id !== adminId && a.email.toLowerCase() === clean)) {
    throw new ApiError('EMAIL_TAKEN', 'Another admin account already uses this email.', { field: 'value' });
  }
  assertAdminPassword(admin, password);

  const challenge = {
    id: makeToken('chc'),
    adminId,
    field,
    value: clean,
    expiresAt: Date.now() + RULES.codeValidMinutes * 60000,
    resendAt: Date.now() + RULES.codeResendSeconds * 1000
  };
  try {
    sessionStorage.setItem(CONTACT_CHALLENGE_KEY, JSON.stringify(challenge));
  } catch (e) {
    /* ignore */
  }
  const sentTo = maskEmail(field === 'email' ? clean : admin.email);
  return { challengeId: challenge.id, sentTo, expiresAt: challenge.expiresAt, resendAt: challenge.resendAt };
}

// Load the saved contact-change code request, only if its ID matches
const readContactChallenge = (challengeId) => {
  try {
    const challenge = JSON.parse(sessionStorage.getItem(CONTACT_CHALLENGE_KEY));
    return challenge && challenge.id === challengeId ? challenge : null;
  } catch (e) {
    return null;
  }
};

/** Email / mobile change: send a new code (restarts the expiry and resend timers). */
export async function adminResendContactCode(challengeId) {
  await latency(400, 700);
  const challenge = readContactChallenge(challengeId);
  if (!challenge) throw new ApiError('CHALLENGE_EXPIRED', 'This request expired. Please start again.');
  if (challenge.resendAt > Date.now()) throw new ApiError('TOO_SOON', 'Please wait before requesting another code.');
  challenge.expiresAt = Date.now() + RULES.codeValidMinutes * 60000;
  challenge.resendAt = Date.now() + RULES.codeResendSeconds * 1000;
  sessionStorage.setItem(CONTACT_CHALLENGE_KEY, JSON.stringify(challenge));
  return { expiresAt: challenge.expiresAt, resendAt: challenge.resendAt };
}

/** Email / mobile change, step 2: check the code, then save the new value. Returns the updated profile. */
export async function adminConfirmContactChange({ challengeId, code }) {
  await latency(450, 800);
  const challenge = readContactChallenge(challengeId);
  if (!challenge) throw new ApiError('CHALLENGE_EXPIRED', 'This request expired. Please start again.');
  assertNotLocked('admin-contact', challenge.adminId);
  if (challenge.expiresAt < Date.now()) throw new ApiError('CODE_EXPIRED', 'This code has expired. Request a new one.');

  if (code !== verificationCodeFor(challenge)) {
    const result = registerFailure('admin-contact', challenge.adminId, RULES.maxCodeAttempts, RULES.codeLockMinutes);
    if (result.locked) {
      sessionStorage.removeItem(CONTACT_CHALLENGE_KEY);
      throw new ApiError('LOCKED', 'Too many incorrect codes. Please start again later.', { lockedUntil: result.lockedUntil });
    }
    throw new ApiError('INVALID_CODE', 'That code is incorrect.', { remaining: result.remaining });
  }

  clearFailures('admin-contact', challenge.adminId);
  sessionStorage.removeItem(CONTACT_CHALLENGE_KEY);
  return write((data) => {
    const admin = data.admins.find((a) => a.id === challenge.adminId);
    if (!admin) throw new ApiError('NOT_FOUND', 'Account not found.');
    // Check again in case another admin took the email while the code was pending
    if (challenge.field === 'email' && data.admins.some((a) => a.id !== admin.id && a.email.toLowerCase() === challenge.value)) {
      throw new ApiError('EMAIL_TAKEN', 'Another admin account already uses this email.');
    }
    admin[challenge.field] = challenge.value;
    return adminProfile(admin);
  });
}

export const authStorageKeys = { LOCK_KEY, CHALLENGE_KEY, CONTACT_CHALLENGE_KEY, RESET_CHALLENGE_KEY };
