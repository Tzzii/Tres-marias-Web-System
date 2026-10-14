import express from 'express';
import { validate } from '../../middleware/validate.js';
import * as schemas from './customers.schemas.js';
import * as customers from './customers.service.js';


export const customerAdminRoutes = express.Router();

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
