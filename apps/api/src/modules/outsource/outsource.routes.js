import express from 'express';
import { validate } from '../../middleware/validate.js';
import * as schemas from './outsource.schemas.js';
import * as outsource from './outsource.service.js';

/**
 * The outsourcing endpoints of Phase 10 (docs/backend-development-phases.md §9.10): URL, guard and
 * request shape only; the rules are in outsource.service.js. One router, mounted by app.js at
 * /api/admin/outsource, behind the admin router's guard: no token -> 401, a customer's token -> 403.
 * The admin who signs every history line is req.user (from the token), never a name sent by the page.
 */

export const outsourceAdminRoutes = express.Router();

// The bookings a contract can be for (approved to confirmed), soonest first
outsourceAdminRoutes.get('/events', async (req, res) => {
  res.json(await outsource.listOutsourceEvents());
});

// Partners: the list (?includeArchived=true adds the archived ones), add, archive or restore, edit
outsourceAdminRoutes.get('/partners', validate({ query: schemas.listQuery }), async (req, res) => {
  res.json(await outsource.listPartners({ includeArchived: req.valid.query.includeArchived }));
});
outsourceAdminRoutes.post('/partners', validate({ body: schemas.partnerBody }), async (req, res) => {
  res.status(201).json(await outsource.savePartner(null, req.valid.body, req.user));
});
// { ids, archived } -> { count }
outsourceAdminRoutes.post('/partners/archive', validate({ body: schemas.archiveBody }), async (req, res) => {
  res.json(await outsource.setPartnerArchived(req.valid.body.ids, req.valid.body.archived, req.user));
});
outsourceAdminRoutes.put('/partners/:id', validate({ params: schemas.idParams, body: schemas.partnerBody }), async (req, res) => {
  res.json(await outsource.savePartner(req.valid.params.id, req.valid.body, req.user));
});

// Contracts: the list (newest first), a new draft, changes to a draft, send, and the next status
outsourceAdminRoutes.get('/contracts', async (req, res) => {
  res.json(await outsource.listContracts());
});
outsourceAdminRoutes.post('/contracts', validate({ body: schemas.contractBody }), async (req, res) => {
  res.status(201).json(await outsource.saveContract(null, req.valid.body, req.user));
});
outsourceAdminRoutes.put('/contracts/:id', validate({ params: schemas.idParams, body: schemas.contractBody }), async (req, res) => {
  res.json(await outsource.saveContract(req.valid.params.id, req.valid.body, req.user));
});
// { body } -> the contract (with deliveryNote when a channel did not really go out)
outsourceAdminRoutes.post('/contracts/:id/send', validate({ params: schemas.idParams, body: schemas.sendBody }), async (req, res) => {
  res.json(await outsource.sendContract(req.valid.params.id, req.valid.body.body, req.user));
});
// { status: 'accepted' | 'declined' | 'completed' | 'cancelled', note }
outsourceAdminRoutes.post('/contracts/:id/status', validate({ params: schemas.idParams, body: schemas.statusBody }), async (req, res) => {
  res.json(await outsource.setContractStatus(req.valid.params.id, req.valid.body.status, req.valid.body.note, req.user));
});
