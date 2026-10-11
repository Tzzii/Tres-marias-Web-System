import { pool } from '../../db.js';
import { publishChange } from './changes.events.js';

/**
 * The change stamp (docs/backend-development-phases.md Phase 7): one number that moves on every saved
 * write, kept in the counters table under the name 'change'. middleware/changes.js moves it after each
 * write request that succeeded. Socket.IO publishes an invalidation once saved; the portals also
 * compare the stamp every 15 seconds (GET /api/changes) as a recovery path.
 * The seeder clears the counters, so after a fresh seed it starts again from 0, which the portals also
 * read as a change.
 */

/** The current stamp: 0 before the first write since the counters were last reset. */
export async function readStamp() {
  const [[row]] = await pool.query("SELECT value FROM counters WHERE name = 'change'");
  return row ? Number(row.value) : 0;
}

/** Move the stamp on by one, creating its row on first use (one statement, so no transaction is needed). */
export async function bumpStamp() {
  await pool.query("INSERT INTO counters (name, value) VALUES ('change', 1) ON DUPLICATE KEY UPDATE value = value + 1");
  publishChange(); // after the saved write and stamp: connected portals can now fetch committed data
}
