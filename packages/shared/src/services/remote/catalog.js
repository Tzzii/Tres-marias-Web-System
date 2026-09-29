import { DEFAULT_MIN_DOWNPAYMENT, DEFAULT_PRICE_PER_PLATE } from '../config.js';
import { emitChange } from '../events.js';
import { http } from '../http.js';

/**
 * The catalog service on the API (apps/api/src/modules/catalog, endpoint map in
 * docs/backend-development-phases.md §9.2): packages, additional charges, buffet dishes, the buffet
 * price per person, the minimum downpayment and the Equipment Rental price list. Same function names,
 * arguments, return shapes and ApiError codes as the browser version (catalogService.js), so no page
 * changes when VITE_API_SERVICES includes "catalog" (see facade/catalog.js).
 *
 * - The includeHidden / includeArchived switches are sent as asked; the server honours them for an
 *   admin's token only, so the customer site can never list a hidden or archived record.
 * - pricePerPlate() and minDownpayment() must answer right away (pages read them while loading or
 *   rendering), so each returns the last value the server gave. Both copies are refreshed by every
 *   catalogue list read (listPackages, listAddons, listDishes wait for the two small GETs alongside
 *   their own), by getCatalog (its answer carries both) and by their own setter, so a page that reads
 *   one right after a catalogue read never shows an older value than the server's (see syncedSetting).
 */

// A record id in a URL path (ids are made by the server, but never trust a path segment)
const segment = (id) => encodeURIComponent(String(id || ''));

// "?includeHidden=true&includeArchived=true" for the switches that are on, or ''
function switches(options) {
  const on = Object.entries(options).filter(([, value]) => value).map(([name]) => `${name}=true`);
  return on.length ? `?${on.join('&')}` : '';
}

/* ---------------- Settings read right away: buffet price per person, minimum downpayment ---------------- */

/**
 * A booking-wide amount the pages read synchronously, kept as the last value the server gave: `path` is
 * its small GET (e.g. '/catalog/price-per-plate'), `field` the key of the answer that holds it, and
 * `fallback` the starting value used until the first answer (the same default as the browser version).
 * `version` goes up with each save, so an answer to a request sent before the last save never replaces
 * the newer value; reads made at the same time share one request.
 */
function syncedSetting(path, field, fallback) {
  let value = null; // the last value from the server; null until the first answer
  let version = 0;
  let pending = null; // the request on its way: { version, promise }

  // Keep a value from the server (a whole number of pesos)
  const remember = (answer) => {
    const amount = Number(answer);
    if (Number.isInteger(amount) && amount > 0) value = amount;
  };

  return {
    /** The value right away: the server's last answer, or the fallback before any. */
    read: () => (value === null ? fallback : value),
    /** Ask the server; resolves once the copy is up to date (an answer older than the last save is dropped). */
    refresh() {
      if (pending && pending.version === version) return pending.promise;
      const sent = version;
      const promise = http
        .get(path)
        .then((data) => {
          if (sent === version) remember(data && data[field]);
        })
        .finally(() => {
          if (pending && pending.promise === promise) pending = null;
        });
      pending = { version: sent, promise };
      return promise;
    },
    /** The version now: taken before a request whose answer also carries the value (getCatalog). */
    stamp: () => version,
    /** Keep the value from an answer to a request sent at `stamp`, unless a save came after it. */
    keep(answer, stamp) {
      if (stamp === version) remember(answer);
    },
    /** A save's own answer: newer than any request still on its way, so it always wins. */
    saved(answer) {
      version += 1;
      remember(answer);
    }
  };
}

const rate = syncedSetting('/catalog/price-per-plate', 'pricePerPlate', DEFAULT_PRICE_PER_PLATE);
const minimum = syncedSetting('/catalog/min-downpayment', 'minDownpayment', DEFAULT_MIN_DOWNPAYMENT);

// A catalogue list read that also brings both settings up to date before it resolves
const withSettings = (request) => Promise.all([request, rate.refresh(), minimum.refresh()]).then(([data]) => data);

/**
 * The buffet price per person, returned right away: the last price the server gave, or the starting
 * price (DEFAULT_PRICE_PER_PLATE, like the browser version) before any catalogue read has finished.
 */
export const pricePerPlate = () => rate.read();

/**
 * The minimum downpayment, returned right away: the last amount the server gave, or the starting
 * amount (DEFAULT_MIN_DOWNPAYMENT) before any catalogue read has finished. Pages that show it first
 * load something from the catalogue (a list, or getCatalog), so they never show a stale default.
 */
export const minDownpayment = () => minimum.read();

/* ---------------- Public reads ---------------- */

/** Packages list. By default only visible, non-archived ones; hidden and archived ones for an admin. */
export const listPackages = ({ includeHidden = false, includeArchived = false } = {}) =>
  withSettings(http.get(`/packages${switches({ includeHidden, includeArchived })}`));

/** One public package by its URL name, e.g. 'package-1'. NOT_FOUND when hidden, archived or unknown. */
export const getPackageBySlug = (slug) => http.get(`/packages/by-slug/${segment(slug)}`);

/** Additional charges (add-ons). By default only the ones not archived. */
export const listAddons = ({ includeArchived = false } = {}) => withSettings(http.get(`/addons${switches({ includeArchived })}`));

/** Dishes a buffet menu can be built from. By default only the ones still offered. */
export const listDishes = ({ includeArchived = false } = {}) => withSettings(http.get(`/dishes${switches({ includeArchived })}`));

/** The rental price list: [{ id, name, category, price, damageFee }], with no stock counts. */
export const listRentalItems = () => http.get('/rental-items');

/** Everything the reservation form needs: { packages, addons, dishes, pricePerPlate, minDownpayment, rentals }. */
export async function getCatalog() {
  const stamps = { rate: rate.stamp(), minimum: minimum.stamp() };
  const catalog = await http.get('/catalog');
  rate.keep(catalog && catalog.pricePerPlate, stamps.rate);
  minimum.keep(catalog && catalog.minDownpayment, stamps.minimum);
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
  rate.saved(result.pricePerPlate); // answers to price requests sent before this save are older: dropped
  emitChange();
  return result;
}

/**
 * Set the minimum downpayment, the same way as the buffet price: the saved amount is kept for
 * minDownpayment() before the change event (quiet, then emitChange), so the pages that reload
 * afterwards already read it. Returns { minDownpayment } like the browser version.
 */
export async function setMinDownpayment(value) {
  const result = await http.put('/admin/catalog/min-downpayment', { minDownpayment: value }, { quiet: true });
  minimum.saved(result.minDownpayment);
  emitChange();
  return result;
}
