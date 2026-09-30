import crypto from 'node:crypto';
import { config } from '../../config.js';
import { ApiError } from '../../lib/ApiError.js';

/**
 * The only file that talks to PayMongo (Phase 8B, docs/backend-development-phases.md §12.10). The secret
 * key never leaves the server: the portals only ever see the QR image and our own payment ids.
 *
 * GCash / e-wallet payments are QR Ph codes (owner's decision, 2026-09-30): a Payment Intent for the exact
 * amount, a "qrph" Payment Method, and the two attached, which gives the QR (a base64 PNG) and when it
 * stops working. PayMongo then reports the payment to our webhook (payment.paid), and getIntent() lets
 * the server ask for itself whenever a webhook is late or missing.
 *
 * In test mode (sk_test_ key) PayMongo also gives a test_url that simulates paying or failing; it is
 * printed to the API console like the log mail driver's codes, never shown on a page. Do not scan and
 * pay a test QR: PayMongo warns it can process a real transaction.
 */

const BASE = 'https://api.paymongo.com/v1';
// How long one call to PayMongo may take before it counts as failed (the webhook must answer within 30 s)
const TIMEOUT_MS = 10000;

/** True when GCash QR payments can be offered: the secret key and the webhook's signing secret are both set. */
export const qrReady = () => Boolean(config.paymongo.secretKey && config.paymongo.webhookSecret);

/**
 * POST (with attributes) or GET to PayMongo with the secret key. Any failure (no answer in 10 s, a network
 * error, a refusal) is logged with PayMongo's error codes and becomes PAYMENT_PROVIDER (502) for the page.
 */
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
    if (res) console.error('[paymongo]', path, res.status, JSON.stringify((json.errors || []).map((e) => e.code || e.detail)));
    throw new ApiError('PAYMENT_PROVIDER', 'We could not reach the payment provider. Please try again.');
  }
  return json.data;
}

/**
 * Open a single-use QR Ph code for an exact amount in whole pesos: Payment Intent (qrph only) -> qrph
 * Payment Method (expiring after PAYMONGO_QR_EXPIRY_SECONDS) -> attach. Returns { intentId, qrImage (a
 * data:image/png;base64 URL), expiresAt (milliseconds, PayMongo's own time), testUrl ('' in live mode) }.
 */
export async function createQrPh({ amount, description, metadata }) {
  const intent = await call('/payment_intents', {
    amount: amount * 100, // PayMongo counts centavos
    currency: 'PHP',
    payment_method_allowed: ['qrph'],
    description,
    metadata
  });
  const method = await call('/payment_methods', { type: 'qrph', expiry_seconds: config.paymongo.qrExpirySeconds });
  const attached = await call(`/payment_intents/${intent.id}/attach`, { payment_method: method.id, client_key: intent.attributes.client_key });
  const code = attached.attributes.next_action && attached.attributes.next_action.code;
  if (!code || !code.image_url) {
    console.error('[paymongo] attach gave no QR code for', intent.id);
    throw new ApiError('PAYMENT_PROVIDER', 'We could not reach the payment provider. Please try again.');
  }
  const expiresAt = Date.parse(code.expires_at);
  return {
    intentId: intent.id,
    qrImage: code.image_url,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + config.paymongo.qrExpirySeconds * 1000,
    testUrl: attached.attributes.livemode ? '' : code.test_url || ''
  };
}

/**
 * A Payment Intent read straight from PayMongo, so neither a webhook nor a missing one is ever trusted on
 * its own: { id, status ('awaiting_next_action', 'processing', 'succeeded', …), amount (centavos),
 * paid: the successful payment { id: 'pay_…', paidAt (milliseconds) } or null, lastError (text or '') }.
 */
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

/**
 * True when the Paymongo-Signature header ("t=…,te=…,li=…") matches an HMAC-SHA256 of "t.rawBody" made
 * with the webhook's signing secret: te is the test-mode signature, li the live-mode one. Compared in
 * constant time. False for a missing or malformed header.
 */
export function verifySignature(header, rawBody, livemode) {
  const parts = Object.fromEntries(
    String(header || '')
      .split(',')
      .map((part) => part.trim().split('='))
      .filter((pair) => pair.length === 2)
  );
  const given = livemode ? parts.li : parts.te;
  if (!parts.t || !given || !config.paymongo.webhookSecret) return false;
  const expected = crypto.createHmac('sha256', config.paymongo.webhookSecret).update(`${parts.t}.${rawBody}`).digest('hex');
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
