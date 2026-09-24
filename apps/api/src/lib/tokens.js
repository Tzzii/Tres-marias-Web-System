import jwt from 'jsonwebtoken';
import { config } from '../config.js';

/**
 * Session tokens (docs/backend-development-phases.md §7.3): a JWT signed with JWT_SECRET (HS256),
 * sent by the portals as "Authorization: Bearer <token>" and kept by createAuth in the same
 * { token, user } session the browser store used.
 *
 * Payload: { sub: account id, role: 'customer' | 'admin', name, pwv, iat, exp }.
 * - role is the kind of account, not the admin's job title (that is admins.role, e.g. "Administrator").
 * - pwv ("password version") is the account's password_changed_at when the token was made (0 when the
 *   password was never changed). middleware/auth.js compares it with the current value on every
 *   request, so changing or resetting a password ends every session made before the change.
 */

const ALGORITHM = 'HS256';

/**
 * Sign a token for an account. Either `ttl` (a duration such as '8h' or '7d', from config.jwt) or
 * `expiresAt` (seconds since 1970, e.g. the `exp` of the token being replaced, so a renewed token
 * ends when the old one would have) sets when it expires.
 */
export function signToken({ id, role, name, passwordChangedAt }, { ttl, expiresAt } = {}) {
  const payload = { sub: id, role, name, pwv: Number(passwordChangedAt) || 0 };
  if (expiresAt) return jwt.sign({ ...payload, exp: expiresAt }, config.jwtSecret, { algorithm: ALGORITHM });
  return jwt.sign(payload, config.jwtSecret, { algorithm: ALGORITHM, expiresIn: ttl });
}

/**
 * The payload of a token, or null when it is not a JWT, was signed with another secret or another
 * algorithm (e.g. "none"), was edited after signing, or has expired. Only HS256 is accepted.
 */
export function readToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret, { algorithms: [ALGORITHM] });
  } catch {
    return null;
  }
}
