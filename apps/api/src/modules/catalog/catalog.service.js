import { rentalPriceList, slugify } from '@tm/shared/src/domain/catalog.js';
import { DEFAULT_PRICE_PER_PLATE, DISH_CATEGORIES, PRICE_PER_PLATE_RANGE, RULES } from '@tm/shared/src/services/config.js';
import { ApiError } from '../../lib/ApiError.js';
import { newId } from '../../lib/ids.js';
import { now } from '../../lib/time.js';
import * as repo from './catalog.repo.js';

/**
 * The catalogue rules on the server (docs/backend-development-phases.md Phase 4, §9.2): packages,
 * additional charges (add-ons), buffet dishes, the buffet price per person and the Equipment Rental
 * price list. Same return shapes, error codes and messages as the browser version (catalogService.js)
 * and as the admin forms on the Packages page (PackagesPage.jsx), whose checks are repeated here
 * because the server never trusts the page (§3 rule 3).
 *
 * - Hidden and archived records are shown to an admin only: callers pass { admin } from the token,
 *   and for anyone else the includeHidden / includeArchived switches are ignored.
 * - The Equipment Rental package (kind 'rental') always keeps price 0, guests 0 and no items,
 *   whatever is sent: only its name, description and visibility change. New packages are always
 *   kind 'package'.
 * - Names are unique: a package by its slug, an add-on case-insensitively, a dish within its
 *   category. The UNIQUE indexes are the last guard for two saves at the same moment (ER_DUP_ENTRY
 *   becomes the same NAME_TAKEN).
 * - Pure rules (the slug, the rental price list) come from @tm/shared/src/domain/catalog.js, the
 *   same code the browser version runs.
 */

// Highest package price accepted (whole pesos), so an extra digit is a clear error rather than a
// silently absurd price; the same ceiling as an outsourcing contract (Phase 10)
const MAX_PACKAGE_PRICE = 10_000_000;
// Limits for a package's "What's included" list: lines, and characters per item name
const MAX_ITEMS = 100;
const MAX_ITEM_NAME = 120;
// Highest quantity written at the start of an item line ("100 Porcelain Plates")
const MAX_ITEM_QTY = 100_000;

const peso = (amount) => `₱${amount.toLocaleString('en-PH')}`;
const invalid = (message, field) => new ApiError('INVALID', message, { field });

// A number sent by the page (a number, or digits as text); anything else is NaN, which fails every check
const toNumber = (value) => (typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN);

// True when a save failed on the named UNIQUE index (two saves of the same name at the same moment)
const isDuplicate = (err, ...keys) => err && err.code === 'ER_DUP_ENTRY' && keys.some((key) => String(err.sqlMessage || err.message).includes(key));

/* ============================ Reads ============================ */

/**
 * Packages list: by default only visible, non-archived ones (what customers see). An admin may
 * ask for hidden and archived ones too; for anyone else the switches are ignored.
 */
export function listPackages({ includeHidden = false, includeArchived = false } = {}, { admin = false } = {}) {
  return repo.listPackages({ includeHidden: admin && includeHidden, includeArchived: admin && includeArchived });
}

/** One public package by its URL name, e.g. 'package-1': visible and not archived, for everyone. */
export async function getPackageBySlug(slug) {
  const pkg = await repo.findPublicPackageBySlug(slug);
  if (!pkg) throw new ApiError('NOT_FOUND', 'This package is no longer available.');
  return pkg;
}

/** Additional charges (add-ons): by default only the ones not archived; archived ones for an admin only. */
export function listAddons({ includeArchived = false } = {}, { admin = false } = {}) {
  return repo.listAddons({ includeArchived: admin && includeArchived });
}

/** Dishes a buffet menu can be built from: by default only the ones still offered; archived ones for an admin only. */
export function listDishes({ includeArchived = false } = {}, { admin = false } = {}) {
  return repo.listDishes({ includeArchived: admin && includeArchived });
}

/** The buffet price per person the admin has set, falling back to the starting price (like the browser version). */
async function currentPricePerPlate() {
  return Number(await repo.getPricePerPlate()) || DEFAULT_PRICE_PER_PLATE;
}

/** The buffet price per person alone, for the portals' synchronous pricePerPlate(): { pricePerPlate }. */
export async function getPricePerPlate() {
  return { pricePerPlate: await currentPricePerPlate() };
}

/** The rental price list shown on the Equipment Rental package page: [{ id, name, category, price, damageFee }], no stock counts. */
export async function listRentalItems() {
  return rentalPriceList(await repo.listRentableItems());
}

