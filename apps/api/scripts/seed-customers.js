// config first: seed dates and backups use the same Manila timezone as the API.
import { config } from '../src/config.js';
import { mkdir, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { pool, tx, closePool } from '../src/db.js';
import { TABLES, toRows, insertRows } from '../src/seed.js';
import { hashSecret } from '../src/lib/passwords.js';
import { validatePassword } from '@tm/shared/src/utils/validation.js';
import { loadSampleSeed, NO_SAMPLE_DATA } from '../src/seedData/sampleLoader.js';
import * as catalog from '../src/modules/catalog/catalog.repo.js';
import { findItems } from '../src/modules/inventory/inventory.repo.js';
import { prepareSampleProofs } from '../src/seedData/proofs.js';

// Customer records and their children, in parent-first order. Configuration and admin accounts stay.
const CUSTOMER_TABLES = [
  'customers', 'reservations', 'reservation_addons', 'reservation_activity',
  'payments', 'refunds', 'qr_payments', 'webhook_events', 'threads', 'messages', 'testimonials',
  'rental_dispatches', 'reservation_rental_items', 'reservation_damage_charges',
  'password_resets', 'signup_requests', 'password_changes'
];

async function backup(conn) {
  const folder = path.join(config.apiRoot, 'tmp', `before-customer-seed-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  await mkdir(folder, { recursive: true });
  const snapshot = {};
  const sql = ['-- Restore into the same schema as this local database.', 'SET NAMES utf8mb4;', 'SET FOREIGN_KEY_CHECKS=0;', 'START TRANSACTION;'];
  for (const table of TABLES) {
    const [rows] = await conn.query('SELECT * FROM ??', [table]);
    snapshot[table] = rows;
    sql.push(conn.format('DELETE FROM ??;', [table]));
    for (const row of rows) {
      const values = Object.values(row).map(value => value !== null && typeof value === 'object' && !Buffer.isBuffer(value) ? JSON.stringify(value) : value);
      sql.push(conn.format('INSERT INTO ?? (??) VALUES (?);', [table, Object.keys(row), values]));
    }
  }
  sql.push('COMMIT;', 'SET FOREIGN_KEY_CHECKS=1;');
  await writeFile(path.join(folder, 'database.json'), JSON.stringify(snapshot, null, 2));
  await writeFile(path.join(folder, 'restore.sql'), sql.join('\n'));
  await cp(path.join(config.apiRoot, 'src', 'seedData', 'sample'), path.join(folder, 'sample'), { recursive: true });
  return folder;
}

async function currentBusiness() {
  const [adminRows] = await pool.query('SELECT id, name, email, mobile, role, created_at AS createdAt FROM admins ORDER BY id');
  if (!adminRows.length) throw new Error('An existing admin account is required.');
  const [[settings]] = await pool.query('SELECT price_per_plate AS pricePerPlate, min_downpayment AS minDownpayment FROM catalog_settings WHERE id = 1');
  const [[calendar]] = await pool.query('SELECT daily_capacity AS dailyCapacity FROM calendar_settings WHERE id = 1');
  const [counters] = await pool.query('SELECT name, value FROM counters');
  const counts = Object.fromEntries(counters.map(row => [row.name, row.value]));
  const [addonRows] = await pool.query('SELECT * FROM addons ORDER BY sort_order, id');
  const addons = addonRows.map(a => ({ id: a.id, parentId: a.parent_id, name: a.name, description: a.description, price: a.price,
    hasQuantity: Boolean(a.has_quantity), hasPackages: Boolean(a.has_packages), archived: Boolean(a.archived) }));
  const { items } = await findItems(pool);
  // Only retain history unrelated to the customers being replaced.
  const cleanItems = items.map(item => ({ ...item, allocations: {}, history: item.history.filter(entry => !entry.ref) }));
  return {
    admins: adminRows, settings, dailyCapacity: calendar.dailyCapacity,
    packages: await catalog.listPackages({ includeHidden: true, includeArchived: true }),
    addons, dishes: await catalog.listDishes({ includeArchived: true }),
    inventory: { items: cleanItems, counter: counts.inventory || 0 },
    counters: { ...counts, receipt: (counts.receipt || 1000) + 1 }
  };
}

async function main() {
  if (config.isProduction || !['127.0.0.1', 'localhost', '::1'].includes(config.db.host)) {
    throw new Error('Customer demo replacement is available only on a local development database.');
  }
  const buildSample = await loadSampleSeed();
  if (!buildSample) throw new Error(NO_SAMPLE_DATA);
  const [schema] = await pool.query('SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()');
  if (schema.length !== TABLES.length || schema.some(row => !TABLES.includes(row.name))) {
    throw new Error('The database schema must match src/seed.js before customer replacement.');
  }
  const password = process.env.SEED_CUSTOMER_PASSWORD || '';
  if (!password || validatePassword(password)) throw new Error('Set a valid SEED_CUSTOMER_PASSWORD in apps/api/.env first.');
  const business = await currentBusiness();
  const data = buildSample(business);
  if (data.customers.length !== 1) throw new Error('This demo must have exactly one customer.');
  const hashes = new Map([[data.customers[0].id, await hashSecret(password)]]);
  const rows = toRows(data, hashes, Date.now());
  await prepareSampleProofs(rows);

  let backupPath;
  await tx(async conn => {
    // The availability lock also serializes booking/rental writes while customer records are replaced.
    await conn.query('SELECT * FROM calendar_settings WHERE id = 1 FOR UPDATE');
    await conn.query('SELECT id FROM customers FOR UPDATE');
    backupPath = await backup(conn); // A failed backup aborts before the first DELETE.
    // Contracts keep string refs rather than FKs; remove those tied to any old customer booking,
    // including stale demo refs. Standalone purchasing and the supplier list are preserved.
    const oldContracts = "SELECT id FROM outsource_contracts WHERE reservation_ref <> 'none'";
    await conn.query(`DELETE FROM outbox WHERE JSON_UNQUOTE(JSON_EXTRACT(meta, '$.contractId')) IN (${oldContracts})`);
    await conn.query(`DELETE FROM outsource_deliveries WHERE contract_id IN (${oldContracts})`);
    await conn.query(`DELETE FROM outsource_contract_history WHERE contract_id IN (${oldContracts})`);
    await conn.query("DELETE FROM outsource_contracts WHERE reservation_ref <> 'none'");
    // Notifications for the removed customers, or their booking metadata, must not survive in admin logs.
    await conn.query(`DELETE o FROM outbox o WHERE EXISTS (
      SELECT 1 FROM customers c WHERE LOCATE(c.email, o.to_address) > 0 OR o.to_address = c.mobile)
      OR JSON_UNQUOTE(JSON_EXTRACT(o.meta, '$.ref')) IN (SELECT ref FROM reservations)
      OR JSON_UNQUOTE(JSON_EXTRACT(o.meta, '$.reservationRef')) IN (SELECT ref FROM reservations)`);
    await conn.query(`DELETE FROM login_attempts WHERE scope IN ('customer', 'signup-code', 'reset-code', 'change-code', 'customer-reauth', 'code-email')`);
    await conn.query("DELETE FROM inventory_allocations WHERE reservation_ref <> 'none'");
    await conn.query('DELETE FROM inventory_history WHERE ref IS NOT NULL');
    for (const table of [...CUSTOMER_TABLES].reverse()) await conn.query('DELETE FROM ??', [table]);
    for (const table of CUSTOMER_TABLES) await insertRows(conn, table, rows[table] || []);
    await insertRows(conn, 'inventory_allocations', rows.inventory_allocations);
    await insertRows(conn, 'inventory_history', rows.inventory_history.filter(entry => entry.ref));
    for (const name of ['receipt', 'payment', 'refund']) {
      const counter = rows.counters.find(row => row.name === name);
      await conn.query('INSERT INTO counters (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?', [name, counter.value, counter.value]);
    }
    // A reset is itself a data change, so open admin/customer portals reload their lists.
    await conn.query("INSERT INTO counters (name, value) VALUES ('change', 1) ON DUPLICATE KEY UPDATE value = value + 1");
  });
  console.log(`Customer demo replaced in ${config.db.database}. Backup: ${backupPath}`);
  console.log(`One customer; ${data.reservations.length} bookings, ${data.payments.length} payments, ${data.refunds.length} refunds, ${data.testimonials.length} reviews. Dates count from ${data.seededOn}.`);
  console.log('Admin accounts, catalog, settings, inventory definitions and suppliers preserved. Password: SEED_CUSTOMER_PASSWORD in apps/api/.env.');
}

try { await main(); } catch (err) { console.error(err.message); process.exitCode = 1; }
finally { await closePool(); }
