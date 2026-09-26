import { pool } from '../../db.js';
import { parseJson, toJson } from '../../lib/json.js';

/**
 * SQL for packages, add-ons, dishes, the buffet price per person and the rental price list
 * (docs §7.1: the repo holds SQL only; the rules are in catalog.service.js). Rows come back as
 * camelCase records shaped like the browser store's packages[] / addons[] / dishes[] entries, so a
 * page gets the same objects from either side.
 *
 * Lists are in sort_order (then id): the seed's order, and each new record after the rest, which is
 * the order of the browser store's arrays. MySQL has no order of its own without ORDER BY.
 *
 * The reads a booking needs (findPackageById, listAddons, getPricePerPlate) use the pool unless given
 * a connection (`db`), so the reservations module can read them inside its own transaction (Phase 6).
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

const ADDON_COLUMNS = 'id, name, description, has_quantity, archived';

// addons row -> add-on record (null stays null)
const toAddon = (row) =>
  row && {
    id: row.id,
    name: row.name,
    description: row.description,
    hasQuantity: Boolean(row.has_quantity),
    archived: Boolean(row.archived)
  };

/** Add-ons in list order; without includeArchived, only the ones still offered. */
export async function listAddons({ includeArchived = false } = {}, db = pool) {
  const [rows] = await db.query(`SELECT ${ADDON_COLUMNS} FROM addons ${where(includeArchived ? [] : ['archived = 0'])} ORDER BY sort_order, id`);
  return rows.map(toAddon);
}

/** The add-on with this id (archived included), or null. */
export const findAddonById = async (id) => toAddon(first(await pool.query(`SELECT ${ADDON_COLUMNS} FROM addons WHERE id = ?`, [id])));

/**
 * True when an add-on other than `exceptId` (archived ones included) already has this name. The
 * comparison uses the column's collation (utf8mb4_unicode_ci: case and accents ignored), the same
 * one its UNIQUE index uses, so this check and the index agree.
 */
export async function addonNameTaken(name, exceptId) {
  const [rows] = await pool.query('SELECT 1 FROM addons WHERE name = ? AND id <> ? LIMIT 1', [name, exceptId]);
  return rows.length > 0;
}

/** The sort_order a new add-on takes (after the last). */
export async function nextAddonOrder() {
  return Number(first(await pool.query('SELECT COALESCE(MAX(sort_order) + 1, 0) AS nextOrder FROM addons')).nextOrder);
}

/** Save a new add-on. A name already in use fails with ER_DUP_ENTRY (UNIQUE name). */
export async function insertAddon(a) {
  await pool.query(
    'INSERT INTO addons (id, name, description, has_quantity, archived, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    [a.id, a.name, a.description, a.hasQuantity, a.archived, a.sortOrder]
  );
}

/** Save the add-on form: name, description and whether it is counted by the piece. */
export async function updateAddon(id, a) {
  await pool.query('UPDATE addons SET name = ?, description = ?, has_quantity = ? WHERE id = ?', [a.name, a.description, a.hasQuantity, id]);
}

/** Archive or restore an add-on. */
export async function setAddonArchived(id, archived) {
  await pool.query('UPDATE addons SET archived = ? WHERE id = ?', [archived, id]);
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
