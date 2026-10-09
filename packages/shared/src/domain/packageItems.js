import { extraGuestsFor } from '../services/pricing.js';
import { formatPackageItem } from '../utils/format.js';

/**
 * How a package's "What's included" follows the guest count (the owner's rule, 2026-10-09). A package is
 * priced and equipped for its default guest count (`pkg.guests`). When a booking has more guests:
 *   - the items that grow with the guests (plates, glasses, spoons, forks, chairs, tables) go up in the
 *     same proportion, rounded up: 200 plates at 600 guests -> 600, 20 tables -> 60;
 *   - every other item with a count (food warmers, pitchers, water jugs, waiters) is "to confirm": the
 *     admin sets its count in the quotation (`itemCounts`, by item name), and until then it shows as
 *     "Elegant Food Warmers (to confirm)";
 *   - items without a count (Buffet Table, Arc, Stage) stay as they are;
 *   - the equipment for the extra guests is priced by the admin in the quotation (computeQuote's
 *     extraGuestsCharge); the booking form shows it as "To be quoted".
 * At or below the default guest count nothing changes, and the package price is still the price.
 *
 * Pure (no database, no localStorage, no React), so the API server and the pages give the same answers
 * (docs/backend-development-phases.md §7.8).
 */

/** Highest count the admin can give a "to confirm" item in the quotation (the package form's own limit). */
export const ITEM_COUNT_MAX = 100_000;

// An item counted per guest or per table that the package form saved without saying (see itemGrows)
const TABLE_NAME = /\btables?\b/i;

/**
 * True when a package item grows with the guest count. The package form saves it on each item with a count
 * (`grows`, the "Grows with the guest count" ticks). An item saved before that has no `grows`, so it is
 * worked out: an item counted once per default guest (200 Porcelain Plates on a 200-guest package) or a
 * counted table ("20 Round Tables with Cloth") grows; anything else with a count is to confirm. An item
 * without a count never grows.
 */
export function itemGrows(item, pkg) {
  if (!item || !item.qty) return false;
  if (typeof item.grows === 'boolean') return item.grows;
  return item.qty === Number(pkg && pkg.guests) || TABLE_NAME.test(item.name);
}

/**
 * A package's items for a guest count: [{ name, qty, defaultQty, grows, toConfirm }], in the package's
 * order. `qty` is the count for this booking (null for an item without one) and `defaultQty` the package's
 * own. `itemCounts` ({ 'Elegant Food Warmers': 10 }) are the counts the admin set in the quotation for the
 * items that do not grow; an item without one is `toConfirm` while the guests are above the default.
 */
export function packageItemsFor(pkg, guests, itemCounts = {}) {
  const extra = extraGuestsFor(pkg, guests);
  const counts = itemCounts && typeof itemCounts === 'object' ? itemCounts : {};
  return ((pkg && pkg.items) || []).map((item) => {
    const grows = itemGrows(item, pkg);
    const base = { name: item.name, qty: item.qty ?? null, defaultQty: item.qty ?? null, grows, toConfirm: false };
    if (!extra || !item.qty) return base;
    if (grows) return { ...base, qty: Math.ceil((item.qty * Number(guests)) / Number(pkg.guests)) };
    const set = Number(counts[item.name]);
    return Number.isInteger(set) && set > 0 ? { ...base, qty: set } : { ...base, toConfirm: true };
  });
}

/** The items whose count the admin sets in the quotation for this guest count (none at or below the default). */
export const itemsToConfirm = (pkg, guests) => (extraGuestsFor(pkg, guests) ? packageItemsFor(pkg, guests).filter((item) => item.toConfirm) : []);

/** One item as text for this booking: "600 Porcelain Plates", "Buffet Table", or "Elegant Food Warmers (to confirm)". */
export const formatBookingItem = (item) => (item.toConfirm ? `${item.name} (to confirm)` : formatPackageItem(item));

/**
 * True when a booking's package items and price follow the guest count: a new booking, a request with no
 * quotation yet, and a booking whose quotation was sent under this rule (it keeps `extraGuests`). A quotation
 * sent before 2026-10-09 has no `extraGuests`; its booking keeps the package's own items and price until
 * the admin re-sends the quotation, so nothing a customer already agreed to changes on its own.
 */
export const usesGuestRule = (reservation) => !reservation.quotation || reservation.quotation.extraGuests !== undefined;

/**
 * A saved booking's package items as the customer and the admin see them (the reservation pages and the
 * quotation and contract printouts): grown to its guest count with the counts the admin set in the
 * quotation, or the package's own items for a booking quoted before the rule (usesGuestRule).
 * `reservation` has { package, guests, quotation }.
 */
export function bookingItems(reservation) {
  const pkg = reservation.package;
  if (!usesGuestRule(reservation)) return ((pkg && pkg.items) || []).map((item) => ({ name: item.name, qty: item.qty ?? null, defaultQty: item.qty ?? null, grows: false, toConfirm: false }));
  return packageItemsFor(pkg, reservation.guests, reservation.quotation && reservation.quotation.itemCounts);
}

/** How many guests a saved booking has above its package's default, 0 for a booking quoted before the rule (usesGuestRule). */
export const bookingExtraGuests = (reservation) => (usesGuestRule(reservation) ? extraGuestsFor(reservation.package, reservation.guests) : 0);
