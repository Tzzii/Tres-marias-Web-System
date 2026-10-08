// config.js first: it fixes the time zone (Asia/Manila) before the seed works out its dates
import { config } from '../src/config.js';
import bcrypt from 'bcrypt';
import { closePool, dbErrorHint, pool } from '../src/db.js';
import { parseJson } from '../src/lib/json.js';
import { seedPasswords } from '../src/seedData/passwords.js';
import { NO_SAMPLE_DATA, loadSampleSeed } from '../src/seedData/sampleLoader.js';
import { buildBusinessSeed } from '../src/seedData/seed.js';

/**
 * `npm run db:roundtrip` — run right after `npm run seed:api`, on the same day. Reads every table back,
 * rebuilds each collection in the record shape of the sample data (buildSampleSeed() in
 * src/seedData/sample/sample.js, on top of buildBusinessSeed() in src/seedData/seed.js) and deep-compares
 * it with a fresh build of that data. Exits with 1 on any difference and lists them, and also when this
 * computer has no seedData/sample/ (kept out of GitHub).
 *
 * It is also the tested reference for reading records out of the database (database -> record), which the
 * module repos need from Phase 6 on: e.g. a reservation's `venue` object from four columns, `addonIds` in
 * sort_order, `addonQty` only for add-ons counted by the piece, and `rentalItems` / `fulfilment` /
 * `damageCharges` only on an equipment rental.
 *
 * Allowed differences: receiptNo '' against NULL, counters.receipt minus one (stored as the last number
 * used), seededOn, JSON key order, messages in time order, and message ids (random in the seed, so they are
 * left out). Passwords are not in the seed records (Phase 12): each account's hash is checked against
 * SEED_ADMIN_PASSWORD or SEED_CUSTOMER_PASSWORD from apps/api/.env instead. Anything done in the app after
 * seeding (a sign-in, a booking) and a seed made on another day also show up as differences.
 *
 * Read-only, apart from one emoji message written inside a transaction and rolled back.
 * First written for the Phase 2 check (2026-09-24), copied here for Phase 6.
 */

const problems = []; // differences that fail the check
const notes = []; // worth knowing, not a failure
const fail = (msg) => problems.push(msg);
const q = async (sql, params = []) => (await pool.query(sql, params))[0];
// BOOLEAN columns come back as 0/1
const bool = (v) => {
  if (v !== 0 && v !== 1) fail(`boolean column holds ${JSON.stringify(v)}`);
  return v === 1;
};

// Deep compare: object key order ignored, arrays by index, primitives with ===
function diff(a, b, path, out) {
  if (a === b) return;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return out.push(`${path}: array vs ${JSON.stringify(b)?.slice(0, 80)}`);
    if (a.length !== b.length) out.push(`${path}: length ${a.length} (db) vs ${b.length} (seed)`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) diff(a[i], b[i], `${path}[${i}]`, out);
    return;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (!(k in a)) out.push(`${path}.${k}: missing in db (seed ${JSON.stringify(b[k])?.slice(0, 80)})`);
      else if (!(k in b)) out.push(`${path}.${k}: extra in db (${JSON.stringify(a[k])?.slice(0, 80)})`);
      else diff(a[k], b[k], `${path}.${k}`, out);
    }
    return;
  }
  out.push(`${path}: db ${JSON.stringify(a)?.slice(0, 120)} vs seed ${JSON.stringify(b)?.slice(0, 120)}`);
}
const compare = (label, db, seed) => {
  const out = [];
  diff(db, seed, label, out);
  out.forEach(fail);
  return out.length;
};
// Compare two lists of records keyed by `key` (their order is not stored for these collections)
const compareKeyed = (label, dbList, seedList, key) => {
  const dbMap = new Map(dbList.map((r) => [r[key], r]));
  const seedMap = new Map(seedList.map((r) => [r[key], r]));
  if (dbMap.size !== dbList.length) fail(`${label}: duplicate ${key} in db`);
  let n = 0;
  for (const k of new Set([...dbMap.keys(), ...seedMap.keys()])) {
    if (!dbMap.has(k)) fail(`${label}[${k}]: missing in db`);
    else if (!seedMap.has(k)) fail(`${label}[${k}]: extra in db`);
    else n += compare(`${label}[${k}]`, dbMap.get(k), seedMap.get(k));
  }
  return n;
};
// Rows grouped by one column, e.g. activity lines by reservation_ref
const group = (rows, key) => {
  const m = new Map();
  rows.forEach((r) => {
    if (!m.has(r[key])) m.set(r[key], []);
    m.get(r[key]).push(r);
  });
  return m;
};

