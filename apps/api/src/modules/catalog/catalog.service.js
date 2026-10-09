import { linkByName, planAddonSizes, readAddonPrice, readAddonSizes, rentalPriceList, slugify, withListedSizes } from '@tm/shared/src/domain/catalog.js';
import { DEFAULT_MIN_DOWNPAYMENT, DEFAULT_PRICE_PER_PLATE, DISH_CATEGORIES, MIN_DOWNPAYMENT_RANGE, PRICE_PER_PLATE_RANGE, RULES } from '@tm/shared/src/services/config.js';
import { tx } from '../../db.js';
import { ApiError } from '../../lib/ApiError.js';
import { newId } from '../../lib/ids.js';
import { now } from '../../lib/time.js';
import * as repo from './catalog.repo.js';

/**
 * The catalogue rules on the server (docs/backend-development-phases.md Phase 4, §9.2): packages,
 * additional charges (add-ons), buffet dishes, the buffet price per person, the minimum downpayment
 * (added 2026-09-26, next to the price per person) and the Equipment Rental price list. Same error
 * codes and messages as the admin forms on the Packages page (PackagesPage.jsx), whose checks are repeated here
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
 * - Pure rules (the slug, the rental price list, an add-on's price and sizes) come from @tm/shared/src/domain/catalog.js, the
 *   same code the admin's forms run.
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

/** One public package by its URL name, e.g. 'classic': visible and not archived, for everyone. */
export async function getPackageBySlug(slug) {
  const pkg = await repo.findPublicPackageBySlug(slug);
  if (!pkg) throw new ApiError('NOT_FOUND', 'This package is no longer available.');
  return pkg;
}

/**
 * Additional charges (add-ons), each with the sizes still offered: by default only the charges not
 * archived; archived ones for an admin only. Removed sizes never show (withListedSizes).
 */
export async function listAddons({ includeArchived = false } = {}, { admin = false } = {}) {
  return (await repo.listAddons({ includeArchived: admin && includeArchived })).map(withListedSizes);
}

/** Dishes a buffet menu can be built from: by default only the ones still offered; archived ones for an admin only. */
export function listDishes({ includeArchived = false } = {}, { admin = false } = {}) {
  return repo.listDishes({ includeArchived: admin && includeArchived });
}

/** The buffet price per person the admin has set, falling back to the starting price (DEFAULT_PRICE_PER_PLATE). */
async function currentPricePerPlate() {
  return Number(await repo.getPricePerPlate()) || DEFAULT_PRICE_PER_PLATE;
}

/** The buffet price per person alone, for the portals' synchronous pricePerPlate(): { pricePerPlate }. */
export async function getPricePerPlate() {
  return { pricePerPlate: await currentPricePerPlate() };
}

/** The minimum downpayment the admin has set, falling back to the starting amount (DEFAULT_MIN_DOWNPAYMENT). */
async function currentMinDownpayment() {
  return Number(await repo.getMinDownpayment()) || DEFAULT_MIN_DOWNPAYMENT;
}

/** The minimum downpayment alone, for the portals' synchronous minDownpayment(): { minDownpayment }. */
export async function getMinDownpayment() {
  return { minDownpayment: await currentMinDownpayment() };
}

/** The rental price list shown on the Equipment Rental package page: [{ id, name, category, price, damageFee }], no stock counts. */
export async function listRentalItems() {
  return rentalPriceList(await repo.listRentableItems());
}

/**
 * Everything the reservation form needs in one call: visible packages, active add-ons, the dishes a
 * buffet menu is picked from, the buffet price per person, the minimum downpayment and the rental
 * price list. Six queries in parallel, one per list or setting (never one per record).
 */
export async function getCatalog() {
  const [packages, addons, dishes, pricePerPlate, minDownpayment, rentals] = await Promise.all([
    repo.listPackages(),
    repo.listAddons(),
    repo.listDishes(),
    currentPricePerPlate(),
    currentMinDownpayment(),
    listRentalItems()
  ]);
  return { packages, addons, dishes, pricePerPlate, minDownpayment, rentals };
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
 * "What's included" as [{ qty, name, grows }]: at least one item, each with a name, and a quantity that is
 * a whole number or null ("Buffet Table" has none). An item with a quantity also keeps `grows` when it is
 * sent (true: it grows with the guest count, like plates and chairs; false: its count above the package's
 * guests is set in the quotation, like waiters; domain/packageItems.js). Nothing else is kept.
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
    return qty !== null && typeof item.grows === 'boolean' ? { qty, name, grows: item.grows } : { qty, name };
  });
}

