import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { ApiError } from '../../lib/ApiError.js';
import { validate } from '../../middleware/validate.js';
import { budgetProposalBody } from './budget.schemas.js';
import { createBudgetProposal } from './budget.service.js';

export function createBudgetRoutes({ service = createBudgetProposal, limit = 5 } = {}) {
  const router = express.Router();
  router.post(
    '/',
    rateLimit({
      windowMs: 60000,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      keyGenerator: (req) => req.user.id,
      handler: (req, res, next) =>
        next(
          new ApiError('RATE_LIMITED', 'Please wait a minute before reviewing your budget again.', { retryAfter: 60 })
        )
    }),
    validate({ body: budgetProposalBody }),
    async (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json(await service(req.user, req.valid.body));
    }
  );
  return router;
}
