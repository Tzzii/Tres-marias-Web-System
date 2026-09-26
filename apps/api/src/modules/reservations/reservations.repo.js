import { RENTAL_SERVICE } from '@tm/shared/src/services/config.js';
import { HOLDS_DATE } from '@tm/shared/src/utils/status.js';
import { toJson, parseJson } from '../../lib/json.js';

/**
 * SQL for reservations (docs §7.1: the repo holds SQL only; the rules are in reservations.service.js).
 * Records come back in the browser store's shape (reservationService.js), built the way
 * scripts/db-roundtrip.js reads them back and checks them against the seed:
 * - `venue` from four columns; `addonIds` in sort_order; `addonQty` for add-ons counted by the piece
 *   (has_quantity; the others are stored as 1 and left out), and for any add-on asked for more than
 *   once, so a count survives the admin switching "counted by the piece" off after the booking (the
 *   browser version keeps the count it booked, and the quotation charges it);
 * - `rentalItems`, `fulfilment` and `damageCharges` on an equipment rental only (not even empty on
 *   other bookings); damage lines have no sort_order, so they come by item id;
 * - `activity` in the order it was written (id).
 *
 * Every function takes `db`: the pool, or a transaction's connection so reads and writes see and lock
 * the same rows. A list is one query per table (reservations with their package and customer names,
 * add-ons, activity, rental lines, damage lines, payments), joined up in JS: never one query per booking.
 */

// First row of a SELECT, or null
const first = ([rows]) => rows[0] || null;

// Rows grouped by one column, e.g. activity lines by reservation_ref: Map(value -> rows), rows in the order read
function groupBy(rows, key) {
  const groups = new Map();
  rows.forEach((row) => {
    if (!groups.has(row[key])) groups.set(row[key], []);
    groups.get(row[key]).push(row);
  });
  return groups;
}

/**
 * The WHERE clause for the reservations to read (the table is always aliased `r`): every one (admin),
 * one customer's (`customerId`), one booking (`ref`), or one booking only when it is that customer's.
 * Only a missing value (undefined or null) leaves a condition out: an empty id or ref matches nothing,
 * it never widens the read to every booking.
 */
