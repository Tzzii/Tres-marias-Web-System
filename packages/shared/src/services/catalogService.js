import { DEFAULT_PRICE_PER_PLATE, DISH_CATEGORIES, INVENTORY_CATEGORIES, PRICE_PER_PLATE_RANGE } from './config.js';
import { ApiError, clone, latency, read, uid, write } from './store.js';

/**
 * Packages, additional charges (add-ons), buffet dishes and the buffet price per person:
 * public browsing plus the admin catalogue manager.
 *
 * A package is a flat-priced set of equipment and service (never food). Add-ons have no fixed
 * price because the admin prices them in each quotation. Dishes are what a buffet menu is built
 * from, one per category. The buffet price per person is the one price set here rather than per
 * booking, because every buffet is charged the same way.
 *
 * One package is different: the Equipment Rental package (`kind: 'rental'`) has no items or price
 * of its own. Its customer picks inventory items marked rentable and pays each one's rental price
 * per piece, so its "price list" is read from the inventory (listRentalItems).
 */

/** The buffet price per person the admin has set, falling back to the starting price. */
export function pricePerPlate() {
  const saved = read().settings;
  return (saved && Number(saved.pricePerPlate)) || DEFAULT_PRICE_PER_PLATE;
}

/**
 * What customers can rent through the Equipment Rental package: inventory items marked rentable,
 * not archived, with a rental price. Only the public facts, never the stock counts:
 * [{ id, name, category, price, damageFee }], in inventory category order, then by name.
 */
function rentalItems(data) {
  return data.inventory
    .filter((item) => item.rentable && !item.archived && item.rentPrice > 0)
    .map((item) => ({ id: item.id, name: item.name, category: item.category, price: item.rentPrice, damageFee: item.damageFee }))
    .sort((a, b) => INVENTORY_CATEGORIES.indexOf(a.category) - INVENTORY_CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name));
}

/** The rental price list shown on the Equipment Rental package page. */
export async function listRentalItems() {
  await latency(150, 350);
  return rentalItems(read());
}

/** Packages list. By default only visible, non-archived ones (what customers see). */
export async function listPackages({ includeHidden = false, includeArchived = false } = {}) {
  await latency(150, 380);
  return clone(
    read().packages.filter((p) => (includeArchived || !p.archived) && (includeHidden || p.visible))
  );
}

/** One public package by its URL name, e.g. 'package-1'. */
export async function getPackageBySlug(slug) {
  await latency(150, 350);
  const pkg = read().packages.find((p) => p.slug === slug && !p.archived && p.visible);
  if (!pkg) throw new ApiError('NOT_FOUND', 'This package is no longer available.');
  return clone(pkg);
}

/** Additional charges (add-ons). By default only the ones not archived. */
export async function listAddons({ includeArchived = false } = {}) {
  await latency(120, 300);
  return clone(read().addons.filter((a) => includeArchived || !a.archived));
}

/** Dishes a buffet menu can be built from. By default only the ones still offered. */
export async function listDishes({ includeArchived = false } = {}) {
  await latency(120, 300);
  return clone(read().dishes.filter((d) => includeArchived || !d.archived));
}

/**
 * Everything the reservation form needs in one call: visible packages, active add-ons,
 * the dishes a buffet menu is picked from, the buffet price per person, and the items the
 * Equipment Rental package can rent (see rentalItems).
 */
export async function getCatalog() {
  await latency(180, 420);
  const data = read();
  return clone({
    packages: data.packages.filter((p) => !p.archived && p.visible),
    addons: data.addons.filter((a) => !a.archived),
    dishes: data.dishes.filter((d) => !d.archived),
    pricePerPlate: pricePerPlate(),
    rentals: rentalItems(data)
  });
}

// Turn a name into a URL-safe slug: "Package 1 with Waiters!" -> "package-1-with-waiters" (accents removed)
const slugify = (value) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/**
 * Admin: update a package if it has an id, otherwise create a new (hidden) one. Names must be unique.
 * Expects { name, price, guests, description, items: [{ qty, name }], visible }.
 * A package is not tied to a service type: any of them can be booked as a Buffet or as Catering only.
 * The Equipment Rental package keeps its kind, a price of 0, no guests and no items whatever is
 * sent: only its name, description and visibility can change (its prices live in the inventory).
 * New packages are always ordinary ones (`kind: 'package'`).
 */
export async function savePackage(pkg) {
  await latency(350, 650);
  return write((data) => {
    const slug = slugify(pkg.name);
    const clash = data.packages.find((p) => p.slug === slug && p.id !== pkg.id);
    if (clash) throw new ApiError('NAME_TAKEN', 'Another package already uses this name.', { field: 'name' });

    if (pkg.id) {
      const index = data.packages.findIndex((p) => p.id === pkg.id);
      if (index < 0) throw new ApiError('NOT_FOUND', 'Package not found.');
      const existing = data.packages[index];
      const fixed = existing.kind === 'rental' ? { kind: 'rental', price: 0, guests: 0, items: [] } : { kind: existing.kind || 'package' };
      data.packages[index] = { ...existing, ...pkg, ...fixed, slug };
      return clone(data.packages[index]);
    }
    const created = {
      ...pkg,
      kind: 'package',
      id: `pkg-${slug}-${Date.now().toString(36).slice(-4)}`,
      slug,
      mood: data.packages.length % 4,
      icon: 'restaurant',
      featured: false,
      visible: pkg.visible ?? false,
      archived: false
    };
    data.packages.push(created);
    return clone(created);
  });
}

