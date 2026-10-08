// First import on purpose: config.js sets the process time zone (Asia/Manila) before the other modules run
import { config } from './config.js';
import { addedText } from '@tm/shared/src/domain/inventory.js';
import { NO_EVENT } from '@tm/shared/src/domain/outsource.js';
import { DEFAULT_MIN_DOWNPAYMENT } from '@tm/shared/src/services/config.js';
import { closePool, dbErrorHint, pool, tx } from './db.js';
import { toJson } from './lib/json.js';
import { hashSecret } from './lib/passwords.js';
import { seedPasswords } from './seedData/passwords.js';
import { NO_SAMPLE_DATA, loadSampleSeed } from './seedData/sampleLoader.js';
import { buildBusinessSeed } from './seedData/seed.js';

/**
 * Fill the database from the seed data, flattened into the tables of schema.sql. Two modes:
 * - `npm run seed:api` — the demo data: the business data (seedData/seed.js) plus the sample customers
 *   with their reservations, payments, chat, reviews and outsourcing (seedData/sample/), for development
 *   and testing. The sample folder is kept out of GitHub, so this mode works only on a computer that has
 *   it and refuses to run anywhere else, the live server included.
 * - `npm run seed:starter` (--starter) — the fresh start for go-live: only the business data, with no
 *   customers and every inventory piece on the shelf (see starterData()).
 * Either one replaces every row, so it refuses to run when NODE_ENV is production unless --force is
 * given. Run `npm run db:reset` first whenever schema.sql has changed.
 *
 * - Everything happens in one transaction: every table is emptied with DELETE (TRUNCATE would commit
 *   on its own), children first, then the rows go in parents first. Foreign keys stay checked the
 *   whole time, so a sample row that points at a missing record stops the run, and the rollback
 *   leaves the database exactly as it was before.
 * - The passwords come from apps/api/.env, never from the code (Phase 12; the repository is public):
 *   SEED_ADMIN_PASSWORD for the admin account and, for the demo data, SEED_CUSTOMER_PASSWORD for every
 *   sample customer (seedData/passwords.js). A missing or weak one stops the run before anything changes.
 *   They are hashed before the transaction starts, so it stays short, with the API's own hashSecret()
 *   (lib/passwords.js): the accounts get the same bcrypt cost as real sign-ups.
 * - Sample dates count from today in Manila time, so seeding again another day moves them.
 * - Prints the row count of every table and the counters, read back after the commit, and for the
 *   starter data the inventory totals (pieces, in use, damaged).
 */

// Every table in schema.sql, in its CREATE TABLE order: each comes after the tables it points to.
// Rows go in in this order and are deleted in the reverse order. A table missing from this list
// would keep its old rows, so main() stops when the database and this list do not match.
const TABLES = [
  'admins', 'customers', 'packages', 'addons', 'dishes', 'catalog_settings',
  'reservations', 'reservation_addons', 'reservation_activity',
  'payments', 'refunds', 'qr_payments', 'webhook_events',
  'threads', 'messages', 'testimonials',
  'calendar_blocks', 'calendar_settings',
  'inventory_items', 'inventory_allocations', 'inventory_history',
  'reservation_rental_items', 'reservation_damage_charges',
  'outbox',
  'outsource_partners', 'outsource_partner_history', 'outsource_contracts', 'outsource_deliveries', 'outsource_contract_history',
  'counters', 'login_attempts', 'auth_challenges', 'password_resets', 'signup_requests', 'password_changes'
];

// --starter: load the fresh start (starterData()) instead of the demo data
const STARTER = process.argv.includes('--starter');

// The fresh start's first receipt number, OR-1001 (chosen by the owner 2026-10-01)
const FIRST_RECEIPT = 1001;

/**
 * The starter data (--starter): the fresh start the live server opens with, as if the website were
 * going up for the first time. Built from `business` (buildBusinessSeed() in seedData/seed.js) alone:
 * - Loaded: the admin account, the packages, add-ons and dishes, the price per person and minimum
 *   downpayment, the daily capacity, and the 48 inventory items (codes, totals, low-stock levels,
 *   rent prices and damage fees, and the tent sizes that book them).
 * - Inventory: every piece is on the shelf (nothing checked out, nothing damaged), and each item's
 *   history starts with one line dated `now`, the one the app writes when the admin adds an item.
 * - Empty: customers and everything made for them (reservations, payments, refunds, chat, reviews),
 *   blocked dates, and outsourcing partners and contracts; the admin adds the real partners.
 * - Counters start at the beginning (pay-0001, OUT-YYYY-0001, rf-0001), except inventory, so the next
 *   item added is EQ-0049, and receipt, so the first receipt is OR-1001. `receipt` is the NEXT number
 *   here, as in the sample data; toRows() stores the last one used.
 */
