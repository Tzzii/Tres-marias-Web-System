import { TERMS_VERSION } from '@tm/shared/src/legal/terms.js';
import { RULES } from '@tm/shared/src/services/config.js';
import {
  cleanMobile,
  cleanName,
  describeDevice,
  fullNameProblem,
  normaliseEmail
} from '@tm/shared/src/domain/account.js';
import { maskEmail } from '@tm/shared/src/utils/format.js';
import {
  validateAdminPassword,
  validateEmail,
  validateMobile,
  validatePassword
} from '@tm/shared/src/utils/validation.js';
import { config } from '../../config.js';
import { tx } from '../../db.js';
import { ApiError } from '../../lib/ApiError.js';
import { newId } from '../../lib/ids.js';
import { checkSecret, hashSecret, newCode } from '../../lib/passwords.js';
import { now } from '../../lib/time.js';
import { readToken, readUnlockTicket, sessionReplaced, signToken, signUnlockTicket } from '../../lib/tokens.js';
import * as messages from './auth.messages.js';
import * as repo from './auth.repo.js';
import { assertNotLocked, clearAttempts, reserveAttempt, wrongAnswer } from './lockout.js';


const minutes = (n) => n * 60000;

const REQUEST_LIFETIME = minutes(30);

const codeTimes = (at) => ({
  expiresAt: at + minutes(RULES.codeValidMinutes),
  resendAt: at + RULES.codeResendSeconds * 1000
});

const isDead = (request, at) => !request || Boolean(request.usedAt) || request.createdAt + REQUEST_LIFETIME < at;

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
  termsVersion: c.termsVersion || '',
  role: 'customer'
});

const publicAdmin = (a) => ({ id: a.id, name: a.name, email: a.email, mobile: a.mobile, role: a.role });

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

function customerSession(customer, remember = false) {
  const token = signToken(
    { id: customer.id, role: 'customer', name: customer.name, passwordChangedAt: customer.passwordChangedAt },
    { ttl: remember ? config.jwt.customerRememberTtl : config.jwt.customerTtl }
  );
  return { token, user: publicCustomer(customer) };
}

async function assertCurrentPassword(scope, account, password) {
  const attempt = await reserveAttempt(scope, account.id);
  if (await checkSecret(password, account.passwordHash)) {
    await clearAttempts(scope, account.id);
    return;
  }
  throw wrongAnswer(
    scope,
    attempt,
    new ApiError('INVALID_CREDENTIALS', 'Your current password is incorrect.', { field: 'current' })
  );
}


export async function customerLogin({ email, password, remember = false }) {
  const address = normaliseEmail(email);
  const attempt = await reserveAttempt('customer', address);
  const customer = await repo.findCustomerByEmail(address);
  if (!(await checkSecret(password, customer && customer.passwordHash))) {
    throw wrongAnswer('customer', attempt, new ApiError('INVALID_CREDENTIALS', 'Incorrect email or password.'));
  }
  await clearAttempts('customer', address);
  return customerSession(customer, remember);
}


