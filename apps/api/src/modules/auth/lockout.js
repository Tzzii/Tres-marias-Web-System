import { RULES } from '@tm/shared/src/services/config.js';
import { tx } from '../../db.js';
import { ApiError } from '../../lib/ApiError.js';
import { now } from '../../lib/time.js';
import * as repo from './auth.repo.js';

const LOGIN = { max: RULES.maxLoginAttempts, lockMinutes: RULES.loginLockMinutes };
const CODE = { max: RULES.maxCodeAttempts, lockMinutes: RULES.codeLockMinutes };

export const SCOPES = {
  customer: { ...LOGIN, message: 'Too many failed attempts. This account is temporarily locked.' },
  admin: { ...LOGIN, message: 'Too many failed attempts. This account is temporarily locked.' },
  'admin-code': { ...CODE, message: 'Too many incorrect codes. Code entry is paused.' },
  'google-code': { ...CODE, message: 'Too many incorrect codes. Code entry is paused.' },
  'reset-code': { ...CODE, message: 'Too many incorrect codes. Code entry is paused.' },
  'signup-code': { ...CODE, message: 'Too many incorrect codes. Code entry is paused.' },
  'change-code': { ...CODE, message: 'Too many incorrect codes. Code entry is paused.' },
  'email-change-code': { ...CODE, message: 'Too many incorrect codes. Code entry is paused.' },
  'customer-reauth': {
    ...LOGIN,
    message: `Too many incorrect passwords. Try again in ${RULES.loginLockMinutes} minutes.`,
    meta: { field: 'current' }
  },
  'admin-reauth': {
    ...LOGIN,
    message: `Too many incorrect passwords. Try again in ${RULES.loginLockMinutes} minutes.`,
    meta: { field: 'current' }
  },
  'admin-contact': { ...CODE, message: 'Too many incorrect codes. Please start again later.' },
  'code-email': {
    max: 5,
    lockMinutes: 60,
    forgetAfterMinutes: 60,
    code: 'RATE_LIMITED',
    message: 'Too many codes were sent to this email. Please try again in an hour.'
  }
};

function lockedError(scope, lockedUntil) {
  const rule = SCOPES[scope];
  return new ApiError(rule.code || 'LOCKED', rule.message, { lockedUntil, ...(rule.meta || {}) });
}

export async function assertNotLocked(scope, identifier) {
  const row = await repo.findAttempts(scope, identifier);
  if (row && row.lockedUntil && row.lockedUntil > now()) throw lockedError(scope, row.lockedUntil);
}

export async function reserveAttempt(scope, identifier) {
  const rule = SCOPES[scope];
  const at = now();
  await repo.ensureAttempts(scope, identifier, at);
  return tx(async (conn) => {
    const row = (await repo.lockAttempts(conn, scope, identifier)) || { count: 0, lockedUntil: null, updatedAt: at };
    if (row.lockedUntil && row.lockedUntil > at) throw lockedError(scope, row.lockedUntil);
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

export const clearAttempts = (scope, identifier) => repo.deleteAttempts(scope, identifier);

export function wrongAnswer(scope, attempt, wrong) {
  if (attempt.lockedUntil) return lockedError(scope, attempt.lockedUntil);
  wrong.meta = { ...wrong.meta, remaining: attempt.remaining };
  return wrong;
}