function starterData(business, now) {
  const actor = business.admins[0].name;
  return {
    settings: business.settings,
    admins: business.admins,
    customers: [],
    packages: business.packages,
    addons: business.addons,
    dishes: business.dishes,
    reservations: [],
    payments: [],
    refunds: [],
    threads: [],
    testimonials: [],
    calendar: { dailyCapacity: business.dailyCapacity, blocked: [] },
    inventory: business.inventory.items.map((item) => ({ ...item, history: [{ at: now, actor, text: addedText(item.total, item) }] })),
    outsourcing: { partners: [], contracts: [] },
    counters: { receipt: FIRST_RECEIPT, payment: 0, inventory: business.inventory.counter, outsource: 0, refund: 0 }
  };
}

/**
 * The seed as table rows: { table: [row, …] }, each row an object keyed by column name.
 * Tables left out (qr_payments, webhook_events, outbox, login_attempts, auth_challenges,
 * password_resets, signup_requests, password_changes) have no sample data and stay empty. Columns left out take their schema.sql
 * default, e.g. the admin's sign-in history and a delivery's outbox_id.
 * `hashes` maps each account id to its bcrypt hash; `now` stamps the two settings rows.
 */
function toRows(data, hashes, now) {
  const reservations = data.reservations;
  const inventory = data.inventory;
  const { partners, contracts } = data.outsourcing;
  // The seed records no verifier; its one admin verified every verified sample payment
  const verifier = data.admins[0].id;

  return {
    admins: data.admins.map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      mobile: a.mobile || '',
      password_hash: hashes.get(a.id),
      role: a.role,
      created_at: a.createdAt,
      password_changed_at: a.passwordChangedAt ?? null
    })),
    customers: data.customers.map((c) => ({
      id: c.id,
      first_name: c.firstName || '',
      middle_name: c.middleName || '',
      last_name: c.lastName || '',
      name: c.name,
      email: c.email,
      mobile: c.mobile || '',
      password_hash: hashes.get(c.id),
      company: c.company || '',
      created_at: c.createdAt,
      password_changed_at: c.passwordChangedAt ?? null,
      // Sample accounts "made before the terms": each is asked once to accept them at its next visit
      terms_version: c.termsVersion || '',
      terms_accepted_at: c.termsAcceptedAt ?? null
    })),
    // sort_order keeps each catalogue list in the seed's order
    packages: data.packages.map((p, index) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      kind: p.kind || 'package',
      price: p.price,
      guests: p.guests,
      description: p.description,
      items: toJson(p.items),
      mood: p.mood,
      icon: p.icon,
      featured: p.featured,
      visible: p.visible,
      archived: p.archived,
      sort_order: index
    })),
    addons: data.addons.map((a, index) => ({
      id: a.id,
      parent_id: a.parentId ?? null, // a size's or package's charge; the seed lists every charge before them
      name: a.name,
      description: a.description,
      price: a.price ?? null,
      has_quantity: a.hasQuantity,
      has_packages: Boolean(a.hasPackages), // a charge with packages (Sounds and lights)
      archived: a.archived,
      sort_order: index
    })),
    dishes: data.dishes.map((d, index) => ({ id: d.id, category: d.category, name: d.name, archived: d.archived, sort_order: index })),
    catalog_settings: [{ id: 1, price_per_plate: data.settings.pricePerPlate, min_downpayment: data.settings.minDownpayment, updated_at: now }],

    // `venue` is flattened into four columns; fulfilment is NULL for everything but an equipment rental
    reservations: reservations.map((r) => ({
      ref: r.ref,
      customer_id: r.customerId,
      event_name: r.eventName,
      occasion: r.occasion,
      date: r.date,
      start_time: r.startTime,
      end_time: r.endTime || null,
      guests: r.guests,
      package_id: r.packageId,
      service_type: r.serviceType,
      fulfilment: r.fulfilment || null,
      menu: toJson(r.menu),
      food_notes: r.foodNotes || '',
      styling: toJson(r.styling ?? null), // the theme, colours and design details; NULL when none (every rental)
      price_per_plate: r.pricePerPlate ?? 0,
      min_downpayment: r.minDownpayment ?? DEFAULT_MIN_DOWNPAYMENT,
      venue_name: r.venue.name,
      venue_address: r.venue.address,
      city: r.venue.city,
      access_notes: r.venue.accessNotes || '',
      status: r.status,
      estimate: toJson(r.estimate),
      quotation: toJson(r.quotation),
      downpayment_due: r.downpaymentDue || null,
      preparing_at: r.preparingAt ?? null,
      notes: r.notes || '',
      decline_reason: r.declineReason || '',
      cancel_reason: r.cancelReason || '',
      cancelled_by: r.cancelledBy ?? null,
      created_at: r.createdAt,
      terms_version: r.termsVersion || ''
    })),
    // sort_order keeps addonIds in order; qty comes from addonQty (1 when not asked)
    reservation_addons: reservations.flatMap((r) =>
      (r.addonIds || []).map((addonId, index) => ({
        reservation_ref: r.ref,
        addon_id: addonId,
        qty: (r.addonQty && r.addonQty[addonId]) || 1,
        sort_order: index
      }))
    ),
    reservation_activity: reservations.flatMap((r) =>
      r.activity.map((entry) => ({ reservation_ref: r.ref, at: entry.at, actor: entry.actor, text: entry.text }))
    ),

    // receipt_no is NULL until verified (UNIQUE allows many NULLs, but only one ''). The sample bank
    // transfers name a proof file but have none, so proof_key, proof_mime and proof_size stay NULL.
    payments: data.payments.map((p) => ({
      id: p.id,
      ref: p.ref,
      customer_id: p.customerId,
      amount: p.amount,
      kind: p.kind,
      method: p.method,
      reference_no: p.referenceNo || '',
      proof_name: p.proofName || '',
      status: p.status,
      submitted_at: p.submittedAt,
      verified_at: p.verifiedAt ?? null,
      verified_by: p.status === 'verified' && p.method !== 'qrph' ? verifier : null, // PayMongo confirms qrph: no admin
      receipt_no: p.receiptNo || null,
      reject_reason: p.rejectReason || ''
    })),
    // The seed has none today; the admin who recorded one is found by name (a refund record keeps the name the pages show)
    refunds: data.refunds.map((r) => ({
      id: r.id,
      ref: r.ref,
      customer_id: r.customerId,
      kind: r.kind,
      amount: r.amount,
      due: r.due,
      method: r.method || '',
      reference_no: r.referenceNo || '',
      sent_on: r.sentOn,
      reason: r.reason || '',
      recorded_at: r.recordedAt,
      recorded_by: (data.admins.find((a) => a.name === r.recordedBy) || data.admins[0]).id
    })),

    threads: data.threads.map((t) => ({ id: t.id, customer_id: t.customerId })),
    messages: data.threads.flatMap((t) =>
      t.messages.map((m) => ({
        id: m.id,
        thread_id: t.id,
        from_side: m.from,
        sender_name: m.senderName,
        body: m.body,
        ref: m.ref || null,
        at: m.at,
        read_by_customer: m.readByCustomer,
        read_by_admin: m.readByAdmin,
        attachment: toJson(m.attachment)
      }))
    ),
    // `categories` and `reply` are flattened; the three reply columns are NULL when there is no reply
    testimonials: data.testimonials.map((t) => ({
      id: t.id,
      customer_id: t.customerId,
      ref: t.ref,
      rating: t.rating,
      cat_food: t.categories.food,
      cat_service: t.categories.service,
      cat_punctuality: t.categories.punctuality,
      cat_setup: t.categories.setup,
      body: t.body,
      created_at: t.createdAt,
      status: t.status,
      featured: t.featured,
      flagged: t.flagged,
      flag_reason: t.flagReason || '',
      archived: t.archived,
      read_by_admin: t.readByAdmin,
      reply_body: t.reply ? t.reply.body : null,
      reply_at: t.reply ? t.reply.at : null,
      reply_by: t.reply ? t.reply.by : null
    })),

    calendar_blocks: data.calendar.blocked.map((b) => ({ date: b.date, reason: b.reason, note: b.note || '' })),
    calendar_settings: [{ id: 1, daily_capacity: data.calendar.dailyCapacity, updated_at: now }],

    inventory_items: inventory.map((i) => ({
      id: i.id,
      code: i.code,
      name: i.name,
      category: i.category,
      total: i.total,
      low_stock_at: i.lowStockAt,
      damaged: i.damaged,
      rentable: i.rentable,
      rent_price: i.rentPrice,
      damage_fee: i.damageFee,
      notes: i.notes || '',
      archived: i.archived,
      addon_id: i.addonId ?? null // the Tent size that books it (addons come before inventory_items)
    })),
    // One row per entry of the item's allocations object: { reservation ref or 'none': qty }
    inventory_allocations: inventory.flatMap((i) =>
      Object.entries(i.allocations).map(([ref, qty]) => ({ item_id: i.id, reservation_ref: ref, qty }))
    ),
    inventory_history: inventory.flatMap((i) =>
      i.history.map((entry) => ({ item_id: i.id, at: entry.at, actor: entry.actor, text: entry.text, ref: entry.ref || null }))
    ),
    // An equipment rental's lines (sort_order keeps rentalItems in order) and its damage charges
    reservation_rental_items: reservations.flatMap((r) =>
      (r.rentalItems || []).map((line, index) => ({
        reservation_ref: r.ref,
        item_id: line.itemId,
        name: line.name,
        qty: line.qty,
        price: line.price,
        damage_fee: line.damageFee,
        sort_order: index
      }))
    ),
    reservation_damage_charges: reservations.flatMap((r) =>
      (r.damageCharges || []).map((line) => ({ reservation_ref: r.ref, item_id: line.itemId, name: line.name, qty: line.qty, fee: line.fee }))
    ),

    outsource_partners: partners.map((p) => ({
      id: p.id,
      name: p.name,
      service: p.service,
      contact_person: p.contactPerson || '',
      email: p.email || '',
      mobile: p.mobile || '',
      address: p.address || '',
      notes: p.notes || '',
      archived: p.archived
    })),
    outsource_partner_history: partners.flatMap((p) =>
      p.history.map((entry) => ({ partner_id: p.id, at: entry.at, actor: entry.actor, text: entry.text }))
    ),
    outsource_contracts: contracts.map((c) => ({
      id: c.id,
      ref: c.ref,
      partner_id: c.partnerId,
      reservation_ref: c.reservationRef || NO_EVENT,
      items: toJson(c.items),
      need_by: c.needBy,
      amount: c.amount,
      notes: c.notes || '',
      status: c.status,
      body: c.body || '',
      created_at: c.createdAt,
      sent_at: c.sentAt ?? null,
      answered_at: c.answeredAt ?? null,
      answer_note: c.answerNote || ''
    })),
    // Sample deliveries were never really sent, so they have no outbox row (outbox_id stays NULL)
    outsource_deliveries: contracts.flatMap((c) =>
      c.deliveries.map((d) => ({ contract_id: c.id, channel: d.channel, to_address: d.to, at: d.at, body: d.body }))
    ),
    outsource_contract_history: contracts.flatMap((c) =>
      c.history.map((entry) => ({ contract_id: c.id, at: entry.at, actor: entry.actor, text: entry.text }))
    ),

    // The seed's `receipt` is the NEXT number and the table keeps the LAST one used (§7.6).
    counters: [
      { name: 'receipt', value: data.counters.receipt - 1 },
      { name: 'payment', value: data.counters.payment },
      { name: 'inventory', value: data.counters.inventory },
      { name: 'outsource', value: data.counters.outsource },
      { name: 'refund', value: data.counters.refund ?? 0 }
    ]
  };
}