export async function startSignUp({
  firstName = '',
  middleName = '',
  lastName = '',
  email = '',
  mobile = '',
  password = '',
  agreeTerms = false
}) {
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
  if (agreeTerms !== true)
    throw new ApiError('INVALID', 'Please agree to the Terms of Service and Privacy Policy.', { field: 'agree' });
  if (await repo.findCustomerByEmail(address))
    throw new ApiError('EMAIL_TAKEN', 'An account with this email already exists.', { field: 'email' });
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
    await repo.deleteSignup(request.id);
    throw err;
  }
  return {
    challengeId: request.id,
    maskedEmail: maskEmail(address),
    expiresAt: request.expiresAt,
    resendAt: request.resendAt
  };
}

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
    await repo.setSignupResendAt(request.id, at);
    throw err;
  }
  return times;
}

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
    passwordChangedAt: null,
    termsVersion: TERMS_VERSION,
    termsAcceptedAt: at
  };
  try {
    await tx(async (conn) => {
      if (!(await repo.markSignupUsed(conn, request.id, at))) throw expired;
      await repo.insertCustomer({ ...customer, passwordHash: request.passwordHash }, conn);
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      throw new ApiError('EMAIL_TAKEN', 'An account with this email already exists.', { field: 'email' });
    throw err;
  }
  await clearAttempts('code-email', request.email);
  return customerSession(customer);
}


export async function startPasswordReset({ email }) {
  const address = normaliseEmail(email);
  const emailError = validateEmail(address);
  if (emailError) throw new ApiError('INVALID', emailError, { field: 'email' });
  const customer = await repo.findCustomerByEmail(address);
  if (!customer) throw new ApiError('NOT_FOUND', 'We could not find an account with this email.', { field: 'email' });
  await reserveAttempt('code-email', address);

  const at = now();
  const code = newCode(RULES.codeLength);
  const reset = {
    id: newId('rst'),
    customerId: customer.id,
    codeHash: await hashSecret(code),
    ...codeTimes(at),
    createdAt: at
  };
  await repo.deleteResetsFor(customer.id);
  await repo.insertReset(reset);
  try {
    await messages.sendResetCode(customer, code, reset.id);
  } catch (err) {
    await repo.deleteReset(reset.id);
    throw err;
  }
  return {
    challengeId: reset.id,
    maskedEmail: maskEmail(customer.email),
    expiresAt: reset.expiresAt,
    resendAt: reset.resendAt
  };
}

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
    await repo.setResetResendAt(reset.id, at);
    throw err;
  }
  return times;
}

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
  await repo.markResetVerified(reset.id, { at, expiresAt: at + minutes(RULES.codeValidMinutes) });
  return { ok: true };
}

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
    if (!(await repo.markResetUsed(conn, reset.id, at))) throw expired;
    await repo.updateCustomerPassword(customer.id, passwordHash, at, conn);
    await repo.deleteWaitingPasswordRequests(customer.id, conn);
  });
  await clearAttempts('customer', customer.email);
  await clearAttempts('code-email', normaliseEmail(customer.email));
  const result = { ok: true, email: customer.email };
  if (user && user.role === 'customer' && user.id === customer.id) {
    result.token = signToken(
      { id: customer.id, role: 'customer', name: customer.name, passwordChangedAt: at },
      { expiresAt: user.exp }
    );
  }
  return result;
}

export async function getCustomerProfile(customerId) {
  const customer = await repo.findCustomerById(customerId);
  if (!customer) throw new ApiError('NOT_FOUND', 'Account not found.');
  return publicCustomer(customer);
}

export async function acceptTerms(customerId, { version }) {
  if (version !== TERMS_VERSION)
    throw new ApiError(
      'INVALID',
      'The terms have changed since this page opened. Please reload the page and read them again.',
      { field: 'version' }
    );
  const customer = await repo.findCustomerById(customerId);
  if (!customer) throw new ApiError('NOT_FOUND', 'Account not found.');
  const at = now();
  await repo.setCustomerTerms(customerId, TERMS_VERSION, at);
  return publicCustomer({ ...customer, termsVersion: TERMS_VERSION, termsAcceptedAt: at });
}

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


export async function startCustomerEmailChange(customerId, { email = '', password = '' }) {
  const customer = await repo.findCustomerById(customerId);
  if (!customer) throw new ApiError('NOT_FOUND', 'Account not found.');

  const address = normaliseEmail(email);
  const problem = validateEmail(address);
  if (problem) throw new ApiError('INVALID', problem, { field: 'email' });
  if (address === normaliseEmail(customer.email)) {
    throw new ApiError('INVALID', 'This is already your email.', { field: 'email' });
  }
  if (await repo.emailUsedByOtherCustomer(address, customerId)) {
    throw new ApiError('EMAIL_TAKEN', 'An account with this email already exists.', { field: 'email' });
  }
  await assertCurrentPassword('customer-reauth', customer, password);
  await reserveAttempt('code-email', address);

  const at = now();
  const code = newCode(RULES.codeLength);
  const change = {
    id: newId('emc'),
    customerId,
    newEmail: address,
    codeHash: await hashSecret(code),
    ...codeTimes(at),
    createdAt: at
  };
  await repo.deleteEmailChangesFor(customerId);
  await repo.insertEmailChange(change);
  try {
    await messages.sendCustomerEmailChangeCode(customer, address, code, change.id);
  } catch (err) {
    await repo.deleteEmailChange(change.id);
    throw err;
  }
  return {
    challengeId: change.id,
    maskedEmail: maskEmail(address),
    expiresAt: change.expiresAt,
    resendAt: change.resendAt
  };
}

async function ownCustomerEmailChange(customerId, challengeId, at) {
  const change = await repo.findEmailChange(challengeId);
  if (isDead(change, at) || change.customerId !== customerId) {
    throw new ApiError('CHALLENGE_EXPIRED', 'This request expired. Please start again.');
  }
  return change;
}

