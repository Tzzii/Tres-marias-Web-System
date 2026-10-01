import express from 'express';
import { validate } from '../../middleware/validate.js';
import * as schemas from './inventory.schemas.js';
import * as inventory from './inventory.service.js';

/**
 * The equipment inventory endpoints of Phase 10 (docs/backend-development-phases.md §9.9): URL, guard
 * and request shape only; the rules are in inventory.service.js. One router, mounted by app.js at
 * /api/admin/inventory, behind the admin router's guard: no token -> 401, a customer's token -> 403.
 * The admin who signs every history line and audit-trail entry is req.user (from the token), never a
 * name sent by the page. Fixed paths (checkout-events, archive, rentals/…) come before /:id.
 */

export const inventoryAdminRoutes = express.Router();

// Every item with its counts and where its pieces are; ?includeArchived=true adds the archived ones
inventoryAdminRoutes.get('/', validate({ query: schemas.listQuery }), async (req, res) => {
  res.json(await inventory.listInventory({ includeArchived: req.valid.query.includeArchived }));
});
// The bookings equipment can be checked out for (approved to confirmed), soonest first
inventoryAdminRoutes.get('/checkout-events', async (req, res) => {
  res.json(await inventory.listCheckoutEvents());
});
// Add item(s): { items: [...] } -> 201 with the new items
inventoryAdminRoutes.post('/', validate({ body: schemas.addBody }), async (req, res) => {
  res.status(201).json(await inventory.addInventoryItems(req.valid.body.items, req.user));
});
// Archive or restore: { ids, archived } -> { count }
inventoryAdminRoutes.post('/archive', validate({ body: schemas.archiveBody }), async (req, res) => {
  res.json(await inventory.setInventoryArchived(req.valid.body.ids, req.valid.body.archived, req.user));
});

// An equipment rental: what is out for it, check out everything it still needs, and record its return
inventoryAdminRoutes.get('/rentals/:ref', validate({ params: schemas.refParams }), async (req, res) => {
  res.json(await inventory.listReservationEquipment(req.valid.params.ref));
});
inventoryAdminRoutes.post('/rentals/:ref/check-out', validate({ params: schemas.refParams }), async (req, res) => {
  res.json(await inventory.checkOutRental(req.valid.params.ref, req.user));
});
// { returns: [{ itemId, good, damaged }] } -> { pieces, damaged }
inventoryAdminRoutes.post('/rentals/:ref/return', validate({ params: schemas.refParams, body: schemas.returnBody }), async (req, res) => {
  res.json(await inventory.returnRental(req.valid.params.ref, req.valid.body.returns, req.user));
});

// One item: edit it, or move its stock ({ action, qty, damagedQty, ref, note }); each answers with the item
inventoryAdminRoutes.patch('/:id', validate({ params: schemas.idParams, body: schemas.updateBody }), async (req, res) => {
  res.json(await inventory.updateInventoryItem(req.valid.params.id, req.valid.body, req.user));
});
inventoryAdminRoutes.post('/:id/movements', validate({ params: schemas.idParams, body: schemas.moveBody }), async (req, res) => {
  const { action, ...input } = req.valid.body;
  res.json(await inventory.moveInventoryStock(req.valid.params.id, action, input, req.user));
});
