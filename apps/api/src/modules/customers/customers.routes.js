import express from 'express';
import { validate } from '../../middleware/validate.js';
import * as schemas from './customers.schemas.js';
import * as customers from './customers.service.js';

/**
 * The customer directory endpoints of Phase 9 (docs/backend-development-phases.md §9.7): URL, guard
 * and request shape only; the rules are in customers.service.js. One router, mounted by app.js at
 * /api/admin/customers, behind the admin router's guard: no token -> 401, a customer's token -> 403.
 * Customers never read this directory; their own details are under /api/me (Phase 3).
 */

export const customerAdminRoutes = express.Router();

// Every customer with their summary (booking counts, balance, total spend), by name
customerAdminRoutes.get('/', async (req, res) => {
  res.json(await customers.listCustomers());
});
// One customer's summary and their bookings, newest event date first
customerAdminRoutes.get('/:id', validate({ params: schemas.idParams }), async (req, res) => {
  res.json(await customers.getCustomer(req.valid.params.id));
});
// Correct the email and mobile number: { email, mobile } -> the customer's summary
customerAdminRoutes.patch('/:id/contact', validate({ params: schemas.idParams, body: schemas.contactBody }), async (req, res) => {
  res.json(await customers.updateCustomerContact(req.valid.params.id, req.valid.body));
});
