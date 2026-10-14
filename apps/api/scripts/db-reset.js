import { readFile } from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';
import { SESSION_SETUP, dbErrorHint } from '../src/db.js';

async function main() {
  if (config.isProduction && !process.argv.includes('--force')) {
    console.error(
      'Refusing to reset: NODE_ENV is production and this drops every table. Add --force only if that is really what you want.'
    );
    return 1;
  }

  const { host, port, user, database } = config.db;
  console.log(
    `Resetting database "${database}" on ${host}:${port} as ${user} (every table is dropped and created again)...`
  );
  const sql = await readFile(path.join(config.apiRoot, 'schema.sql'), 'utf8');

  let conn;
  try {
    conn = await mysql.createConnection({ ...config.db, charset: 'utf8mb4_unicode_ci', multipleStatements: true });
    for (const statement of SESSION_SETUP) await conn.query(statement);
    await conn.query(sql);
    const [[{ tables }]] = await conn.query(
      'SELECT COUNT(*) AS tables FROM information_schema.tables WHERE table_schema = DATABASE()'
    );
    console.log(
      `Done: "${database}" now has ${tables} tables, empty except the catalog and calendar settings rows and the counters.`
    );
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
