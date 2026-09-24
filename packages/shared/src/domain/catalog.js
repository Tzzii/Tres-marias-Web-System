import { INVENTORY_CATEGORIES } from '../services/config.js';

/**
 * Catalogue rules that need no stored data: how a package name becomes the URL name (slug) that
 * also keeps package names unique, and which inventory items make up the Equipment Rental price
 * list, in what order.
 *
 * Pure (no store.js, no localStorage, no React), so the browser service (catalogService.js) and the
 * API server (apps/api/src/modules/catalog) give the same answers (docs/backend-development-phases.md §7.8).
 */

/**
 * A name as a URL-safe slug: "Package 1 with Waiters!" -> "package-1-with-waiters". Accents are
 * removed ("Café" -> "cafe"), and every run of other characters becomes one dash. Two package names
 * with the same slug count as the same name ("Package 1!" and "package 1").
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
