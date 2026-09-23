import { saveToOutbox } from '../../outbox/outbox.repo.js';
import { now } from '../../lib/time.js';

/**
 * SMS driver until a provider is set up (SMS_DRIVER=log): same idea as the mail log driver.
 * The text is saved to the outbox table with status "logged" and printed on the server console,
 * so nothing is lost and the logged rows can be sent once a provider exists.
 */
export default {
  name: 'log',

  /** Save the text to the outbox, print it, and return the outbox row id. */
  async send({ to, body, meta = {} }) {
    const row = await saveToOutbox({ channel: 'sms', to, body, status: 'logged', provider: 'log', meta });
    console.log(`\n[SMS -> ${to}] ${body}\n`);
    return { id: row.id, provider: 'log', at: now() };
  }
};
