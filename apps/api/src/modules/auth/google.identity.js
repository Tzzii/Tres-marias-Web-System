import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { normaliseEmail } from '@tm/shared/src/domain/account.js';
import { validateEmail } from '@tm/shared/src/utils/validation.js';
import { ApiError } from '../../lib/ApiError.js';

/** Google credentials never become application session tokens. Verify them before account lookup. */
export function createGoogleIdentity({ clientId, secret, googleClient = new OAuth2Client(clientId) }) {
  const key = `${secret}:customer-google-challenge`;
  const invalid = () => new ApiError('INVALID_CREDENTIALS', 'Google sign-in could not be verified. Please try again.');
  return {
    issue() {
      if (!clientId) return { clientId: '' };
      const nonce = randomBytes(32).toString('hex');
      const challenge = jwt.sign({ kind: 'google-sign-in', nonce }, key, { algorithm: 'HS256', expiresIn: '10m' });
      return { clientId, nonce, challenge };
    },
    async verify({ credential, challenge }) {
      if (!clientId) throw new ApiError('INVALID_STATE', 'Google sign-in is not available right now.');
      try {
        const claims = jwt.verify(challenge, key, { algorithms: ['HS256'] });
        if (claims.kind !== 'google-sign-in' || typeof claims.nonce !== 'string') throw invalid();
        const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: clientId });
        const payload = ticket.getPayload();
        if (
          !payload ||
          payload.nonce !== claims.nonce ||
          payload.email_verified !== true ||
          typeof payload.sub !== 'string' ||
          !payload.sub ||
          payload.sub.length > 255 ||
          typeof payload.email !== 'string' ||
          validateEmail(payload.email) ||
          !Number.isFinite(payload.exp) ||
          payload.exp * 1000 <= Date.now()
        )
          throw invalid();
        const email = normaliseEmail(payload.email);
        return {
          sub: payload.sub,
          email,
          firstName: typeof payload.given_name === 'string' ? payload.given_name.slice(0, 60) : '',
          lastName: typeof payload.family_name === 'string' ? payload.family_name.slice(0, 60) : '',
          authoritativeEmail: email.endsWith('@gmail.com') || (typeof payload.hd === 'string' && Boolean(payload.hd))
        };
      } catch {
        throw invalid();
      }
    }
  };
}

// The browser exchanges credentials using JSON, not a cross-site form or ambient authentication cookies.
export const requireGoogleOrigin = (origins) => (req, res, next) => {
  if (!origins.includes(req.get('Origin')) || !req.is('application/json'))
    throw new ApiError('FORBIDDEN', 'Open the customer website to continue with Google.');
  next();
};
