import { pool } from '../../db.js';
import { publishChange } from './changes.events.js';


export async function readStamp() {
  const [[row]] = await pool.query("SELECT value FROM counters WHERE name = 'change'");
  return row ? Number(row.value) : 0;
}

export async function bumpStamp() {
  await pool.query("INSERT INTO counters (name, value) VALUES ('change', 1) ON DUPLICATE KEY UPDATE value = value + 1");
  publishChange();
}
