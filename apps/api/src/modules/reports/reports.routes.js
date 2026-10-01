import express from 'express';
import { validate } from '../../middleware/validate.js';
import * as schemas from './reports.schemas.js';
import * as reports from './reports.service.js';

/**
 * The dashboard and report endpoints of Phase 11 (docs/backend-development-phases.md §9.11): URL, guard
 * and request shape only; the figures are worked out in reports.service.js. One router, mounted by app.js
 * at /api/admin/reports, behind the admin router's guard: no token -> 401, a customer's token -> 403.
 * All three are reads. The TXT exports are made by the admin page itself (apps/admin/src/lib/txt.js).
 */

export const reportAdminRoutes = express.Router();

// The Dashboard: today's events, requests waiting, payments to verify, revenue this month, the next events
reportAdminRoutes.get('/dashboard', async (req, res) => {
  res.json(await reports.getDashboardSummary());
});
// The Reports page's figures: ?range=this_year (the default) | last_12 | last_year | all
reportAdminRoutes.get('/', validate({ query: schemas.rangeQuery }), async (req, res) => {
  res.json(await reports.getReport(req.valid.query.range));
});
// A saved report's rows: /saved/monthly_sales or /saved/outstanding, with the same ?range=
reportAdminRoutes.get('/saved/:kind', validate({ params: schemas.kindParams, query: schemas.rangeQuery }), async (req, res) => {
  res.json(await reports.runSavedReport(req.valid.params.kind, req.valid.query.range));
});
