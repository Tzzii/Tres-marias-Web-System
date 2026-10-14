import { saveToOutbox } from '../../outbox/outbox.repo.js';
import { now } from '../../lib/time.js';


async function deliver({ to, subject, text, html }) {
  console.log(`\n[EMAIL -> ${to}] ${subject}\n${text || html || ''}\n`);
  return { status: 'logged', providerId: null };
}

export default {
  name: 'log',
  deliver,

  async send({ to, subject, text, html, meta = {} }) {
    const body = text || html || '';
    const row = await saveToOutbox({ channel: 'email', to, subject, body, status: 'logged', provider: 'log', meta });
    await deliver({ to, subject, text, html });
    return { id: row.id, provider: 'log', at: now() };
  }
};