function scope({ customerId, ref }) {
  const conditions = [];
  const params = [];
  if (customerId != null) {
    conditions.push('r.customer_id = ?');
    params.push(customerId);
  }
  if (ref != null) {
    conditions.push('r.ref = ?');
    params.push(ref);
  }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

// payments row -> payment record (the proof file's storage columns never leave the server)
const toPayment = (row) => ({
  id: row.id,
  ref: row.ref,
  customerId: row.customer_id,
  amount: row.amount,
  kind: row.kind,
  method: row.method,
  referenceNo: row.reference_no,
  proofName: row.proof_name,
  status: row.status,
  submittedAt: row.submitted_at,
  verifiedAt: row.verified_at,
  receiptNo: row.receipt_no ?? '', // NULL until verified (the UNIQUE index allows many NULLs); '' in the record
  rejectReason: row.reject_reason
});

// reservations row + its child rows -> reservation record
function toReservation(row, { addonLinks = [], activity = [], rentalLines = [], damageLines = [] }) {
  const record = {
    ref: row.ref,
    customerId: row.customer_id,
    eventName: row.event_name,
    occasion: row.occasion,
    date: row.date,
    startTime: row.start_time,
    guests: row.guests,
    packageId: row.package_id,
    serviceType: row.service_type,
    menu: parseJson(row.menu),
    foodNotes: row.food_notes,
    pricePerPlate: row.price_per_plate,
    venue: { name: row.venue_name, address: row.venue_address, city: row.city, accessNotes: row.access_notes },
    addonIds: addonLinks.map((link) => link.addon_id),
    addonQty: Object.fromEntries(addonLinks.filter((link) => link.has_quantity || link.qty !== 1).map((link) => [link.addon_id, link.qty])),
    status: row.status,
    estimate: parseJson(row.estimate),
    quotation: parseJson(row.quotation),
    downpaymentDue: row.downpayment_due,
    notes: row.notes,
    declineReason: row.decline_reason,
    cancelReason: row.cancel_reason,
    activity: activity.map((entry) => ({ at: entry.at, actor: entry.actor, text: entry.text })),
    createdAt: row.created_at
  };
  if (row.service_type === RENTAL_SERVICE) {
    record.rentalItems = rentalLines.map((line) => ({ itemId: line.item_id, name: line.name, qty: line.qty, price: line.price, damageFee: line.damage_fee }));
    record.fulfilment = row.fulfilment;
    record.damageCharges = damageLines.map((line) => ({ itemId: line.item_id, name: line.name, qty: line.qty, fee: line.fee }));
  }
  return record;
}

/* ============================ Reads ============================ */

/**
 * Reservations with what a summary needs, newest request first (created_at; ties by ref, the seed's
 * order): [{ reservation, packageName, packageSlug, customerName, customerEmail, customerMobile,
 * payments }]. The names are null when the package or customer row is missing; `payments` are the
 * booking's payment records, newest first. `filter` is { customerId?, ref? } (see scope()).
 */
export async function findReservations(db, filter = {}) {
  const { where, params } = scope(filter);
  const [rows] = await db.query(
    `SELECT r.ref, r.customer_id, r.event_name, r.occasion, r.date, r.start_time, r.guests, r.package_id, r.service_type,
            r.fulfilment, r.menu, r.food_notes, r.price_per_plate, r.venue_name, r.venue_address, r.city, r.access_notes,
            r.status, r.estimate, r.quotation, r.downpayment_due, r.notes, r.decline_reason, r.cancel_reason, r.created_at,
            p.name AS package_name, p.slug AS package_slug, c.name AS customer_name, c.email AS customer_email, c.mobile AS customer_mobile
       FROM reservations r
       LEFT JOIN packages p ON p.id = r.package_id
       LEFT JOIN customers c ON c.id = r.customer_id
       ${where}
      ORDER BY r.created_at DESC, r.ref`,
    params
  );
  if (!rows.length) return [];

  const [[addonLinks], [activity], [rentalLines], [damageLines], [payments]] = await Promise.all([
    db.query(
      `SELECT ra.reservation_ref, ra.addon_id, ra.qty, a.has_quantity
         FROM reservation_addons ra JOIN reservations r ON r.ref = ra.reservation_ref JOIN addons a ON a.id = ra.addon_id
         ${where} ORDER BY ra.reservation_ref, ra.sort_order`,
      params
    ),
    db.query(
      `SELECT act.reservation_ref, act.at, act.actor, act.text
         FROM reservation_activity act JOIN reservations r ON r.ref = act.reservation_ref
         ${where} ORDER BY act.id`,
      params
    ),
    db.query(
      `SELECT l.reservation_ref, l.item_id, l.name, l.qty, l.price, l.damage_fee
         FROM reservation_rental_items l JOIN reservations r ON r.ref = l.reservation_ref
         ${where} ORDER BY l.reservation_ref, l.sort_order`,
      params
    ),
    db.query(
      `SELECT d.reservation_ref, d.item_id, d.name, d.qty, d.fee
         FROM reservation_damage_charges d JOIN reservations r ON r.ref = d.reservation_ref
         ${where} ORDER BY d.reservation_ref, d.item_id`,
      params
    ),
    db.query(
      `SELECT pay.id, pay.ref, pay.customer_id, pay.amount, pay.kind, pay.method, pay.reference_no, pay.proof_name, pay.status,
              pay.submitted_at, pay.verified_at, pay.receipt_no, pay.reject_reason
         FROM payments pay JOIN reservations r ON r.ref = pay.ref
         ${where} ORDER BY pay.submitted_at DESC, pay.id`,
      params
    )
  ]);

  const byRef = {
    addonLinks: groupBy(addonLinks, 'reservation_ref'),
    activity: groupBy(activity, 'reservation_ref'),
    rentalLines: groupBy(rentalLines, 'reservation_ref'),
    damageLines: groupBy(damageLines, 'reservation_ref'),
    payments: groupBy(payments, 'ref')
  };
  return rows.map((row) => ({
    reservation: toReservation(row, {
      addonLinks: byRef.addonLinks.get(row.ref),
      activity: byRef.activity.get(row.ref),
      rentalLines: byRef.rentalLines.get(row.ref),
      damageLines: byRef.damageLines.get(row.ref)
    }),
    packageName: row.package_name,
    packageSlug: row.package_slug,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerMobile: row.customer_mobile,
    payments: (byRef.payments.get(row.ref) || []).map(toPayment)
  }));
}

/** How many of this customer's events are completed (the admin's "past events" on a booking). */
export async function countCompleted(db, customerId) {
  const row = first(await db.query("SELECT COUNT(*) AS n FROM reservations WHERE customer_id = ? AND status = 'completed'", [customerId]));
  return Number(row.n);
}

/**
 * The review left for an event, or null. The admin's private note on a flag (flag_reason) is not even
 * read: it belongs to the Feedbacks page, not to the reservation both sides can open.
 */
export async function findTestimonial(db, ref) {
  const row = first(
    await db.query(
      `SELECT id, customer_id, ref, rating, cat_food, cat_service, cat_punctuality, cat_setup, body, created_at, status,
              featured, flagged, archived, read_by_admin, reply_body, reply_at, reply_by
         FROM testimonials WHERE ref = ?`,
      [ref]
    )
  );
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customer_id,
    ref: row.ref,
    rating: row.rating,
    categories: { food: row.cat_food, service: row.cat_service, punctuality: row.cat_punctuality, setup: row.cat_setup },
    body: row.body,
    createdAt: row.created_at,
    status: row.status,
    featured: Boolean(row.featured),
    flagged: Boolean(row.flagged),
    archived: Boolean(row.archived),
    readByAdmin: Boolean(row.read_by_admin),
    reply: row.reply_body === null ? null : { body: row.reply_body, at: row.reply_at, by: row.reply_by }
  };
}

