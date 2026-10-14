import crypto from 'node:crypto';


const PREFIX = /^[a-z]{1,19}$/;

export function newId(prefix) {
  if (!PREFIX.test(prefix)) throw new Error(`newId: bad prefix "${prefix}" (1-19 lower-case letters).`);
  return `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

export async function nextCounter(conn, name) {
  if (typeof conn.getConnection === 'function') {
    throw new Error('nextCounter must run inside tx(): pass the transaction connection, not the pool.');
  }
  const [rows] = await conn.query('SELECT value FROM counters WHERE name = ? FOR UPDATE', [name]);
  if (!rows.length) {
    throw new Error(
      `Counter "${name}" is missing from the counters table. Run npm run db:reset (and the seeder) to create it.`
    );
  }
  const next = Number(rows[0].value) + 1;
  await conn.query('UPDATE counters SET value = ? WHERE name = ?', [next, name]);
  return next;
}
