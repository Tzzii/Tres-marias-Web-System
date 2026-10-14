
const first = ([rows]) => rows[0] || null;

function groupBy(rows, key) {
  const groups = new Map();
  rows.forEach((row) => {
    if (!groups.has(row[key])) groups.set(row[key], []);
    groups.get(row[key]).push(row);
  });
  return groups;
}

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
  photoVersion: row.photo_key ? row.photo_key.split('/').pop() : null,
  notes: row.notes,
  archived: Boolean(row.archived),
  addonId: row.addon_id ?? null,
  history: history.map((h) => ({ at: h.at, actor: h.actor, text: h.text, ...(h.ref === null ? {} : { ref: h.ref }) }))
});


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

export async function itemNames(db) {
  const [rows] = await db.query('SELECT id, name FROM inventory_items');
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

export async function hasBookingReferences(db, id) {
  const row = first(
    await db.query(
      `SELECT (
        EXISTS (SELECT 1 FROM reservation_rental_items WHERE item_id = ?) OR
        EXISTS (SELECT 1 FROM reservation_damage_charges WHERE item_id = ?) OR
        EXISTS (SELECT 1 FROM rental_dispatches WHERE item_id = ?) OR
        EXISTS (SELECT 1 FROM inventory_history WHERE item_id = ? AND ref IS NOT NULL)
      ) AS linked`,
      [id, id, id, id]
    )
  );
  return Boolean(row.linked);
}

export async function equipmentOut(db, ref) {
  const [rows] = await db.query(
    `SELECT a.item_id, a.reservation_ref, a.qty FROM inventory_allocations a JOIN inventory_items i ON i.id = a.item_id
      WHERE a.reservation_ref = ? ORDER BY i.code`,
    [ref]
  );
  return rows.map((row) => ({ itemId: row.item_id, ref: row.reservation_ref, qty: row.qty }));
}

export async function rentalDispatches(db, ref) {
  const [rows] = await db.query('SELECT item_id, qty FROM rental_dispatches WHERE reservation_ref = ?', [ref]);
  return Object.fromEntries(rows.map((row) => [row.item_id, row.qty]));
}

export async function setRentalDispatch(conn, ref, itemId, qty, at) {
  await conn.query(
    `INSERT INTO rental_dispatches (reservation_ref, item_id, qty, dispatched_at) VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE qty = ?, dispatched_at = ?`,
    [ref, itemId, qty, at, qty, at]
  );
}

export async function dueRentals(db, { date, time }) {
  const [rows] = await db.query(
    `SELECT ref FROM reservations WHERE service_type = 'Equipment rental'
    AND status = 'confirmed' AND date = ? AND start_time <= ? ORDER BY start_time, created_at, ref`,
    [date, time]
  );
  return rows.map((row) => row.ref);
}

export async function lastAutomaticNotice(db, ref) {
  const row = first(
    await db.query(
      `SELECT text FROM reservation_activity
    WHERE reservation_ref = ? AND actor = 'Automatic inventory' ORDER BY id DESC LIMIT 1`,
      [ref]
    )
  );
  return row?.text || '';
}


export async function deleteItem(conn, id) {
  await conn.query('DELETE FROM inventory_history WHERE item_id = ?', [id]);
  await conn.query('DELETE FROM inventory_items WHERE id = ?', [id]);
}

export async function insertItem(conn, item) {
  await conn.query(
    `INSERT INTO inventory_items (id, code, name, category, total, low_stock_at, damaged, rentable, rent_price, damage_fee, notes, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.code,
      item.name,
      item.category,
      item.total,
      item.lowStockAt,
      item.damaged,
      item.rentable,
      item.rentPrice,
      item.damageFee,
      item.notes,
      item.archived
    ]
  );
}

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

export async function findItemPhoto(db, id) {
  return first(
    await db.query(
      'SELECT id, photo_key AS `key`, photo_mime AS mime, rentable, archived, rent_price FROM inventory_items WHERE id = ?',
      [id]
    )
  );
}

export async function setItemPhoto(conn, id, photo) {
  await conn.query('UPDATE inventory_items SET photo_key = ?, photo_mime = ? WHERE id = ?', [
    photo?.key || null,
    photo?.mime || null,
    id
  ]);
}

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

export async function setAllocation(conn, itemId, ref, qty) {
  if (qty > 0) {
    await conn.query(
      'INSERT INTO inventory_allocations (item_id, reservation_ref, qty) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE qty = ?',
      [itemId, ref, qty, qty]
    );
  } else {
    await conn.query('DELETE FROM inventory_allocations WHERE item_id = ? AND reservation_ref = ?', [itemId, ref]);
  }
}

export async function insertHistory(conn, itemId, { at, actor, text, ref = null }) {
  await conn.query('INSERT INTO inventory_history (item_id, at, actor, text, ref) VALUES (?, ?, ?, ?, ?)', [
    itemId,
    at,
    actor,
    text,
    ref
  ]);
}
