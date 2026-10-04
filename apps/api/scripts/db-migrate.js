import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/config.js';
import { closePool, dbErrorHint, pool } from '../src/db.js';

/**
 * `npm run db:migrate` — add the tables and columns that apps/api/schema.sql has and the database does
 * not, and change nothing else. For a database that holds real data (the owner's local copy, the live
 * server) when a phase adds a table (Phase 12's signup_requests and password_changes) or a column (the
 * 2026-10-03 reservations.end_time, calendar_blocks.note, terms_version…): db:reset would drop every
 * row, this keeps them all.
 *
 * - Each missing table is created with its own CREATE TABLE from schema.sql, in schema.sql's order
 *   (a table comes after the tables it points to), so its columns, keys and checks are exactly the
 *   ones a db:reset makes.
 * - Each missing column of an existing table is added with ALTER TABLE … ADD COLUMN, from its line in
 *   schema.sql (type, NULL / NOT NULL, DEFAULT), placed AFTER the column before it as in schema.sql.
 *   Existing rows get the column's DEFAULT (or NULL). A new KEY or CHECK on an existing table is not
 *   added, so a new column carries its rules in its own line (type, NOT NULL, DEFAULT).
 * - Nothing is ever dropped, renamed or changed: a column whose type changed in schema.sql keeps its
 *   old type. Tables in the database that schema.sql does not know are listed, not touched.
 * - Safe to run again: with nothing missing it only says so. Allowed in production for that reason.
 * - Runs on a pooled connection, so it gets the app's session setup (time zone, collation, strict mode;
 *   src/db.js) like every other write.
 */

/**
 * The columns of one CREATE TABLE statement, in order: [{ name, definition }], e.g.
 * { name: 'end_time', definition: 'CHAR(5) NULL' }. A column line is a name followed by a column type
 * (COLUMN_TYPE); comment lines, the `-- …` comment at the end of a line and the trailing comma are left out,
 * and so are PRIMARY KEY, KEY, CONSTRAINT lines and the inside of a CHECK written over several lines
 * ("AND cat_setup BETWEEN 1 AND 5" is not a column).
 */
const COLUMN_TYPE = /^(BIGINT|INT|SMALLINT|TINYINT|MEDIUMINT|DECIMAL|BOOLEAN|CHAR|VARCHAR|TEXT|MEDIUMTEXT|LONGTEXT|JSON|DATE|DATETIME|TIMESTAMP|TIME|ENUM)\b/i;
function columnsOf(createSql) {
  const body = createSql.slice(createSql.indexOf('(') + 1, createSql.lastIndexOf(') ENGINE'));
  return body
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, '').trim().replace(/,$/, '').trim())
    .map((line) => {
      const match = line.match(/^`?(\w+)`?\s+(.+)$/);
      return match && !/^(PRIMARY|KEY|UNIQUE|INDEX|CONSTRAINT|FOREIGN|CHECK|FULLTEXT)$/i.test(match[1]) && COLUMN_TYPE.test(match[2])
        ? { name: match[1], definition: match[2] }
        : null;
    })
    .filter(Boolean);
}

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

      // Columns schema.sql has and an existing table lacks, added in schema.sql's order
      let added = 0;
      for (const table of statements.filter((s) => existing.has(s.name))) {
        const [columnRows] = await conn.query(
          'SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?',
          [table.name]
        );
        const have = new Set(columnRows.map((row) => row.name.toLowerCase()));
        const columns = columnsOf(table.sql);
        for (const [i, column] of columns.entries()) {
          if (have.has(column.name.toLowerCase())) continue;
          const place = i === 0 ? 'FIRST' : `AFTER \`${columns[i - 1].name}\``;
          await conn.query(`ALTER TABLE \`${table.name}\` ADD COLUMN \`${column.name}\` ${column.definition} ${place}`);
          have.add(column.name.toLowerCase());
          added += 1;
          console.log(`  added ${table.name}.${column.name}`);
        }
      }

      if (unknown.length) console.log(`Not in schema.sql (left as they are): ${unknown.join(', ')}`);
      console.log(
        missing.length || added
          ? `Done: ${missing.length} table(s) and ${added} column(s) added; every other table, column and row is unchanged.`
          : 'Nothing to do: every table and column in schema.sql is already there.'
      );
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
