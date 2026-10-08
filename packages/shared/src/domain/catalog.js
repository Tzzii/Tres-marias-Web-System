import { ADDON_PRICE_RANGE, INVENTORY_CATEGORIES } from '../services/config.js';

/**
 * Catalogue rules that need no stored data: how a package name becomes the URL name (slug) that
 * also keeps package names unique, which inventory items make up the Equipment Rental price
 * list, in what order, and the rules for an additional charge's own price, its sizes and its packages.
 *
 * Pure (no database, no localStorage, no React), so the API server (apps/api/src/modules/catalog) and the
 * pages (the admin's forms, the booking form) give the same answers (docs/backend-development-phases.md §7.8).
 */

/**
 * A name as a URL-safe slug: "Classic Full Service!" -> "classic-full-service". Accents are
 * removed ("Café" -> "cafe"), and every run of other characters becomes one dash. Two package names
 * with the same slug count as the same name ("Classic!" and "classic").
 */
export const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/**
 * What customers can rent through the Equipment Rental package, from inventory items: those marked
 * rentable, not archived, with a rental price. Only the public facts, never the stock counts:
 * [{ id, name, category, price, damageFee }], in INVENTORY_CATEGORIES order, then by name.
 * `items` are inventory records ({ id, name, category, rentable, archived, rentPrice, damageFee, … }).
 */
export function rentalPriceList(items) {
  return items
    .filter((item) => item.rentable && !item.archived && item.rentPrice > 0)
    .map((item) => ({ id: item.id, name: item.name, category: item.category, price: item.rentPrice, damageFee: item.damageFee }))
    .sort((a, b) => INVENTORY_CATEGORIES.indexOf(a.category) - INVENTORY_CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name));
}

/**
 * An additional charge's price as the admin typed it. Blank (null, undefined or only spaces) is null:
 * the charge has no price of its own and is priced in each quotation. Anything else must be a whole
 * number of pesos in ADDON_PRICE_RANGE. Returns { price } or { problem } (the message under the Price box).
 */
export function readAddonPrice(value) {
  if (value === null || value === undefined || String(value).trim() === '') return { price: null };
  const amount = Number(value);
  const { min, max } = ADDON_PRICE_RANGE;
  if (!Number.isInteger(amount) || amount < min || amount > max) {
    return { problem: `Enter a whole amount from ₱${min} to ₱${max.toLocaleString('en-PH')}, or leave it blank.` };
  }
  return { price: amount };
}

/**
 * { addonId: price of one } for the add-ons that have their own price, e.g. { 'add-waiters': 800 }.
 * Add-ons without one are left out, so computeQuote counts them as 0 until the quotation prices them.
 */
export const addonPriceMap = (addons) => Object.fromEntries(addons.filter((a) => a.price > 0).map((a) => [a.id, a.price]));

/** Most sizes (or packages) one additional charge can have. */
export const MAX_ADDON_SIZES = 10;

/** Most characters a package's "What's included" can have. */
export const PACKAGE_INCLUDES_MAX = 1000;

/**
 * The additional charges as the pages use them, from the stored rows ({ id, parentId, name, description,
 * price, hasQuantity, hasPackages, archived, inventoryItemId }, in list order; inventoryItemId is the
 * inventory item the row books, or null). A charge can come in sizes, e.g. Tent in "10 × 10" and
 * "10 × 20", or, when it is a charge with packages (`hasPackages`), in packages, e.g. Sounds and lights in
 * "Basic sound system" and "Basic lights and sounds". Either way each one is a row of its own pointing at
 * its charge (`parentId`), with its own price:
 * - a size is always counted by the piece, and is described by its charge's description;
 * - a package is booked once (never counted by the piece), one per charge at most (packagePickProblem),
 *   and keeps its own description: what the package includes.
 * Returns the charges (the rows without a parentId), each with `hasPackages` and its sizes or packages in
 * `sizes`. Every size or package carries `size` (its own name, "10 × 10" or "Basic sound system"), `name`
 * (in full, "Tent 10 × 10" or "Sounds and lights – Basic sound system"), so quotations, documents and
 * booking lists name it in full, and `isPackage`.
 * Without includeArchived, archived charges, sizes and packages are left out, and so are the sizes of an
 * archived charge; with it, everything is kept, so an old booking can still name what it booked.
 */