/**
 * The booking's owner and status, { ref, customerId, status } or null, with its row locked until the
 * transaction ends, so two writes on one booking (e.g. the customer cancelling while the admin
 * approves) run one after the other and the second sees the first one's result. `ref` comes back as
 * stored: the lookup ignores case and trailing spaces (the column's collation), so callers compare it.
 * Lock order for every write: the availability lock (when needed), then this row, then the chat thread.
 */
export async function lockOwner(conn, ref) {
  const row = first(await conn.query('SELECT ref, customer_id, status FROM reservations WHERE ref = ? FOR UPDATE', [ref]));
  return row && { ref: row.ref, customerId: row.customer_id, status: row.status };
}

/** Every ref already given out that starts with `prefix` (e.g. "RES-2026-1020-"), declined and cancelled ones included. */
export async function refsWithPrefix(conn, prefix) {
  const [rows] = await conn.query('SELECT ref FROM reservations WHERE ref LIKE ?', [`${prefix}%`]);
  return rows.map((row) => row.ref);
}

/**
 * What the rental stock rules (rentalStock in @tm/shared/src/domain/reservation.js) need for one date:
 *   inventory     every item: { id, name, total, damaged, lowStockAt, rentable, archived, rentPrice,
 *                 damageFee, allocations: { reservationRef: pieces checked out for bookings on the date } }
 *   reservations  the bookings on the date in a status that holds it (HOLDS_DATE), each rental with its
 *                 rentalItems: [{ itemId, qty }]
 */
