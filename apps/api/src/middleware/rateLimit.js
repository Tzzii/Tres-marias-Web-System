import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { ApiError } from '../lib/ApiError.js';
import { readToken } from '../lib/tokens.js';

/**
 * Request limits (docs/backend-development-phases.md §7.2, Phase 3):
 *   authLimiter  5 a minute per client IP address on each sign-in, sign-up, code and password-reset route
 *   apiLimiter   100 a minute on everything under /api: per account for a signed-in request (since
 *                Phase 7), per client IP address otherwise
 * Counted in memory, per API process: a restart forgets the counts (the lockouts, which matter more,
 * are in the database). req.ip is the real client because app.js trusts one proxy (Nginx) in front;
 * the API must therefore be reachable only through that proxy in production (Phase 13), otherwise a
 * client could pick its own address with an X-Forwarded-For header.
 * Over the limit: 429 RATE_LIMITED in the usual { code, message, meta } shape, with a Retry-After
 * header and meta.retryAfter (seconds).
 */

const MINUTE = 60 * 1000;

// Answer "too many requests" through the error handler, like every other error
function refuse(req, res, next, options) {
  const reset = req.rateLimit && req.rateLimit.resetTime;
  const retryAfter = reset ? Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000)) : Math.ceil(options.windowMs / 1000);
  next(new ApiError('RATE_LIMITED', 'Too many requests. Please wait a moment and try again.', { retryAfter }));
}

/**
 * The strict limit for /api/auth routes. Put it on each route (router.post(path, authLimiter, …)),
 * not on the whole router: the key is the IP address plus the route, so the log-in form and the
 * code form each allow 5 tries a minute. req.route is the matched route pattern (e.g.
 * /customer/password-reset/:id/verify), so a new request id does not start a new count.
 * ipKeyGenerator groups an IPv6 address with its /56 block, since one household gets a whole block.
 */
export const authLimiter = rateLimit({
  windowMs: MINUTE,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip || '')} ${req.method} ${req.baseUrl}${req.route ? req.route.path : req.path}`,
  handler: refuse
});

/**
 * Who a request counts against: the account whose genuine, unexpired token it carries (people behind
 * one IP address, such as a family's Wi-Fi or a mobile network, each get their own count, and the
 * portals' change poller adds 4 requests a minute per open tab), or else its IP address (with IPv6
 * grouped by /56, like authLimiter). Only the signature and expiry are checked here; requireAuth still
 * decides whether the session is current.
 */
function accountOrAddress(req) {
  const [scheme, token] = (req.get('Authorization') || '').split(' ');
  const payload = scheme === 'Bearer' && token ? readToken(token) : null;
  return payload && typeof payload.sub === 'string' ? `${payload.role}:${payload.sub}` : ipKeyGenerator(req.ip || '');
}

/** The general limit for every /api route (after /api/health, which uptime checks may call often). */
export const apiLimiter = rateLimit({
  windowMs: MINUTE,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: accountOrAddress,
  handler: refuse
});