/** Admin: show or hide a package on the website. */
export async function setPackageVisibility(id, visible) {
  await latency(200, 400);
  return write((data) => {
    const pkg = data.packages.find((p) => p.id === id);
    if (!pkg) throw new ApiError('NOT_FOUND', 'Package not found.');
    pkg.visible = visible;
    return clone(pkg);
  });
}

/** Admin: archive (also hides it) or restore a package. */
export async function setPackageArchived(id, archived) {
  await latency(250, 450);
  return write((data) => {
    const pkg = data.packages.find((p) => p.id === id);
    if (!pkg) throw new ApiError('NOT_FOUND', 'Package not found.');
    pkg.archived = archived;
    if (archived) pkg.visible = false;
    return clone(pkg);
  });
}

/**
 * Admin: update or create an add-on (name, description and whether it is counted by the piece;
 * the price is set in each quotation). When `hasQuantity` is on, the booking form asks the
 * customer how many they need and the quotation prices one of them.
 */
export async function saveAddon(addon) {
  await latency(300, 550);
  return write((data) => {
    const name = addon.name.trim();
    if (data.addons.some((a) => a.name.toLowerCase() === name.toLowerCase() && a.id !== addon.id)) {
      throw new ApiError('NAME_TAKEN', 'An additional charge with this name already exists.', { field: 'name' });
    }
    if (addon.id) {
      const existing = data.addons.find((a) => a.id === addon.id);
      if (!existing) throw new ApiError('NOT_FOUND', 'Add-on not found.');
      Object.assign(existing, { name, description: addon.description.trim(), hasQuantity: Boolean(addon.hasQuantity) });
      return clone(existing);
    }
    const created = {
      id: uid('add'),
      name,
      description: addon.description.trim(),
      hasQuantity: Boolean(addon.hasQuantity),
      archived: false
    };
    data.addons.push(created);
    return clone(created);
  });
}

/** Admin: archive or restore an add-on. */
export async function setAddonArchived(id, archived) {
  await latency(200, 400);
  return write((data) => {
    const addon = data.addons.find((a) => a.id === id);
    if (!addon) throw new ApiError('NOT_FOUND', 'Add-on not found.');
    addon.archived = archived;
    return clone(addon);
  });
}

/**
 * Admin: update a dish if it has an id, otherwise create one. A dish is a name inside one of the
 * four buffet categories; names must be unique within their category, so a customer picking a
 * pork dish never sees the same name twice.
 */
export async function saveDish(dish) {
  await latency(250, 500);
  return write((data) => {
    const name = String(dish.name || '').trim();
    if (name.length < 2) throw new ApiError('INVALID', 'Enter the name of the dish.', { field: 'name' });
    if (!DISH_CATEGORIES.some((c) => c.key === dish.category)) {
      throw new ApiError('INVALID', 'Choose which part of the menu this dish belongs to.', { field: 'category' });
    }
    const clash = data.dishes.some((d) => d.category === dish.category && d.name.toLowerCase() === name.toLowerCase() && d.id !== dish.id);
    if (clash) throw new ApiError('NAME_TAKEN', 'This category already has a dish with that name.', { field: 'name' });

    if (dish.id) {
      const existing = data.dishes.find((d) => d.id === dish.id);
      if (!existing) throw new ApiError('NOT_FOUND', 'Dish not found.');
      Object.assign(existing, { name, category: dish.category });
      return clone(existing);
    }
    const created = { id: uid('dish'), name, category: dish.category, archived: false };
    data.dishes.push(created);
    return clone(created);
  });
}

/**
 * Admin: archive or restore a dish. Archiving only takes it off the booking form; reservations
 * that already chose it keep showing it, so an old menu never loses a dish name.
 */
export async function setDishArchived(id, archived) {
  await latency(200, 400);
  return write((data) => {
    const dish = data.dishes.find((d) => d.id === id);
    if (!dish) throw new ApiError('NOT_FOUND', 'Dish not found.');
    dish.archived = archived;
    return clone(dish);
  });
}

/**
 * Admin: set the buffet price per person. It applies to bookings made from now on; quotations
 * already sent keep the price stored on them, so raising it never changes what a customer owes.
 */
export async function setPricePerPlate(value) {
  await latency(250, 450);
  const amount = Number(value);
  const { min, max } = PRICE_PER_PLATE_RANGE;
  if (!Number.isInteger(amount) || amount < min || amount > max) {
    throw new ApiError('INVALID', `The buffet price per person must be between ₱${min} and ₱${max.toLocaleString('en-PH')}.`, { field: 'pricePerPlate' });
  }
  return write((data) => {
    data.settings = { ...data.settings, pricePerPlate: amount };
    return { pricePerPlate: amount };
  });
}
