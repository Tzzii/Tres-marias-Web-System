import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/config.js';
import { closePool, dbErrorHint, pool } from '../src/db.js';
import { migrateOutsourcePartnerDeletion } from './lib/outsource-partner-deletion-migration.js';


const COLUMN_TYPE =
  /^(BIGINT|INT|SMALLINT|TINYINT|MEDIUMINT|DECIMAL|BOOLEAN|CHAR|VARCHAR|TEXT|MEDIUMTEXT|LONGTEXT|JSON|DATE|DATETIME|TIMESTAMP|TIME|ENUM)\b/i;
function columnsOf(createSql) {
  const body = createSql.slice(createSql.indexOf('(') + 1, createSql.lastIndexOf(') ENGINE'));
  return body
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, '').trim().replace(/,$/, '').trim())
    .map((line) => {
      const match = line.match(/^`?(\w+)`?\s+(.+)$/);
      return match &&
        !/^(PRIMARY|KEY|UNIQUE|INDEX|CONSTRAINT|FOREIGN|CHECK|FULLTEXT)$/i.test(match[1]) &&
        COLUMN_TYPE.test(match[2])
        ? { name: match[1], definition: match[2] }
        : null;
    })
    .filter(Boolean);
}

async function main() {
  const { host, port, user, database } = config.db;
  console.log(`Checking database "${database}" on ${host}:${port} as ${user} against schema.sql...`);
  const sql = await readFile(path.join(config.apiRoot, 'schema.sql'), 'utf8');

  const statements = [...sql.matchAll(/CREATE TABLE (\w+) \([\s\S]*?\) ENGINE=[^;]*;/g)].map((m) => ({
    name: m[1],
    sql: m[0]
  }));
  if (!statements.length) throw new Error('No CREATE TABLE statements found in schema.sql.');

  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()'
      );
      const existing = new Set(rows.map((row) => row.name));
      const missing = statements.filter((s) => !existing.has(s.name));
      const unknown = [...existing].filter((name) => !statements.some((s) => s.name === name));

      for (const table of missing) {
        await conn.query(table.sql);
        console.log(`  created ${table.name}`);
      }

      let added = 0;
      let widened = 0;
      for (const table of statements.filter((s) => existing.has(s.name))) {
        const [columnRows] = await conn.query(
          'SELECT column_name AS name, data_type AS type, character_maximum_length AS length FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?',
          [table.name]
        );
        const have = new Map(columnRows.map((row) => [row.name.toLowerCase(), row]));
        const columns = columnsOf(table.sql);
        for (const [i, column] of columns.entries()) {
          const current = have.get(column.name.toLowerCase());
          if (current) {
            const wanted = /^VARCHAR\((\d+)\)/i.exec(column.definition);
            if (
              wanted &&
              String(current.type).toLowerCase() === 'varchar' &&
              Number(wanted[1]) > Number(current.length)
            ) {
              await conn.query(`ALTER TABLE \`${table.name}\` MODIFY COLUMN \`${column.name}\` ${column.definition}`);
              widened += 1;
              console.log(
                `  widened ${table.name}.${column.name} from VARCHAR(${current.length}) to VARCHAR(${wanted[1]})`
              );
            }
            continue;
          }
          const place = i === 0 ? 'FIRST' : `AFTER \`${columns[i - 1].name}\``;
          await conn.query(`ALTER TABLE \`${table.name}\` ADD COLUMN \`${column.name}\` ${column.definition} ${place}`);
          have.set(column.name.toLowerCase(), { name: column.name });
          added += 1;
          console.log(`  added ${table.name}.${column.name}`);
        }
      }

      const partnerDeletion = await migrateOutsourcePartnerDeletion(conn);
      if (partnerDeletion) console.log('  enabled permanent partner deletion; existing requests and links kept');

      if (unknown.length) console.log(`Not in schema.sql (left as they are): ${unknown.join(', ')}`);
      console.log(
        missing.length || added || widened || partnerDeletion
          ? `Done: ${missing.length} table(s) and ${added} column(s) added, ${widened} column(s) widened${partnerDeletion ? ', partner deletion enabled' : ''}; existing rows kept.`
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
