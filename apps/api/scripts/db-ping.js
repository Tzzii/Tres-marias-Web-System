import { config } from '../src/config.js';
import { closePool, dbErrorHint, ping, pool } from '../src/db.js';

/**
 * `npm run db:ping` — check that the API can reach its database with the settings in apps/api/.env.
 * Passes when the database answers, text with ₱, ñ and an en dash comes back unchanged (the
 * connection really is utf8mb4), and the session set up by src/db.js is in place: time zone +08:00
 * and a sql_mode that includes STRICT_TRANS_TABLES (without it, a server running non-strict would
 * silently cut text that is too long). Prints the session's full sql_mode.
 * Exits with 1 otherwise, with a hint for the usual connection problems.
 */
const SAMPLE = '₱ñ–';

async function main() {
  const { host, port, user, database } = config.db;
  console.log(`Checking database "${database}" on ${host}:${port} as ${user}...`);
  try {
    const status = await ping();
    console.log(`ping: ${status}`);

    const [[row]] = await pool.query(`SELECT '${SAMPLE}' AS s, @@SESSION.time_zone AS tz, @@SESSION.sql_mode AS mode, VERSION() AS version`);
    const textOk = row.s === SAMPLE;
    const zoneOk = row.tz === '+08:00';
    const strictOk = row.mode.split(',').includes('STRICT_TRANS_TABLES');
    console.log(`text round trip: ${row.s} (${textOk ? 'matches' : `expected ${SAMPLE}`})`);
    console.log(`session time zone: ${row.tz} (${zoneOk ? 'ok' : 'expected +08:00'}) · server ${row.version}`);
    console.log(`session sql_mode: ${row.mode || '(empty)'} (${strictOk ? 'strict, ok' : 'STRICT_TRANS_TABLES missing'})`);
    return status === 'ok' && textOk && zoneOk && strictOk ? 0 : 1;
  } catch (err) {
    console.error(`Database check failed: ${err.message}`);
    const hint = dbErrorHint(err);
    if (hint) console.error(hint);
    return 1;
  } finally {
    await closePool().catch(() => {});
  }
}

process.exitCode = await main();
