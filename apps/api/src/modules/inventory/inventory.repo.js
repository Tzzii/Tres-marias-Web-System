/**
 * SQL for the equipment inventory (docs §7.1: the repo holds SQL only; the rules are in
 * inventory.service.js and @tm/shared/src/domain/inventory.js). An item comes back in the record
 * shape domain/inventory.js works with, the way the seeder saves it and scripts/db-roundtrip.js reads it:
 *   { id, code, name, category, total, lowStockAt, allocations: { reservationRef or 'none': pieces out },
 *     damaged, rentable, rentPrice, damageFee, notes, archived, history: [{ at, actor, text, ref? }] }
 * `allocations` comes from inventory_allocations (one row per item and place; a row that would reach 0
 * is deleted), `history` from inventory_history in the order it was written (id); a history line
 * carries `ref` only when it is about a reservation.
 *
 * Every function takes `db`: the pool, or a transaction's connection so reads and writes see and lock
 * the same rows. Lock order for an inventory write (inventory.service.js): the availability lock, then
 * the booking's row when the write is for one, then the item rows (lockItems), then the chat thread.
 */

// First row of a SELECT, or null
const first = ([rows]) => rows[0] || null;

// Rows grouped by one column: Map(value -> rows), rows in the order read
function groupBy(rows, key) {
  const groups = new Map();
  rows.forEach((row) => {
    if (!groups.has(row[key])) groups.set(row[key], []);
    groups.get(row[key]).push(row);
  });
  return groups;
}

// inventory_items row + its allocation and history rows -> item record
const toItem = (row, allocations = [], history = []) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  category: row.category,
  total: row.total,
  lowStockAt: row.low_stock_at,
  allocations: Object.fromEntries(allocations.map((a) => [a.reservation_ref, a.qty])),
  damaged: row.damaged,
  rentable: Boolean(row.rentable),
  rentPrice: row.rent_price,
  damageFee: row.damage_fee,
  notes: row.notes,
  archived: Boolean(row.archived),
  addonId: row.addon_id ?? null, // the additional charge or size that books it (set on the Packages page)
  history: history.map((h) => ({ at: h.at, actor: h.actor, text: h.text, ...(h.ref === null ? {} : { ref: h.ref }) }))
});

/* ============================ Reads ============================ */

/**
 * Items with their allocations and history, in the order they were added (their EQ- code), and the
 * event name and date of every booking they have pieces out at: { items, eventOf(ref) -> { eventName,
 * date } or null }. Which items: every one, or not the archived ones (`includeArchived: false`), or the
 * ones in `ids` (the lookup ignores case and trailing spaces, the column's collation, so callers compare
 * the ids they get back). `lock` locks the item rows and their allocation rows until the transaction
 * ends (FOR UPDATE; pass the transaction's connection), before anything else is read.
 */
export async function findItems(db, { ids, includeArchived = true, lock = false } = {}) {
  if (ids && !ids.length) return { items: [], eventOf: () => null };
  const conditions = [];
  const params = [];
  if (ids) {
    conditions.push('i.id IN (?)');
    params.push(ids);
  }
  if (!includeArchived) conditions.push('i.archived = 0');
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const forUpdate = lock ? ' FOR UPDATE' : '';

  const [rows] = await db.query(`SELECT i.* FROM inventory_items i ${where} ORDER BY i.code${forUpdate}`, params);
  if (!rows.length) return { items: [], eventOf: () => null };
  const itemIds = rows.map((row) => row.id);
  const [allocations] = await db.query(
    `SELECT a.item_id, a.reservation_ref, a.qty FROM inventory_allocations a WHERE a.item_id IN (?) ORDER BY a.item_id, a.reservation_ref${forUpdate}`,
    [itemIds]
  );
  const [[history], [events]] = await Promise.all([
    db.query('SELECT item_id, at, actor, text, ref FROM inventory_history WHERE item_id IN (?) ORDER BY id', [itemIds]),
    db.query(
      `SELECT DISTINCT r.ref, r.event_name, r.date FROM inventory_allocations a JOIN reservations r ON r.ref = a.reservation_ref
        WHERE a.item_id IN (?)`,
      [itemIds]
    )
  ]);
  const byItem = { allocations: groupBy(allocations, 'item_id'), history: groupBy(history, 'item_id') };
  const eventsByRef = new Map(events.map((e) => [e.ref, { eventName: e.event_name, date: e.date }]));
  return {
    items: rows.map((row) => toItem(row, byItem.allocations.get(row.id), byItem.history.get(row.id))),
    eventOf: (ref) => eventsByRef.get(ref) || null
  };
}