/**
 * Everything the reservation form needs in one call: visible packages, active add-ons, the dishes a
 * buffet menu is picked from, the buffet price per person and the rental price list. Five queries
 * in parallel, one per list (never one per record).
 */
export async function getCatalog() {
  const [packages, addons, dishes, pricePerPlate, rentals] = await Promise.all([
    repo.listPackages(),
    repo.listAddons(),
    repo.listDishes(),
    currentPricePerPlate(),
    listRentalItems()
  ]);
  return { packages, addons, dishes, pricePerPlate, rentals };
}

/* ============================ Packages (admin) ============================ */

/**
 * The package form's checks (PackagesPage.jsx), with the same messages and fields, plus the limits
 * the page leaves to the server: whole pesos, a ceiling on the price, and on the items list.
 * Returns the clean values to save. For the rental package, price, guests and items are not read.
 */
function packageValues(values, rental) {
  const name = values.name.trim();
  const description = values.description.trim();
  if (name.length < 3) throw invalid('Enter a package name.', 'name');
  if (description.length < 10) throw invalid('Describe the package in at least 10 characters.', 'description');
  // The name is also the package's web address: it needs at least one letter or number to make one
  if (!slugify(name)) throw invalid('Use letters or numbers in the package name.', 'name');
  if (rental) return { name, description, price: 0, guests: 0, items: [] };

  const price = toNumber(values.price);
  if (!price || price < 100) throw invalid('Enter a price of at least ₱100.', 'price');
  if (!Number.isInteger(price)) throw invalid('Enter the price in whole pesos.', 'price');
  if (price > MAX_PACKAGE_PRICE) throw invalid(`Enter a price of at most ${peso(MAX_PACKAGE_PRICE)}.`, 'price');

  const guests = toNumber(values.guests);
  if (!Number.isInteger(guests) || guests < 1 || guests > RULES.maxGuests) throw invalid(`Between 1 and ${RULES.maxGuests}.`, 'guests');

  return { name, description, price, guests, items: packageItems(values.items) };
}

/**
 * "What's included" as [{ qty, name }]: at least one item, each with a name, and a quantity that is
 * a whole number or null ("Buffet Table" has none). Only qty and name are kept.
 */
function packageItems(list) {
  if (!Array.isArray(list) || list.length === 0) throw invalid('List at least one item.', 'items');
  if (list.length > MAX_ITEMS) throw invalid(`List at most ${MAX_ITEMS} items.`, 'items');
  return list.map((item) => {
    const name = item && typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) throw invalid('Give every item a name.', 'items');
    if (name.length > MAX_ITEM_NAME) throw invalid(`Keep each item to ${MAX_ITEM_NAME} characters or fewer.`, 'items');
    const qty = item.qty ?? null;
    if (qty !== null && (!Number.isInteger(qty) || qty < 1 || qty > MAX_ITEM_QTY)) {
      throw invalid(`Start a line with a quantity from 1 to ${MAX_ITEM_QTY.toLocaleString('en-PH')}, or leave the number out.`, 'items');
    }
    return { qty, name };
  });
}

const packageTaken = () => new ApiError('NAME_TAKEN', 'Another package already uses this name.', { field: 'name' });

/**
 * Admin: update the package with this id, or create a new one when id is null. Returns the saved package.
 * Expects { name, price, guests, description, items: [{ qty, name }], visible }. A new package is
 * kind 'package', hidden unless `visible` is true (the form's switch), with the next card colour
 * (mood) and the default icon. Editing keeps the current visibility when `visible` is not sent.
 */
export async function savePackage(id, values) {
  const existing = id ? await repo.findPackageById(id) : null;
  if (id && !existing) throw new ApiError('NOT_FOUND', 'Package not found.');
  const clean = packageValues(values, Boolean(existing && existing.kind === 'rental'));
  const slug = slugify(clean.name);
  if (await repo.packageSlugTaken(slug, id || '')) throw packageTaken();

  const savedId = id || newId('pkg');
  try {
    if (existing) {
      await repo.updatePackage(id, { ...clean, slug, visible: values.visible ?? existing.visible });
    } else {
      const { total, nextOrder } = await repo.packageCounts();
      await repo.insertPackage({
        ...clean,
        id: savedId,
        slug,
        kind: 'package',
        mood: total % 4,
        icon: 'restaurant',
        featured: false,
        visible: values.visible ?? false,
        archived: false,
        sortOrder: nextOrder
      });
    }
  } catch (err) {
    // Another save took the name (or its slug) after the check above
    if (isDuplicate(err, 'uq_packages_slug', 'uq_packages_name')) throw packageTaken();
    throw err;
  }
  return repo.findPackageById(savedId);
}

