import express from 'express';
import { validate } from '../../middleware/validate.js';
import * as schemas from './reservations.schemas.js';
import * as reservations from './reservations.service.js';

/**
 * The reservation endpoints of Phase 6 (docs/backend-development-phases.md §9.4): URL, guard and
 * request shape only; the rules are in reservations.service.js. Three routers, mounted by app.js:
 *   reservationRoutes       /api/reservations...        behind requireAuth + requireRole('customer'):
 *                                                        the signed-in customer's own bookings
 *   rentalRoutes            /api/rentals...             behind requireAuth only (any role): the rental
 *                                                        form (customer) and the admin's rental edit
 *                                                        dialog both read the stock on a date
 *   reservationAdminRoutes  /api/admin/reservations...  behind the admin router's guard: every booking,
 *                                                        and the admin's actions and edits (Phase 6B)
 * The customer is always req.user (from the token), never an id sent by the page; so is the admin whose
 * name goes into the audit trail and the chat messages.
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
// Cancel online (when the summary's onlineCancel allows it; the service checks again): { reason } -> the summary
reservationRoutes.post('/:ref/cancel', validate({ params: schemas.refParams, body: schemas.reasonBody }), async (req, res) => {
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

// The admin's actions: each answers with the booking's summary
// Price and send the quotation: { addonPrices, otherCharges, otherLabel, discount, deliveryFee, note }
reservationAdminRoutes.post('/:ref/quotation', validate({ params: schemas.refParams, body: schemas.quotationBody }), async (req, res) => {
  res.json(await reservations.sendQuotation(req.valid.params.ref, req.valid.body, req.user));
});
reservationAdminRoutes.post('/:ref/approve', validate({ params: schemas.refParams }), async (req, res) => {
  res.json(await reservations.approveReservation(req.valid.params.ref, req.user));
});
// { reason } shown to the customer
reservationAdminRoutes.post('/:ref/decline', validate({ params: schemas.refParams, body: schemas.reasonBody }), async (req, res) => {
  res.json(await reservations.declineReservation(req.valid.params.ref, req.valid.body.reason, req.user));
});
reservationAdminRoutes.post('/:ref/confirm', validate({ params: schemas.refParams }), async (req, res) => {
  res.json(await reservations.confirmReservation(req.valid.params.ref, req.user));
});
reservationAdminRoutes.post('/:ref/complete', validate({ params: schemas.refParams }), async (req, res) => {
  res.json(await reservations.completeReservation(req.valid.params.ref, req.user));
});
// { reason } shown to the customer
reservationAdminRoutes.post('/:ref/cancel', validate({ params: schemas.refParams, body: schemas.reasonBody }), async (req, res) => {
  res.json(await reservations.cancelReservationByAdmin(req.valid.params.ref, req.valid.body.reason, req.user));
});
// "Started preparing": POST marks it, DELETE takes it back
reservationAdminRoutes.post('/:ref/preparing', validate({ params: schemas.refParams }), async (req, res) => {
  res.json(await reservations.startPreparing(req.valid.params.ref, req.user));
});
reservationAdminRoutes.delete('/:ref/preparing', validate({ params: schemas.refParams }), async (req, res) => {
  res.json(await reservations.undoPreparing(req.valid.params.ref, req.user));
});

// The admin's edits
// Date, time, guests, venue (and pick up or delivery for a rental) -> { changed }
reservationAdminRoutes.patch('/:ref/logistics', validate({ params: schemas.refParams, body: schemas.logisticsBody }), async (req, res) => {
  res.json(await reservations.updateLogistics(req.valid.params.ref, req.valid.body, req.user));
});
// { serviceType, menu, foodNotes } -> { ok: true }
reservationAdminRoutes.put('/:ref/menu', validate({ params: schemas.refParams, body: schemas.menuBody }), async (req, res) => {
  res.json(await reservations.updateMenu(req.valid.params.ref, req.valid.body, req.user));
});
// { notes } (private to the admin) -> { ok: true }
reservationAdminRoutes.put('/:ref/notes', validate({ params: schemas.refParams, body: schemas.notesBody }), async (req, res) => {
  res.json(await reservations.saveNotes(req.valid.params.ref, req.valid.body.notes));
});
// A rental's whole new list { items: [{ itemId, qty }] } -> { changed }
reservationAdminRoutes.put('/:ref/rental-items', validate({ params: schemas.refParams, body: schemas.rentalItemsBody }), async (req, res) => {
  res.json(await reservations.updateRentalItems(req.valid.params.ref, req.valid.body, req.user));
});
