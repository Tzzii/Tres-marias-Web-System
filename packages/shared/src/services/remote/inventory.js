import { NO_EVENT } from '../../domain/inventory.js';
import { ApiError } from '../errors.js';
import { http } from '../http.js';

/**
 * The equipment inventory on the API (apps/api/src/modules/inventory, endpoint map in
 * docs/backend-development-phases.md §9.9). Same function names, arguments, return shapes and ApiError
 * codes as the browser version (inventoryService.js), so no page changes when VITE_API_SERVICES includes
 * "inventory" (see facade/inventory.js). Admin only: every address is under /api/admin/inventory.
 *
 * - Every write is one request, which emits one change event (http.js), so the Inventory page, the
 *   reservation page's rented items and anything else on screen reload. The customer's rental form reads
 *   the stock fresh for each date (getRentalAvailability), so nothing else needs refreshing.
 * - Without an item id or a booking ref there is nothing to send: those calls still answer as the
 *   browser version would (the item or the booking is not found; nothing is out for no ref at all).
 */

// An item id or a reservation ref in a URL path (never trust a path segment)
const segment = (value) => encodeURIComponent(String(value || ''));
const itemNotFound = () => new ApiError('NOT_FOUND', 'Item not found.');
const rentalNotFound = () => new ApiError('NOT_FOUND', 'We could not find this reservation.');

/** Every item (archived ones only when asked), by category order then name, with its counts and where its pieces are. */
export const listInventory = ({ includeArchived = false } = {}) => http.get(`/admin/inventory${includeArchived ? '?includeArchived=true' : ''}`);

/** The bookings equipment can be checked out for: approved to confirmed, soonest first. */
export const listCheckoutEvents = () => http.get('/admin/inventory/checkout-events');

/** Add one or more items (every row is checked before any is saved). Returns the created items. */
export const addInventoryItems = (items) => http.post('/admin/inventory', { items });

/** Edit an item's name, category, total, alert level, rental settings and notes. Returns the item. */
export async function updateInventoryItem(id, changes) {
  if (!id) throw itemNotFound();
  return http.patch(`/admin/inventory/${segment(id)}`, changes);
}

/**
 * Move pieces between Available, In use and Damaged: 'checkout' { qty, ref? } · 'return' { ref, qty,
 * damagedQty } · 'damage' { qty, note } · 'repair' { qty } · 'dispose' { qty, note }. Returns the item.
 */
export async function moveInventoryStock(id, action, { qty = 0, damagedQty = 0, ref = NO_EVENT, note = '' } = {}) {
  if (!id) throw itemNotFound();
  return http.post(`/admin/inventory/${segment(id)}/movements`, { action, qty, damagedQty, ref, note });
}

/** Archive or restore several items (not while pieces are out). Returns { count }. */
export const setInventoryArchived = (ids, archived) => http.post('/admin/inventory/archive', { ids, archived });

/** Check out everything an approved rental still needs. Returns { lines }. */
export async function checkOutRental(ref) {
  if (!ref) throw rentalNotFound();
  return http.post(`/admin/inventory/rentals/${segment(ref)}/check-out`, {});
}

/** Record a rental coming back: [{ itemId, good, damaged }]; damaged or missing pieces are charged. Returns { pieces, damaged }. */
export async function returnRental(ref, returns = []) {
  if (!ref) throw rentalNotFound();
  return http.post(`/admin/inventory/rentals/${segment(ref)}/return`, { returns });
}

/** What is out for one reservation right now: { itemId: pieces } ({} when nothing is). */
export async function listReservationEquipment(ref) {
  if (!ref) return {};
  return http.get(`/admin/inventory/rentals/${segment(ref)}`);
}

// The "no event" key: the same on both sides
export { NO_EVENT };
