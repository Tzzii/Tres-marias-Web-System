import crypto from 'node:crypto';

/**
 * Record ids and sequential numbers (docs/backend-development-phases.md §7.6).
 * Random ids (cus-, th-, m-, tst-, inv-, op-, oc-, pkg-, add-, qr-, ob- …) come from newId();
 * numbered ones (OR-####, pay-####, EQ-####, OUT-YYYY-####) from the counters table via nextCounter().
 */

// Lower-case letters only, and short enough that prefix + '-' + 20 characters fits VARCHAR(40)
const PREFIX = /^[a-z]{1,19}$/;

/**
 * A new random id: the prefix, a dash and 20 hex characters of crypto.randomUUID(),
 * e.g. newId('cus') -> "cus-3f9c2a7e41b04d8e9a1c". About 74 random bits (the UUID's version and
 * variant bits are fixed), so ids never collide in practice and cannot be guessed from one another.
 */
export function newId(prefix) {
  if (!PREFIX.test(prefix)) throw new Error(`newId: bad prefix "${prefix}" (1-19 lower-case letters).`);
  return `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

/**
 * The next number of a counter ('receipt', 'payment', 'inventory', 'outsource'): locks the row,
 * adds 1, saves it and returns the new number. The stored value is always the LAST number used.
 *
 * Call it only inside tx() with that transaction's connection: the FOR UPDATE lock is what stops
 * two requests from getting the same receipt number, and it lasts only until the transaction ends
 * (a rollback also gives the number back, so receipts have no gaps). Passing the pool is refused.
 * Throws when the counter row is missing (schema.sql and the seeder create all four).
 */
export async function nextCounter(conn, name) {
  if (typeof conn.getConnection === 'function') {
    throw new Error('nextCounter must run inside tx(): pass the transaction connection, not the pool.');
  }
  const [rows] = await conn.query('SELECT value FROM counters WHERE name = ? FOR UPDATE', [name]);
  if (!rows.length) {
    throw new Error(`Counter "${name}" is missing from the counters table. Run npm run db:reset (and the seeder) to create it.`);
  }
  const next = Number(rows[0].value) + 1;
  await conn.query('UPDATE counters SET value = ? WHERE name = ?', [next, name]);
  return next;
}