const packageTaken = () => new ApiError('NAME_TAKEN', 'Another package already uses this name.', { field: 'name' });

/**
 * Admin: update the package with this id, or create a new one when id is null. Returns the saved package.
 * Expects { name, price, guests, description, items: [{ qty, name, grows }], visible }. A new package is
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
 * Admin: update the charge with this id, or create one when id is null: { name, description, price,
 * hasQuantity, hasPackages, inventoryItemId, sizes }. Returns the saved charge with its sizes.
 * - `price` is optional (readAddonPrice in domain/catalog.js): blank saves null, and the charge is then
 *   priced in each quotation; for a charge counted by the piece it is the price of one.
 * - `hasPackages` makes a new charge a charge with packages (the admin's "Additional charges with
 *   packages", e.g. Sounds and lights); it is read only when the charge is created, and an edit keeps it.
 * - `sizes` is optional (readAddonSizes): [{ id?, name, price }], e.g. a Tent in 10 × 10 and 10 × 20.
 *   Each size has its own price of one and is always counted by the piece; the customer books the sizes,
 *   so a charge with sizes keeps no price or how-many of its own. Sizes left off the list are archived
 *   (planAddonSizes), never deleted, because bookings may point at them, and let their item go.
 *   For a charge with packages the list is its packages: [{ id?, name, price, description }], each with
 *   its own price and what it includes (`description`), booked once; the customer picks one of them.
 *   A charge with packages is never counted by the piece, and keeps no price of its own once it has packages.
 * - `inventoryItemId` (the charge's, when it has no sizes, and each size's) is the inventory item it takes
 *   from, so an event holds those pieces on its date (rentalStock). The admin's page shows it without
 *   changing it: one with none takes the item named after it, if there is one (linkByName: the Tent's
 *   10 × 10 size takes "Tent 10x10"). An item must exist, not be archived and not be used by another charge.
 * All of it is one transaction.
 * A new price applies to bookings made from now on (each booking copies it into its estimate).
 */
export async function saveAddon(id, values) {
  const name = values.name.trim();
  const description = values.description.trim();
  if (name.length < 3) throw invalid('Enter the name.', 'name');
  if (description.length < 10) throw invalid('Add a short description.', 'description');
  const current = id ? await repo.findAddonById(id) : null;
  if (id && !current) throw new ApiError('NOT_FOUND', 'Add-on not found.');
  const hasPackages = current ? current.hasPackages : values.hasPackages === true;
  const sized = readAddonSizes(values.sizes, { packages: hasPackages });
  if (sized.problem) throw invalid(sized.problem, sized.field);
  let { sizes } = sized;
  const own = sizes.length ? { price: null } : readAddonPrice(values.price);
  if (own.problem) throw invalid(own.problem, 'price');
  if (await repo.addonNameTaken(name, id || '')) throw addonTaken();

  // The inventory items it takes from: the links it has, plus the item named after anything without one
  // (linkByName). Each must exist, not be archived, and not be used by another charge.
  const ownIds = new Set([id, ...(current ? current.sizes.map((s) => s.id) : [])].filter(Boolean));
  const inventory = await repo.listInventoryForLinks();
  const linked = linkByName({ name, inventoryItemId: typeof values.inventoryItemId === 'string' ? values.inventoryItemId : null, sizes }, inventory, ownIds);
  const ownItem = linked.inventoryItemId;
  sizes = linked.sizes;
  [[ownItem, 'inventoryItemId'], ...sizes.map((s, i) => [s.inventoryItemId, `sizes.${i}.inventoryItemId`])]
    .filter(([itemId]) => itemId)
    .forEach(([itemId, field]) => {
      const item = inventory.find((i) => i.id === itemId);
      if (!item || item.archived) throw invalid('That inventory item no longer exists.', field);
      if (item.addonId && !ownIds.has(item.addonId)) throw invalid(`${item.name} is already used by another additional charge.`, field);
    });

  const clean = { name, description, price: own.price, hasQuantity: sizes.length || hasPackages ? false : values.hasQuantity, hasPackages };
  // A size is counted by the piece; a package is booked once
  const sizeCounted = !hasPackages;
  const savedId = id || newId('add');
  const plan = planAddonSizes(current ? current.sizes : [], sizes);
  const addedIds = plan.add.map(() => newId('add'));
  // [add-on id, item id] for everything that books an item; archived sizes book none
  const links = [
    ...(ownItem ? [[savedId, ownItem]] : []),
    ...plan.update.filter((s) => s.inventoryItemId).map((s) => [s.id, s.inventoryItemId]),
    ...plan.add.map((s, i) => [addedIds[i], s.inventoryItemId]).filter(([, itemId]) => itemId)
  ];
  try {
    await tx(async (conn) => {
      if (id) await repo.updateAddon(id, clean, conn);
      else await repo.insertAddon({ ...clean, id: savedId, archived: false, sortOrder: await repo.nextAddonOrder(conn) }, conn);
      // Updates first, so a new size never meets a name that an existing size is giving up
      for (const size of plan.update) await repo.updateAddonSize(size.id, { ...size, hasQuantity: sizeCounted }, conn);
      for (const sizeId of plan.archive) await repo.setAddonArchived(sizeId, true, conn);
      for (const [i, size] of plan.add.entries()) {
        await repo.insertAddon(
          { id: addedIds[i], parentId: savedId, name: size.name, description: size.description, price: size.price, hasQuantity: sizeCounted, archived: false, sortOrder: size.sortOrder },
          conn
        );
      }
      await repo.linkInventoryItems(conn, [savedId, ...ownIds], links);
    });
  } catch (err) {
    if (isDuplicate(err, 'uq_addons_name')) throw addonTaken();
    throw err;
  }
  return withListedSizes(await repo.findAddonById(savedId));
}