async function check() {
  const buildSample = await loadSampleSeed();
  if (!buildSample) {
    console.error(NO_SAMPLE_DATA);
    return 1;
  }
  const seed = buildSample(buildBusinessSeed());
  console.log(`DB ${config.db.database} on ${config.db.host}:${config.db.port}; fresh sample data dated ${seed.seededOn}, TZ ${process.env.TZ}`);

  // ---- accounts (each password hash checked with bcrypt against the seed passwords in .env) ----
  const passwords = seedPasswords({ customers: true });
  passwords.problems.forEach(fail);
  const adminRows = await q('SELECT * FROM admins ORDER BY id');
  const admins = [];
  for (const a of adminRows) {
    const s = seed.admins.find((x) => x.id === a.id);
    const ok = s && (await bcrypt.compare(passwords.admin, a.password_hash));
    const wrong = s && (await bcrypt.compare(passwords.admin + 'x', a.password_hash));
    if (!ok || wrong) fail(`admins[${a.id}]: bcrypt check failed (right ${ok}, wrong accepted ${wrong})`);
    if (!/^\$2[aby]\$10\$/.test(a.password_hash)) fail(`admins[${a.id}]: hash is not bcrypt cost 10`);
    const r = { id: a.id, name: a.name, email: a.email, mobile: a.mobile, role: a.role, createdAt: a.created_at };
    if (a.password_changed_at !== null) r.passwordChangedAt = a.password_changed_at;
    if (a.last_sign_in_at !== null) r.lastSignInAt = a.last_sign_in_at;
    if (a.last_sign_in_device !== '') r.lastSignInDevice = a.last_sign_in_device;
    if (a.previous_sign_in_at !== null) r.previousSignInAt = a.previous_sign_in_at;
    if (a.failed_attempts !== 0) r.failedAttempts = a.failed_attempts;
    if (a.failed_since_last_sign_in !== 0) r.failedSinceLastSignIn = a.failed_since_last_sign_in;
    admins.push(r);
  }
  compareKeyed('admins', admins, seed.admins, 'id');

  const customerRows = await q('SELECT * FROM customers ORDER BY id');
  const customers = [];
  for (const c of customerRows) {
    const s = seed.customers.find((x) => x.id === c.id);
    const ok = s && (await bcrypt.compare(passwords.customer, c.password_hash));
    if (!ok) fail(`customers[${c.id}]: bcrypt check failed`);
    const r = { id: c.id, name: c.name, email: c.email, mobile: c.mobile, createdAt: c.created_at, company: c.company };
    if (c.first_name) r.firstName = c.first_name;
    if (c.middle_name) r.middleName = c.middle_name;
    if (c.last_name) r.lastName = c.last_name;
    if (c.password_changed_at !== null) r.passwordChangedAt = c.password_changed_at;
    // The Terms version agreed to: none on the sample accounts, so only a set one is compared
    if (c.terms_version) r.termsVersion = c.terms_version;
    if (c.terms_accepted_at !== null) r.termsAcceptedAt = c.terms_accepted_at;
    customers.push(r);
  }
  compareKeyed('customers', customers, seed.customers, 'id');

  // ---- catalogue (ordered by sort_order: the order the pages show) ----
  const packages = (await q('SELECT * FROM packages ORDER BY sort_order, id')).map((p) => ({
    id: p.id, slug: p.slug, name: p.name, kind: p.kind, price: p.price, guests: p.guests, description: p.description,
    items: parseJson(p.items), mood: p.mood, icon: p.icon, featured: bool(p.featured), visible: bool(p.visible), archived: bool(p.archived)
  }));
  compare('packages', packages, seed.packages);
  const addonRows = await q('SELECT * FROM addons ORDER BY sort_order, id');
  const addons = addonRows.map((a) => ({
    id: a.id, parentId: a.parent_id, name: a.name, description: a.description, price: a.price,
    hasQuantity: bool(a.has_quantity), hasPackages: bool(a.has_packages), archived: bool(a.archived)
  }));
  compare('addons', addons, seed.addons);
  const dishes = (await q('SELECT * FROM dishes ORDER BY sort_order, id')).map((d) => ({ id: d.id, category: d.category, name: d.name, archived: bool(d.archived) }));
  compare('dishes', dishes, seed.dishes);
  const hasQty = new Set(addonRows.filter((a) => a.has_quantity).map((a) => a.id));

  // ---- reservations with their child rows (the database -> record mapping for reservations.repo.js) ----
  const addonLinks = group(await q('SELECT * FROM reservation_addons ORDER BY reservation_ref, sort_order'), 'reservation_ref');
  const activityById = group(await q('SELECT * FROM reservation_activity ORDER BY id'), 'reservation_ref');
  const activityByAt = group(await q('SELECT * FROM reservation_activity ORDER BY at, id'), 'reservation_ref');
  const rentalLines = group(await q('SELECT * FROM reservation_rental_items ORDER BY reservation_ref, sort_order'), 'reservation_ref');
  // No sort_order on damage lines: they come back by item id (one line per item and booking)
  const damageLines = group(await q('SELECT * FROM reservation_damage_charges ORDER BY reservation_ref, item_id'), 'reservation_ref');
  const reservations = (await q('SELECT * FROM reservations')).map((r) => {
    const links = addonLinks.get(r.ref) || [];
    links.forEach((l, i) => l.sort_order !== i && fail(`reservation_addons ${r.ref}: sort_order gap`));
    const acts = activityById.get(r.ref) || [];
    const actsAt = activityByAt.get(r.ref) || [];
    if (acts.map((a) => a.id).join() !== actsAt.map((a) => a.id).join()) notes.push(`${r.ref}: activity insertion order is not chronological`);
    const out = {
      ref: r.ref, customerId: r.customer_id, eventName: r.event_name, occasion: r.occasion, date: r.date, startTime: r.start_time,
      endTime: r.end_time,
      guests: r.guests, packageId: r.package_id, serviceType: r.service_type, menu: parseJson(r.menu), foodNotes: r.food_notes,
      pricePerPlate: r.price_per_plate, minDownpayment: r.min_downpayment,
      venue: { name: r.venue_name, address: r.venue_address, city: r.city, accessNotes: r.access_notes },
      addonIds: links.map((l) => l.addon_id),
      // Only add-ons counted by the piece carry a quantity in the record; the others are stored as 1
      addonQty: Object.fromEntries(links.filter((l) => hasQty.has(l.addon_id)).map((l) => [l.addon_id, l.qty])),
      status: r.status, estimate: parseJson(r.estimate), quotation: parseJson(r.quotation), downpaymentDue: r.downpayment_due,
      preparingAt: r.preparing_at,
      notes: r.notes, declineReason: r.decline_reason, cancelReason: r.cancel_reason, cancelledBy: r.cancelled_by,
      activity: acts.map((a) => ({ at: a.at, actor: a.actor, text: a.text })), createdAt: r.created_at
    };
    // The Terms version agreed to when booking: none on the sample bookings, so only a set one is compared
    if (r.terms_version) out.termsVersion = r.terms_version;
    links.filter((l) => !hasQty.has(l.addon_id)).forEach((l) => l.qty !== 1 && fail(`${r.ref}: qty ${l.qty} on an add-on without hasQuantity`));
    // The rental fields exist on an equipment rental only (not even empty on other bookings)
    if (r.service_type === 'Equipment rental') {
      out.rentalItems = (rentalLines.get(r.ref) || []).map((l) => ({ itemId: l.item_id, name: l.name, qty: l.qty, price: l.price, damageFee: l.damage_fee }));
      out.fulfilment = r.fulfilment;
      out.damageCharges = (damageLines.get(r.ref) || []).map((l) => ({ itemId: l.item_id, name: l.name, qty: l.qty, fee: l.fee }));
    } else if (r.fulfilment !== null || rentalLines.has(r.ref) || damageLines.has(r.ref)) {
      fail(`${r.ref}: rental data on a non-rental`);
    }
    return out;
  });
  compareKeyed('reservations', reservations, seed.reservations, 'ref');

  // ---- payments ----
  const payments = (await q('SELECT * FROM payments')).map((p) => {
    if (p.proof_key !== null || p.proof_mime !== null || p.proof_size !== null) fail(`payments[${p.id}]: proof file columns should be NULL`);
    // PayMongo confirms a GCash QR payment ('qrph'), so it has no admin; the admin verified every other verified one
    const verifier = p.status === 'verified' && p.method !== 'qrph' ? 'adm-001' : null;
    if (p.verified_by !== verifier) fail(`payments[${p.id}]: verified_by ${p.verified_by} for ${p.method} ${p.status}`);
    if (p.receipt_no === '') fail(`payments[${p.id}]: receipt_no stored as ''`);
    return {
      id: p.id, ref: p.ref, customerId: p.customer_id, amount: p.amount, kind: p.kind, method: p.method, referenceNo: p.reference_no,
      proofName: p.proof_name, status: p.status, submittedAt: p.submitted_at, verifiedAt: p.verified_at, receiptNo: p.receipt_no ?? '', rejectReason: p.reject_reason
    };
  });
  compareKeyed('payments', payments, seed.payments, 'id');

  // ---- refunds (the admin's id comes back as the name, like the API's answers) ----
  const refunds = await q('SELECT f.*, a.name AS admin_name FROM refunds f JOIN admins a ON a.id = f.recorded_by').then((rows) => rows.map((f) => ({
    id: f.id, ref: f.ref, customerId: f.customer_id, kind: f.kind, amount: f.amount, due: f.due, method: f.method, referenceNo: f.reference_no,
    sentOn: f.sent_on, reason: f.reason, recordedAt: f.recorded_at, recordedBy: f.admin_name
  })));
  compareKeyed('refunds', refunds, seed.refunds, 'id');

  // ---- chat (messages come back in time order; ids left out, see above) ----
  const withoutId = ({ id, ...message }) => message; // eslint-disable-line no-unused-vars
  const msgRows = group(await q('SELECT * FROM messages ORDER BY thread_id, at, id'), 'thread_id');
  const threads = (await q('SELECT * FROM threads ORDER BY id')).map((t) => ({
    id: t.id, customerId: t.customer_id,
    messages: (msgRows.get(t.id) || []).map((m) => ({
      from: m.from_side, senderName: m.sender_name, body: m.body, ref: m.ref, at: m.at,
      readByCustomer: bool(m.read_by_customer), readByAdmin: bool(m.read_by_admin), attachment: parseJson(m.attachment)
    }))
  }));
  // The seed's arrays sorted by `at` (stable), the way the database returns them
  const seedThreadsSorted = seed.threads.map((t) => ({ ...t, messages: [...t.messages].sort((a, b) => a.at - b.at) }));
  seed.threads.forEach((t, i) => {
    if (t.messages.some((m, n) => m !== seedThreadsSorted[i].messages[n])) notes.push(`seed thread ${t.id} (${t.customerId}): its messages array is NOT in time order; the database returns it in time order`);
  });
  compareKeyed('threads', threads, seedThreadsSorted.map((t) => ({ ...t, messages: t.messages.map(withoutId) })), 'id');

  // ---- feedback ----
  const testimonials = (await q('SELECT * FROM testimonials')).map((t) => ({
    id: t.id, customerId: t.customer_id, ref: t.ref, rating: t.rating,
    categories: { food: t.cat_food, service: t.cat_service, punctuality: t.cat_punctuality, setup: t.cat_setup },
    body: t.body, createdAt: t.created_at, status: t.status, featured: bool(t.featured), flagged: bool(t.flagged), flagReason: t.flag_reason,
    archived: bool(t.archived), readByAdmin: bool(t.read_by_admin), reply: t.reply_body === null ? null : { body: t.reply_body, at: t.reply_at, by: t.reply_by }
  }));
  compareKeyed('testimonials', testimonials, seed.testimonials, 'id');

  // ---- calendar and settings (always exactly one row each) ----
  const [calSettings] = await q('SELECT * FROM calendar_settings');
  const [catSettings] = await q('SELECT * FROM catalog_settings');
  const settingsRows = [(await q('SELECT COUNT(*) AS n FROM calendar_settings'))[0].n, (await q('SELECT COUNT(*) AS n FROM catalog_settings'))[0].n];
  if (settingsRows.join() !== '1,1' || calSettings.id !== 1 || catSettings.id !== 1) fail(`settings rows: ${settingsRows}`);
  const ageMin = (ms) => ((Date.now() - ms) / 60000).toFixed(1);
  compare('calendar', { dailyCapacity: calSettings.daily_capacity, blocked: (await q('SELECT * FROM calendar_blocks ORDER BY date')).map((b) => ({ date: b.date, reason: b.reason, note: b.note })) }, seed.calendar);
  compare('settings', { pricePerPlate: catSettings.price_per_plate, minDownpayment: catSettings.min_downpayment }, seed.settings);

  // ---- inventory ----
  const allocs = group(await q('SELECT * FROM inventory_allocations'), 'item_id');
  const invHistory = group(await q('SELECT * FROM inventory_history ORDER BY id'), 'item_id');
  const inventory = (await q('SELECT * FROM inventory_items')).map((i) => ({
    id: i.id, code: i.code, name: i.name, category: i.category, total: i.total, lowStockAt: i.low_stock_at,
    allocations: Object.fromEntries((allocs.get(i.id) || []).map((a) => [a.reservation_ref, a.qty])),
    damaged: i.damaged, rentable: bool(i.rentable), rentPrice: i.rent_price, damageFee: i.damage_fee, notes: i.notes, archived: bool(i.archived), addonId: i.addon_id,
    history: (invHistory.get(i.id) || []).map((h) => ({ at: h.at, actor: h.actor, text: h.text, ...(h.ref === null ? {} : { ref: h.ref }) }))
  }));
  compareKeyed('inventory', inventory, seed.inventory, 'id');

  // ---- outsourcing ----
  const partnerHistory = group(await q('SELECT * FROM outsource_partner_history ORDER BY id'), 'partner_id');
  const partners = (await q('SELECT * FROM outsource_partners')).map((p) => ({
    id: p.id, name: p.name, service: p.service, contactPerson: p.contact_person, email: p.email, mobile: p.mobile, address: p.address, notes: p.notes,
    archived: bool(p.archived), history: (partnerHistory.get(p.id) || []).map((h) => ({ at: h.at, actor: h.actor, text: h.text }))
  }));
  compareKeyed('partners', partners, seed.outsourcing.partners, 'id');
  const deliveries = group(await q('SELECT * FROM outsource_deliveries ORDER BY id'), 'contract_id');
  const contractHistory = group(await q('SELECT * FROM outsource_contract_history ORDER BY id'), 'contract_id');
  const contracts = (await q('SELECT * FROM outsource_contracts')).map((c) => ({
    id: c.id, ref: c.ref, partnerId: c.partner_id, reservationRef: c.reservation_ref, items: parseJson(c.items), needBy: c.need_by, amount: c.amount,
    notes: c.notes, status: c.status, body: c.body,
    deliveries: (deliveries.get(c.id) || []).map((d) => {
      if (d.outbox_id !== null) fail(`delivery ${d.id}: outbox_id not NULL`);
      return { channel: d.channel, to: d.to_address, at: d.at, body: d.body };
    }),
    createdAt: c.created_at, sentAt: c.sent_at, answeredAt: c.answered_at, answerNote: c.answer_note,
    history: (contractHistory.get(c.id) || []).map((h) => ({ at: h.at, actor: h.actor, text: h.text }))
  }));
  compareKeyed('contracts', contracts, seed.outsourcing.contracts, 'id');

  // ---- counters (receipt stored as the last one used; the 'change' stamp is not seed data, Phase 7) ----
  const counterRows = await q("SELECT * FROM counters WHERE name <> 'change'");
  const counters = Object.fromEntries(counterRows.map((c) => [c.name, c.name === 'receipt' ? c.value + 1 : c.value]));
  compare('counters', counters, seed.counters);
  console.log('counters in db:', counterRows.map((c) => `${c.name}=${c.value}`).join(' '), `| seed.counters.receipt=${seed.counters.receipt}`);

  // ---- tables the seed leaves empty (sign-ins, codes and deliveries fill them) ----
  for (const t of ['login_attempts', 'auth_challenges', 'password_resets', 'signup_requests', 'password_changes', 'outbox', 'qr_payments', 'webhook_events']) {
    const [{ n }] = await q(`SELECT COUNT(*) AS n FROM ${t}`);
    if (n !== 0) fail(`${t} has ${n} rows`);
  }

  // ---- integrity: every foreign key, the two 'none' columns, receipt numbers ----
  const fks = await q(`SELECT k.TABLE_NAME t, k.COLUMN_NAME c, k.REFERENCED_TABLE_NAME pt, k.REFERENCED_COLUMN_NAME pc
    FROM information_schema.KEY_COLUMN_USAGE k WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL`);
  let fkChecked = 0;
  for (const { t, c, pt, pc } of fks) {
    const [{ n }] = await q(`SELECT COUNT(*) AS n FROM ${t} x LEFT JOIN ${pt} p ON p.${pc} = x.${c} WHERE x.${c} IS NOT NULL AND p.${pc} IS NULL`);
    fkChecked++;
    if (n) fail(`orphans: ${t}.${c} -> ${pt}.${pc}: ${n}`);
  }
  for (const [t, c] of [['inventory_allocations', 'reservation_ref'], ['outsource_contracts', 'reservation_ref']]) {
    const [{ n }] = await q(`SELECT COUNT(*) AS n FROM ${t} x LEFT JOIN reservations r ON r.ref = x.${c} WHERE x.${c} <> 'none' AND r.ref IS NULL`);
    if (n) fail(`${t}.${c}: ${n} values neither 'none' nor a reservation`);
  }
  const dupReceipts = await q('SELECT receipt_no, COUNT(*) n FROM payments WHERE receipt_no IS NOT NULL GROUP BY receipt_no HAVING n > 1');
  if (dupReceipts.length) fail(`duplicate receipt numbers: ${JSON.stringify(dupReceipts)}`);
  const [receiptStats] = await q(`SELECT COUNT(receipt_no) AS withReceipt, SUM(receipt_no IS NULL) AS nullReceipt, MIN(receipt_no) AS first, MAX(receipt_no) AS last,
    (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND INDEX_NAME = 'uq_payments_receipt_no' AND NON_UNIQUE = 0) AS uniqueIndex FROM payments`);

  // ---- special characters, byte for byte ----
  const [chars] = await q(`SELECT
    (SELECT COUNT(*) FROM reservations WHERE event_name LIKE '%–%') AS enDashEvents,
    (SELECT COUNT(*) FROM reservations WHERE city LIKE '%ñ%') AS enyeCities,
    (SELECT COUNT(*) FROM reservation_activity WHERE text LIKE '%₱%') AS pesoActivity,
    (SELECT COUNT(*) FROM reservations WHERE food_notes LIKE '%’%') AS curlyApostrophe,
    (SELECT COUNT(*) FROM testimonials WHERE reply_body LIKE '%—%') AS emDash,
    (SELECT HEX(event_name) FROM reservations WHERE event_name LIKE 'Santos%Wedding%') AS santosHex`);
  if (!chars.santosHex || !chars.santosHex.includes('E28093')) fail('en dash not stored as UTF-8 E2 80 93');
  // Emoji: the seed has none, so write one in a transaction, read it back, and roll back
  const conn = await pool.getConnection();
  let emojiOk = false;
  try {
    await conn.beginTransaction();
    const text = 'Salamat po! 🎉🙏 ₱1,500 – Parañaque · sago’t gulaman';
    await conn.query("INSERT INTO messages (id, thread_id, from_side, sender_name, body, ref, at, read_by_customer, read_by_admin, attachment) VALUES ('m-emoji-test', 'th-0001', 'customer', 'Test', ?, NULL, 1, 1, 0, ?)", [text, JSON.stringify({ name: '🎉.pdf' })]);
    const [[row]] = await conn.query("SELECT body, attachment, HEX(body) AS h FROM messages WHERE id = 'm-emoji-test'");
    emojiOk = row.body === text && parseJson(row.attachment).name === '🎉.pdf' && row.h.includes('F09F8E89');
  } catch (err) {
    fail(`emoji test could not run: ${err.message}`);
  } finally {
    await conn.rollback();
    conn.release();
  }
  if (!emojiOk) fail('emoji did not round-trip');
  const [{ leftover }] = await q("SELECT COUNT(*) AS leftover FROM messages WHERE id = 'm-emoji-test'");

  // ---- the numbers the plan lists ----
  const [lolaRow] = await q("SELECT ref FROM reservations WHERE event_name = 'Lola Carmen''s 80th Birthday'");
  const lolaSeed = seed.reservations.find((r) => r.eventName === "Lola Carmen's 80th Birthday");
  const count = async (t) => (await q(`SELECT COUNT(*) AS n FROM ${t}`))[0].n;
  const summary = {
    admins: await count('admins'), customers: await count('customers'), packages: await count('packages'), addons: await count('addons'), dishes: await count('dishes'),
    reservations: await count('reservations'), payments: await count('payments'), threads: await count('threads'), testimonials: await count('testimonials'),
    inventory_items: await count('inventory_items'), partners: await count('outsource_partners'), contracts: await count('outsource_contracts'),
    blocked: await count('calendar_blocks'), dailyCapacity: calSettings.daily_capacity
  };
  console.log('counts:', JSON.stringify(summary));
  console.log(`receipt_no: ${receiptStats.withReceipt} set (${receiptStats.first}..${receiptStats.last}), ${receiptStats.nullReceipt} NULL, duplicates ${dupReceipts.length}, UNIQUE index present ${receiptStats.uniqueIndex === 1}`);
  console.log(`foreign keys checked for orphans: ${fkChecked} (0 orphans unless listed below)`);
  console.log(`characters: ${JSON.stringify({ ...chars, santosHex: undefined })}; emoji round trip ${emojiOk}, test row left behind ${leftover}`);
  console.log(`Lola Carmen's 80th Birthday: db ${lolaRow ? lolaRow.ref : '(missing)'}, fresh sample data ${lolaSeed ? lolaSeed.ref : '(missing)'}`);
  // A seed from another day moves every relative date, so say how old the seed is
  console.log(`settings updated_at: catalog ${ageMin(catSettings.updated_at)} min ago, calendar ${ageMin(calSettings.updated_at)} min ago (both set by seed:api)`);
  notes.forEach((n) => console.log('NOTE:', n));
  if (problems.length) {
    console.log(`\nROUND TRIP: ${problems.length} PROBLEM(S)`);
    problems.slice(0, 60).forEach((p) => console.log('  -', p));
    if (problems.length > 60) console.log(`  … and ${problems.length - 60} more`);
    return 1;
  }
  console.log('\nROUND TRIP: every record and field matches (allowed differences only: receiptNo \'\' vs NULL, counters.receipt - 1, seededOn, key order, message order and ids; passwords checked against .env).');
  return 0;
}

try {
  process.exitCode = await check();
} catch (err) {
  console.error(`Round-trip check failed: ${err.message}`);
  const hint = dbErrorHint(err);
  if (hint) console.error(hint);
  process.exitCode = 1;
} finally {
  await closePool().catch(() => {});
}
