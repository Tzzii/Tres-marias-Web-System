import { config } from './config.js';
import { pathToFileURL } from 'node:url';
import { addedText } from '@tm/shared/src/domain/inventory.js';
import { NO_EVENT } from '@tm/shared/src/domain/outsource.js';
import { DEFAULT_MIN_DOWNPAYMENT } from '@tm/shared/src/services/config.js';
import { closePool, dbErrorHint, pool, tx } from './db.js';
import { toJson } from './lib/json.js';
import { hashSecret } from './lib/passwords.js';
import { seedAdminEmail, seedPasswords } from './seedData/passwords.js';
import { NO_SAMPLE_DATA, loadSampleSeed } from './seedData/sampleLoader.js';
import { buildBusinessSeed } from './seedData/seed.js';
import { prepareSampleProofs } from './seedData/proofs.js';

export const TABLES = [
  'admins',
  'customers',
  'packages',
  'addons',
  'dishes',
  'catalog_settings',
  'reservations',
  'reservation_addons',
  'reservation_activity',
  'payments',
  'refunds',
  'qr_payments',
  'webhook_events',
  'threads',
  'messages',
  'testimonials',
  'calendar_blocks',
  'calendar_settings',
  'inventory_items',
  'inventory_allocations',
  'rental_dispatches',
  'inventory_history',
  'reservation_rental_items',
  'reservation_damage_charges',
  'outbox',
  'outsource_partners',
  'outsource_partner_history',
  'outsource_contracts',
  'outsource_deliveries',
  'outsource_contract_history',
  'counters',
  'login_attempts',
  'auth_challenges',
  'password_resets',
  'signup_requests',
  'password_changes',
  'customer_email_changes'
];

const STARTER = process.argv.includes('--starter');

const FIRST_RECEIPT = 1001;

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
    inventory: business.inventory.items.map((item) => ({
      ...item,
      history: [{ at: now, actor, text: addedText(item.total, item) }]
    })),
    outsourcing: { partners: [], contracts: [] },
    counters: { receipt: FIRST_RECEIPT, payment: 0, inventory: business.inventory.counter, outsource: 0, refund: 0 }
  };
}

export function toRows(data, hashes, now) {
  const reservations = data.reservations;
  const inventory = data.inventory;
  const { partners, contracts } = data.outsourcing;
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
      terms_version: c.termsVersion || '',
      terms_accepted_at: c.termsAcceptedAt ?? null
    })),
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
      parent_id: a.parentId ?? null,
      name: a.name,
      description: a.description,
      price: a.price ?? null,
      has_quantity: a.hasQuantity,
      has_packages: Boolean(a.hasPackages),
      archived: a.archived,
      sort_order: index
    })),
    dishes: data.dishes.map((d, index) => ({
      id: d.id,
      category: d.category,
      name: d.name,
      archived: d.archived,
      sort_order: index
    })),
    catalog_settings: [
      {
        id: 1,
        price_per_plate: data.settings.pricePerPlate,
        min_downpayment: data.settings.minDownpayment,
        six_hour_fee: data.settings.sixHourFee,
        updated_at: now
      }
    ],

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
      styling: toJson(r.styling ?? null),
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

    payments: data.payments.map((p) => ({
      id: p.id,
      ref: p.ref,
      customer_id: p.customerId,
      amount: p.amount,
      kind: p.kind,
      method: p.method,
      reference_no: p.referenceNo || '',
      proof_name: p.proofName || '',
      proof_key: p.proofKey ?? null,
      proof_mime: p.proofMime ?? null,
      proof_size: p.proofSize ?? null,
      status: p.status,
      submitted_at: p.submittedAt,
      verified_at: p.verifiedAt ?? null,
      verified_by: p.status === 'verified' && p.method !== 'qrph' ? verifier : null,
      receipt_no: p.receiptNo || null,
      reject_reason: p.rejectReason || ''
    })),
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
        attachment: toJson(m.attachment),
        typed: Boolean(m.typed),
        edited_at: m.editedAt ?? null,
        deleted_at: m.deletedAt ?? null,
        history: toJson(m.history || [])
      }))
    ),
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
      addon_id: i.addonId ?? null
    })),
    rental_dispatches: reservations.flatMap((r) =>
      Object.entries(r.rentalDispatches || {}).map(([itemId, qty]) => ({
        reservation_ref: r.ref,
        item_id: itemId,
        qty,
        dispatched_at: r.dispatchedAt
      }))
    ),
    inventory_allocations: inventory.flatMap((i) =>
      Object.entries(i.allocations).map(([ref, qty]) => ({ item_id: i.id, reservation_ref: ref, qty }))
    ),
    inventory_history: inventory.flatMap((i) =>
      i.history.map((entry) => ({
        item_id: i.id,
        at: entry.at,
        actor: entry.actor,
        text: entry.text,
        ref: entry.ref || null
      }))
    ),
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
      (r.damageCharges || []).map((line) => ({
        reservation_ref: r.ref,
        item_id: line.itemId,
        name: line.name,
        qty: line.qty,
        fee: line.fee
      }))
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
    outsource_deliveries: contracts.flatMap((c) =>
      c.deliveries.map((d) => ({ contract_id: c.id, channel: d.channel, to_address: d.to, at: d.at, body: d.body }))
    ),
    outsource_contract_history: contracts.flatMap((c) =>
      c.history.map((entry) => ({ contract_id: c.id, at: entry.at, actor: entry.actor, text: entry.text }))
    ),

    counters: [
      { name: 'receipt', value: data.counters.receipt - 1 },
      { name: 'payment', value: data.counters.payment },
      { name: 'inventory', value: data.counters.inventory },
      { name: 'outsource', value: data.counters.outsource },
      { name: 'refund', value: data.counters.refund ?? 0 }
    ]
  };
}

