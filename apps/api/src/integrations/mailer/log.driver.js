import { saveToOutbox } from '../../outbox/outbox.repo.js';
import { now } from '../../lib/time.js';

/**
 * Mail driver for development and until a provider is set up (MAIL_DRIVER=log).
 * The message is saved to the outbox table with status "logged" and printed on the server console,
 * so every flow that sends mail (OTP codes included) works end to end, and the logged rows can be
 * sent for real once a provider is switched on.
 */
export default {
  name: 'log',

  /** Save the message to the outbox, print it, and return the outbox row id. */
  async send({ to, subject, text, html, meta = {} }) {
    const body = text || html || '';
    const row = await saveToOutbox({ channel: 'email', to, subject, body, status: 'logged', provider: 'log', meta });
    console.log(`\n[EMAIL -> ${to}] ${subject}\n${body}\n`);
    return { id: row.id, provider: 'log', at: now() };
  }
};
