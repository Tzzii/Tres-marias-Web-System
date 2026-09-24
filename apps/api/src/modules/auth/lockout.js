import { RULES } from '@tm/shared/src/services/config.js';
import { tx } from '../../db.js';
import { ApiError } from '../../lib/ApiError.js';
import { now } from '../../lib/time.js';
import * as repo from './auth.repo.js';

/**
 * Failed-attempt counting and lockouts, kept in the login_attempts table (one row per scope and
 * account) instead of the browser's localStorage: a lock now holds whatever the browser does, so
 * clearing site data or switching browsers no longer unlocks an account.
 *
 * Same rules as the browser version (authService.js registerFailure / assertNotLocked): `max`
 * wrong answers in a row lock the scope for `lockMinutes`; a right answer clears the count; an
 * expired lock starts a fresh round. The scopes and their messages are listed in SCOPES.
 *
 * One difference, because a server takes requests in parallel: each attempt is counted BEFORE the
 * password or code is checked (reserveAttempt), in a short transaction that locks the counter row.
 * The attempt that uses up the last try sets the lock at once, so requests sent at the same moment
 * cannot all slip past the limit; the ones after it are refused with LOCKED. A right answer then
 * deletes the row (clearAttempts), which also lifts a lock that attempt had just set.
 */

const LOGIN = { max: RULES.maxLoginAttempts, lockMinutes: RULES.loginLockMinutes };
const CODE = { max: RULES.maxCodeAttempts, lockMinutes: RULES.codeLockMinutes };

/**
 * Every scope, its limits and what a locked account is told. The identifier is the lower-case email
 * for 'customer', 'admin', 'admin-code' and 'reset-code', and the account id for the others.
 * - customer / admin: the password on the log-in and sign-in forms.
 * - admin-code / reset-code: the emailed sign-in code and the texted password-reset code.
 * - customer-reauth / admin-reauth: the current password asked before a password, email or mobile change.
 * - admin-contact: the code that confirms a new email or mobile number.
 * - reset-sms: not wrong answers but reset codes TEXTED to one customer (start and resend). SMS
 *   costs money and reaches a real phone, so after 5 texts sending pauses for an hour; the count
 *   starts over after an hour without a text, and a finished reset clears it.
 */
export const SCOPES = {
  customer: { ...LOGIN, message: 'Too many failed attempts. This account is temporarily locked.' },
  admin: { ...LOGIN, message: 'Too many failed attempts. This account is temporarily locked.' },
  'admin-code': { ...CODE, message: 'Too many incorrect codes. Code entry is paused.' },
  'reset-code': { ...CODE, message: 'Too many incorrect codes. Code entry is paused.' },
  'customer-reauth': { ...LOGIN, message: `Too many incorrect passwords. Try again in ${RULES.loginLockMinutes} minutes.`, meta: { field: 'current' } },
  'admin-reauth': { ...LOGIN, message: `Too many incorrect passwords. Try again in ${RULES.loginLockMinutes} minutes.`, meta: { field: 'current' } },
  'admin-contact': { ...CODE, message: 'Too many incorrect codes. Please start again later.' },
  'reset-sms': { max: 5, lockMinutes: 60, forgetAfterMinutes: 60, code: 'RATE_LIMITED', message: 'Too many codes were sent to this account. Please try again in an hour.' }
};

// The error for a locked scope: LOCKED (423) with meta.lockedUntil, which the pages count down from
function lockedError(scope, lockedUntil) {
  const rule = SCOPES[scope];
  return new ApiError(rule.code || 'LOCKED', rule.message, { lockedUntil, ...(rule.meta || {}) });
}

/**
 * Throws LOCKED when this account is locked in this scope; reads only. Used where the browser
 * version checks the lock before other errors (e.g. LOCKED comes before CODE_EXPIRED).
 */
export async function assertNotLocked(scope, identifier) {
  const row = await repo.findAttempts(scope, identifier);
  if (row && row.lockedUntil && row.lockedUntil > now()) throw lockedError(scope, row.lockedUntil);
}

/**
 * Count one attempt, before its answer is checked. Throws LOCKED when the scope is already locked.
 * Returns { remaining, lockedUntil }:
 *   remaining    tries left after this one, if this one turns out wrong
 *   lockedUntil  set when this attempt was the last one allowed: the lock is already saved, and a
 *                right answer lifts it again through clearAttempts
 */
export async function reserveAttempt(scope, identifier) {
  const rule = SCOPES[scope];
  const at = now();
  await repo.ensureAttempts(scope, identifier, at);
  return tx(async (conn) => {
    // Missing only if a right answer on another request deleted it a moment ago: then nothing is counted yet
    const row = (await repo.lockAttempts(conn, scope, identifier)) || { count: 0, lockedUntil: null, updatedAt: at };
    if (row.lockedUntil && row.lockedUntil > at) throw lockedError(scope, row.lockedUntil);
    // A lock that has run out, or (reset-sms) a long quiet spell, starts a fresh round
    const stale = row.lockedUntil || (rule.forgetAfterMinutes && row.updatedAt < at - rule.forgetAfterMinutes * 60000);
    const count = (stale ? 0 : row.count) + 1;
    if (count >= rule.max) {
      const lockedUntil = at + rule.lockMinutes * 60000;
      await repo.saveAttempts(conn, scope, identifier, { count: 0, lockedUntil, at });
      return { remaining: 0, lockedUntil };
    }
    await repo.saveAttempts(conn, scope, identifier, { count, lockedUntil: null, at });
    return { remaining: rule.max - count, lockedUntil: null };
  });
}

/** Forget the failures, and any lock, after a right answer (or a finished password reset). */
export const clearAttempts = (scope, identifier) => repo.deleteAttempts(scope, identifier);

/**
 * The error to throw for a wrong answer: LOCKED when this attempt used up the last try, otherwise
 * `wrong` (e.g. INVALID_CREDENTIALS) with meta.remaining added, which the forms show as "N attempts left".
 */
export function wrongAnswer(scope, attempt, wrong) {
  if (attempt.lockedUntil) return lockedError(scope, attempt.lockedUntil);
  wrong.meta = { ...wrong.meta, remaining: attempt.remaining };
  return wrong;
}
