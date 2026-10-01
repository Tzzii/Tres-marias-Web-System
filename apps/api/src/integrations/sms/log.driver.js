import { saveToOutbox } from '../../outbox/outbox.repo.js';
import { now } from '../../lib/time.js';

/**
 * SMS driver until a provider is set up (SMS_DRIVER=log): same idea as the mail log driver.
 * Nothing leaves the server: the text is printed on the server console (and send() also saves it to the
 * outbox table with status "logged"), so nothing is lost and the logged rows can be sent once a
 * provider exists.
 */

/** Print the text on the server console. Returns { status: 'logged' }: it was only printed, not sent. */
async function deliver({ to, body }) {
  console.log(`\n[SMS -> ${to}] ${body}\n`);
  return { status: 'logged', providerId: null };
}

export default {
  name: 'log',
  deliver,

  /** Save the text to the outbox, print it, and return the outbox row id. */
  async send({ to, body, meta = {} }) {
    const row = await saveToOutbox({ channel: 'sms', to, body, status: 'logged', provider: 'log', meta });
    await deliver({ to, body });
    return { id: row.id, provider: 'log', at: now() };
  }
};
