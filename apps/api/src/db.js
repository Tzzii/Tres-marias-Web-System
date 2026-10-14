import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  ...config.db,
  charset: 'utf8mb4_unicode_ci',
  timezone: '+08:00',
  dateStrings: ['DATE'],
  namedPlaceholders: true,
  connectionLimit: 10
});

export const SESSION_SETUP = [
  "SET time_zone = '+08:00'",
  'SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci',
  "SET SESSION sql_mode = IF(FIND_IN_SET('STRICT_TRANS_TABLES', @@SESSION.sql_mode), @@SESSION.sql_mode, TRIM(BOTH ',' FROM CONCAT(@@SESSION.sql_mode, ',STRICT_TRANS_TABLES')))"
];

const reportSessionError = (err) => {
  if (err) console.error('[db] Could not set up a new database connection:', err.message);
};

pool.on('connection', (conn) => {
  SESSION_SETUP.forEach((sql) => conn.query(sql, reportSessionError));
});

export async function tx(fn) {
  const conn = await pool.getConnection();
  const hooks = [];
  conn.afterCommit = (hook) => {
    hooks.push(hook);
  };
  let broken = false;
  let committed = false;
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    committed = true;
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      broken = true;
    }
    throw err;
  } finally {
    delete conn.afterCommit;
    if (broken) conn.destroy();
    else conn.release();
    if (committed) {
      hooks.forEach((hook) => {
        Promise.resolve()
          .then(hook)
          .catch((err) => console.error('[db] An after-commit task failed:', err.message));
      });
    }
  }
}

export async function ping() {
  const [[row]] = await pool.query('SELECT 1 AS ok');
  return row.ok === 1 ? 'ok' : 'failed';
}

export function closePool() {
  return pool.end();
}

export function dbErrorHint(err) {
  const { host, port, user, database } = config.db;
  switch (err && err.code) {
    case 'ECONNREFUSED':
      return `Nothing is accepting connections on ${host}:${port}. Start MySQL (on Windows, the MySQL80 service), or fix DB_HOST / DB_PORT in apps/api/.env.`;
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return `The host "${host}" could not be found. Check DB_HOST in apps/api/.env.`;
    case 'ETIMEDOUT':
      return `${host}:${port} did not answer in time. Check DB_HOST / DB_PORT in apps/api/.env and that MySQL is running.`;
    case 'ER_ACCESS_DENIED_ERROR':
      return `MySQL refused the user "${user}". Check DB_USER and DB_PASSWORD in apps/api/.env, and that the user exists (apps/api/db-setup.sql creates it).`;
    case 'ER_DBACCESS_DENIED_ERROR':
      return `The user "${user}" has no rights on the database "${database}". As root: GRANT ALL PRIVILEGES ON ${database}.* TO '${user}'@'localhost';`;
    case 'ER_BAD_DB_ERROR':
      return `The database "${database}" does not exist yet. Create it first, in utf8mb4: CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; (apps/api/db-setup.sql does this).`;
    default:
      return null;
  }
}
