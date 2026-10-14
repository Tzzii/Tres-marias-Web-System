import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { ApiError } from './ApiError.js';


const ALGORITHM = 'HS256';

export function signToken({ id, role, name, passwordChangedAt, sessionId }, { ttl, expiresAt } = {}) {
  const payload = {
    sub: id,
    role,
    name,
    pwv: Number(passwordChangedAt) || 0,
    ...(sessionId ? { sid: sessionId } : {})
  };
  if (expiresAt) return jwt.sign({ ...payload, exp: expiresAt }, config.jwtSecret, { algorithm: ALGORITHM });
  return jwt.sign(payload, config.jwtSecret, { algorithm: ALGORITHM, expiresIn: ttl });
}

export function readToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret, { algorithms: [ALGORITHM] });
  } catch {
    return null;
  }
}

const unlockKey = () => `${config.jwtSecret}:admin-unlock`;

export function signUnlockTicket({ id, passwordChangedAt }, sessionId, expiresAt) {
  return jwt.sign(
    { sub: id, pwv: Number(passwordChangedAt) || 0, sid: sessionId, kind: 'admin-unlock', exp: expiresAt },
    unlockKey(),
    {
      algorithm: ALGORITHM
    }
  );
}

export function readUnlockTicket(ticket) {
  try {
    const claims = jwt.verify(ticket, unlockKey(), { algorithms: [ALGORITHM] });
    return claims && claims.kind === 'admin-unlock' ? claims : null;
  } catch {
    return null;
  }
}

export const sessionReplaced = () =>
  new ApiError('SESSION_REPLACED', 'You were signed out because your account was signed in on another device.');
