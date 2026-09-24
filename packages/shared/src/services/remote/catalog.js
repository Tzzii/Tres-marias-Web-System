import { DEFAULT_PRICE_PER_PLATE } from '../config.js';
import { emitChange } from '../events.js';
import { http } from '../http.js';

/**
 * The catalog service on the API (apps/api/src/modules/catalog, endpoint map in
 * docs/backend-development-phases.md §9.2): packages, additional charges, buffet dishes, the buffet
 * price per person and the Equipment Rental price list. Same function names, arguments, return
 * shapes and ApiError codes as the browser version (catalogService.js), so no page changes when
 * VITE_API_SERVICES includes "catalog" (see facade/catalog.js).
 *
 * - The includeHidden / includeArchived switches are sent as asked; the server honours them for an
 *   admin's token only, so the customer site can never list a hidden or archived record.
 * - pricePerPlate() must answer right away (the admin Packages page reads it while loading), so it
 *   returns the last price the server gave. That copy is refreshed by every catalogue list read
 *   (listPackages, listAddons, listDishes wait for a small GET alongside their own), by getCatalog
 *   (its answer carries the price) and by setPricePerPlate, so the Packages page, which reads it
 *   right after its lists, never shows an older price than the server's.
 */

// A record id in a URL path (ids are made by the server, but never trust a path segment)
const segment = (id) => encodeURIComponent(String(id || ''));

// "?includeHidden=true&includeArchived=true" for the switches that are on, or ''
function switches(options) {
  const on = Object.entries(options).filter(([, value]) => value).map(([name]) => `${name}=true`);
  return on.length ? `?${on.join('&')}` : '';
}

/* ---------------- Buffet price per person (sync) ---------------- */

let rate = null; // the last price per person from the server; null until the first answer
let version = 0; // goes up with each saved price, so an answer to an older request never replaces a newer price
let pending = null; // the price request on its way: { version, promise }

// Keep a price from the server (a whole number of pesos)
function remember(value) {
  const amount = Number(value);
  if (Number.isInteger(amount) && amount > 0) rate = amount;
}

// Ask the server for the price. Reads made at the same time share one request; an answer to a
// request sent before the last save is dropped (the save's own answer is newer).
function refreshRate() {
  if (pending && pending.version === version) return pending.promise;
  const sent = version;
  const promise = http
    .get('/catalog/price-per-plate')
    .then((data) => {
      if (sent === version) remember(data && data.pricePerPlate);
    })
    .finally(() => {
      if (pending && pending.promise === promise) pending = null;
    });
  pending = { version: sent, promise };
  return promise;
}

// A catalogue list read that also brings the price per person up to date before it resolves
const withRate = (request) => Promise.all([request, refreshRate()]).then(([data]) => data);

/**
 * The buffet price per person, returned right away: the last price the server gave, or the starting
 * price (DEFAULT_PRICE_PER_PLATE, like the browser version) before any catalogue read has finished.
 */
export const pricePerPlate = () => (rate === null ? DEFAULT_PRICE_PER_PLATE : rate);

/* ---------------- Public reads ---------------- */

/** Packages list. By default only visible, non-archived ones; hidden and archived ones for an admin. */
export const listPackages = ({ includeHidden = false, includeArchived = false } = {}) =>
  withRate(http.get(`/packages${switches({ includeHidden, includeArchived })}`));

/** One public package by its URL name, e.g. 'package-1'. NOT_FOUND when hidden, archived or unknown. */
export const getPackageBySlug = (slug) => http.get(`/packages/by-slug/${segment(slug)}`);

/** Additional charges (add-ons). By default only the ones not archived. */
export const listAddons = ({ includeArchived = false } = {}) => withRate(http.get(`/addons${switches({ includeArchived })}`));

/** Dishes a buffet menu can be built from. By default only the ones still offered. */
export const listDishes = ({ includeArchived = false } = {}) => withRate(http.get(`/dishes${switches({ includeArchived })}`));

/** The rental price list: [{ id, name, category, price, damageFee }], with no stock counts. */
export const listRentalItems = () => http.get('/rental-items');

/** Everything the reservation form needs: { packages, addons, dishes, pricePerPlate, rentals }. */
export async function getCatalog() {
  const sent = version;
  const catalog = await http.get('/catalog');
  if (sent === version) remember(catalog && catalog.pricePerPlate);
  return catalog;
}

/* ---------------- Admin: catalogue manager ---------------- */

/**
 * Update a package if it has an id, otherwise create a new one (hidden unless `visible` is on).
 * Only the form's fields are sent; the server keeps the kind, slug, colour and icon itself.
 */
export function savePackage(pkg) {
  const { id, name, price, guests, description, items, visible } = pkg;
  const body = { name, price, guests, description, items, visible };
  return id ? http.put(`/admin/packages/${segment(id)}`, body) : http.post('/admin/packages', body);
}

/** Show or hide a package on the website. */
export const setPackageVisibility = (id, visible) => http.patch(`/admin/packages/${segment(id)}/visibility`, { visible });

/** Archive (also hides it) or restore a package. */
export const setPackageArchived = (id, archived) => http.patch(`/admin/packages/${segment(id)}/archived`, { archived });

/** Update or create an additional charge: { id?, name, description, hasQuantity }. */
export function saveAddon(addon) {
  const { id, name, description, hasQuantity } = addon;
  const body = { name, description, hasQuantity: Boolean(hasQuantity) };
  return id ? http.put(`/admin/addons/${segment(id)}`, body) : http.post('/admin/addons', body);
}

/** Archive or restore an additional charge. */
export const setAddonArchived = (id, archived) => http.patch(`/admin/addons/${segment(id)}/archived`, { archived });

/** Update or create a dish: { id?, name, category }. */
export function saveDish(dish) {
  const { id, name, category } = dish;
  return id ? http.put(`/admin/dishes/${segment(id)}`, { name, category }) : http.post('/admin/dishes', { name, category });
}

/** Archive or restore a dish. */
export const setDishArchived = (id, archived) => http.patch(`/admin/dishes/${segment(id)}/archived`, { archived });

/**
 * Set the buffet price per person. The saved price is kept for pricePerPlate() before the change
 * event (quiet, then emitChange), so the pages that reload afterwards already read the new one.
 * Returns { pricePerPlate } like the browser version.
 */
export async function setPricePerPlate(value) {
  const result = await http.put('/admin/catalog/price-per-plate', { pricePerPlate: value }, { quiet: true });
  version += 1; // answers to price requests sent before this save are older: drop them
  remember(result.pricePerPlate);
  emitChange();
  return result;
}
