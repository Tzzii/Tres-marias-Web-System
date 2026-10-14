import { mailer as defaultMailer } from '../../integrations/mailer/index.js';
import { markOutbox, saveToOutbox } from '../../outbox/outbox.repo.js';
import { CUSTOMER_EMAILS } from './customer.emails.js';


let mailer = defaultMailer;

export function useMailerForTests(stub = defaultMailer) {
  mailer = stub;
}

const firstWord = (name) =>
  String(name || '')
    .trim()
    .split(/\s+/)[0] || '';

export async function queueCustomerEmail(conn, { customerId, ref, purpose, data = {} }) {
  if (!conn || typeof conn.afterCommit !== 'function') {
    throw new Error(
      `[notify] ${purpose} ${ref}: queueCustomerEmail must run inside tx(), so the email is sent only after the change is saved.`
    );
  }
  try {
    const build = CUSTOMER_EMAILS[purpose];
    if (!build) throw new Error(`unknown email purpose "${purpose}"`);
    const [[customer]] = await conn.query('SELECT email, first_name, name FROM customers WHERE id = ?', [customerId]);
    const to = customer ? String(customer.email || '').trim() : '';
    if (!to) {
      console.warn(`[notify] ${purpose} ${ref}: the customer has no email address, so no email was sent.`);
      return null;
    }
    const email = build({ ...data, firstName: (customer.first_name || '').trim() || firstWord(customer.name) });
    const { id } = await saveToOutbox(
      {
        channel: 'email',
        to,
        subject: email.subject,
        body: email.text,
        status: 'queued',
        provider: mailer.name,
        meta: { purpose, ref, customerId }
      },
      conn
    );
    conn.afterCommit(() =>
      deliverQueued(id, { to, subject: email.subject, text: email.text, html: email.html }, purpose, ref)
    );
    return id;
  } catch (err) {
    console.error(`[notify] ${purpose} ${ref}: ${err.message}`);
    return null;
  }
}

async function deliverQueued(outboxId, message, purpose, ref) {
  let outcome;
  try {
    const result = await mailer.deliver(message);
    outcome = { status: result.status, providerId: result.providerId || null };
  } catch (err) {
    console.error(`[notify] ${purpose} ${ref}: ${err.message}`);
    outcome = { status: 'failed', error: err.message };
  }
  await markOutbox(outboxId, outcome).catch((err) => console.error(`[notify] ${purpose} ${ref}: ${err.message}`));
}

export async function emailedRecently(conn, { purpose, ref, withinMs }) {
  const [[row]] = await conn.query(
    `SELECT COUNT(*) AS n FROM outbox
      WHERE channel = 'email' AND status <> 'failed' AND created_at >= ?
        AND JSON_UNQUOTE(JSON_EXTRACT(meta, '$.purpose')) = ? AND JSON_UNQUOTE(JSON_EXTRACT(meta, '$.ref')) = ?`,
    [Date.now() - withinMs, purpose, ref]
  );
  return Number(row.n) > 0;
}
