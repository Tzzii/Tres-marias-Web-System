import express from 'express';
import { config } from '../../config.js';
import { tx } from '../../db.js';
import { checkSecret } from '../../lib/passwords.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { createGoogleIdentity, requireGoogleOrigin } from './google.identity.js';
import { createGoogleCustomerService } from './google.service.js';
import { createGoogleSignInCodeService } from './google-code.service.js';
import { startGoogleEmailSignup } from './auth.service.js';
import { customerGoogle, codeBody, requestParams } from './auth.schemas.js';
import { assertNotLocked, reserveAttempt, wrongAnswer } from './lockout.js';
import * as repo from './google.repo.js';

export function createGoogleRoutes({
  identity = createGoogleIdentity({ clientId: config.googleClientId, secret: config.jwtSecret }),
  origins = config.corsOrigins,
  codes = createGoogleSignInCodeService(),
  service = createGoogleCustomerService({
    verify: identity.verify,
    repo,
    transaction: tx,
    startSignInCode: codes.start,
    checkPassword: checkSecret,
    assertNotLocked,
    reserveAttempt,
    wrongAnswer,
    startEmailSignup: startGoogleEmailSignup
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
  router.post(
    '/customer/google/:id/verify',
    requireGoogleOrigin(origins),
    authLimiter,
    validate({ params: requestParams, body: codeBody }),
    async (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json(await codes.verify({ challengeId: req.valid.params.id, code: req.valid.body.code }));
    }
  );
  router.post(
    '/customer/google/:id/resend',
    requireGoogleOrigin(origins),
    authLimiter,
    validate({ params: requestParams }),
    async (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json(await codes.resend(req.valid.params.id));
    }
  );
  return router;
}