// The package with this id, or NOT_FOUND
async function packageOrFail(id) {
  const pkg = await repo.findPackageById(id);
  if (!pkg) throw new ApiError('NOT_FOUND', 'Package not found.');
  return pkg;
}

/** Admin: show or hide a package on the website. Returns the package. */
export async function setPackageVisibility(id, visible) {
  await packageOrFail(id);
  await repo.setPackageVisible(id, visible);
  return repo.findPackageById(id);
}

/** Admin: archive (also hides it) or restore a package. Returns the package. */
export async function setPackageArchived(id, archived) {
  await packageOrFail(id);
  await repo.setPackageArchived(id, archived);
  return repo.findPackageById(id);
}

/* ============================ Add-ons (admin) ============================ */

const addonTaken = () => new ApiError('NAME_TAKEN', 'An additional charge with this name already exists.', { field: 'name' });

/**
 * Admin: update the add-on with this id, or create one when id is null: { name, description,
 * hasQuantity }. The price is set in each quotation. Returns the saved add-on.
 */
export async function saveAddon(id, values) {
  const name = values.name.trim();
  const description = values.description.trim();
  if (name.length < 3) throw invalid('Enter the name.', 'name');
  if (description.length < 10) throw invalid('Add a short description.', 'description');
  if (id && !(await repo.findAddonById(id))) throw new ApiError('NOT_FOUND', 'Add-on not found.');
  if (await repo.addonNameTaken(name, id || '')) throw addonTaken();

  const clean = { name, description, hasQuantity: values.hasQuantity };
  const savedId = id || newId('add');
  try {
    if (id) await repo.updateAddon(id, clean);
    else await repo.insertAddon({ ...clean, id: savedId, archived: false, sortOrder: await repo.nextAddonOrder() });
  } catch (err) {
    if (isDuplicate(err, 'uq_addons_name')) throw addonTaken();
    throw err;
  }
  return repo.findAddonById(savedId);
}

/** Admin: archive or restore an add-on. Returns the add-on. */
export async function setAddonArchived(id, archived) {
  if (!(await repo.findAddonById(id))) throw new ApiError('NOT_FOUND', 'Add-on not found.');
  await repo.setAddonArchived(id, archived);
  return repo.findAddonById(id);
}

/* ============================ Dishes (admin) ============================ */

const dishTaken = () => new ApiError('NAME_TAKEN', 'This category already has a dish with that name.', { field: 'name' });

/**
 * Admin: update the dish with this id, or create one when id is null: { name, category }, the
 * category being one of DISH_CATEGORIES. Names are unique within their category. Returns the saved dish.
 */
export async function saveDish(id, values) {
  const name = values.name.trim();
  if (name.length < 2) throw invalid('Enter the name of the dish.', 'name');
  if (!DISH_CATEGORIES.some((c) => c.key === values.category)) throw invalid('Choose which part of the menu this dish belongs to.', 'category');
  if (id && !(await repo.findDishById(id))) throw new ApiError('NOT_FOUND', 'Dish not found.');
  if (await repo.dishNameTaken(values.category, name, id || '')) throw dishTaken();

  const clean = { name, category: values.category };
  const savedId = id || newId('dish');
  try {
    if (id) await repo.updateDish(id, clean);
    else await repo.insertDish({ ...clean, id: savedId, archived: false, sortOrder: await repo.nextDishOrder() });
  } catch (err) {
    if (isDuplicate(err, 'uq_dishes_category_name')) throw dishTaken();
    throw err;
  }
  return repo.findDishById(savedId);
}

/**
 * Admin: archive or restore a dish. Archiving only takes it off the booking form's suggestions;
 * reservations that already named it keep their menu as written. Returns the dish.
 */
export async function setDishArchived(id, archived) {
  if (!(await repo.findDishById(id))) throw new ApiError('NOT_FOUND', 'Dish not found.');
  await repo.setDishArchived(id, archived);
  return repo.findDishById(id);
}

/* ============================ Buffet price per person (admin) ============================ */

/**
 * Admin: set the buffet price per person, a whole number of pesos in PRICE_PER_PLATE_RANGE.
 * It applies to bookings made from now on: each reservation stores the rate it was made at
 * (Phase 6), so raising it never changes what a customer already owes. Returns { pricePerPlate }.
 */
export async function setPricePerPlate(value) {
  const amount = toNumber(value);
  const { min, max } = PRICE_PER_PLATE_RANGE;
  if (!Number.isInteger(amount) || amount < min || amount > max) {
    throw invalid(`The buffet price per person must be between ₱${min} and ₱${max.toLocaleString('en-PH')}.`, 'pricePerPlate');
  }
  await repo.setPricePerPlate(amount, now());
  return { pricePerPlate: amount };
}
