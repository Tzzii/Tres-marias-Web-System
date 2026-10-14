import crypto from 'node:crypto';
import { config } from '../../config.js';
import { ApiError } from '../../lib/ApiError.js';


const BASE = 'https://api.paymongo.com/v1';
const TIMEOUT_MS = 10000;

export const qrReady = () => Boolean(config.paymongo.secretKey && config.paymongo.webhookSecret);

async function call(path, attributes) {
  let res = null;
  try {
    res = await fetch(BASE + path, {
      method: attributes ? 'POST' : 'GET',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${config.paymongo.secretKey}:`).toString('base64'),
        'Content-Type': 'application/json'
      },
      body: attributes ? JSON.stringify({ data: { attributes } }) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (err) {
    console.error('[paymongo]', path, 'no answer:', err.name);
  }
  const json = res ? await res.json().catch(() => ({})) : {};
  if (!res || !res.ok) {
    if (res)
      console.error('[paymongo]', path, res.status, JSON.stringify((json.errors || []).map((e) => e.code || e.detail)));
    throw new ApiError('PAYMENT_PROVIDER', 'We could not reach the payment provider. Please try again.');
  }
  return json.data;
}

export async function createQrPh({ amount, description, metadata }) {
  const intent = await call('/payment_intents', {
    amount: amount * 100,
    currency: 'PHP',
    payment_method_allowed: ['qrph'],
    description,
    metadata
  });
  const method = await call('/payment_methods', { type: 'qrph', expiry_seconds: config.paymongo.qrExpirySeconds });
  const attached = await call(`/payment_intents/${intent.id}/attach`, {
    payment_method: method.id,
    client_key: intent.attributes.client_key
  });
  const code = attached.attributes.next_action && attached.attributes.next_action.code;
  if (!code || !code.image_url) {
    console.error('[paymongo] attach gave no QR code for', intent.id);
    throw new ApiError('PAYMENT_PROVIDER', 'We could not reach the payment provider. Please try again.');
  }
  const expiresAt = Date.parse(code.expires_at);
  return {
    intentId: intent.id,
    codeId: typeof code.id === 'string' ? code.id : '',
    qrImage: code.image_url,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + config.paymongo.qrExpirySeconds * 1000,
    testUrl: attached.attributes.livemode ? '' : code.test_url || ''
  };
}

export async function getIntent(id) {
  const intent = await call(`/payment_intents/${encodeURIComponent(id)}`);
  const payments = intent.attributes.payments || [];
  const paid = payments.find((p) => p.attributes && p.attributes.status === 'paid');
  const error = intent.attributes.last_payment_error;
  return {
    id: intent.id,
    status: intent.attributes.status,
    amount: intent.attributes.amount,
    paid: paid ? { id: paid.id, paidAt: paid.attributes.paid_at ? paid.attributes.paid_at * 1000 : Date.now() } : null,
    lastError: error ? String(error.failed_message || error.failed_code || error.message || 'Payment failed.') : ''
  };
}

export function verifySignature(header, rawBody, livemode) {
  const parts = Object.fromEntries(
    String(header || '')
      .split(',')
      .map((part) => part.trim().split('='))
      .filter((pair) => pair.length === 2)
  );
  const given = livemode ? parts.li : parts.te;
  if (!parts.t || !given || !config.paymongo.webhookSecret) return false;
  const expected = crypto
    .createHmac('sha256', config.paymongo.webhookSecret)
    .update(`${parts.t}.${rawBody}`)
    .digest('hex');
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
