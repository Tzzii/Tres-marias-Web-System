import { mailer as defaultMailer } from '../../integrations/mailer/index.js';
import { markOutbox, saveToOutbox } from '../../outbox/outbox.repo.js';
import { CUSTOMER_EMAILS } from './customer.emails.js';

/**
 * Customer email notices (Phase 13A, 2026-10-10): an email to the customer for the reservation and payment
 * events listed in customer.emails.js, IN ADDITION to the chat message those actions already post (the chat
 * texts, the bell and every status rule are unchanged). The pattern is the outsourcing request's (Phase 10):
 * the outbox row is saved as 'queued' inside the transaction of the change, and the email is handed to the
 * mail driver only after that transaction committed (tx()'s afterCommit), then the row says how it went.
 *
 * On purpose:
 * - Queued in the same transaction as the change, so a refused, rolled-back or no-op action sends nothing.
 * - The recipient is only customers.email of the booking's customer, read here from the database: never
 *   from the request. One recipient, no CC or BCC. No address -> nothing is sent (logged).
 * - Never breaks the action: building or queuing the email is caught here, and the delivery runs after
 *   the answer, so a mail problem never changes the API response or rolls anything back. Errors are logged
 *   as "[notify] {purpose} {ref}: {message}" only (no body, no credentials) and the row is marked 'failed'.
 * - The outbox row keeps the text version as its body and { purpose, ref, customerId } as meta: never a
 *   code, a token or a secret. Nothing in the API exposes the outbox (it holds personal data).
 * - With MAIL_DRIVER=log (development) the email is only printed on the API console and the row says
 *   'logged': the local sample customers' addresses never get real mail.
 */

// The mail port in use; email-test.js swaps in a stub with useMailerForTests()
let mailer = defaultMailer;

/** For scripts/email-test.js only: send through `stub` ({ name, deliver }) instead of the real driver; no argument puts the real one back. */
export function useMailerForTests(stub = defaultMailer) {
  mailer = stub;
}

// "Wilma W. Cabiscuelas" -> "Wilma", when an account has no first name saved
const firstWord = (name) => String(name || '').trim().split(/\s+/)[0] || '';

/**
 * Queue one email to the booking's customer, inside the transaction `conn` (a tx() connection) of the change
 * it is about. `purpose` is a key of CUSTOMER_EMAILS (e.g. 'quotation_ready'), `ref` the reservation and
 * `data` what that builder takes (see customer.emails.js). The customer's email address and first name are
 * read here, in the same transaction. The row is saved as 'queued'; after the commit the email is delivered
 * and the row marked 'sent', 'logged' or 'failed'.
 * Returns the outbox row's id, or null when nothing was queued (no email address, or the email could not be
 * built or saved; logged). Throws only when called outside tx(), a programming mistake caught in development.
 */
export async function queueCustomerEmail(conn, { customerId, ref, purpose, data = {} }) {
  if (!conn || typeof conn.afterCommit !== 'function') {
    throw new Error(`[notify] ${purpose} ${ref}: queueCustomerEmail must run inside tx(), so the email is sent only after the change is saved.`);
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
      { channel: 'email', to, subject: email.subject, body: email.text, status: 'queued', provider: mailer.name, meta: { purpose, ref, customerId } },
      conn
    );
    conn.afterCommit(() => deliverQueued(id, { to, subject: email.subject, text: email.text, html: email.html }, purpose, ref));
    return id;
  } catch (err) {
    console.error(`[notify] ${purpose} ${ref}: ${err.message}`);
    return null;
  }
}

/**
 * Hand a queued email to the mail driver (after the commit) and record the outcome on its outbox row:
 * 'sent' with the provider's message id, 'logged' (the log driver only printed it) or 'failed' with the
 * reason. Never throws: a failure is logged.
 */
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

/**
 * True when an email of `purpose` about booking `ref` was queued or sent in the last `withinMs` milliseconds
 * (failed ones don't count), read in the caller's transaction. Used for the payment reminder's flood control:
 * at most one reminder email per booking every 12 hours (the chat reminder is still posted every time).
 */
export async function emailedRecently(conn, { purpose, ref, withinMs }) {
  const [[row]] = await conn.query(
    `SELECT COUNT(*) AS n FROM outbox
      WHERE channel = 'email' AND status <> 'failed' AND created_at >= ?
        AND JSON_UNQUOTE(JSON_EXTRACT(meta, '$.purpose')) = ? AND JSON_UNQUOTE(JSON_EXTRACT(meta, '$.ref')) = ?`,
    [Date.now() - withinMs, purpose, ref]
  );
  return Number(row.n) > 0;
}
