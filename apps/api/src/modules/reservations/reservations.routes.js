import express from 'express';
import { validate } from '../../middleware/validate.js';
import * as schemas from './reservations.schemas.js';
import * as reservations from './reservations.service.js';

/**
 * The reservation endpoints of Phase 6A (docs/backend-development-phases.md §9.4): URL, guard and
 * request shape only; the rules are in reservations.service.js. Three routers, mounted by app.js:
 *   reservationRoutes       /api/reservations...        behind requireAuth + requireRole('customer'):
 *                                                        the signed-in customer's own bookings
 *   rentalRoutes            /api/rentals...             behind requireAuth only (any role): the rental
 *                                                        form (customer) and the admin's rental edit
 *                                                        dialog both read the stock on a date
 *   reservationAdminRoutes  /api/admin/reservations...  behind the admin router's guard
 * The customer is always req.user (from the token), never an id sent by the page.
 */

/* ============================ /api/reservations (customer) ============================ */

export const reservationRoutes = express.Router();

// The customer's bookings, newest first (no admin notes)
reservationRoutes.get('/', async (req, res) => {
  res.json(await reservations.listReservations({ customerId: req.user.id }));
});
// The booking form: an event or an equipment rental -> 201 with the new booking's summary
reservationRoutes.post('/', validate({ body: schemas.createBody }), async (req, res) => {
  res.status(201).json(await reservations.createReservation(req.user, req.valid.body));
});
// One of the customer's own bookings in full; another customer's is 404
reservationRoutes.get('/:ref', validate({ params: schemas.refParams }), async (req, res) => {
  res.json(await reservations.getReservation(req.valid.params.ref, { customerId: req.user.id }));
});
// Cancel (while Pending or Approved): { reason } -> the summary
reservationRoutes.post('/:ref/cancel', validate({ params: schemas.refParams, body: schemas.cancelBody }), async (req, res) => {
  res.json(await reservations.cancelReservation(req.valid.params.ref, req.user, req.valid.body.reason));
});
// Ask for a change in the chat: { message } -> { threadId }
reservationRoutes.post('/:ref/change-request', validate({ params: schemas.refParams, body: schemas.changeBody }), async (req, res) => {
  res.json(await reservations.requestChange(req.valid.params.ref, req.user, req.valid.body.message));
});

/* ============================ /api/rentals (any signed-in user) ============================ */

export const rentalRoutes = express.Router();

// ?date=YYYY-MM-DD -> { itemId: { left, status } }. excludeRef (the booking being edited) counts for an admin only.
rentalRoutes.get('/availability', validate({ query: schemas.availabilityQuery }), async (req, res) => {
  const { date, excludeRef } = req.valid.query;
  res.json(await reservations.getRentalAvailability(date, { excludeRef: req.user.role === 'admin' ? excludeRef : undefined }));
});

/* ============================ /api/admin/reservations ============================ */

export const reservationAdminRoutes = express.Router();

// Every booking, newest first
reservationAdminRoutes.get('/', async (req, res) => {
  res.json(await reservations.listReservations());
});
// One booking in full
reservationAdminRoutes.get('/:ref', validate({ params: schemas.refParams }), async (req, res) => {
  res.json(await reservations.getReservation(req.valid.params.ref));
});
