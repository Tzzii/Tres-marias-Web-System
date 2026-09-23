import { pool } from '../db.js';
import { newId } from '../lib/ids.js';
import { toJson } from '../lib/json.js';

/**
 * Save one outgoing email or SMS in the outbox table: the record of everything the system sent or
 * logged (the mail and SMS log drivers call this with status 'logged'), so no message is lost
 * before a provider is connected and logged ones can be sent later.
 *
 * `to` is stored as to_address, `meta` (what the message is about) as JSON. sent_at is filled only
 * when the row is saved as 'sent'. Pass a transaction connection as `conn` to save the row in the
 * same transaction as the change that caused it; by default it uses the pool.
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