export async function resendCustomerEmailChangeCode(customerId, challengeId) {
  const at = now();
  const change = await ownCustomerEmailChange(customerId, challengeId, at);
  if (change.resendAt > at) throw new ApiError('TOO_SOON', 'Please wait before requesting another code.');
  const customer = await repo.findCustomerById(customerId);
  if (!customer) throw new ApiError('NOT_FOUND', 'Account not found.');
  await reserveAttempt('code-email', change.newEmail);

  const code = newCode(RULES.codeLength);
  const times = codeTimes(at);
  await repo.replaceEmailChangeCode(change.id, { codeHash: await hashSecret(code), ...times });
  try {
    await messages.sendCustomerEmailChangeCode(customer, change.newEmail, code, change.id);
  } catch (err) {
    await repo.setEmailChangeResendAt(change.id, at);
    throw err;
  }
  return times;
}

export async function confirmCustomerEmailChange(customerId, { challengeId, code }) {
  const at = now();
  const expired = new ApiError('CHALLENGE_EXPIRED', 'This request expired. Please start again.');
  const change = await ownCustomerEmailChange(customerId, challengeId, at);
  await assertNotLocked('email-change-code', customerId);
  if (change.expiresAt < at) throw new ApiError('CODE_EXPIRED', 'This code has expired. Request a new one.');

  const attempt = await reserveAttempt('email-change-code', customerId);
  if (!(await checkSecret(code, change.codeHash))) {
    await repo.addEmailChangeAttempt(change.id);
    throw wrongAnswer('email-change-code', attempt, new ApiError('INVALID_CODE', 'That code is incorrect.'));
  }
  await clearAttempts('email-change-code', customerId);

  const customer = await repo.findCustomerById(customerId);
  if (!customer) throw expired;
  const taken = new ApiError('EMAIL_TAKEN', 'An account with this email already exists.', { field: 'email' });
  if (await repo.emailUsedByOtherCustomer(change.newEmail, customerId)) throw taken;
  try {
    await tx(async (conn) => {
      if (!(await repo.markEmailChangeUsed(conn, change.id, at))) throw expired;
      await repo.updateCustomerEmail(conn, customerId, change.newEmail);
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw taken;
    throw err;
  }
  await clearAttempts('code-email', change.newEmail);
  return publicCustomer({ ...customer, email: change.newEmail });
}


export async function startPasswordChange(customerId, { current, next }) {
  const customer = await repo.findCustomerById(customerId);
  if (!customer) throw new ApiError('NOT_FOUND', 'Account not found.');
  await assertCurrentPassword('customer-reauth', customer, current);
  const problem = validatePassword(next);
  if (problem) throw new ApiError('INVALID', problem, { field: 'next' });
  if (next === current)
    throw new ApiError('INVALID', 'Choose a password different from the current one.', { field: 'next' });
  await reserveAttempt('code-email', normaliseEmail(customer.email));

  const at = now();
  const code = newCode(RULES.codeLength);
  const change = {
    id: newId('pwc'),
    customerId: customer.id,
    newPasswordHash: await hashSecret(next),
    codeHash: await hashSecret(code),
    ...codeTimes(at),
    createdAt: at
  };
  await repo.deleteChangesFor(customer.id);
  await repo.insertChange(change);
  try {
    await messages.sendPasswordChangeCode(customer, code, change.id);
  } catch (err) {
    await repo.deleteChange(change.id);
    throw err;
  }
  return {
    challengeId: change.id,
    maskedEmail: maskEmail(customer.email),
    expiresAt: change.expiresAt,
    resendAt: change.resendAt
  };
}

async function ownPasswordChange(customerId, challengeId, at) {
  const change = await repo.findChange(challengeId);
  if (isDead(change, at) || change.customerId !== customerId)
    throw new ApiError('CHALLENGE_EXPIRED', 'This request expired. Please start again.');
  return change;
}

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
    await repo.setChangeResendAt(change.id, at);
    throw err;
  }
  return times;
}

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
    if (!(await repo.markChangeUsed(conn, change.id, at))) throw expired;
    await repo.updateCustomerPassword(customer.id, change.newPasswordHash, at, conn);
    await repo.deleteWaitingPasswordRequests(customer.id, conn);
  });
  await clearAttempts('code-email', normaliseEmail(customer.email));
  const token = signToken(
    { id: customer.id, role: 'customer', name: customer.name, passwordChangedAt: at },
    { expiresAt: user.exp }
  );
  return { ok: true, token };
}


