import crypto from 'node:crypto';

/**
 * TEST ONLY. Loaded into the security tests' own API process with `node --import` (never into the real
 * API): it answers the API's calls to PayMongo (integrations/paymongo/index.js uses fetch) without the
 * network, so test #19 can send a signed webhook for a GCash QR twice and see it recorded once.
 *   POST /payment_intents            a new intent for the amount asked
 *   POST /payment_methods            a qrph method
 *   POST /payment_intents/:id/attach the QR (a 1x1 image) and when it expires
 *   GET  /payment_intents/:id        "succeeded", paid in full: what PayMongo says once a QR is paid
 * Any other address goes to the real fetch. The API's own rules (signature, amount, dedupe) are untouched.
 */

const realFetch = globalThis.fetch;
const BASE = 'https://api.paymongo.com/v1';
const intents = new Map(); // intent id -> { amount in centavos, payment id }
const random = () => crypto.randomBytes(10).toString('hex');
const answer = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  if (!url.startsWith(`${BASE}/`)) return realFetch(input, init);
  const route = url.slice(BASE.length);
  const method = (init.method || 'GET').toUpperCase();
  const body = init.body ? JSON.parse(init.body) : null;

  if (method === 'POST' && route === '/payment_intents') {
    const id = `pi_fake_${random()}`;
    intents.set(id, { amount: body.data.attributes.amount, paymentId: `pay_fake_${random()}` });
    return answer(200, { data: { id, attributes: { client_key: `${id}_client_${random()}`, amount: body.data.attributes.amount, status: 'awaiting_payment_method' } } });
  }
  if (method === 'POST' && route === '/payment_methods') {
    return answer(200, { data: { id: `pm_fake_${random()}`, attributes: { type: 'qrph' } } });
  }
  const attach = /^\/payment_intents\/([^/]+)\/attach$/.exec(route);
  if (method === 'POST' && attach) {
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    return answer(200, { data: { id: attach[1], attributes: { livemode: false, status: 'awaiting_next_action', next_action: { code: { image_url: PIXEL, expires_at: expiresAt, test_url: '' } } } } });
  }
  const read = /^\/payment_intents\/([^/?]+)$/.exec(route);
  if (method === 'GET' && read) {
    const id = decodeURIComponent(read[1]);
    const intent = intents.get(id);
    if (!intent) return answer(404, { errors: [{ code: 'resource_not_found', detail: 'No such intent in the test fake.' }] });
    const paidAt = Math.floor(Date.now() / 1000);
    return answer(200, {
      data: { id, attributes: { status: 'succeeded', amount: intent.amount, last_payment_error: null, payments: [{ id: intent.paymentId, attributes: { status: 'paid', paid_at: paidAt } }] } }
    });
  }
  return answer(404, { errors: [{ code: 'not_in_test_fake', detail: `${method} ${route}` }] });
};
