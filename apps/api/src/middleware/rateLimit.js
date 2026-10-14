import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { ApiError } from '../lib/ApiError.js';
import { readToken } from '../lib/tokens.js';


const MINUTE = 60 * 1000;

function refuse(req, res, next, options) {
  const reset = req.rateLimit && req.rateLimit.resetTime;
  const retryAfter = reset
    ? Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000))
    : Math.ceil(options.windowMs / 1000);
  next(new ApiError('RATE_LIMITED', 'Too many requests. Please wait a moment and try again.', { retryAfter }));
}

export const authLimiter = rateLimit({
  windowMs: MINUTE,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${ipKeyGenerator(req.ip || '')} ${req.method} ${req.baseUrl}${req.route ? req.route.path : req.path}`,
  handler: refuse
});

const ACCOUNT_LIMIT = 300;
const ADDRESS_LIMIT = 100;

function accountOf(req) {
  if (req.rateLimitAccount === undefined) {
    const [scheme, token] = (req.get('Authorization') || '').split(' ');
    const payload = scheme === 'Bearer' && token ? readToken(token) : null;
    req.rateLimitAccount = payload && typeof payload.sub === 'string' ? `${payload.role}:${payload.sub}` : null;
  }
  return req.rateLimitAccount;
}

const accountOrAddress = (req) => accountOf(req) || ipKeyGenerator(req.ip || '');

export const apiLimiter = rateLimit({
  windowMs: MINUTE,
  limit: (req) => (accountOf(req) ? ACCOUNT_LIMIT : ADDRESS_LIMIT),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: accountOrAddress,
  handler: refuse
});
