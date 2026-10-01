import { nestAddons } from '@tm/shared/src/domain/catalog.js';
import { pool } from '../../db.js';
import { parseJson, toJson } from '../../lib/json.js';

/**
 * SQL for packages, add-ons, dishes, the buffet price per person, the minimum downpayment and the
 * rental price list (docs §7.1: the repo holds SQL only; the rules are in catalog.service.js). Rows
 * come back as camelCase records, the package, add-on and dish objects the pages work with.
 *
 * Lists are in sort_order (then id): the seed's order, and each new record after the rest, the order
 * the admin's lists show. MySQL has no order of its own without ORDER BY.
 *
 * The reads a booking needs (findPackageById, listAddons, getPricePerPlate, getMinDownpayment) use the
 * pool unless given a connection (`db`), so the reservations module can read them inside its own
 * transaction (Phase 6).
 */

// First row of a SELECT, or null
const first = ([rows]) => rows[0] || null;

// WHERE clause from a list of conditions ('' when there are none)
const where = (conditions) => (conditions.length ? `WHERE ${conditions.join(' AND ')}` : '');

/* ============================ Packages ============================ */

const PACKAGE_COLUMNS = 'id, slug, name, kind, price, guests, description, items, mood, icon, featured, visible, archived';

// packages row -> package record (null stays null)
const toPackage = (row) =>
  row && {
    id: row.id,
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    price: row.price,
    guests: row.guests,
    description: row.description,
    items: parseJson(row.items, []),
    mood: row.mood,
    icon: row.icon,
    featured: Boolean(row.featured),
    visible: Boolean(row.visible),
    archived: Boolean(row.archived)
  };

/** Packages in list order. Without the flags: only visible, non-archived ones (what customers see). */
export async function listPackages({ includeHidden = false, includeArchived = false } = {}) {
  const conditions = [];
  if (!includeArchived) conditions.push('archived = 0');
  if (!includeHidden) conditions.push('visible = 1');
  const [rows] = await pool.query(`SELECT ${PACKAGE_COLUMNS} FROM packages ${where(conditions)} ORDER BY sort_order, id`);
  return rows.map(toPackage);
}

/** The package with this id (hidden and archived included), or null. */
export const findPackageById = async (id, db = pool) =>
  toPackage(first(await db.query(`SELECT ${PACKAGE_COLUMNS} FROM packages WHERE id = ?`, [id])));

/** The visible, non-archived package with this slug, or null. */
export const findPublicPackageBySlug = async (slug) =>
  toPackage(first(await pool.query(`SELECT ${PACKAGE_COLUMNS} FROM packages WHERE slug = ? AND visible = 1 AND archived = 0`, [slug])));

/** True when a package other than `exceptId` (archived ones included) already has this slug. */
export async function packageSlugTaken(slug, exceptId) {
  const [rows] = await pool.query('SELECT 1 FROM packages WHERE slug = ? AND id <> ? LIMIT 1', [slug, exceptId]);
  return rows.length > 0;
}

/** How many packages exist (archived included) and the sort_order a new one takes (after the last). */
export async function packageCounts() {
  const row = first(await pool.query('SELECT COUNT(*) AS total, COALESCE(MAX(sort_order) + 1, 0) AS nextOrder FROM packages'));
  return { total: Number(row.total), nextOrder: Number(row.nextOrder) };
}

