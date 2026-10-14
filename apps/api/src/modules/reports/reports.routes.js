import express from 'express';
import { validate } from '../../middleware/validate.js';
import * as schemas from './reports.schemas.js';
import * as reports from './reports.service.js';


export const reportAdminRoutes = express.Router();

reportAdminRoutes.get('/dashboard', async (req, res) => {
  res.json(await reports.getDashboardSummary());
});
reportAdminRoutes.get('/', validate({ query: schemas.rangeQuery }), async (req, res) => {
  res.json(await reports.getReport(req.valid.query.range));
});
reportAdminRoutes.get(
  '/saved/:kind',
  validate({ params: schemas.kindParams, query: schemas.rangeQuery }),
  async (req, res) => {
    res.json(await reports.runSavedReport(req.valid.params.kind, req.valid.query.range));
  }
);
