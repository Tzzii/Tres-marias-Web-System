import { pool } from '../db.js';
import { newId } from '../lib/ids.js';
import { toJson } from '../lib/json.js';

/**
 * The outbox table: the record of everything the system sent or logged, so no message is lost before
 * a provider is connected and logged ones can be sent later.
 *
 * Two ways a row gets here:
 * - The mail and SMS log drivers' send() saves the message it prints, with status 'logged' (the
 *   one-time codes of Phase 3).
 * - A message saved before it is sent (an outsourcing contract, Phase 10): saveToOutbox() with status
 *   'queued' inside the transaction of the change it belongs to, then, after that transaction, the
 *   driver's deliver() hands it over and markOutbox() records how it went: 'sent' (a provider took it,
 *   with its message id), 'logged' (the log driver only printed it: nothing left the server) or
 *   'failed' (with the reason). A row left 'queued' was never handed over (e.g. the API stopped).
 */

/**
 * Save one outgoing email or SMS. `to` is stored as to_address, `meta` (what the message is about) as
 * JSON. sent_at is filled only when the row is saved as 'sent'. Pass a transaction connection as `conn`
 * to save the row in the same transaction as the change that caused it; by default it uses the pool.
 * Returns the new row's id and creation time.
 */
export async function saveToOutbox({ channel, to, subject = null, body, status, provider, meta = {} }, conn = pool) {
  const id = newId('ob');
  const createdAt = Date.now();
  await conn.query(
    `INSERT INTO outbox (id, channel, to_address, subject, body, status, provider, meta, created_at, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, channel, to, subject, body, status, provider, toJson(meta), createdAt, status === 'sent' ? createdAt : null]
  );
  return { id, createdAt };
}

/**
 * Record how a queued message went: `status` 'sent' (with the provider's message id and the time it
 * left), 'logged' or 'failed' (with the reason, cut to 1,000 characters).
 */
export async function markOutbox(id, { status, providerId = null, error = null }, conn = pool) {
  await conn.query('UPDATE outbox SET status = ?, provider_id = ?, error = ?, sent_at = ? WHERE id = ?', [
    status,
    providerId,
    error === null ? null : String(error).slice(0, 1000),
    status === 'sent' ? Date.now() : null,
    id
  ]);
}
