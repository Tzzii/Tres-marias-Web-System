import { saveToOutbox } from '../../outbox/outbox.repo.js';
import { now } from '../../lib/time.js';

/**
 * Mail driver for development and until a provider is set up (MAIL_DRIVER=log).
 * Nothing leaves the server: the message is printed on the server console (and send() also saves it to
 * the outbox table with status "logged"), so every flow that sends mail (OTP codes included) works end
 * to end, and the logged rows can be sent for real once a provider is switched on.
 */

/** Print the message on the server console. Returns { status: 'logged' }: it was only printed, not sent. */
async function deliver({ to, subject, text, html }) {
  console.log(`\n[EMAIL -> ${to}] ${subject}\n${text || html || ''}\n`);
  return { status: 'logged', providerId: null };
}

export default {
  name: 'log',
  deliver,

  /** Save the message to the outbox, print it, and return the outbox row id. */
  async send({ to, subject, text, html, meta = {} }) {
    const body = text || html || '';
    const row = await saveToOutbox({ channel: 'email', to, subject, body, status: 'logged', provider: 'log', meta });
    await deliver({ to, subject, text, html });
    return { id: row.id, provider: 'log', at: now() };
  }
};
