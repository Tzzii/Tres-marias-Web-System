/**
 * Reading and writing JSON columns (package items, quotations, chat attachments, outbox meta …)
 * the same way on MySQL 8 and MariaDB (docs/backend-development-phases.md §4 row 11, §12.4).
 */

/**
 * The value of a JSON column as a JS value. MySQL 8 hands mysql2 an already-parsed object;
 * MariaDB (XAMPP) stores JSON as LONGTEXT and hands back a string. Both are accepted, and a
 * Buffer is read as UTF-8 text. NULL, or text that is not valid JSON, gives `fallback`.
 */
export function parseJson(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const text = Buffer.isBuffer(value) ? value.toString('utf8') : value;
  if (typeof text !== 'string') return text;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

/**
 * A JS value as text for a JSON column. Always stringify before writing: mysql2 would turn a
 * plain object into `key = value` pairs instead of JSON. null and undefined stay SQL NULL.
 */
export function toJson(value) {
  return value === null || value === undefined ? null : JSON.stringify(value);
}