/** Save a new package. A slug or name already in use fails with ER_DUP_ENTRY (the UNIQUE indexes). */
export async function insertPackage(p) {
  await pool.query(
    `INSERT INTO packages (id, slug, name, kind, price, guests, description, items, mood, icon, featured, visible, archived, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [p.id, p.slug, p.name, p.kind, p.price, p.guests, p.description, toJson(p.items), p.mood, p.icon, p.featured, p.visible, p.archived, p.sortOrder]
  );
}

/** Save the package form: name (and its slug), price, guests, description, items and visibility. */
export async function updatePackage(id, p) {
  await pool.query(
    'UPDATE packages SET slug = ?, name = ?, price = ?, guests = ?, description = ?, items = ?, visible = ? WHERE id = ?',
    [p.slug, p.name, p.price, p.guests, p.description, toJson(p.items), p.visible, id]
  );
}

/** Show or hide a package on the website. */
export async function setPackageVisible(id, visible) {
  await pool.query('UPDATE packages SET visible = ? WHERE id = ?', [visible, id]);
}

/** Archive a package (which also hides it) or restore it (it stays hidden until shown again). */
export async function setPackageArchived(id, archived) {
  const sql = archived ? 'UPDATE packages SET archived = 1, visible = 0 WHERE id = ?' : 'UPDATE packages SET archived = 0 WHERE id = ?';
  await pool.query(sql, [id]);
}

/* ============================ Add-ons ============================ */

// addons row (with the id of the inventory item it books, if any) -> stored add-on record: a charge,
// or one of its sizes or packages when parentId is set
const toAddonRow = (row) => ({
  id: row.id,
  parentId: row.parent_id,
  name: row.name,
  description: row.description,
  price: row.price === null ? null : Number(row.price), // null: priced in each quotation
  hasQuantity: Boolean(row.has_quantity),
  hasPackages: Boolean(row.has_packages), // a charge with packages: its child rows are packages
  archived: Boolean(row.archived),
  inventoryItemId: row.inventory_item_id ?? null // inventory_items.addon_id points here; null: stock not tracked
});

/**
 * The additional charges in list order, each with its sizes or packages in `sizes` (nestAddons in
 * domain/catalog.js: named in full, "Tent 10 × 10"). Without includeArchived, only what is still offered.
 */
export async function listAddons({ includeArchived = false } = {}, db = pool) {
  const [rows] = await db.query(
    `SELECT a.id, a.parent_id, a.name, a.description, a.price, a.has_quantity, a.has_packages, a.archived, i.id AS inventory_item_id
       FROM addons a LEFT JOIN inventory_items i ON i.addon_id = a.id ORDER BY a.sort_order, a.id`
  );
  return nestAddons(rows.map(toAddonRow), { includeArchived });
}

/** The charge with this id (archived included) with all its sizes, archived ones too, or null. A size's id gives null. */
export async function findAddonById(id, db = pool) {
  return (await listAddons({ includeArchived: true }, db)).find((charge) => charge.id === id) || null;
}

/**
 * True when a charge other than `exceptId` (archived ones included) already has this name. Sizes are
 * not counted: they are named within their charge. The comparison uses the column's collation
 * (utf8mb4_unicode_ci: case and accents ignored), the same one its UNIQUE index uses, so this check
 * and the index agree.
 */
export async function addonNameTaken(name, exceptId) {
  const [rows] = await pool.query('SELECT 1 FROM addons WHERE parent_id IS NULL AND name = ? AND id <> ? LIMIT 1', [name, exceptId]);
  return rows.length > 0;
}

/** The sort_order a new charge takes (after the last). */
export async function nextAddonOrder(db = pool) {
  return Number(first(await db.query('SELECT COALESCE(MAX(sort_order) + 1, 0) AS nextOrder FROM addons WHERE parent_id IS NULL')).nextOrder);
}

/**
 * Save a new charge (`hasPackages` on for a charge with packages), or a new size or package of one
 * (`parentId` set). A name already in use fails with ER_DUP_ENTRY (UNIQUE parent_key + name).
 */
export async function insertAddon(a, db = pool) {
  await db.query(
    'INSERT INTO addons (id, parent_id, name, description, price, has_quantity, has_packages, archived, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [a.id, a.parentId ?? null, a.name, a.description, a.price, a.hasQuantity, Boolean(a.hasPackages), a.archived, a.sortOrder]
  );
}

/**
 * Save the add-on form: name, description, price (null for none) and whether it is counted by the piece.
 * Whether it is a charge with packages is set when it is created and never changes here.
 */
export async function updateAddon(id, a, db = pool) {
  await db.query('UPDATE addons SET name = ?, description = ?, price = ?, has_quantity = ? WHERE id = ?', [a.name, a.description, a.price, a.hasQuantity, id]);
}

/**
 * Save one size or package as the admin listed it: name, price, description (what a package includes;
 * '' for a size), whether it is counted by the piece (a size) or booked once (a package), and position.
 * A listed one is never archived.
 */
export async function updateAddonSize(id, size, db = pool) {
  await db.query('UPDATE addons SET name = ?, description = ?, price = ?, sort_order = ?, has_quantity = ?, archived = 0 WHERE id = ?', [
    size.name,
    size.description,
    size.price,
    size.sortOrder,
    size.hasQuantity,
    id
  ]);
}

/** Every inventory item as a charge's link needs it: [{ id, name, archived, addonId }], to match and check links. */
export async function listInventoryForLinks(db = pool) {
  const [rows] = await db.query('SELECT id, name, archived, addon_id FROM inventory_items');
  return rows.map((row) => ({ id: row.id, name: row.name, archived: Boolean(row.archived), addonId: row.addon_id }));
}

/**
 * Point inventory items at the charges and sizes that book them: every item booked by one of `addonIds`
 * is let go first, then each [addonId, itemId] of `links` is set, so items can swap between sizes in one
 * save without meeting the UNIQUE addon_id index.
 */
export async function linkInventoryItems(conn, addonIds, links) {
  if (addonIds.length) await conn.query('UPDATE inventory_items SET addon_id = NULL WHERE addon_id IN (?)', [addonIds]);
  for (const [addonId, itemId] of links) await conn.query('UPDATE inventory_items SET addon_id = ? WHERE id = ?', [addonId, itemId]);
}

/** How many bookings have one of these add-ons (a charge and its sizes). */
export async function countAddonBookings(ids, db = pool) {
  return Number(first(await db.query('SELECT COUNT(DISTINCT reservation_ref) AS n FROM reservation_addons WHERE addon_id IN (?)', [ids])).n);
}

/**
 * Delete a charge for good with its sizes (`ids`: the charge's and its sizes'), inside a transaction:
 * the inventory items they took from are let go first, then the sizes, then the charge.
 */
export async function deleteAddon(conn, chargeId, ids) {
  await conn.query('UPDATE inventory_items SET addon_id = NULL WHERE addon_id IN (?)', [ids]);
  await conn.query('DELETE FROM addons WHERE parent_id = ?', [chargeId]);
  await conn.query('DELETE FROM addons WHERE id = ?', [chargeId]);
}

/** Archive or restore an add-on (a charge, or a size the admin took off the list). */
export async function setAddonArchived(id, archived, db = pool) {
  await db.query('UPDATE addons SET archived = ? WHERE id = ?', [archived, id]);
}

/* ============================ Dishes ============================ */

const DISH_COLUMNS = 'id, category, name, archived';

// dishes row -> dish record (null stays null)
const toDish = (row) => row && { id: row.id, category: row.category, name: row.name, archived: Boolean(row.archived) };

/** Dishes in list order; without includeArchived, only the ones still suggested. */
export async function listDishes({ includeArchived = false } = {}) {
  const [rows] = await pool.query(`SELECT ${DISH_COLUMNS} FROM dishes ${where(includeArchived ? [] : ['archived = 0'])} ORDER BY sort_order, id`);
  return rows.map(toDish);
}

/** The dish with this id (archived included), or null. */
export const findDishById = async (id) => toDish(first(await pool.query(`SELECT ${DISH_COLUMNS} FROM dishes WHERE id = ?`, [id])));

/** True when another dish in the same category (archived ones included) has this name; compared like addonNameTaken. */
export async function dishNameTaken(category, name, exceptId) {
  const [rows] = await pool.query('SELECT 1 FROM dishes WHERE category = ? AND name = ? AND id <> ? LIMIT 1', [category, name, exceptId]);
  return rows.length > 0;
}

/** The sort_order a new dish takes (after the last). */
export async function nextDishOrder() {
  return Number(first(await pool.query('SELECT COALESCE(MAX(sort_order) + 1, 0) AS nextOrder FROM dishes')).nextOrder);
}

/** Save a new dish. A name already in its category fails with ER_DUP_ENTRY (UNIQUE category + name). */
export async function insertDish(d) {
  await pool.query('INSERT INTO dishes (id, category, name, archived, sort_order) VALUES (?, ?, ?, ?, ?)', [d.id, d.category, d.name, d.archived, d.sortOrder]);
}

/** Rename a dish or move it to another category. */
export async function updateDish(id, d) {
  await pool.query('UPDATE dishes SET category = ?, name = ? WHERE id = ?', [d.category, d.name, id]);
}

/** Archive or restore a dish. */
export async function setDishArchived(id, archived) {
  await pool.query('UPDATE dishes SET archived = ? WHERE id = ?', [archived, id]);
}

/** Delete a dish for good. No table points at dishes (a menu is the customer's own words). */
export async function deleteDish(id) {
  await pool.query('DELETE FROM dishes WHERE id = ?', [id]);
}

/* ============================ Buffet price per person ============================ */

/** The saved buffet price per person, or null when the settings row is missing. */
export async function getPricePerPlate(db = pool) {
  const row = first(await db.query('SELECT price_per_plate FROM catalog_settings WHERE id = 1'));
  return row ? row.price_per_plate : null;
}

/**
 * Save the buffet price per person and when it changed. Throws when the settings row is missing
 * (schema.sql and the seeder always create it), rather than reporting a save that did not happen.
 */
export async function setPricePerPlate(amount, at) {
  const [result] = await pool.query('UPDATE catalog_settings SET price_per_plate = ?, updated_at = ? WHERE id = 1', [amount, at]);
  if (result.affectedRows === 0) throw new Error('The catalog_settings row is missing. Run npm run db:reset and npm run seed:api.');
}

/* ============================ Minimum downpayment ============================ */

/** The saved minimum downpayment, or null when the settings row is missing. */
export async function getMinDownpayment(db = pool) {
  const row = first(await db.query('SELECT min_downpayment FROM catalog_settings WHERE id = 1'));
  return row ? row.min_downpayment : null;
}

/**
 * Save the minimum downpayment and when it changed. Throws when the settings row is missing
 * (schema.sql and the seeder always create it), rather than reporting a save that did not happen.
 */
export async function setMinDownpayment(amount, at) {
  const [result] = await pool.query('UPDATE catalog_settings SET min_downpayment = ?, updated_at = ? WHERE id = 1', [amount, at]);
  if (result.affectedRows === 0) throw new Error('The catalog_settings row is missing. Run npm run db:reset and npm run seed:api.');
}

/* ============================ Rental price list ============================ */

/**
 * The inventory items the Equipment Rental package can offer (rentable, not archived, with a rental
 * price), with only the columns the public price list needs: no stock counts are read at all.
 */
export async function listRentableItems() {
  const [rows] = await pool.query(
    'SELECT id, name, category, rentable, archived, rent_price, damage_fee FROM inventory_items WHERE rentable = 1 AND archived = 0 AND rent_price > 0'
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    rentable: Boolean(row.rentable),
    archived: Boolean(row.archived),
    rentPrice: row.rent_price,
    damageFee: row.damage_fee
  }));
}
