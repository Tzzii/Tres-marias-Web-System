import { z } from 'zod';

/**
 * Request shapes for the payment routes (zod), checked by middleware/validate.js before a service runs.
 *
 * Like reservations.schemas.js, these check only what the service cannot: that a text field is text and
 * fits its column, so an over-long value is a clear 400 under its input instead of a database error.
 * Everything the forms check (amounts, the reference format, methods, dates) passes through to
 * payments.service.js, which answers with the browser version's own messages. Keys not listed are
 * dropped, so a customerId, status or receipt number added to a request never reaches a service.
 */

// Text of at most `max` characters; missing -> '' so the service answers with the form's own message
const text = (max) =>
  z.string({ error: 'This field is required.' }).max(max, { error: `Use ${max} characters or fewer.` }).default('');

// Checked by the service (.optional(): a missing key reaches it as undefined, not as zod's own 400)
const passThrough = z.unknown().optional();

// A payment id or reservation ref from the URL (Express always gives text); an unknown one is a 404 from the service
export const idParams = z.object({ id: z.string() });
export const refParams = z.object({ ref: z.string() });

/**
 * POST /api/payments (multipart): the customer's bank transfer. Every field arrives as text; the file is
 * multer's req.file. The reference is at most 30 characters once trimmed (the service says so in the
 * form's words); 100 here is only the column's own limit. proofName is the file's name, cut by the service.
 */
export const submitBody = z.object({
  ref: text(40),
  method: text(20),
  amount: passThrough,
  referenceNo: text(100),
  proofName: text(1000)
});

// POST /api/payments/qr: a GCash / e-wallet QR for { ref, amount } (whole pesos, checked by the service)
export const qrBody = z.object({ ref: text(40), amount: passThrough });

// GET /api/payments/qr/:id?image=1: the QR's image too (for a page coming back to an open QR)
export const qrQuery = z.object({ image: z.enum(['0', '1']).optional() });

// POST /api/admin/payments/:id/reject: the reason the customer sees (at least 5 characters, checked by the service)
export const rejectBody = z.object({ reason: text(1000) });

// POST /api/admin/reservations/:ref/cash-payments: { amount } in whole pesos (checked by the service)
export const cashBody = z.object({ amount: passThrough });

/**
 * POST /api/admin/reservations/:ref/refunds: { amount, method, referenceNo, sentOn, reason }. amount must
 * be a number (the service refuses text, as the browser version does); reason is TEXT, kept to 1,000.
 */
export const refundBody = z.object({
  amount: passThrough,
  method: text(20),
  referenceNo: text(100),
  sentOn: text(10),
  reason: text(1000)
});
