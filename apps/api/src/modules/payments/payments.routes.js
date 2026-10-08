import express from 'express';
import multer from 'multer';
import { config } from '../../config.js';
import { ApiError } from '../../lib/ApiError.js';
import { storage } from '../../integrations/storage/index.js';
import { validate } from '../../middleware/validate.js';
import * as schemas from './payments.schemas.js';
import * as payments from './payments.service.js';

/**
 * The payment and refund endpoints of Phase 8 (docs/backend-development-phases.md §9.6): URL, guard and
 * request shape only; the rules are in payments.service.js. Routers, mounted by app.js:
 *   paymentRoutes                /api/payments...                 customer: own payments, the bank-transfer
 *                                                                  upload, own proofs, what can be offered,
 *                                                                  the GCash / e-wallet QR (Phase 8B) and
 *                                                                  the record of own QRs
 *   refundRoutes                 /api/refunds                     customer: own refunds
 *   paymentAdminRoutes           /api/admin/payments...           every payment, every QR opened, proofs,
 *                                                                  verify, reject
 *   paymentReservationRoutes     /api/admin/reservations/:ref/... cash, reminder and refund of one booking
 *   balanceAdminRoutes           /api/admin/balances              the Payments ledger
 *   refundAdminRoutes            /api/admin/refunds...            every refund, and the refunds to send
 * The customer is always req.user (from the token), never an id sent by the page; so is the admin whose
 * name goes into the audit trail and the chat messages. PayMongo's webhook is not here: it has no token
 * and needs the raw body, so app.js mounts paymongo.webhook.js on its own.
 */

/**
 * The proof upload: one file named "proof", kept in memory (up to MAX_UPLOAD_MB, 20 MB) so the service can
 * check its first bytes before anything is written to disk. The routers using it sit behind requireAuth,
 * so a request without a valid token is refused before the file is read. Too large, or a file under
 * another name: MulterError, which middleware/errors.js answers with 400 INVALID under "proof".
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.storage.maxUploadMb * 1024 * 1024, files: 1, fields: 10, parts: 12 }
}).single('proof');

/**
 * Stream a proof file back: its stored type, shown in the browser (inline) under the customer's file
 * name, never cached, never sniffed as another type. A file missing from the disk is a 404, not a 500.
 */
async function sendProof(res, { key, mime, name }) {
  const stream = storage.stream(key);
  await new Promise((resolve, reject) => {
    stream.once('open', resolve);
    stream.once('error', reject);
  }).catch(() => {
    throw new ApiError('NOT_FOUND', 'The file for this payment is missing.');
  });
  res.set({
    'Content-Type': mime,
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(name || 'proof')}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store'
  });
  stream.pipe(res);
}

/* ============================ /api/payments and /api/refunds (customer) ============================ */

export const paymentRoutes = express.Router();

// The customer's payments, newest first
paymentRoutes.get('/', async (req, res) => {
  res.json(await payments.listPayments({ customerId: req.user.id }));
});
// What the Payments page can offer: { qr } (the GCash / e-wallet QR, once PayMongo is set up)
paymentRoutes.get('/options', async (req, res) => {
  res.json(await payments.paymentOptions());
});
// The customer's QR Ph codes as a record, newest first: waiting, paid, expired or failed (no images)
paymentRoutes.get('/qr', async (req, res) => {
  res.json(await payments.listQrPayments({ customerId: req.user.id }));
});
// Open a GCash / e-wallet QR: { ref, amount } -> 201 with the QR (the same one again for the same amount while it is open)
paymentRoutes.post('/qr', validate({ body: schemas.qrBody }), async (req, res) => {
  res.status(201).json(await payments.startQrPayment(req.user, req.valid.body));
});
// One of the customer's QRs as it stands (the page asks every few seconds); ?image=1 adds the image
paymentRoutes.get('/qr/:id', validate({ params: schemas.idParams, query: schemas.qrQuery }), async (req, res) => {
  res.json(await payments.getQrPayment(req.user, req.valid.params.id, { image: req.valid.query.image === '1' }));
});
// A bank transfer: multipart { ref, method: 'bank', amount, referenceNo, proofName } + the file "proof" -> 201 with the payment
paymentRoutes.post('/', upload, validate({ body: schemas.submitBody }), async (req, res) => {
  res.status(201).json(await payments.submitPayment(req.user, req.valid.body, req.file));
});
// The customer's own uploaded receipt; another customer's is 404
paymentRoutes.get('/:id/proof', validate({ params: schemas.idParams }), async (req, res) => {
  await sendProof(res, await payments.getProof(req.valid.params.id, { customerId: req.user.id }));
});

export const refundRoutes = express.Router();

// Money returned to the customer, newest first
refundRoutes.get('/', async (req, res) => {
  res.json(await payments.listRefunds({ customerId: req.user.id }));
});

/* ============================ /api/admin/... ============================ */

export const paymentAdminRoutes = express.Router();

// Every payment, newest first
paymentAdminRoutes.get('/', async (req, res) => {
  res.json(await payments.listPayments());
});
// Every QR Ph code customers opened, newest first (?ref= one booking's only): the record of each try
paymentAdminRoutes.get('/qr', validate({ query: schemas.qrListQuery }), async (req, res) => {
  res.json(await payments.listQrPayments({ ref: req.valid.query.ref }));
});
// The receipt a customer uploaded
paymentAdminRoutes.get('/:id/proof', validate({ params: schemas.idParams }), async (req, res) => {
  await sendProof(res, await payments.getProof(req.valid.params.id));
});
// Accept a waiting bank transfer -> the payment with its receipt number
paymentAdminRoutes.post('/:id/verify', validate({ params: schemas.idParams }), async (req, res) => {
  res.json(await payments.verifyPayment(req.valid.params.id, req.user));
});
// Turn it down: { reason } shown to the customer -> the payment
paymentAdminRoutes.post('/:id/reject', validate({ params: schemas.idParams, body: schemas.rejectBody }), async (req, res) => {
  res.json(await payments.rejectPayment(req.valid.params.id, req.valid.body.reason, req.user));
});

// Mounted at /api/admin/reservations next to reservationAdminRoutes: the money actions on one booking
export const paymentReservationRoutes = express.Router();

// Cash collected on site: { amount } -> the verified payment with its receipt number
paymentReservationRoutes.post('/:ref/cash-payments', validate({ params: schemas.refParams, body: schemas.cashBody }), async (req, res) => {
  res.status(201).json(await payments.recordCashPayment(req.valid.params.ref, req.valid.body.amount, req.user));
});
// A reminder in the customer's chat -> { ok: true }
paymentReservationRoutes.post('/:ref/payment-reminder', validate({ params: schemas.refParams }), async (req, res) => {
  res.json(await payments.sendPaymentReminder(req.valid.params.ref, req.user));
});
// Money sent back: { amount, method, referenceNo, sentOn, reason } -> the refund
paymentReservationRoutes.post('/:ref/refunds', validate({ params: schemas.refParams, body: schemas.refundBody }), async (req, res) => {
  res.status(201).json(await payments.recordRefund(req.valid.params.ref, req.valid.body, req.user));
});

export const balanceAdminRoutes = express.Router();

// One row per booking with money attached, by event date
balanceAdminRoutes.get('/', async (req, res) => {
  res.json(await payments.listBalances());
});

export const refundAdminRoutes = express.Router();

// Every refund, newest first
refundAdminRoutes.get('/', async (req, res) => {
  res.json(await payments.listRefunds());
});
// The bookings with money still to return, oldest event first
refundAdminRoutes.get('/due', async (req, res) => {
  res.json(await payments.listRefundsDue());
});