/** Every item's id and name (archived ones included), for the "already in the inventory" check. */
export async function itemNames(db) {
  const [rows] = await db.query('SELECT id, name FROM inventory_items');
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

/**
 * What is out for one reservation: [{ itemId, ref, qty }] in the items' EQ- order. The lookup ignores
 * case and trailing spaces (the column's collation): callers keep only the rows whose `ref` is theirs.
 */
export async function equipmentOut(db, ref) {
  const [rows] = await db.query(
    `SELECT a.item_id, a.reservation_ref, a.qty FROM inventory_allocations a JOIN inventory_items i ON i.id = a.item_id
      WHERE a.reservation_ref = ? ORDER BY i.code`,
    [ref]
  );
  return rows.map((row) => ({ itemId: row.item_id, ref: row.reservation_ref, qty: row.qty }));
}

/* ============================ Writes (inside a transaction) ============================ */

/** Save a new item. A name already in use (any case or accent) fails with ER_DUP_ENTRY (UNIQUE name). */
export async function insertItem(conn, item) {
  await conn.query(
    `INSERT INTO inventory_items (id, code, name, category, total, low_stock_at, damaged, rentable, rent_price, damage_fee, notes, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [item.id, item.code, item.name, item.category, item.total, item.lowStockAt, item.damaged, item.rentable, item.rentPrice, item.damageFee, item.notes, item.archived]
  );
}

// Record fields updateItem() may change -> column. A fixed list, so a key from anywhere else never becomes SQL.
const COLUMNS = {
  name: 'name',
  category: 'category',
  total: 'total',
  lowStockAt: 'low_stock_at',
  damaged: 'damaged',
  rentable: 'rentable',
  rentPrice: 'rent_price',
  damageFee: 'damage_fee',
  notes: 'notes',
  archived: 'archived'
};

/**
 * Change some of an item's fields, given in the record's shape, e.g. { damaged: 3 } or { archived: true }.
 * Any other field name is a programming error and throws before anything is saved. A new name already
 * in use fails with ER_DUP_ENTRY (UNIQUE name).
 */
export async function updateItem(conn, id, changes) {
  const sets = [];
  const params = [];
  Object.entries(changes).forEach(([field, value]) => {
    if (!COLUMNS[field]) throw new Error(`updateItem: "${field}" is not a field it can save.`);
    sets.push(`${COLUMNS[field]} = ?`);
    params.push(value);
  });
  if (!sets.length) return;
  await conn.query(`UPDATE inventory_items SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
}

/**
 * Set how many pieces of an item are out at one place (a reservation's ref as stored, or 'none'): the
 * row is written when `qty` is above 0 and deleted at 0 (no row means nothing is out there).
 */
export async function setAllocation(conn, itemId, ref, qty) {
  if (qty > 0) {
    await conn.query('INSERT INTO inventory_allocations (item_id, reservation_ref, qty) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE qty = ?', [itemId, ref, qty, qty]);
  } else {
    await conn.query('DELETE FROM inventory_allocations WHERE item_id = ? AND reservation_ref = ?', [itemId, ref]);
  }
}

/** Add an entry to an item's history; `ref` is the reservation it is about, or null. */
export async function insertHistory(conn, itemId, { at, actor, text, ref = null }) {
  await conn.query('INSERT INTO inventory_history (item_id, at, actor, text, ref) VALUES (?, ?, ?, ?, ?)', [itemId, at, actor, text, ref]);
}