// A charge is on bookings: deleting it would take it off them, so the admin archives it instead
const addonInUse = (name, count) =>
  new ApiError('IN_USE', `${name} is on ${count} reservation${count === 1 ? '' : 's'}, so it can't be deleted. Archive it instead to stop offering it.`);

/**
 * Admin: delete a charge for good, with its sizes. Only when no booking has it or one of its sizes
 * (IN_USE otherwise: archive it instead, so those bookings keep naming it); a booking made at the same
 * moment is caught by the foreign key and answered the same way. The inventory items it took from stay,
 * no longer linked. Returns { id }.
 */
export async function deleteAddon(id) {
  const charge = await repo.findAddonById(id);
  if (!charge) throw new ApiError('NOT_FOUND', 'Add-on not found.');
  const ids = [charge.id, ...charge.sizes.map((s) => s.id)];
  const booked = await repo.countAddonBookings(ids);
  if (booked) throw addonInUse(charge.name, booked);
  try {
    await tx((conn) => repo.deleteAddon(conn, charge.id, ids));
  } catch (err) {
    if (err && err.code === 'ER_ROW_IS_REFERENCED_2') throw addonInUse(charge.name, await repo.countAddonBookings(ids));
    throw err;
  }
  return { id };
}

/** Admin: archive or restore an add-on. Returns the add-on. */
export async function setAddonArchived(id, archived) {
  if (!(await repo.findAddonById(id))) throw new ApiError('NOT_FOUND', 'Add-on not found.');
  await repo.setAddonArchived(id, archived);
  return withListedSizes(await repo.findAddonById(id));
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

/**
 * Admin: delete a dish suggestion for good. Nothing points at it: a booking's menu is what the customer
 * wrote, so past reservations keep their menus as they are. Returns { id }.
 */
export async function deleteDish(id) {
  if (!(await repo.findDishById(id))) throw new ApiError('NOT_FOUND', 'Dish not found.');
  await repo.deleteDish(id);
  return { id };
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

/* ============================ Minimum downpayment (admin) ============================ */

/**
 * Admin: set the minimum downpayment, the least a customer pays first to secure a date: a whole number
 * of pesos in MIN_DOWNPAYMENT_RANGE (same message and meta.field as the admin's form). It applies to
 * bookings made from now on: each reservation stores the amount it was made with (reservations.
 * min_downpayment), so a change never moves an existing booking. Returns { minDownpayment }.
 */
export async function setMinDownpayment(value) {
  const amount = toNumber(value);
  const { min, max } = MIN_DOWNPAYMENT_RANGE;
  if (!Number.isInteger(amount) || amount < min || amount > max) {
    throw invalid(`The minimum downpayment must be between ₱${min.toLocaleString('en-PH')} and ₱${max.toLocaleString('en-PH')}.`, 'minDownpayment');
  }
  await repo.setMinDownpayment(amount, now());
  return { minDownpayment: amount };
}
