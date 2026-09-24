import express from 'express';
import { ApiError } from '../../lib/ApiError.js';
import { optionalAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as schemas from './catalog.schemas.js';
import * as catalog from './catalog.service.js';

/**
 * The catalogue endpoints (docs/backend-development-phases.md §9.2): URL, guard and request shape
 * only; the rules are in catalog.service.js. Two routers, mounted by app.js:
 *   catalogRoutes       /api/...        public reads; three of them (packages, addons, dishes) use
 *                                       optionalAuth, so an admin's token can see hidden and archived records
 *   catalogAdminRoutes  /api/admin/...  the admin catalogue manager, behind the admin router's guard
 */

/**
 * Who is asking, for the reads that show more to an admin: { admin: true } for a signed-in admin.
 * When the request asks for the admin view (hidden or archived records) and carries a token that no
 * longer works (expired, or older than a password change), answer 401 UNAUTHENTICATED instead of
 * quietly returning what customers see: the admin portal then signs out, rather than showing a
 * Packages page with its hidden and archived records missing. Without those switches a bad token is
 * simply a guest, so a customer whose session ended can still browse the site.
 */
function viewer(req, wantsAdminView) {
  if (wantsAdminView && !req.user && req.get('Authorization')) throw new ApiError('UNAUTHENTICATED', 'Please sign in again.');
  return { admin: Boolean(req.user && req.user.role === 'admin') };
}

/* ============================ /api (public reads) ============================ */

export const catalogRoutes = express.Router();

// ?includeHidden=true&includeArchived=true: honoured for an admin only
catalogRoutes.get('/packages', optionalAuth, validate({ query: schemas.packagesQuery }), async (req, res) => {
  const { query } = req.valid;
  res.json(await catalog.listPackages(query, viewer(req, query.includeHidden || query.includeArchived)));
});
catalogRoutes.get('/packages/by-slug/:slug', validate({ params: schemas.slugParams }), async (req, res) => {
  res.json(await catalog.getPackageBySlug(req.valid.params.slug));
});
catalogRoutes.get('/addons', optionalAuth, validate({ query: schemas.archivedQuery }), async (req, res) => {
  const { query } = req.valid;
  res.json(await catalog.listAddons(query, viewer(req, query.includeArchived)));
});
catalogRoutes.get('/dishes', optionalAuth, validate({ query: schemas.archivedQuery }), async (req, res) => {
  const { query } = req.valid;
  res.json(await catalog.listDishes(query, viewer(req, query.includeArchived)));
});
// The booking form's one call: { packages, addons, dishes, pricePerPlate, rentals }
catalogRoutes.get('/catalog', async (req, res) => {
  res.json(await catalog.getCatalog());
});
// { pricePerPlate }: keeps the portals' synchronous pricePerPlate() current (services/remote/catalog.js)
catalogRoutes.get('/catalog/price-per-plate', async (req, res) => {
  res.json(await catalog.getPricePerPlate());
});
// The Equipment Rental price list: [{ id, name, category, price, damageFee }], never stock counts
catalogRoutes.get('/rental-items', async (req, res) => {
  res.json(await catalog.listRentalItems());
});

/* ============================ /api/admin (catalogue manager) ============================ */

export const catalogAdminRoutes = express.Router();

// Packages: create (201), edit, show/hide, archive/restore
catalogAdminRoutes.post('/packages', validate({ body: schemas.packageBody }), async (req, res) => {
  res.status(201).json(await catalog.savePackage(null, req.valid.body));
});
catalogAdminRoutes.put('/packages/:id', validate({ params: schemas.idParams, body: schemas.packageBody }), async (req, res) => {
  res.json(await catalog.savePackage(req.valid.params.id, req.valid.body));
});
catalogAdminRoutes.patch('/packages/:id/visibility', validate({ params: schemas.idParams, body: schemas.visibilityBody }), async (req, res) => {
  res.json(await catalog.setPackageVisibility(req.valid.params.id, req.valid.body.visible));
});
catalogAdminRoutes.patch('/packages/:id/archived', validate({ params: schemas.idParams, body: schemas.archivedBody }), async (req, res) => {
  res.json(await catalog.setPackageArchived(req.valid.params.id, req.valid.body.archived));
});

// Additional charges (add-ons): create (201), edit, archive/restore
catalogAdminRoutes.post('/addons', validate({ body: schemas.addonBody }), async (req, res) => {
  res.status(201).json(await catalog.saveAddon(null, req.valid.body));
});
catalogAdminRoutes.put('/addons/:id', validate({ params: schemas.idParams, body: schemas.addonBody }), async (req, res) => {
  res.json(await catalog.saveAddon(req.valid.params.id, req.valid.body));
});
catalogAdminRoutes.patch('/addons/:id/archived', validate({ params: schemas.idParams, body: schemas.archivedBody }), async (req, res) => {
  res.json(await catalog.setAddonArchived(req.valid.params.id, req.valid.body.archived));
});

// Buffet dishes: create (201), edit, archive/restore
catalogAdminRoutes.post('/dishes', validate({ body: schemas.dishBody }), async (req, res) => {
  res.status(201).json(await catalog.saveDish(null, req.valid.body));
});
catalogAdminRoutes.put('/dishes/:id', validate({ params: schemas.idParams, body: schemas.dishBody }), async (req, res) => {
  res.json(await catalog.saveDish(req.valid.params.id, req.valid.body));
});
catalogAdminRoutes.patch('/dishes/:id/archived', validate({ params: schemas.idParams, body: schemas.archivedBody }), async (req, res) => {
  res.json(await catalog.setDishArchived(req.valid.params.id, req.valid.body.archived));
});

// Buffet price per person: { pricePerPlate } in, { pricePerPlate } out
catalogAdminRoutes.put('/catalog/price-per-plate', validate({ body: schemas.pricePerPlateBody }), async (req, res) => {
  res.json(await catalog.setPricePerPlate(req.valid.body.pricePerPlate));
});
