import express from 'express';
import { ApiError } from '../../lib/ApiError.js';
import { storage } from '../../integrations/storage/index.js';
import { validate } from '../../middleware/validate.js';
import { photoUpload } from '../../middleware/photoUpload.js';
import * as schemas from './payments.schemas.js';
import * as payments from './payments.service.js';

const upload = photoUpload('proof');

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

export const paymentRoutes = express.Router();

paymentRoutes.get('/bank-details', async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await payments.getBankDetails());
});

paymentRoutes.get('/', async (req, res) => {
  res.json(await payments.listPayments({ customerId: req.user.id }));
});
paymentRoutes.get('/options', async (req, res) => {
  res.json(await payments.paymentOptions());
});
paymentRoutes.get('/qr', async (req, res) => {
  res.json(await payments.listQrPayments({ customerId: req.user.id }));
});
paymentRoutes.post('/qr', validate({ body: schemas.qrBody }), async (req, res) => {
  res.status(201).json(await payments.startQrPayment(req.user, req.valid.body));
});
paymentRoutes.get('/qr/:id', validate({ params: schemas.idParams, query: schemas.qrQuery }), async (req, res) => {
  res.json(await payments.getQrPayment(req.user, req.valid.params.id, { image: req.valid.query.image === '1' }));
});
paymentRoutes.post('/', upload, validate({ body: schemas.submitBody }), async (req, res) => {
  res.status(201).json(await payments.submitPayment(req.user, req.valid.body, req.file));
});
paymentRoutes.get('/:id/proof', validate({ params: schemas.idParams }), async (req, res) => {
  await sendProof(res, await payments.getProof(req.valid.params.id, { customerId: req.user.id }));
});

export const refundRoutes = express.Router();

refundRoutes.get('/', async (req, res) => {
  res.json(await payments.listRefunds({ customerId: req.user.id }));
});

export const paymentAdminRoutes = express.Router();

paymentAdminRoutes.get('/bank-details', async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await payments.getBankDetails());
});
paymentAdminRoutes.put('/bank-details', validate({ body: schemas.bankDetailsBody }), async (req, res) => {
  res.json(await payments.saveBankDetails(req.valid.body));
});

paymentAdminRoutes.get('/', async (req, res) => {
  res.json(await payments.listPayments());
});
paymentAdminRoutes.get('/qr', validate({ query: schemas.qrListQuery }), async (req, res) => {
  res.json(await payments.listQrPayments({ ref: req.valid.query.ref }));
});
paymentAdminRoutes.get('/:id/proof', validate({ params: schemas.idParams }), async (req, res) => {
  await sendProof(res, await payments.getProof(req.valid.params.id));
});
paymentAdminRoutes.post('/:id/verify', validate({ params: schemas.idParams }), async (req, res) => {
  res.json(await payments.verifyPayment(req.valid.params.id, req.user));
});
paymentAdminRoutes.post(
  '/:id/reject',
  validate({ params: schemas.idParams, body: schemas.rejectBody }),
  async (req, res) => {
    res.json(await payments.rejectPayment(req.valid.params.id, req.valid.body.reason, req.user));
  }
);

export const paymentReservationRoutes = express.Router();

paymentReservationRoutes.post(
  '/:ref/cash-payments',
  validate({ params: schemas.refParams, body: schemas.cashBody }),
  async (req, res) => {
    res.status(201).json(await payments.recordCashPayment(req.valid.params.ref, req.valid.body.amount, req.user));
  }
);
paymentReservationRoutes.post('/:ref/payment-reminder', validate({ params: schemas.refParams }), async (req, res) => {
  res.json(await payments.sendPaymentReminder(req.valid.params.ref, req.user));
});
paymentReservationRoutes.post(
  '/:ref/refunds',
  validate({ params: schemas.refParams, body: schemas.refundBody }),
  async (req, res) => {
    res.status(201).json(await payments.recordRefund(req.valid.params.ref, req.valid.body, req.user));
  }
);

export const balanceAdminRoutes = express.Router();

balanceAdminRoutes.get('/', async (req, res) => {
  res.json(await payments.listBalances());
});

export const refundAdminRoutes = express.Router();

refundAdminRoutes.get('/', async (req, res) => {
  res.json(await payments.listRefunds());
});
refundAdminRoutes.get('/due', async (req, res) => {
  res.json(await payments.listRefundsDue());
});
