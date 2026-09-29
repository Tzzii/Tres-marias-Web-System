import express from 'express';
import { validate } from '../../middleware/validate.js';
import * as schemas from './messages.schemas.js';
import * as messages from './messages.service.js';

/**
 * The chat endpoints of Phase 7 (docs/backend-development-phases.md §9.5): URL, guard and request
 * shape only; the rules are in messages.service.js. Two routers, mounted by app.js:
 *   threadRoutes       /api/threads...        behind requireAuth + requireRole('customer'): the
 *                                             signed-in customer's own conversation
 *   threadAdminRoutes  /api/admin/threads...  behind the admin router's guard: every conversation
 * The side, the customer and the sender's name always come from req.user, never from the request.
 */

/* ============================ /api/threads (customer) ============================ */

export const threadRoutes = express.Router();

// The customer's conversation (none or one), with its last message and unread count
threadRoutes.get('/', async (req, res) => {
  res.json(await messages.listThreads({ customerId: req.user.id, side: 'customer' }));
});
// Start the customer's conversation (the portal asks only when the list is empty) -> { id }
threadRoutes.post('/', async (req, res) => {
  res.json(await messages.openThread({ customerId: req.user.id }));
});
// The conversation with every message; another customer's is 404
threadRoutes.get('/:id', validate({ params: schemas.threadParams }), async (req, res) => {
  res.json(await messages.getThread(req.valid.params.id, { customerId: req.user.id, side: 'customer' }));
});
// Mark the admin's messages as read -> { ok }
threadRoutes.post('/:id/read', validate({ params: schemas.threadParams }), async (req, res) => {
  res.json(await messages.markThreadRead(req.valid.params.id, 'customer', { customerId: req.user.id }));
});
// { body, ref } -> 201 with the new message (ref: one of the customer's own reservations, or null)
threadRoutes.post('/:id/messages', validate({ params: schemas.threadParams, body: schemas.sendBody }), async (req, res) => {
  const { body, ref } = req.valid.body;
  res.status(201).json(await messages.sendMessage(req.valid.params.id, { side: 'customer', senderName: req.user.name, body, customerId: req.user.id, ref }));
});

/* ============================ /api/admin/threads ============================ */

export const threadAdminRoutes = express.Router();

// Every conversation, most recently active first; ?customerId= for one customer's
threadAdminRoutes.get('/', validate({ query: schemas.listQuery }), async (req, res) => {
  const { customerId } = req.valid.query;
  res.json(await messages.listThreads({ customerId: typeof customerId === 'string' ? customerId : undefined, side: 'admin' }));
});
// Start a customer's conversation: { customerId } -> { id }
threadAdminRoutes.post('/', validate({ body: schemas.openBody }), async (req, res) => {
  res.json(await messages.openThread({ customerId: req.valid.body.customerId }));
});
threadAdminRoutes.get('/:id', validate({ params: schemas.threadParams }), async (req, res) => {
  res.json(await messages.getThread(req.valid.params.id, { side: 'admin' }));
});
// Mark the customer's messages as read -> { ok }
threadAdminRoutes.post('/:id/read', validate({ params: schemas.threadParams }), async (req, res) => {
  res.json(await messages.markThreadRead(req.valid.params.id, 'admin'));
});
// { body, ref } -> 201 with the new message, sent as the signed-in admin
threadAdminRoutes.post('/:id/messages', validate({ params: schemas.threadParams, body: schemas.sendBody }), async (req, res) => {
  const { body, ref } = req.valid.body;
  res.status(201).json(await messages.sendMessage(req.valid.params.id, { side: 'admin', senderName: req.user.name, body, ref }));
});
