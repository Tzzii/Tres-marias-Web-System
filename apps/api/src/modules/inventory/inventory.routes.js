import express from 'express';
import { validate } from '../../middleware/validate.js';
import * as schemas from './inventory.schemas.js';
import * as inventory from './inventory.service.js';
import { photoUpload } from '../../middleware/photoUpload.js';
import { ApiError } from '../../lib/ApiError.js';
import { sendInventoryPhoto } from './inventory.photo.js';

const uploadPhoto = photoUpload('photo');
function itemForm(req, res, next) {
  if (!req.is('multipart/form-data')) return next();
  uploadPhoto(req, res, (err) => {
    if (err) return next(err);
    try {
      req.body = JSON.parse(req.body.item);
    } catch {
      return next(new ApiError('INVALID', 'The inventory form could not be read.'));
    }
    return next();
  });
}


export const inventoryAdminRoutes = express.Router();

inventoryAdminRoutes.get('/', validate({ query: schemas.listQuery }), async (req, res) => {
  res.json(await inventory.listInventory({ includeArchived: req.valid.query.includeArchived }));
});
inventoryAdminRoutes.get('/checkout-events', async (req, res) => {
  res.json(await inventory.listCheckoutEvents());
});
inventoryAdminRoutes.post('/', validate({ body: schemas.addBody }), async (req, res) => {
  res.status(201).json(await inventory.addInventoryItems(req.valid.body.items, req.user));
});
inventoryAdminRoutes.post('/archive', validate({ body: schemas.archiveBody }), async (req, res) => {
  res.json(await inventory.setInventoryArchived(req.valid.body.ids, req.valid.body.archived, req.user));
});

inventoryAdminRoutes.get('/rentals/:ref', validate({ params: schemas.refParams }), async (req, res) => {
  res.json(await inventory.listReservationEquipment(req.valid.params.ref));
});
inventoryAdminRoutes.get('/rentals/:ref/checkout-state', validate({ params: schemas.refParams }), async (req, res) => {
  res.json(await inventory.rentalCheckoutState(req.valid.params.ref));
});
inventoryAdminRoutes.post('/rentals/:ref/check-out', validate({ params: schemas.refParams }), async (req, res) => {
  res.json(await inventory.checkOutRental(req.valid.params.ref, req.user));
});
inventoryAdminRoutes.post(
  '/rentals/:ref/return',
  validate({ params: schemas.refParams, body: schemas.returnBody }),
  async (req, res) => {
    res.json(await inventory.returnRental(req.valid.params.ref, req.valid.body.returns, req.user));
  }
);

inventoryAdminRoutes.get('/:id/photo', validate({ params: schemas.idParams }), async (req, res) => {
  await sendInventoryPhoto(req, res, true);
});
inventoryAdminRoutes.patch(
  '/:id',
  itemForm,
  validate({ params: schemas.idParams, body: schemas.updateBody }),
  async (req, res) => {
    res.json(await inventory.updateInventoryItem(req.valid.params.id, req.valid.body, req.user, req.file));
  }
);
inventoryAdminRoutes.delete('/:id', validate({ params: schemas.idParams }), async (req, res) => {
  res.json(await inventory.deleteInventoryItem(req.valid.params.id));
});
inventoryAdminRoutes.post(
  '/:id/movements',
  validate({ params: schemas.idParams, body: schemas.moveBody }),
  async (req, res) => {
    const { action, ...input } = req.valid.body;
    res.json(await inventory.moveInventoryStock(req.valid.params.id, action, input, req.user));
  }
);
