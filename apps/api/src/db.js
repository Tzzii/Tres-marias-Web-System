import mysql from 'mysql2/promise';
import { config } from './config.js';

/**
 * The MySQL / MariaDB connection pool shared by the whole API, and the transaction helper.
 *
 * - Creating the pool opens no connection: the first query does. So importing this file never
 *   fails when MySQL is down, and the API still answers /api/health.
 * - `charset` is the collation the handshake asks for (utf8mb4 with utf8mb4_unicode_ci, the
 *   tables' collation). mysql2 reads a bare 'utf8mb4' as utf8mb4_general_ci.
 * - DATE columns come back as 'YYYY-MM-DD' strings (dateStrings), so an event date never moves
 *   a day because of a time zone. Instants are BIGINT milliseconds and come back as numbers.
 * - `timezone` only tells mysql2 how to turn JS Date values into SQL text. The session itself
 *   (time zone, connection collation, strict SQL mode) is set on every new connection below.
 * - Named placeholders (:name with an object) are on; `?` with an array works as well.
 */
export const pool = mysql.createPool({
  ...config.db,
  charset: 'utf8mb4_unicode_ci',
  timezone: '+08:00',
  dateStrings: ['DATE'],
  namedPlaceholders: true,
  connectionLimit: 10
});

/**
 * The session settings every connection gets before anything else runs on it, as SQL statements:
 * 1. The Philippine time zone (§7.5), so NOW(), CURDATE() and FROM_UNIXTIME() in SQL (e.g. report
 *    months) use Manila time even on a UTC server.
 * 2. utf8mb4_unicode_ci for the connection (§7.5), so ₱, ñ and en dashes are compared like the
 *    columns they meet.
 * 3. Strict mode: STRICT_TRANS_TABLES added to the server's own sql_mode, keeping its other modes
 *    (e.g. MySQL 8's ONLY_FULL_GROUP_BY). MariaDB under XAMPP may run non-strict, and then text that
 *    is too long is silently cut and a bad value is silently turned into '' or 0; in strict mode
 *    those writes fail with an error instead. The IF leaves a mode that already has it unchanged,
 *    and the TRIM drops the leading comma when the server's mode was empty.
 * Exported so scripts/db-reset.js gives its own connection the same session.
 */
export const SESSION_SETUP = [
  "SET time_zone = '+08:00'",
  'SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci',
  "SET SESSION sql_mode = IF(FIND_IN_SET('STRICT_TRANS_TABLES', @@SESSION.sql_mode), @@SESSION.sql_mode, TRIM(BOTH ',' FROM CONCAT(@@SESSION.sql_mode, ',STRICT_TRANS_TABLES')))"
];

// Report a failed session setup; the connection stays in use, but its session is not as documented
const reportSessionError = (err) => {
  if (err) console.error('[db] Could not set up a new database connection:', err.message);
};

/*
 * Apply SESSION_SETUP to every new pooled connection. The pool emits 'connection' with the
 * callback-style connection before handing it out, and a connection runs its commands in order,
 * so these statements always run before the first query of whoever asked for the connection.
 * A failure is only logged. By the time it is reported, the first query of whoever asked for the
 * connection may already be on its way to the server, so destroying the connection would not
 * reliably stop that query (checked with mysql2 3.24). `npm run db:ping` fails instead when the
 * time zone or strict mode is missing.
 * (IGNORE_SPACE may also show up in sql_mode: mysql2 asks for it in its default handshake flags.)
 */
pool.on('connection', (conn) => {
  SESSION_SETUP.forEach((sql) => conn.query(sql, reportSessionError));
});

/**
 * Run `fn(conn)` in one transaction: commit when it returns, roll back when it throws, and always
 * give the connection back. Every write that touches more than one row goes through here (§7.7),
 * and so does anything that locks rows with SELECT … FOR UPDATE (e.g. nextCounter).
 * A connection whose rollback also failed (e.g. the link dropped) is discarded, not reused.
 */
export async function tx(fn) {
  const conn = await pool.getConnection();
  let broken = false;
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      broken = true; // keep the original error; the rollback failure only means the connection is unusable
    }
    throw err;
  } finally {
    if (broken) conn.destroy();
    else conn.release();
  }
}

/** Connection check for scripts/db-ping.js and health checks: 'ok' when the database answers. */
export async function ping() {
  const [[row]] = await pool.query('SELECT 1 AS ok');
  return row.ok === 1 ? 'ok' : 'failed';
}

/** Close every pooled connection, so a script can exit (the open sockets would keep Node running). */
export function closePool() {
  return pool.end();
}

/**
 * A plain-language next step for the usual reasons a database connection fails, or null when
 * the error is something else. Shared by the db scripts so they give the same advice.
 * Never includes the password.
 */
export function dbErrorHint(err) {
  const { host, port, user, database } = config.db;
  switch (err && err.code) {
    case 'ECONNREFUSED':
      return `Nothing is accepting connections on ${host}:${port}. Start MySQL (the MySQL80 Windows service, or MySQL in the XAMPP control panel), or fix DB_HOST / DB_PORT in apps/api/.env.`;
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
