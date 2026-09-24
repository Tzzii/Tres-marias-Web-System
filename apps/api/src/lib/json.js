/**
 * Reading and writing JSON columns (package items, quotations, chat attachments, outbox meta …)
 * on MySQL 8, the only database the API supports (docs/backend-development-phases.md §12.4).
 */

/**
 * The value of a JSON column as a JS value. For a JSON column, MySQL 8 hands mysql2 an
 * already-parsed value, which is returned as it is. JSON that reaches Node as text (e.g. built
 * in SQL with GROUP_CONCAT) is parsed, and a Buffer is read as UTF-8 text first. NULL, or text
 * that is not valid JSON, gives `fallback`.
 * MySQL returns objects with their keys re-sorted, not in the order they were written, so never
 * rely on key order: walk a fixed list instead (e.g. DISH_CATEGORIES for a reservation's menu).
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
