import { HOLDS_DATE } from '@tm/shared/src/utils/status.js';
import { pool } from '../../db.js';


const first = ([rows]) => rows[0] || null;

const MISSING_SETTINGS = 'The calendar_settings row is missing. Run npm run db:reset and npm run seed:api.';


export async function getDailyCapacity(db = pool) {
  const row = first(await db.query('SELECT daily_capacity FROM calendar_settings WHERE id = 1'));
  if (!row) throw new Error(MISSING_SETTINGS);
  return row.daily_capacity;
}

export async function listBlocks(db = pool) {
  const [rows] = await db.query('SELECT date, reason, note FROM calendar_blocks ORDER BY date');
  return rows.map((row) => ({ date: row.date, reason: row.reason, note: row.note }));
}

export async function listSlotHolders(db = pool) {
  const [rows] = await db.query(
    'SELECT ref, date, start_time, end_time, status, service_type FROM reservations WHERE status IN (?) ORDER BY date, start_time, ref',
    [HOLDS_DATE]
  );
  return rows.map((row) => ({
    ref: row.ref,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time ?? null,
    status: row.status,
    serviceType: row.service_type
  }));
}


export async function lockAvailability(conn) {
  const row = first(await conn.query('SELECT id FROM calendar_settings WHERE id = 1 FOR UPDATE'));
  if (!row) throw new Error(MISSING_SETTINGS);
}

export async function touchSettings(conn, at) {
  const [result] = await conn.query('UPDATE calendar_settings SET updated_at = ? WHERE id = 1', [at]);
  if (result.affectedRows === 0) throw new Error(MISSING_SETTINGS);
}

export async function countBlocked(conn, from, to) {
  const row = first(
    await conn.query('SELECT COUNT(*) AS n FROM calendar_blocks WHERE date BETWEEN ? AND ? FOR UPDATE', [from, to])
  );
  return Number(row.n);
}

export async function upsertBlocks(conn, dates, reason, note = '') {
  await conn.query(
    'INSERT INTO calendar_blocks (date, reason, note) VALUES ? AS fresh ON DUPLICATE KEY UPDATE reason = fresh.reason, note = fresh.note',
    [dates.map((date) => [date, reason, note])]
  );
}

export async function deleteBlock(conn, date) {
  await conn.query('DELETE FROM calendar_blocks WHERE date = ?', [date]);
}


export async function setDailyCapacity(capacity, at) {
  const [result] = await pool.query('UPDATE calendar_settings SET daily_capacity = ?, updated_at = ? WHERE id = 1', [
    capacity,
    at
  ]);
  if (result.affectedRows === 0) throw new Error(MISSING_SETTINGS);
}
