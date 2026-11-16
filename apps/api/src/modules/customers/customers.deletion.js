import { createHmac } from 'node:crypto';
import { pool } from '../../db.js';
import { config } from '../../config.js';
import { storage } from '../../integrations/storage/index.js';
import { cleanReferencePhotos } from '@tm/shared/src/domain/referencePhoto.js';

const json = (value) => (typeof value === 'string' ? JSON.parse(value) : value);

// Delete children before parents using the installed schema, including older linked tables.
// Every predicate starts from rows belonging to this customer. Shared catalogue rows are parents.
async function deleteLinkedRows(conn, edges, table, column, values) {
  if (!values.length) return;
  for (const edge of edges.filter((edge) => edge.parentTable === table)) {
    const [rows] = await conn.query('SELECT DISTINCT ?? AS linked FROM ?? WHERE ?? IN (?)', [
      edge.parentColumn,
      table,
      column,
      values
    ]);
    await deleteLinkedRows(
      conn,
      edges,
      edge.childTable,
      edge.childColumn,
      rows.map((row) => row.linked).filter((value) => value != null)
    );
  }
  await conn.query('DELETE FROM ?? WHERE ?? IN (?)', [table, column, values]);
}

export async function purgeCustomer(conn, customer) {
  const [edges] = await conn.query(`SELECT TABLE_NAME AS childTable, COLUMN_NAME AS childColumn,
    REFERENCED_TABLE_NAME AS parentTable, REFERENCED_COLUMN_NAME AS parentColumn
    FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL`);
  const [reservations] = await conn.query('SELECT ref, styling FROM reservations WHERE customer_id = ? FOR UPDATE', [
    customer.id
  ]);
  const refs = reservations.map((row) => row.ref);
  const [proofs] = await conn.query('SELECT proof_key FROM payments WHERE customer_id = ?', [customer.id]);
  const [conversations] = await conn.query(
    'SELECT id, reference_photos FROM assistant_conversations WHERE customer_id = ? FOR UPDATE',
    [customer.id]
  );
  const files = new Set(proofs.map((row) => row.proof_key).filter(Boolean));
  for (const reservation of reservations) {
    const styling = json(reservation.styling) || {};
    for (const photo of cleanReferencePhotos(styling.referencePhotos ?? styling.referencePhoto)) files.add(photo.key);
  }
  for (const conversation of conversations) {
    for (const photo of cleanReferencePhotos(json(conversation.reference_photos))) files.add(photo.key);
  }
  for (const key of files) {
    await conn.query('INSERT IGNORE INTO customer_file_deletions (file_key, created_at) VALUES (?, ?)', [
      key,
      Date.now()
    ]);
  }

  // These relationships intentionally have no foreign keys in the application schema.
  if (refs.length) {
    const [deliveries] = await conn.query(
      `SELECT d.outbox_id FROM outsource_deliveries d JOIN outsource_contracts c ON c.id = d.contract_id
      WHERE c.reservation_ref IN (?) AND d.outbox_id IS NOT NULL`,
      [refs]
    );
    await deleteLinkedRows(conn, edges, 'outsource_contracts', 'reservation_ref', refs);
    await deleteLinkedRows(
      conn,
      edges,
      'outbox',
      'id',
      deliveries.map((row) => row.outbox_id)
    );
    await deleteLinkedRows(conn, edges, 'inventory_allocations', 'reservation_ref', refs);
  }
  await deleteLinkedRows(conn, edges, 'assistant_conversations', 'customer_id', [customer.id]);
  const allowancePrefix = `c:${customer.id}:`;
  await conn.query('DELETE FROM assistant_allowances WHERE LEFT(id, ?) = ?', [allowancePrefix.length, allowancePrefix]);
  await conn.query('DELETE FROM assistant_usage WHERE owner_key = ? OR LEFT(owner_key, ?) = ?', [
    `c:${customer.id}`,
    allowancePrefix.length,
    allowancePrefix
  ]);
  const actorKey = createHmac('sha256', config.jwtSecret).update(`c:${customer.id}`).digest('hex').slice(0, 32);
  await conn.query('DELETE FROM ai_guard_leases WHERE actor_key = ?', [actorKey]);
  await conn.query('DELETE FROM ai_guard_windows WHERE id LIKE ?', [`%:${actorKey}`]);
  await conn.query('DELETE FROM signup_requests WHERE email = ?', [customer.email]);
  await conn.query('DELETE FROM login_attempts WHERE identifier IN (?, ?)', [customer.id, customer.email]);
  await conn.query(
    `DELETE FROM outbox WHERE (to_address = ? AND JSON_UNQUOTE(JSON_EXTRACT(meta, '$.purpose')) IN ('customer_sign_up', 'customer_google_sign_in', 'customer_password_reset', 'customer_password_change', 'customer_email_change')) OR JSON_UNQUOTE(JSON_EXTRACT(meta, '$.customerId')) = ?`,
    [customer.email, customer.id]
  );
  if (refs.length)
    await conn.query("DELETE FROM outbox WHERE JSON_UNQUOTE(JSON_EXTRACT(meta, '$.ref')) IN (?)", [refs]);
  await deleteLinkedRows(conn, edges, 'customers', 'id', [customer.id]);
}

export async function processCustomerFileDeletions({
  db = pool,
  remove = (key) => storage.remove(key),
  clock = Date.now
} = {}) {
  const [rows] = await db.query(
    'SELECT file_key FROM customer_file_deletions WHERE next_attempt_at <= ? ORDER BY next_attempt_at, created_at, file_key LIMIT 50',
    [clock()]
  );
  for (const row of rows) {
    try {
      await remove(row.file_key);
      await db.query('DELETE FROM customer_file_deletions WHERE file_key = ?', [row.file_key]);
    } catch (error) {
      await db.query(
        'UPDATE customer_file_deletions SET attempts = attempts + 1, next_attempt_at = ? WHERE file_key = ?',
        [clock() + 60000, row.file_key]
      );
      console.error('[customer-files] Cleanup will retry:', error.message);
    }
  }
}

export function createCustomerFileCleanupScheduler({
  process = processCustomerFileDeletions,
  intervalMs = 60000
} = {}) {
  let timer;
  let running;
  const run = () => {
    if (!running)
      running = process()
        .catch((error) => console.error('[customer-files]', error.message))
        .finally(() => {
          running = null;
        });
  };
  return {
    start() {
      timer = setInterval(run, intervalMs);
      timer.unref();
      run();
    },
    async stop() {
      clearInterval(timer);
      await running;
    }
  };
}