export async function insertRows(conn, table, rows) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const values = rows.map((row, index) => {
    const keys = Object.keys(row);
    if (keys.length !== columns.length || !keys.every((key) => columns.includes(key))) {
      throw new Error(
        `Seeder bug: row ${index} of ${table} has columns ${keys.join(', ')} instead of ${columns.join(', ')}.`
      );
    }
    return columns.map((column) => row[column]);
  });
  await conn.query('INSERT INTO ?? (??) VALUES ?', [table, columns, values]);
}

async function schemaProblem() {
  const [rows] = await pool.query(
    'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()'
  );
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

async function main() {
  const what = STARTER ? 'the starter data: no customers, every inventory piece available' : 'the sample data';
  if (config.isProduction && !process.argv.includes('--force')) {
    console.error(
      `Refusing to seed: NODE_ENV is production and this replaces every row with ${what}. Add --force only if that is really what you want.`
    );
    return 1;
  }
  const buildSample = STARTER ? null : await loadSampleSeed();
  if (!STARTER && !buildSample) {
    console.error(`Refusing to seed: ${NO_SAMPLE_DATA}`);
    return 1;
  }
  const passwords = seedPasswords({ customers: !STARTER });
  const adminEmail = seedAdminEmail();
  const problems = [...passwords.problems, adminEmail.problem].filter(Boolean);
  if (problems.length) {
    console.error(`Refusing to seed:\n- ${problems.join('\n- ')}`);
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
    if (adminEmail.email) {
      business.admins[0].email = adminEmail.email;
      console.log(`The admin account (${business.admins[0].name}) signs in with SEED_ADMIN_EMAIL from apps/api/.env.`);
    }
    const data = STARTER ? starterData(business, now) : buildSample(business);
    const accounts = [
      ...data.admins.map((a) => [a.id, passwords.admin]),
      ...data.customers.map((c) => [c.id, passwords.customer])
    ];
    const hashes = new Map(await Promise.all(accounts.map(async ([id, password]) => [id, await hashSecret(password)])));
    const rows = toRows(data, hashes, now);
    if (!STARTER) await prepareSampleProofs(rows);

    await tx(async (conn) => {
      for (const table of [...TABLES].reverse())
        await conn.query(table === 'addons' ? 'DELETE FROM addons ORDER BY parent_id IS NULL' : 'DELETE FROM ??', [
          table
        ]);
      for (const table of TABLES) await insertRows(conn, table, rows[table] || []);
    });

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
    console.log(
      `Counters (last number used): receipt ${counter.receipt} (next OR-${counter.receipt + 1}) · payment ${counter.payment} · inventory ${counter.inventory} · outsource ${counter.outsource} · refund ${counter.refund}`
    );
    if (STARTER) {
      const [[stock]] = await pool.query(
        'SELECT COUNT(*) AS items, COALESCE(SUM(total), 0) AS pcs, COALESCE(SUM(damaged), 0) AS damaged FROM inventory_items'
      );
      const [[out]] = await pool.query('SELECT COALESCE(SUM(qty), 0) AS pcs FROM inventory_allocations');
      console.log(
        `Fresh start: ${stock.items} inventory items, ${Number(stock.pcs).toLocaleString('en-PH')} pcs (${Number(out.pcs)} in use, ${Number(stock.damaged)} damaged). The first customer to sign up starts the records.`
      );
    } else {
      console.log(`Sample dates count from ${data.seededOn}; seed again on another day to move them.`);
    }
    return 0;
  } catch (err) {
    console.error(`Seed failed: ${err.message}`);
    const hint =
      dbErrorHint(err) ||
      (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(err.code)
        ? 'The database is older than schema.sql: run npm run db:reset first, then seed again.'
        : null);
    if (hint) console.error(hint);
    return 1;
  } finally {
    await closePool().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
