import jwt from 'jsonwebtoken';
import { config } from '../config.js';

/**
 * Session tokens (docs/backend-development-phases.md §7.3): a JWT signed with JWT_SECRET (HS256),
 * sent by the portals as "Authorization: Bearer <token>" and kept by createAuth (packages/shared) in
 * the portal's { token, user } session.
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

/*
 * The admin's unlock ticket (screen lock after RULES.idleMinutes of inactivity, 2026-10-03). It is handed
 * out with the admin session at sign-in and kept by the page when the session is locked; with the admin's
 * password it opens a new session without an emailed code (auth.service.js, adminUnlock). It is signed
 * with its OWN key, derived from JWT_SECRET, so it can never pass as a session token: readToken (and so
 * every guarded route) refuses it, and readUnlockTicket refuses a session token.
 * Payload: { sub: admin id, pwv, kind: 'admin-unlock', exp }: `exp` is the sign-in session's own end, so
 * unlocking never makes a session last longer than JWT_ADMIN_TTL after the code sign-in, and `pwv` ends
 * the ticket when the password changes.
 */
const unlockKey = () => `${config.jwtSecret}:admin-unlock`;

/** Sign an unlock ticket for an admin, ending at `expiresAt` (seconds since 1970: the session's exp). */
export function signUnlockTicket({ id, passwordChangedAt }, expiresAt) {
  return jwt.sign({ sub: id, pwv: Number(passwordChangedAt) || 0, kind: 'admin-unlock', exp: expiresAt }, unlockKey(), { algorithm: ALGORITHM });
}

/** The payload of an unlock ticket, or null when it is not one (a session token included), was edited, or has expired. */
export function readUnlockTicket(ticket) {
  try {
    const claims = jwt.verify(ticket, unlockKey(), { algorithms: [ALGORITHM] });
    return claims && claims.kind === 'admin-unlock' ? claims : null;
  } catch {
    return null;
  }
}
