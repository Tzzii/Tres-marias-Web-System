import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/config.js';
import { closePool, dbErrorHint, pool } from '../src/db.js';

/**
 * `npm run db:migrate` — add the tables that apps/api/schema.sql has and the database does not, and
 * change nothing else. For a database that holds real data (the owner's local copy, the live server)
 * when a phase adds a new table, e.g. Phase 12's signup_requests and password_changes: db:reset would
 * drop every row, this keeps them all.
 *
 * - Each missing table is created with its own CREATE TABLE from schema.sql, in schema.sql's order
 *   (a table comes after the tables it points to), so its columns, keys and checks are exactly the
 *   ones a db:reset makes.
 * - Existing tables are never dropped or altered: a new COLUMN still needs its own ALTER TABLE (or a
 *   db:reset on a copy that can lose its data). Tables in the database that schema.sql does not
 *   know are listed, not touched.
 * - Safe to run again: with nothing missing it only says so. Allowed in production for that reason.
 * - Runs on a pooled connection, so it gets the app's session setup (time zone, collation, strict mode;
 *   src/db.js) like every other write.
 */
async function main() {
  const { host, port, user, database } = config.db;
  console.log(`Checking database "${database}" on ${host}:${port} as ${user} against schema.sql...`);
  const sql = await readFile(path.join(config.apiRoot, 'schema.sql'), 'utf8');

  // Every "CREATE TABLE name ( … ) ENGINE=…;" statement, in file order
  const statements = [...sql.matchAll(/CREATE TABLE (\w+) \([\s\S]*?\) ENGINE=[^;]*;/g)].map((m) => ({ name: m[1], sql: m[0] }));
  if (!statements.length) throw new Error('No CREATE TABLE statements found in schema.sql.');

  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query('SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()');
      const existing = new Set(rows.map((row) => row.name));
      const missing = statements.filter((s) => !existing.has(s.name));
      const unknown = [...existing].filter((name) => !statements.some((s) => s.name === name));

      for (const table of missing) {
        await conn.query(table.sql);
        console.log(`  created ${table.name}`);
      }
      if (unknown.length) console.log(`Not in schema.sql (left as they are): ${unknown.join(', ')}`);
      console.log(missing.length ? `Done: ${missing.length} table(s) added; every other table and row is unchanged.` : 'Nothing to do: every table in schema.sql is already there.');
      return 0;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(`Migrate failed: ${err.message}`);
    const hint = dbErrorHint(err);
    if (hint) console.error(hint);
    return 1;
  } finally {
    await closePool().catch(() => {});
  }
}

process.exitCode = await main();
