import { config } from '../../config.js';
import { verifySignature } from '../../integrations/paymongo/index.js';
import { handlePaymongoEvent } from './payments.service.js';

/**
 * POST /api/webhooks/paymongo — PayMongo -> us (Phase 8B, docs §12.10). No token: the Paymongo-Signature
 * header is the guard. app.js mounts it with express.raw() before express.json() and the rate limit, so
 * the signature is checked on the exact bytes PayMongo signed.
 *
 * - A body that is not JSON: 400. A missing or wrong signature: 401, nothing changes.
 * - An event whose livemode does not match the key (a test event reaching a live server, or the other way
 *   round) is never acted on: 200, logged by id.
 * - Otherwise the event is handled first and answered after: 200 once saved (or already saved: the event
 *   is noted in the same transaction, so a retry or a resend is skipped), 500 when handling failed, so
 *   PayMongo tries again (30 seconds a try, up to 12 retries; it disables the webhook after 3 events in a
 *   row fail every retry, so every 500 is logged). Only the event's id and type are logged: the body
 *   carries the payer's name and email.
 */
export async function paymongoWebhook(req, res) {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  let event;
  try {
    event = JSON.parse(raw).data;
  } catch {
    return res.status(400).json({ code: 'INVALID', message: 'Bad payload.', meta: {} });
  }
  if (!event || !event.attributes || !verifySignature(req.get('Paymongo-Signature'), raw, event.attributes.livemode)) {
    return res.status(401).json({ code: 'UNAUTHENTICATED', message: 'Bad signature.', meta: {} });
  }
  if (Boolean(event.attributes.livemode) !== config.paymongo.live) {
    console.warn('[paymongo webhook] ignored, livemode does not match the key:', event.id);
    return res.status(200).json({ ok: true });
  }
  try {
    const outcome = await handlePaymongoEvent(event);
    console.log(`[paymongo webhook] ${event.id} ${event.attributes.type}: ${outcome}`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(`[paymongo webhook] ${event.id} ${event.attributes.type} failed, PayMongo will retry:`, err.message);
    return res.status(500).json({ code: 'SERVER_ERROR', message: 'Try again.', meta: {} });
  }
}