export function nestAddons(rows, { includeArchived = false } = {}) {
  const keep = (row) => includeArchived || !row.archived;
  return rows
    .filter((row) => !row.parentId && keep(row))
    .map((charge) => {
      const packages = Boolean(charge.hasPackages);
      return {
        ...charge,
        hasPackages: packages,
        sizes: rows
          .filter((row) => row.parentId === charge.id && keep(row))
          .map((size) =>
            packages
              ? { ...size, size: size.name, name: `${charge.name} – ${size.name}`, description: size.description || '', hasQuantity: false, hasPackages: false, isPackage: true }
              : { ...size, size: size.name, name: `${charge.name} ${size.name}`, description: charge.description, hasQuantity: true, hasPackages: false, isPackage: false }
          )
      };
    });
}

/** The charges of a nested list (nestAddons) and all their sizes and packages in one list, to find any of them by id. */
export const flattenAddons = (charges) => charges.flatMap((charge) => [charge, ...(charge.sizes || [])]);

/**
 * What a customer can book from a nested list (nestAddons): each charge without sizes or packages, and
 * each size or package of a charge that has them. Such a charge is only a heading on the form, never
 * booked itself. (A charge with packages that has none yet is booked like any other charge.)
 */
export const bookableAddons = (charges) => charges.flatMap((charge) => (charge.sizes && charge.sizes.length ? charge.sizes : [charge]));

/**
 * Why these additional charges can't be booked together, or null. `addons` are entries of bookableAddons
 * (a booking's ticked charges, sizes and packages): a charge with packages takes one of its packages at
 * most. Returns { message, field }, the field being `addonQty.<the charge's id>`, where the booking form
 * shows a charge's own message.
 */
export function packagePickProblem(addons) {
  const charges = new Set();
  for (const addon of addons) {
    if (!addon || !addon.isPackage) continue;
    if (charges.has(addon.parentId)) return { message: 'Choose only one package for each additional charge.', field: `addonQty.${addon.parentId}` };
    charges.add(addon.parentId);
  }
  return null;
}

/**
 * The sizes, or with `packages` the packages, the admin typed for an additional charge, in order:
 * [{ id?, name, price, description?, inventoryItemId? }].
 * Each needs a name (at most 60 characters, not listed twice, case ignored) and a price read like
 * readAddonPrice (blank = set in each quotation); `inventoryItemId` is the inventory item it books, or blank
 * for none (whether the item exists is the service's check). A package also has `description`, what it
 * includes: optional, at most PACKAGE_INCLUDES_MAX characters, line breaks kept; a size has none ('').
 * Returns { sizes: [{ id, name, price, description, inventoryItemId }] } (id '' for a new one,
 * inventoryItemId null for none) or { problem, field }, where field is 'sizes', 'sizes.N.name',
 * 'sizes.N.price', 'sizes.N.description' or 'sizes.N.inventoryItemId' (N counts from 0).
 */
export function readAddonSizes(value, { packages = false } = {}) {
  const noun = packages ? 'package' : 'size';
  const list = Array.isArray(value) ? value : [];
  if (list.length > MAX_ADDON_SIZES) return { problem: `Use ${MAX_ADDON_SIZES} ${noun}s or fewer.`, field: 'sizes' };
  const sizes = [];
  const seen = new Set();
  for (let i = 0; i < list.length; i += 1) {
    const entry = list[i] && typeof list[i] === 'object' ? list[i] : {};
    const name = String(entry.name ?? '').trim().replace(/\s+/g, ' ');
    if (!name) return { problem: packages ? 'Enter the package name.' : 'Enter the size.', field: `sizes.${i}.name` };
    if (name.length > 60) return { problem: 'Use 60 characters or fewer.', field: `sizes.${i}.name` };
    if (seen.has(name.toLowerCase())) return { problem: `This ${noun} is already listed.`, field: `sizes.${i}.name` };
    seen.add(name.toLowerCase());
    const { price, problem } = readAddonPrice(entry.price);
    if (problem) return { problem, field: `sizes.${i}.price` };
    // What a package includes, one thing per line as typed; a size keeps none
    const description = packages ? String(entry.description ?? '').replace(/\r\n?/g, '\n').trim() : '';
    if (description.length > PACKAGE_INCLUDES_MAX) return { problem: `Use ${PACKAGE_INCLUDES_MAX.toLocaleString('en-PH')} characters or fewer.`, field: `sizes.${i}.description` };
    const item = entry.inventoryItemId;
    if (item !== undefined && item !== null && item !== '' && typeof item !== 'string') return { problem: 'Choose an inventory item from the list.', field: `sizes.${i}.inventoryItemId` };
    if (item && sizes.some((s) => s.inventoryItemId === item)) return { problem: `Another ${noun} already uses this item.`, field: `sizes.${i}.inventoryItemId` };
    sizes.push({ id: typeof entry.id === 'string' ? entry.id : '', name, price, description, inventoryItemId: item || null });
  }
  return { sizes };
}

