import express from 'express';
import { validate } from '../../middleware/validate.js';
import * as schemas from './customers.schemas.js';
import * as customers from './customers.service.js';

export const customerAdminRoutes = express.Router();

customerAdminRoutes.post('/:id/restore-access', validate({ params: schemas.idParams }), async (req, res) => {
  res.json(await customers.restoreCustomerAccess(req.valid.params.id, req.user));
});
customerAdminRoutes.post(
  '/:id/delete-account',
  validate({ params: schemas.idParams, body: schemas.deletionBody }),
  async (req, res) => {
    res.json(await customers.deleteCustomerAccount(req.valid.params.id, req.valid.body, req.user));
  }
);

customerAdminRoutes.post(
  '/:id/remove-access',
  validate({ params: schemas.idParams, body: schemas.removalBody }),
  async (req, res) => {
    res.json(await customers.removeCustomerAccess(req.valid.params.id, req.valid.body, req.user));
  }
);

customerAdminRoutes.get('/', async (req, res) => {
  res.json(await customers.listCustomers());
});
customerAdminRoutes.get('/:id', validate({ params: schemas.idParams }), async (req, res) => {
  res.json(await customers.getCustomer(req.valid.params.id));
});
customerAdminRoutes.patch(
  '/:id/contact',
  validate({ params: schemas.idParams, body: schemas.contactBody }),
  async (req, res) => {
    res.json(await customers.updateCustomerContact(req.valid.params.id, req.valid.body));
  }
);
