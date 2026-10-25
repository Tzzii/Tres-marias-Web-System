import { nestAddons } from '@tm/shared/src/domain/catalog.js';
import { helperLabel } from '@tm/shared/src/utils/helperLabels.js';
import { pool } from '../../db.js';
import { parseJson, toJson } from '../../lib/json.js';

const first = ([rows]) => rows[0] || null;

const where = (conditions) => (conditions.length ? `WHERE ${conditions.join(' AND ')}` : '');

const PACKAGE_COLUMNS =
  'id, slug, name, kind, price, guests, description, items, photo_key, photo_mime, mood, icon, featured, visible, archived';

const toPackage = (row) =>
  row && {
    id: row.id,
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    price: row.price,
    guests: row.guests,
    photoVersion: row.photo_key ? row.photo_key.split('/').pop() : null,
    description: helperLabel(row.description),
    items: parseJson(row.items, []).map((item) => ({ ...item, name: helperLabel(item.name) })),
    mood: row.mood,
    icon: row.icon,
    featured: Boolean(row.featured),
    visible: Boolean(row.visible),
    archived: Boolean(row.archived)
  };

export async function listPackages({ includeHidden = false, includeArchived = false } = {}) {
  const conditions = [];
  if (!includeArchived) conditions.push('archived = 0');
  if (!includeHidden) conditions.push('visible = 1');
  const [rows] = await pool.query(
    `SELECT ${PACKAGE_COLUMNS} FROM packages ${where(conditions)} ORDER BY sort_order, id`
  );
  return rows.map(toPackage);
}

export const findPackageById = async (id, db = pool, lock = false) =>
  toPackage(
    first(await db.query(`SELECT ${PACKAGE_COLUMNS} FROM packages WHERE id = ?${lock ? ' FOR UPDATE' : ''}`, [id]))
  );

export const findPackagePhoto = async (id, db = pool) =>
  first(
    await db.query('SELECT photo_key AS `key`, photo_mime AS mime, visible, archived FROM packages WHERE id = ?', [id])
  );

export const findPublicPackageBySlug = async (slug) =>
  toPackage(
    first(
      await pool.query(`SELECT ${PACKAGE_COLUMNS} FROM packages WHERE slug = ? AND visible = 1 AND archived = 0`, [
        slug
      ])
    )
  );

export async function packageSlugTaken(slug, exceptId, db = pool) {
  const [rows] = await db.query('SELECT 1 FROM packages WHERE slug = ? AND id <> ? LIMIT 1', [slug, exceptId]);
  return rows.length > 0;
}

export async function packageCounts(db = pool) {
  const row = first(
    await db.query('SELECT COUNT(*) AS total, COALESCE(MAX(sort_order) + 1, 0) AS nextOrder FROM packages')
  );
  return { total: Number(row.total), nextOrder: Number(row.nextOrder) };
}

