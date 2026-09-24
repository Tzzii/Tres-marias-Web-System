import { readFile } from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';
import { SESSION_SETUP, dbErrorHint } from '../src/db.js';

/**
 * `npm run db:reset` — drop every table and create the schema again from apps/api/schema.sql.
 * All data in the database named by DB_NAME is lost, so it refuses to run when NODE_ENV is
 * production unless --force is given. Prints where it is connecting (never the password).
 * Afterwards only the starter rows at the end of schema.sql remain: the catalog_settings and
 * calendar_settings rows and the four counters at 0.
 *
 * schema.sql is many statements in one file, so this script opens its own single connection with
 * multipleStatements on. The app pool (src/db.js) never allows that: it would let one harmful
 * string run extra statements. That connection first gets the pool's session setup (SESSION_SETUP:
 * time zone, collation, strict mode), so the schema and its starter rows are created under the same
 * rules as the app's writes, even on a server that runs non-strict.
 */
async function main() {
  if (config.isProduction && !process.argv.includes('--force')) {
    console.error('Refusing to reset: NODE_ENV is production and this drops every table. Add --force only if that is really what you want.');
    return 1;
  }

  const { host, port, user, database } = config.db;
  console.log(`Resetting database "${database}" on ${host}:${port} as ${user} (every table is dropped and created again)...`);
  const sql = await readFile(path.join(config.apiRoot, 'schema.sql'), 'utf8');

  let conn;
  try {
    conn = await mysql.createConnection({ ...config.db, charset: 'utf8mb4_unicode_ci', multipleStatements: true });
    for (const statement of SESSION_SETUP) await conn.query(statement);
    await conn.query(sql);
    const [[{ tables }]] = await conn.query('SELECT COUNT(*) AS tables FROM information_schema.tables WHERE table_schema = DATABASE()');
    console.log(`Done: "${database}" now has ${tables} tables, empty except the catalog and calendar settings rows and the counters.`);
    return 0;
  } catch (err) {
    console.error(`Reset failed: ${err.message}`);
    const hint = dbErrorHint(err);
    if (hint) console.error(hint);
    return 1;
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
}

process.exitCode = await main();
