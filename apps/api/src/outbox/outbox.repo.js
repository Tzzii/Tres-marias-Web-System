import { pool } from '../db.js';
import { newId } from '../lib/ids.js';
import { toJson } from '../lib/json.js';


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

export async function markOutbox(id, { status, providerId = null, error = null }, conn = pool) {
  await conn.query('UPDATE outbox SET status = ?, provider_id = ?, error = ?, sent_at = ? WHERE id = ?', [
    status,
    providerId,
    error === null ? null : String(error).slice(0, 1000),
    status === 'sent' ? Date.now() : null,
    id
  ]);
}