export async function adminStartSignIn({ email, password }) {
  const address = normaliseEmail(email);
  const attempt = await reserveAttempt('admin', address);
  const admin = await repo.findAdminByEmail(address);
  if (!(await checkSecret(password, admin && admin.passwordHash))) {
    if (admin) await repo.addAdminFailedAttempt(admin.id);
    throw wrongAnswer('admin', attempt, new ApiError('INVALID_CREDENTIALS', 'Incorrect username or password.'));
  }
  await clearAttempts('admin', address);

  const at = now();
  const code = newCode(RULES.codeLength);
  const challenge = {
    id: newId('chl'),
    purpose: 'sign_in',
    adminId: admin.id,
    codeHash: await hashSecret(code),
    ...codeTimes(at),
    createdAt: at
  };
  await repo.deleteChallengesFor(admin.id, 'sign_in');
  await repo.insertChallenge(challenge);
  try {
    await messages.sendSignInCode(admin, code, challenge.id);
  } catch (err) {
    await repo.deleteChallenge(challenge.id);
    throw err;
  }
  return {
    challengeId: challenge.id,
    maskedEmail: maskEmail(admin.email),
    expiresAt: challenge.expiresAt,
    resendAt: challenge.resendAt
  };
}

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
    await repo.setChallengeResendAt(challenge.id, at);
    throw err;
  }
  return times;
}

function adminSession(admin, token, user) {
  const { exp, sid } = readToken(token);
  return { token, user, unlockTicket: signUnlockTicket(admin, sid, exp), unlockUntil: exp * 1000 };
}

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

  const attempt = await reserveAttempt('admin-code', email);
  if (!(await checkSecret(code, challenge.codeHash))) {
    await repo.addAdminFailedAttempt(admin.id);
    await repo.addChallengeAttempt(challenge.id);
    throw wrongAnswer('admin-code', attempt, new ApiError('INVALID_CODE', 'That code is incorrect.'));
  }

  await clearAttempts('admin-code', email);
  const device = describeDevice(userAgent);
  const sessionId = newId('ses');
  await tx(async (conn) => {
    if (!(await repo.markChallengeUsed(conn, challenge.id, at))) throw expired;
    await repo.recordAdminSignIn(conn, admin.id, { at, device, sessionId });
  });
  const token = signToken(
    { id: admin.id, role: 'admin', name: admin.name, passwordChangedAt: admin.passwordChangedAt, sessionId },
    { ttl: config.jwt.adminTtl }
  );
  return adminSession(admin, token, { ...publicAdmin(admin), signedInAt: at, device });
}

export async function adminUnlock({ ticket, password }) {
  const ended = new ApiError('CHALLENGE_EXPIRED', 'Your session has ended. Please sign in again.');
  const claims = typeof ticket === 'string' ? readUnlockTicket(ticket) : null;
  if (!claims || typeof claims.sid !== 'string') throw ended;
  const admin = await repo.findAdminById(claims.sub);
  if (!admin || (Number(admin.passwordChangedAt) || 0) !== claims.pwv || !admin.sessionId) throw ended;
  if (claims.sid !== admin.sessionId) throw sessionReplaced();
  if (typeof password !== 'string' || !password)
    throw new ApiError('INVALID', 'Enter your password.', { field: 'password' });

  const address = normaliseEmail(admin.email);
  const attempt = await reserveAttempt('admin', address);
  if (!(await checkSecret(password, admin.passwordHash))) {
    await repo.addAdminFailedAttempt(admin.id);
    throw wrongAnswer(
      'admin',
      attempt,
      new ApiError('INVALID_CREDENTIALS', 'Incorrect password.', { field: 'password' })
    );
  }
  await clearAttempts('admin', address);
  const token = signToken(
    {
      id: admin.id,
      role: 'admin',
      name: admin.name,
      passwordChangedAt: admin.passwordChangedAt,
      sessionId: claims.sid
    },
    { expiresAt: claims.exp }
  );
  return { token, user: publicAdmin(admin), unlockTicket: ticket, unlockUntil: claims.exp * 1000 };
}


export async function getAdminProfile(adminId) {
  const admin = await repo.findAdminById(adminId);
  if (!admin) throw new ApiError('NOT_FOUND', 'Account not found.');
  return adminProfile(admin);
}

export async function updateAdminProfile(adminId, { name }) {
  const clean = cleanName(name);
  const problem = fullNameProblem(clean, 80);
  if (problem) throw new ApiError('INVALID', problem, { field: 'name' });
  const admin = await repo.findAdminById(adminId);
  if (!admin) throw new ApiError('NOT_FOUND', 'Account not found.');
  await repo.updateAdminName(adminId, clean);
  return adminProfile({ ...admin, name: clean });
}