/**
 * How to bring a charge's stored sizes (or packages) in line with the admin's list (readAddonSizes).
 * `existing` are the charge's sizes as nestAddons gives them with includeArchived (each with `id` and `size`).
 * - A listed size takes over the stored size of the same name first (an archived one comes back, so old
 *   bookings and the size stay one record), else the stored size with its id; anything else is new.
 * - Stored sizes no longer listed are archived, never deleted, because bookings may point at them.
 * - The list order becomes the sizes' order (sortOrder).
 * Returns { update: [{ id, name, price, description, inventoryItemId, sortOrder }], add: [{ name, price,
 * description, inventoryItemId, sortOrder }], archive: [id] } (description '' for a size).
 * Saved in that order (updates first), no two sizes of the charge ever hold the same name at once.
 */
export function planAddonSizes(existing, wanted) {
  const claimed = new Set();
  const free = (size) => (size && !claimed.has(size.id) ? size : null);
  const update = [];
  const add = [];
  wanted.forEach((w, sortOrder) => {
    const match =
      free(existing.find((s) => s.size.toLowerCase() === w.name.toLowerCase())) ||
      (w.id ? free(existing.find((s) => s.id === w.id)) : null);
    const fields = { name: w.name, price: w.price, description: w.description ?? '', inventoryItemId: w.inventoryItemId ?? null, sortOrder };
    if (match) {
      claimed.add(match.id);
      update.push({ id: match.id, ...fields });
    } else {
      add.push(fields);
    }
  });
  const archive = existing.filter((s) => !claimed.has(s.id) && !s.archived).map((s) => s.id);
  return { update, add, archive };
}

/**
 * A charge as the lists show it (the admin's Packages page, the public pages): only the sizes still
 * offered. Sizes the admin removed stay in the data for the bookings that have them, never in a list.
 */
export const withListedSizes = (charge) => (charge ? { ...charge, sizes: (charge.sizes || []).filter((size) => !size.archived) } : charge);

// A name as it is matched against the inventory: lower case, "×" read as "x", spaces dropped,
// so "Tent 10 × 10" and "Tent 10x10" are the same
const inventoryKey = (value) => String(value || '').toLowerCase().replace(/×/g, 'x').replace(/\s+/g, '');

/**
 * Give the charge (when it has no sizes) and each size that has no inventory item yet the item named
 * after it: the charge's name, plus the size for a size, e.g. the Tent's 10 × 10 size takes "Tent 10x10"
 * (inventoryKey: case, spaces and × against x ignored). Only items not archived and not used by another
 * charge are taken (`ownIds` are this charge's and its sizes' ids), each once. Links already there stay.
 * `values` is { name, inventoryItemId, sizes } as read by readAddonSizes; returns a copy with the links.
 * `inventory` is the items: [{ id, name, archived, addonId }].
 */
export function linkByName(values, inventory, ownIds) {
  const taken = new Set([values.inventoryItemId, ...values.sizes.map((s) => s.inventoryItemId)].filter(Boolean));
  const find = (name) => {
    const item = inventory.find((i) => !i.archived && !taken.has(i.id) && (!i.addonId || ownIds.has(i.addonId)) && inventoryKey(i.name) === inventoryKey(name));
    if (item) taken.add(item.id);
    return item ? item.id : null;
  };
  const sizes = values.sizes.map((s) => (s.inventoryItemId ? s : { ...s, inventoryItemId: find(`${values.name} ${s.name}`) }));
  const inventoryItemId = values.sizes.length ? null : values.inventoryItemId || find(values.name);
  return { ...values, inventoryItemId, sizes };
}