/**
 * Insert all of a table's rows in one statement. The columns come from the first row, and every
 * row must have exactly those keys: a key missing from one row would otherwise go in as NULL
 * without a word.
 */
async function insertRows(conn, table, rows) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const values = rows.map((row, index) => {
    const keys = Object.keys(row);
    if (keys.length !== columns.length || !keys.every((key) => columns.includes(key))) {
      throw new Error(`Seeder bug: row ${index} of ${table} has columns ${keys.join(', ')} instead of ${columns.join(', ')}.`);
    }
    return columns.map((column) => row[column]);
  });
  await conn.query('INSERT INTO ?? (??) VALUES ?', [table, columns, values]);
}

/**
 * Compare the database's tables with TABLES. Returns what is wrong in plain words, or null when
 * the two match: a table missing from the database means schema.sql has not been run yet (or is
 * newer than the database); an extra one means TABLES was not updated after schema.sql changed.
 */
async function schemaProblem() {
  const [rows] = await pool.query('SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()');
  const inDatabase = rows.map((row) => row.name);
  const missing = TABLES.filter((table) => !inDatabase.includes(table));
  const unknown = inDatabase.filter((table) => !TABLES.includes(table));
  if (missing.length) {
    return `The database is missing ${missing.length} table(s): ${missing.join(', ')}. Run npm run db:reset first, then seed again.`;
  }
  if (unknown.length) {
    return `The seeder does not know these tables: ${unknown.join(', ')}. Add them to TABLES in apps/api/src/seed.js (in schema.sql order).`;
  }
  return null;
}