export async function insertPackage(p, db = pool) {
  await db.query(
    `INSERT INTO packages (id, slug, name, kind, price, guests, description, items, mood, icon, featured, visible, archived, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      p.id,
      p.slug,
      p.name,
      p.kind,
      p.price,
      p.guests,
      p.description,
      toJson(p.items),
      p.mood,
      p.icon,
      p.featured,
      p.visible,
      p.archived,
      p.sortOrder
    ]
  );
}

export async function updatePackage(id, p, db = pool) {
  await db.query(
    'UPDATE packages SET slug = ?, name = ?, price = ?, guests = ?, description = ?, items = ?, visible = ? WHERE id = ?',
    [p.slug, p.name, p.price, p.guests, p.description, toJson(p.items), p.visible, id]
  );
}

export async function setPackagePhoto(id, photo, db = pool) {
  await db.query('UPDATE packages SET photo_key = ?, photo_mime = ? WHERE id = ?', [
    photo?.key || null,
    photo?.mime || null,
    id
  ]);
}

export async function setPackageVisible(id, visible) {
  await pool.query('UPDATE packages SET visible = ? WHERE id = ?', [visible, id]);
}

export async function setPackageArchived(id, archived) {
  const sql = archived
    ? 'UPDATE packages SET archived = 1, visible = 0 WHERE id = ?'
    : 'UPDATE packages SET archived = 0 WHERE id = ?';
  await pool.query(sql, [id]);
}

const toAddonRow = (row) => ({
  id: row.id,
  parentId: row.parent_id,
  name: helperLabel(row.name),
  description: helperLabel(row.description),
  price: row.price === null ? null : Number(row.price),
  hasQuantity: Boolean(row.has_quantity),
  hasPackages: Boolean(row.has_packages),
  archived: Boolean(row.archived),
  inventoryItemId: row.inventory_item_id ?? null
});

export async function listAddons({ includeArchived = false } = {}, db = pool) {
  const [rows] = await db.query(
    `SELECT a.id, a.parent_id, a.name, a.description, a.price, a.has_quantity, a.has_packages, a.archived, i.id AS inventory_item_id
       FROM addons a LEFT JOIN inventory_items i ON i.addon_id = a.id ORDER BY a.sort_order, a.id`
  );
  return nestAddons(rows.map(toAddonRow), { includeArchived });
}

export async function findAddonById(id, db = pool) {
  return (await listAddons({ includeArchived: true }, db)).find((charge) => charge.id === id) || null;
}

export async function addonNameTaken(name, exceptId) {
  const names =
    helperLabel(name).toLowerCase() === 'helper' ? ['Helper', 'Waiter/Dishwasher', 'Water/Dishwasher'] : [name];
  const [rows] = await pool.query('SELECT 1 FROM addons WHERE parent_id IS NULL AND name IN (?) AND id <> ? LIMIT 1', [
    names,
    exceptId
  ]);
  return rows.length > 0;
}

export async function nextAddonOrder(db = pool) {
  return Number(
    first(await db.query('SELECT COALESCE(MAX(sort_order) + 1, 0) AS nextOrder FROM addons WHERE parent_id IS NULL'))
      .nextOrder
  );
}

export async function insertAddon(a, db = pool) {
  await db.query(
    'INSERT INTO addons (id, parent_id, name, description, price, has_quantity, has_packages, archived, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      a.id,
      a.parentId ?? null,
      a.name,
      a.description,
      a.price,
      a.hasQuantity,
      Boolean(a.hasPackages),
      a.archived,
      a.sortOrder
    ]
  );
}

export async function updateAddon(id, a, db = pool) {
  await db.query('UPDATE addons SET name = ?, description = ?, price = ?, has_quantity = ? WHERE id = ?', [
    a.name,
    a.description,
    a.price,
    a.hasQuantity,
    id
  ]);
}

export async function updateAddonSize(id, size, db = pool) {
  await db.query(
    'UPDATE addons SET name = ?, description = ?, price = ?, sort_order = ?, has_quantity = ?, archived = 0 WHERE id = ?',
    [size.name, size.description, size.price, size.sortOrder, size.hasQuantity, id]
  );
}

export async function listInventoryForLinks(db = pool) {
  const [rows] = await db.query('SELECT id, name, archived, addon_id FROM inventory_items');
  return rows.map((row) => ({ id: row.id, name: row.name, archived: Boolean(row.archived), addonId: row.addon_id }));
}

export async function linkInventoryItems(conn, addonIds, links) {
  if (addonIds.length) await conn.query('UPDATE inventory_items SET addon_id = NULL WHERE addon_id IN (?)', [addonIds]);
  for (const [addonId, itemId] of links)
    await conn.query('UPDATE inventory_items SET addon_id = ? WHERE id = ?', [addonId, itemId]);
}

export async function countAddonBookings(ids, db = pool) {
  return Number(
    first(
      await db.query('SELECT COUNT(DISTINCT reservation_ref) AS n FROM reservation_addons WHERE addon_id IN (?)', [ids])
    ).n
  );
}

export async function deleteAddon(conn, chargeId, ids) {
  await conn.query('UPDATE inventory_items SET addon_id = NULL WHERE addon_id IN (?)', [ids]);
  await conn.query('DELETE FROM addons WHERE parent_id = ?', [chargeId]);
  await conn.query('DELETE FROM addons WHERE id = ?', [chargeId]);
}

export async function setAddonArchived(id, archived, db = pool) {
  await db.query('UPDATE addons SET archived = ? WHERE id = ?', [archived, id]);
}

const DISH_COLUMNS = 'id, category, name, archived';

const toDish = (row) =>
  row && {
    id: row.id,
    category: /^kare[\s-]*kare$/i.test(row.name) ? 'pork' : row.category,
    name: row.name,
    archived: Boolean(row.archived)
  };

export async function listDishes({ includeArchived = false } = {}) {
  const [rows] = await pool.query(
    `SELECT ${DISH_COLUMNS} FROM dishes ${where(includeArchived ? [] : ['archived = 0'])} ORDER BY sort_order, id`
  );
  return rows.map(toDish);
}

export const findDishById = async (id) =>
  toDish(first(await pool.query(`SELECT ${DISH_COLUMNS} FROM dishes WHERE id = ?`, [id])));

export async function dishNameTaken(category, name, exceptId) {
  const [rows] = await pool.query('SELECT 1 FROM dishes WHERE category = ? AND name = ? AND id <> ? LIMIT 1', [
    category,
    name,
    exceptId
  ]);
  return rows.length > 0;
}

export async function nextDishOrder() {
  return Number(first(await pool.query('SELECT COALESCE(MAX(sort_order) + 1, 0) AS nextOrder FROM dishes')).nextOrder);
}

export async function insertDish(d) {
  await pool.query('INSERT INTO dishes (id, category, name, archived, sort_order) VALUES (?, ?, ?, ?, ?)', [
    d.id,
    d.category,
    d.name,
    d.archived,
    d.sortOrder
  ]);
}

export async function updateDish(id, d) {
  await pool.query('UPDATE dishes SET category = ?, name = ? WHERE id = ?', [d.category, d.name, id]);
}

export async function setDishArchived(id, archived) {
  await pool.query('UPDATE dishes SET archived = ? WHERE id = ?', [archived, id]);
}

export async function deleteDish(id) {
  await pool.query('DELETE FROM dishes WHERE id = ?', [id]);
}

export async function getPricePerPlate(db = pool) {
  const row = first(await db.query('SELECT price_per_plate FROM catalog_settings WHERE id = 1'));
  return row ? row.price_per_plate : null;
}

export async function getPricingSettings(db = pool) {
  const row = first(
    await db.query('SELECT price_per_plate, min_downpayment, six_hour_fee FROM catalog_settings WHERE id = 1')
  );
  return (
    row && { pricePerPlate: row.price_per_plate, minDownpayment: row.min_downpayment, sixHourFee: row.six_hour_fee }
  );
}

export async function setPricePerPlate(amount, at) {
  const [result] = await pool.query('UPDATE catalog_settings SET price_per_plate = ?, updated_at = ? WHERE id = 1', [
    amount,
    at
  ]);
  if (result.affectedRows === 0)
    throw new Error('The catalog_settings row is missing. Run npm run db:reset and npm run seed:api.');
}

export async function getMinDownpayment(db = pool) {
  const row = first(await db.query('SELECT min_downpayment FROM catalog_settings WHERE id = 1'));
  return row ? row.min_downpayment : null;
}

export async function getSixHourFee(db = pool) {
  const row = first(await db.query('SELECT six_hour_fee FROM catalog_settings WHERE id = 1'));
  return row?.six_hour_fee ?? null;
}

export async function setSixHourFee(amount, at) {
  const [result] = await pool.query('UPDATE catalog_settings SET six_hour_fee = ?, updated_at = ? WHERE id = 1', [
    amount,
    at
  ]);
  if (!result.affectedRows) throw new Error('The catalog settings row is missing.');
}

export async function setMinDownpayment(amount, at) {
  const [result] = await pool.query('UPDATE catalog_settings SET min_downpayment = ?, updated_at = ? WHERE id = 1', [
    amount,
    at
  ]);
  if (result.affectedRows === 0)
    throw new Error('The catalog_settings row is missing. Run npm run db:reset and npm run seed:api.');
}

export async function listRentableItems() {
  const [rows] = await pool.query(
    'SELECT id, code, name, category, rentable, archived, rent_price, damage_fee, photo_key FROM inventory_items WHERE rentable = 1 AND archived = 0 AND rent_price > 0'
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    rentable: Boolean(row.rentable),
    archived: Boolean(row.archived),
    rentPrice: row.rent_price,
    damageFee: row.damage_fee,
    code: row.code,
    photoVersion: row.photo_key ? row.photo_key.split('/').pop() : null
  }));
}