export async function changeAdminPassword(adminId, { current, next }) {
  const admin = await repo.findAdminById(adminId);
  if (!admin) throw new ApiError('NOT_FOUND', 'Account not found.');
  await assertCurrentPassword('admin-reauth', admin, current);
  const problem = validateAdminPassword(next);
  if (problem) throw new ApiError('INVALID', problem, { field: 'next' });
  if (next === current)
    throw new ApiError('INVALID', 'Choose a password different from the current one.', { field: 'next' });
  await repo.updateAdminPassword(adminId, await hashSecret(next), now());
  return { ok: true };
}

export async function adminStartContactChange(adminId, { field, value, password }) {
  if (field !== 'email' && field !== 'mobile') throw new ApiError('INVALID', 'Unknown field.');
  const admin = await repo.findAdminById(adminId);
  if (!admin) throw new ApiError('NOT_FOUND', 'Account not found.');

  const clean = field === 'email' ? normaliseEmail(value) : cleanMobile(value);
  const problem = field === 'email' ? validateEmail(clean) : validateMobile(clean);
  if (problem) throw new ApiError('INVALID', problem, { field: 'value' });
  if (clean === (field === 'email' ? normaliseEmail(admin.email) : cleanMobile(admin.mobile))) {
    throw new ApiError('INVALID', `This is already your ${field === 'email' ? 'email' : 'mobile number'}.`, {
      field: 'value'
    });
  }
  if (field === 'email' && (await repo.emailUsedByOtherAdmin(clean, adminId))) {
    throw new ApiError('EMAIL_TAKEN', 'Another admin account already uses this email.', { field: 'value' });
  }
  await assertCurrentPassword('admin-reauth', admin, password);

  const at = now();
  const code = newCode(RULES.codeLength);
  const challenge = {
    id: newId('chc'),
    purpose: 'contact_change',
    adminId,
    codeHash: await hashSecret(code),
    field,
    value: clean,
    ...codeTimes(at),
    createdAt: at
  };
  await repo.deleteChallengesFor(adminId, 'contact_change');
  await repo.insertChallenge(challenge);
  try {
    await messages.sendContactCode(admin, { field, value: clean }, code, challenge.id);
  } catch (err) {
    await repo.deleteChallenge(challenge.id);
    throw err;
  }
  const sentTo = maskEmail(field === 'email' ? clean : admin.email);
  return { challengeId: challenge.id, sentTo, expiresAt: challenge.expiresAt, resendAt: challenge.resendAt };
}

async function ownContactChallenge(adminId, challengeId, at) {
  const challenge = await repo.findChallenge(challengeId);
  if (isDead(challenge, at) || challenge.purpose !== 'contact_change' || challenge.adminId !== adminId) {
    throw new ApiError('CHALLENGE_EXPIRED', 'This request expired. Please start again.');
  }
  return challenge;
}

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
    await repo.setChallengeResendAt(challenge.id, at);
    throw err;
  }
  return times;
}

export async function adminConfirmContactChange(adminId, { challengeId, code }) {
  const at = now();
  const challenge = await ownContactChallenge(adminId, challengeId, at);
  await assertNotLocked('admin-contact', adminId);
  if (challenge.expiresAt < at) throw new ApiError('CODE_EXPIRED', 'This code has expired. Request a new one.');

  const attempt = await reserveAttempt('admin-contact', adminId);
  if (!(await checkSecret(code, challenge.codeHash))) {
    await repo.addChallengeAttempt(challenge.id);
    if (attempt.lockedUntil) await repo.deleteChallenge(challenge.id);
    throw wrongAnswer('admin-contact', attempt, new ApiError('INVALID_CODE', 'That code is incorrect.'));
  }
  await clearAttempts('admin-contact', adminId);

  const taken = new ApiError('EMAIL_TAKEN', 'Another admin account already uses this email.');
  if (challenge.field === 'email' && (await repo.emailUsedByOtherAdmin(challenge.value, adminId))) throw taken;
  try {
    await tx(async (conn) => {
      if (!(await repo.markChallengeUsed(conn, challenge.id, at)))
        throw new ApiError('CHALLENGE_EXPIRED', 'This request expired. Please start again.');
      await repo.updateAdminContact(conn, adminId, challenge.field, challenge.value);
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw taken;
    throw err;
  }
  return getAdminProfile(adminId);
}
