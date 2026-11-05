import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../lib/ApiError.js';
import { createBody, proposalParams, selectionBody } from './packageProposal.schemas.js';
import { createPackageProposal, getPackageProposal, selectPackageProposal } from './packageProposal.service.js';

export const packageProposalRoutes = express.Router();
packageProposalRoutes.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
packageProposalRoutes.post(
  '/',
  rateLimit({
    windowMs: 60000,
    limit: 8,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.user.id,
    handler: (req, res, next) =>
      next(new ApiError('RATE_LIMITED', 'Wait a minute before requesting more custom packages.'))
  }),
  validate({ body: createBody }),
  async (req, res) => {
    res.json(await createPackageProposal(req.user.id, req.valid.body));
  }
);
packageProposalRoutes.get('/:id', validate({ params: proposalParams }), async (req, res) => {
  res.json(await getPackageProposal(req.user.id, req.valid.params.id));
});
packageProposalRoutes.post(
  '/:id/select',
  validate({ params: proposalParams, body: selectionBody }),
  async (req, res) => {
    res.json(await selectPackageProposal(req.user.id, { proposalId: req.valid.params.id, ...req.valid.body }));
  }
);
