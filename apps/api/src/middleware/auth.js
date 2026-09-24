import { ApiError } from '../lib/ApiError.js';
import { readToken } from '../lib/tokens.js';
import { findSessionAccount } from '../modules/auth/auth.repo.js';

/**
 * Route guards (docs/backend-development-phases.md §7.2, §12.7). A request is signed in when it
 * carries "Authorization: Bearer <token>" and the token is:
 *   1. genuine and unexpired: signed with JWT_SECRET, HS256 only (lib/tokens.js), and
 *   2. still current: its account exists and the account's password has not changed since the token
 *      was made (the token's `pwv` equals password_changed_at). Changing or resetting a password
 *      therefore signs out every older session.
 * Then req.user = { id, role: 'customer' | 'admin', name, exp }. The name is read from the database
 * on every request, so an audit entry never carries a name that has since changed; `exp` (seconds)
 * lets a renewed token end when this one would have.
 */

// The token from "Authorization: Bearer <token>", or null
function bearer(req) {
  const [scheme, token] = (req.get('Authorization') || '').split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

// The signed-in user behind the request, or null when there is no usable token
async function sessionUser(req) {
  const token = bearer(req);
  const payload = token ? readToken(token) : null;
  if (!payload || typeof payload.sub !== 'string' || (payload.role !== 'customer' && payload.role !== 'admin')) return null;
  const account = await findSessionAccount(payload.role, payload.sub);
  if (!account || (Number(account.passwordChangedAt) || 0) !== payload.pwv) return null;
  return { id: payload.sub, role: payload.role, name: account.name, exp: payload.exp };
}

/**
 * A signed-in user is required: otherwise 401 UNAUTHENTICATED, which makes the portal end its
 * session (services/http.js). Sets req.user.
 */
export async function requireAuth(req, res, next) {
  const user = await sessionUser(req);
  if (!user) throw new ApiError('UNAUTHENTICATED', 'Please sign in again.');
  req.user = user;
  next();
}

/** The signed-in user must have this role ('customer' or 'admin'): otherwise 403 FORBIDDEN. Use after requireAuth. */
export const requireRole = (role) => (req, res, next) =>
  req.user && req.user.role === role ? next() : next(new ApiError('FORBIDDEN', 'You do not have access to this.'));

/**
 * For public routes that show more to an admin (e.g. hidden packages, Phase 4): sets req.user when
 * the request carries a usable token, and otherwise carries on as a guest. A bad token is not an
 * error here, just no user.
 */
export async function optionalAuth(req, res, next) {
  const user = await sessionUser(req);
  if (user) req.user = user;
  next();
}
