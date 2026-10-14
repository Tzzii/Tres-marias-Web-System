import { ApiError } from '../lib/ApiError.js';
import { readToken, sessionReplaced } from '../lib/tokens.js';
import { findSessionAccount } from '../modules/auth/auth.repo.js';


function bearer(req) {
  const [scheme, token] = (req.get('Authorization') || '').split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

export async function readSessionToken(token, findAccount = findSessionAccount) {
  const payload = token ? readToken(token) : null;
  if (
    !payload ||
    typeof payload.sub !== 'string' ||
    !payload.sub ||
    payload.sub.length > 128 ||
    !Number.isFinite(payload.exp) ||
    (payload.role !== 'customer' && payload.role !== 'admin')
  )
    return { user: null };
  const account = await findAccount(payload.role, payload.sub);
  if (!account || (Number(account.passwordChangedAt) || 0) !== payload.pwv) return { user: null };
  if (payload.role === 'admin') {
    if (typeof payload.sid !== 'string' || !account.sessionId) return { user: null };
    if (payload.sid !== account.sessionId) return { user: null, replaced: true };
  }
  return { user: { id: payload.sub, role: payload.role, name: account.name, exp: payload.exp } };
}

const readSession = (req) => readSessionToken(bearer(req));

export async function requireAuth(req, res, next) {
  const { user, replaced } = await readSession(req);
  if (replaced) throw sessionReplaced();
  if (!user) throw new ApiError('UNAUTHENTICATED', 'Please sign in again.');
  req.user = user;
  next();
}

export const requireRole = (role) => (req, res, next) =>
  req.user && req.user.role === role ? next() : next(new ApiError('FORBIDDEN', 'You do not have access to this.'));

export async function optionalAuth(req, res, next) {
  const { user } = await readSession(req);
  if (user) req.user = user;
  next();
}
