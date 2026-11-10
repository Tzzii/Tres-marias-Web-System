import { createHash } from 'node:crypto';
import { ipKeyGenerator } from 'express-rate-limit';
import { tx } from '../db.js';
import { ApiError } from '../lib/ApiError.js';
import * as attempts from '../modules/auth/auth.repo.js';

// Fixed windows live in MySQL so restarts and multiple API workers share limits.
export async function consumeAction(scope, identifier, limit, windowMs) {
  const at = Date.now();
  await attempts.ensureAttempts(scope, identifier, at);
  await tx(async (conn) => {
    const row = await attempts.lockAttempts(conn, scope, identifier);
    const active = row.lockedUntil > at;
    if (active && row.count >= limit)
      throw new ApiError('RATE_LIMITED', 'Too many requests. Please wait before trying again.', {
        retryAfter: Math.ceil((row.lockedUntil - at) / 1000)
      });
    await attempts.saveAttempts(conn, scope, identifier, {
      count: active ? row.count + 1 : 1,
      lockedUntil: active ? row.lockedUntil : at + windowMs,
      at
    });
  });
}

export function createCustomerAbuseGuard(consume = consumeAction) {
  return async (req, res, next) => {
    if (req.method !== 'POST') return next();
    const path = req.path.replace(/\/$/, '');
    if (path === '/auth/customer/register' || path === '/auth/customer/google') {
      const network = createHash('sha256')
        .update(ipKeyGenerator(req.ip || ''))
        .digest('hex');
      await consume('signup-network', network, 20, 60 * 60 * 1000);
    }
    next();
  };
}

export function createCustomerWriteGuard(consume = consumeAction) {
  return async (req, res, next) => {
    if (req.method !== 'POST' || req.user?.role !== 'customer') return next();
    if (req.path === '/' || req.path === '') {
      if (req.baseUrl === '/api/reservations') await consume('booking-submit', req.user.id, 5, 60 * 60 * 1000);
    }
    if (req.baseUrl === '/api/threads' && /^\/[^/]+\/messages\/?$/.test(req.path))
      await consume('message-submit', req.user.id, 20, 60 * 1000);
    next();
  };
}