/**
 * Run the seed: the demo data, or the starter data with --starter (the fresh start for go-live).
 * Returns the exit code: 0 when every row went in, 1 when nothing changed (also when the demo data is
 * asked for on a computer without seedData/sample/).
 */
async function main() {
  const what = STARTER ? 'the starter data: no customers, every inventory piece available' : 'the sample data';
  if (config.isProduction && !process.argv.includes('--force')) {
    console.error(`Refusing to seed: NODE_ENV is production and this replaces every row with ${what}. Add --force only if that is really what you want.`);
    return 1;
  }
  // The demo data needs the sample folder, which is only on the developer's computer
  const buildSample = STARTER ? null : await loadSampleSeed();
  if (!STARTER && !buildSample) {
    console.error(`Refusing to seed: ${NO_SAMPLE_DATA}`);
    return 1;
  }
  // The accounts' passwords, from apps/api/.env (checked before anything changes)
  const passwords = seedPasswords({ customers: !STARTER });
  if (passwords.problems.length) {
    console.error(`Refusing to seed:\n- ${passwords.problems.join('\n- ')}`);
    return 1;
  }

  const { host, port, user, database } = config.db;
  console.log(`Seeding database "${database}" on ${host}:${port} as ${user} (every row is replaced with ${what})...`);

  try {
    const problem = await schemaProblem();
    if (problem) {
      console.error(`Seed failed: ${problem}`);
      return 1;
    }

    const now = Date.now();
    const business = buildBusinessSeed();
    const data = STARTER ? starterData(business, now) : buildSample(business);
    // Every admin gets SEED_ADMIN_PASSWORD and every sample customer SEED_CUSTOMER_PASSWORD, each with its own salt
    const accounts = [...data.admins.map((a) => [a.id, passwords.admin]), ...data.customers.map((c) => [c.id, passwords.customer])];
    const hashes = new Map(await Promise.all(accounts.map(async ([id, password]) => [id, await hashSecret(password)])));
    const rows = toRows(data, hashes, now);

    await tx(async (conn) => {
      // A size points at its charge in the same table (addons.parent_id), so sizes are deleted first
      for (const table of [...TABLES].reverse()) await conn.query(table === 'addons' ? 'DELETE FROM addons ORDER BY parent_id IS NULL' : 'DELETE FROM ??', [table]);
      for (const table of TABLES) await insertRows(conn, table, rows[table] || []);
    });

    // Read back after the commit: what is really in the database now
    const counts = [];
    for (const table of TABLES) {
      const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM ??', [table]);
      counts.push([table, total]);
    }
    const [counterRows] = await pool.query('SELECT name, value FROM counters ORDER BY name');
    const counter = Object.fromEntries(counterRows.map((row) => [row.name, row.value]));

    const width = Math.max(...TABLES.map((table) => table.length));
    console.log('Done. Rows per table:');
    counts.forEach(([table, total]) => console.log(`  ${table.padEnd(width)}  ${total}`));
    console.log(`Counters (last number used): receipt ${counter.receipt} (next OR-${counter.receipt + 1}) · payment ${counter.payment} · inventory ${counter.inventory} · outsource ${counter.outsource} · refund ${counter.refund}`);
    if (STARTER) {
      const [[stock]] = await pool.query('SELECT COUNT(*) AS items, COALESCE(SUM(total), 0) AS pcs, COALESCE(SUM(damaged), 0) AS damaged FROM inventory_items');
      const [[out]] = await pool.query('SELECT COALESCE(SUM(qty), 0) AS pcs FROM inventory_allocations');
      console.log(`Fresh start: ${stock.items} inventory items, ${Number(stock.pcs).toLocaleString('en-PH')} pcs (${Number(out.pcs)} in use, ${Number(stock.damaged)} damaged). The first customer to sign up starts the records.`);
    } else {
      console.log(`Sample dates count from ${data.seededOn}; seed again on another day to move them.`);
    }
    return 0;
  } catch (err) {
    console.error(`Seed failed: ${err.message}`);
    const hint =
      dbErrorHint(err) ||
      (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(err.code) ? 'The database is older than schema.sql: run npm run db:reset first, then seed again.' : null);
    if (hint) console.error(hint);
    return 1;
  } finally {
    await closePool().catch(() => {});
  }
}

process.exitCode = await main();
