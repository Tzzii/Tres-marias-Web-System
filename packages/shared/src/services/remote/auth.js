import { normaliseEmail } from '../../domain/account.js';
import { emitChange, emitTokenRenewed } from '../events.js';
import { http } from '../http.js';

/**
 * The auth service on the API (apps/api/src/modules/auth, endpoint map in
 * docs/backend-development-phases.md §9.1). Same function names, arguments, return shapes and
 * ApiError codes as the browser version (authService.js), so no page changes when VITE_API_SERVICES
 * includes "auth" (see facade/auth.js).
 *
 * - The server decides whose account a /me call is about from the session token; the id arguments
 *   (customerId, adminId) are kept for the pages' sake and not sent.
 * - Codes are emailed (admin) or texted (customer) by the server and never come back in a response.
 * - Lockouts are enforced by the server. getLockout only remembers, for this tab, the lock the server
 *   last reported, so the log-in page can restore its countdown after a reload.
 */

/* ---------------- Lockout countdown (sync) ---------------- */

// sessionStorage key: { 'customer:maria@gmail.com': lockedUntil, ... } for this tab
const LOCKS_KEY = 'tm.auth.lockouts';

const readLocks = () => {
  try {
    return JSON.parse(sessionStorage.getItem(LOCKS_KEY)) || {};
  } catch (e) {
    return {};
  }
};

// Remember (lockedUntil) or forget (null) the lock on one account, and drop locks that have ended
function rememberLock(scope, email, lockedUntil) {
  const locks = Object.fromEntries(Object.entries(readLocks()).filter(([, until]) => until > Date.now()));
  const key = `${scope}:${normaliseEmail(email)}`;
  if (lockedUntil) locks[key] = lockedUntil;
  else delete locks[key];
  try {
    sessionStorage.setItem(LOCKS_KEY, JSON.stringify(locks));
  } catch (e) {
    /* storage unavailable: the countdown just won't survive a reload */
  }
}

/**
 * Remaining lock for an email (the time it ends), used to restore the countdown on page load;
 * null when this tab has not been told of a lock that is still running. Returns right away.
 */
export function getLockout(scope, email) {
  const until = readLocks()[`${scope}:${normaliseEmail(email)}`];
  return until && until > Date.now() ? until : null;
}

// Run a sign-in call and keep the countdown cache in step with its outcome
async function trackLock(scope, email, call) {
  try {
    const result = await call();
    rememberLock(scope, email, null);
    return result;
  } catch (error) {
    if (error.code === 'LOCKED' && error.meta && error.meta.lockedUntil) rememberLock(scope, email, error.meta.lockedUntil);
    throw error;
  }
}

// A request id in a URL path (ids are made by the server, but never trust a path segment)
const segment = (id) => encodeURIComponent(String(id || ''));

/* ============================ Customers ============================ */

/**
 * Customer log in. `remember` ("Remember me") asks for the longer-lasting token; the page decides
 * where the session is kept (createAuth). Returns { token, user }.
 */
export const customerLogin = ({ email, password, remember = false }) =>
  trackLock('customer', email, () => http.post('/auth/customer/login', { email, password, remember }));

/** Create a customer account and sign them in: { token, user }. Only the account fields are sent. */
export const customerRegister = ({ firstName = '', middleName = '', lastName = '', email = '', mobile = '', password = '' }) =>
  http.post('/auth/customer/register', { firstName, middleName, lastName, email, mobile, password });

/** Forgot password, step 1: the server texts a code to the account's mobile. { challengeId, maskedMobile, expiresAt, resendAt } */
export const startPasswordReset = ({ email }) => http.post('/auth/customer/password-reset', { email });

/** Text a new code (after the resend cooldown): { expiresAt, resendAt } */
export const resendPasswordResetCode = (challengeId) => http.post(`/auth/customer/password-reset/${segment(challengeId)}/resend`);

/** Step 2: check the texted code: { ok: true } */
export const verifyPasswordResetCode = ({ challengeId, code }) => http.post(`/auth/customer/password-reset/${segment(challengeId)}/verify`, { code });

/** Step 3: save the new password: { ok: true, email } */
export const completePasswordReset = ({ challengeId, password }) => http.post(`/auth/customer/password-reset/${segment(challengeId)}/complete`, { password });

/** The signed-in customer's profile. */
export const getCustomerProfile = () => http.get('/me');

/** Save name, mobile and company; returns the updated profile. */
export const updateCustomerProfile = (customerId, { name = '', mobile = '', company = '' }) => http.patch('/me', { name, mobile, company });

/**
 * Change the password. The server signs out every other session and returns a new token for this
 * one; it is saved (emitTokenRenewed) before the change event, so the pages that reload afterwards
 * already use it. Returns { ok: true } like the browser version.
 */
export async function changeCustomerPassword(customerId, { current, next }) {
  const { token } = await http.post('/me/password', { current, next }, { quiet: true });
  emitTokenRenewed(token);
  emitChange();
  return { ok: true };
}

/* ============================ Admin ============================ */

/** Stage 1: check the password; the server emails the code. { challengeId, maskedEmail, expiresAt, resendAt } */
export const adminStartSignIn = ({ email, password }) =>
  trackLock('admin', email, () => http.post('/auth/admin/start', { email, password }));

/** Send a new code (after the resend cooldown): { expiresAt, resendAt } */
export const adminResendCode = (challengeId) => http.post('/auth/admin/resend', { challengeId });

/** Stage 2: verify the emailed code: { token, user } with the sign-in time and device. */
export const adminVerifyCode = ({ challengeId, code }) => http.post('/auth/admin/verify', { challengeId, code });

/** The signed-in admin's account record (My account, and the top bar's name check). */
export const getAdminProfile = () => http.get('/admin/me');

/** Save the admin's display name; returns the updated profile. */
export const updateAdminProfile = (adminId, { name }) => http.patch('/admin/me', { name });

/**
 * Change the admin password. Every session of this admin ends on the server, this one included, and
 * the page signs out right after (quiet: no reload is sent with the token that just stopped working).
 */
export const changeAdminPassword = (adminId, { current, next }) => http.post('/admin/me/password', { current, next }, { quiet: true });

/** Email / mobile change, step 1: the server checks the password and emails a code. { challengeId, sentTo, expiresAt, resendAt } */
export const adminStartContactChange = (adminId, { field, value, password }) => http.post('/admin/me/contact/start', { field, value, password });

/** Email / mobile change: send a new code: { expiresAt, resendAt } */
export const adminResendContactCode = (challengeId) => http.post('/admin/me/contact/resend', { challengeId });

/** Email / mobile change, step 2: check the code and save; returns the updated profile. */
export const adminConfirmContactChange = ({ challengeId, code }) => http.post('/admin/me/contact/confirm', { challengeId, code });
