import { config } from '../../config.js';
import { verifySignature } from '../../integrations/paymongo/index.js';
import { handlePaymongoEvent } from './payments.service.js';

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
