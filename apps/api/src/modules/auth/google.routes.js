import express from 'express';
import { config } from '../../config.js';
import { tx } from '../../db.js';
import { checkSecret } from '../../lib/passwords.js';
import { newId } from '../../lib/ids.js';
import { now } from '../../lib/time.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { createGoogleIdentity, requireGoogleOrigin } from './google.identity.js';
import { createGoogleCustomerService } from './google.service.js';
import { customerSession, startGoogleEmailSignup } from './auth.service.js';
import { customerGoogle } from './auth.schemas.js';
import { assertNotLocked, reserveAttempt, wrongAnswer, clearAttempts } from './lockout.js';
import * as repo from './google.repo.js';

export function createGoogleRoutes({
  identity = createGoogleIdentity({ clientId: config.googleClientId, secret: config.jwtSecret }),
  origins = config.corsOrigins,
  service = createGoogleCustomerService({
    verify: identity.verify,
    repo,
    transaction: tx,
    session: customerSession,
    checkPassword: checkSecret,
    assertNotLocked,
    reserveAttempt,
    wrongAnswer,
    clearAttempts,
    startEmailSignup: startGoogleEmailSignup,
    newId,
    now
  })
} = {}) {
  const router = express.Router();
  router.get('/customer/google/config', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(identity.issue());
  });
  router.post(
    '/customer/google',
    requireGoogleOrigin(origins),
    authLimiter,
    validate({ body: customerGoogle }),
    async (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json(await service.signIn(req.valid.body));
    }
  );
  return router;
}