export async function rentalStockInputs(db, date) {
  const [[items], [held], [lines], [allocations]] = await Promise.all([
    db.query('SELECT id, name, total, damaged, low_stock_at, rentable, archived, rent_price, damage_fee FROM inventory_items'),
    db.query('SELECT ref, date, status, service_type FROM reservations WHERE date = ? AND status IN (?)', [date, HOLDS_DATE]),
    db.query(
      `SELECT l.reservation_ref, l.item_id, l.qty FROM reservation_rental_items l JOIN reservations r ON r.ref = l.reservation_ref
        WHERE r.date = ? AND r.status IN (?)`,
      [date, HOLDS_DATE]
    ),
    db.query(
      `SELECT a.item_id, a.reservation_ref, a.qty FROM inventory_allocations a JOIN reservations r ON r.ref = a.reservation_ref
        WHERE r.date = ? AND r.status IN (?)`,
      [date, HOLDS_DATE]
    )
  ]);
  const linesByRef = groupBy(lines, 'reservation_ref');
  const allocationsByItem = groupBy(allocations, 'item_id');
  return {
    inventory: items.map((item) => ({
      id: item.id,
      name: item.name,
      total: item.total,
      damaged: item.damaged,
      lowStockAt: item.low_stock_at,
      rentable: Boolean(item.rentable),
      archived: Boolean(item.archived),
      rentPrice: item.rent_price,
      damageFee: item.damage_fee,
      allocations: Object.fromEntries((allocationsByItem.get(item.id) || []).map((a) => [a.reservation_ref, a.qty]))
    })),
    reservations: held.map((r) => ({
      ref: r.ref,
      date: r.date,
      status: r.status,
      serviceType: r.service_type,
      rentalItems: (linesByRef.get(r.ref) || []).map((line) => ({ itemId: line.item_id, qty: line.qty }))
    }))
  };
}

/* ============================ Writes (inside a transaction) ============================ */

/**
 * Save a new booking from its record. `venue` is flattened into four columns; fulfilment is NULL for
 * everything but an equipment rental. A ref already in use fails with ER_DUP_ENTRY on the primary key.
 */
export async function insertReservation(conn, r) {
  await conn.query(
    `INSERT INTO reservations (ref, customer_id, event_name, occasion, date, start_time, guests, package_id, service_type, fulfilment,
                               menu, food_notes, price_per_plate, venue_name, venue_address, city, access_notes, status, estimate,
                               quotation, downpayment_due, notes, decline_reason, cancel_reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      r.ref, r.customerId, r.eventName, r.occasion, r.date, r.startTime, r.guests, r.packageId, r.serviceType, r.fulfilment || null,
      toJson(r.menu), r.foodNotes, r.pricePerPlate, r.venue.name, r.venue.address, r.venue.city, r.venue.accessNotes, r.status, toJson(r.estimate),
      toJson(r.quotation), r.downpaymentDue, r.notes, r.declineReason, r.cancelReason, r.createdAt
    ]
  );
}

/** The ticked add-ons, in the order of `addonIds`; the quantity from `addonQty` (1 when not counted by the piece). */
export async function insertAddons(conn, ref, addonIds, addonQty) {
  if (!addonIds.length) return;
  await conn.query('INSERT INTO reservation_addons (reservation_ref, addon_id, qty, sort_order) VALUES ?', [
    addonIds.map((addonId, index) => [ref, addonId, addonQty[addonId] || 1, index])
  ]);
}

/** A rental's lines ([{ itemId, name, qty, price, damageFee }]), in order. */
export async function insertRentalLines(conn, ref, lines) {
  if (!lines.length) return;
  await conn.query('INSERT INTO reservation_rental_items (reservation_ref, item_id, name, qty, price, damage_fee, sort_order) VALUES ?', [
    lines.map((line, index) => [ref, line.itemId, line.name, line.qty, line.price, line.damageFee, index])
  ]);
}

/** Add an entry to the booking's audit trail (always in the transaction of the change it describes). */
export async function insertActivity(conn, ref, { at, actor, text }) {
  await conn.query('INSERT INTO reservation_activity (reservation_ref, at, actor, text) VALUES (?, ?, ?, ?)', [ref, at, actor, text]);
}

/** Mark a booking cancelled, with the customer's reason. */
export async function setCancelled(conn, ref, reason) {
  await conn.query("UPDATE reservations SET status = 'cancelled', cancel_reason = ? WHERE ref = ?", [reason, ref]);
}
