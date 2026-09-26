import { HOLDS_DATE } from '@tm/shared/src/utils/status.js';
import { pool } from '../../db.js';

/**
 * SQL for the calendar: blocked dates, the one calendar_settings row, and the reservations that can
 * hold a date (docs §7.1: the repo holds SQL only; the rules are in calendar.service.js and
 * @tm/shared/src/domain/availability.js). Rows come back as camelCase records shaped like the
 * browser store's, so domain/availability.js reads either the same way.
 *
 * The write helpers take the transaction's connection (calendar.service.js runs them in tx()). The
 * reads use the pool unless given a connection (`db`), so a reservation write can read the calendar
 * inside its own transaction (Phase 6).
 */

// First row of a SELECT, or null
const first = ([rows]) => rows[0] || null;

// schema.sql and the seeder always create the one settings row. Without it the capacity is unknown,
// so fail loudly (a 500) instead of guessing, or reporting a save that did not happen.
const MISSING_SETTINGS = 'The calendar_settings row is missing. Run npm run db:reset and npm run seed:api.';

/* ============================ Reads ============================ */

/** The daily event capacity (1–10). */
export async function getDailyCapacity(db = pool) {
  const row = first(await db.query('SELECT daily_capacity FROM calendar_settings WHERE id = 1'));
  if (!row) throw new Error(MISSING_SETTINGS);
  return row.daily_capacity;
}

/** Blocked dates, earliest first: [{ date: 'YYYY-MM-DD', reason }]. */
export async function listBlocks(db = pool) {
  const [rows] = await db.query('SELECT date, reason FROM calendar_blocks ORDER BY date');
  return rows.map((row) => ({ date: row.date, reason: row.reason }));
}

/**
 * Reservations in a status that holds a date (HOLDS_DATE: approved to confirmed), as
 * { ref, date, startTime, status, serviceType }, by date and start time. buildSnapshot() still
 * decides which of them take a slot (an equipment rental never does); this filter only keeps the
 * others (pending, declined, cancelled, completed) from being read at all. Uses the
 * idx_reservations_date_status index.
 */
export async function listSlotHolders(db = pool) {
  const [rows] = await db.query(
    'SELECT ref, date, start_time, status, service_type FROM reservations WHERE status IN (?) ORDER BY date, start_time, ref',
    [HOLDS_DATE]
  );
  return rows.map((row) => ({ ref: row.ref, date: row.date, startTime: row.start_time, status: row.status, serviceType: row.service_type }));
}

/* ============================ Writes (inside a transaction) ============================ */

/**
 * The availability lock (docs Phase 6): locks the one calendar_settings row until the transaction
 * ends. A reservation write that books, takes or moves a slot or rental stock runs this first, and
 * every calendar write starts by updating the same row (touchSettings), so all of them run one after
 * the other and always take this lock before any other row: no two of them can pass the same check
 * at once, and they cannot deadlock on each other.
 */
export async function lockAvailability(conn) {
  const row = first(await conn.query('SELECT id FROM calendar_settings WHERE id = 1 FOR UPDATE'));
  if (!row) throw new Error(MISSING_SETTINGS);
}

/**
 * Stamp calendar_settings.updated_at: the calendar's change stamp (Phase 7), which also sees an
 * unblock, since that leaves no row behind. Every calendar write runs this first: it locks the
 * settings row until the transaction ends, so two calendar writes run one after the other.
 */
export async function touchSettings(conn, at) {
  const [result] = await conn.query('UPDATE calendar_settings SET updated_at = ? WHERE id = 1', [at]);
  if (result.affectedRows === 0) throw new Error(MISSING_SETTINGS);
}

/** How many dates from `from` to `to` (both included) are already blocked. A locking read, so it sees the latest saved rows. */
export async function countBlocked(conn, from, to) {
  const row = first(await conn.query('SELECT COUNT(*) AS n FROM calendar_blocks WHERE date BETWEEN ? AND ? FOR UPDATE', [from, to]));
  return Number(row.n);
}

/** Block every date in `dates` with this reason, in one statement; a date already blocked gets the new reason. */
export async function upsertBlocks(conn, dates, reason) {
  await conn.query('INSERT INTO calendar_blocks (date, reason) VALUES ? ON DUPLICATE KEY UPDATE reason = ?', [dates.map((date) => [date, reason]), reason]);
}

/** Open a blocked date again (nothing to delete when it was not blocked). */
export async function deleteBlock(conn, date) {
  await conn.query('DELETE FROM calendar_blocks WHERE date = ?', [date]);
}

/* ============================ Capacity ============================ */

/** Save the daily capacity and stamp the change, in one statement (so no transaction is needed). */
export async function setDailyCapacity(capacity, at) {
  const [result] = await pool.query('UPDATE calendar_settings SET daily_capacity = ?, updated_at = ? WHERE id = 1', [capacity, at]);
  if (result.affectedRows === 0) throw new Error(MISSING_SETTINGS);
}
