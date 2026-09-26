import { DISH_CATEGORIES, includesFood, isRental } from '../services/config.js';
import { HOLDS_DATE } from '../utils/status.js';

/**
 * Reservation rules that need no stored data: whether a sent quotation is out of date, how many
 * pieces of each item are free for a rental on a date, and the menu as a display list.
 *
 * Pure (no store.js, no localStorage, no React), so the browser service (reservationService.js) and
 * the API server (apps/api/src/modules/reservations) give the same answers
 * (docs/backend-development-phases.md §7.8). The money rules are in domain/money.js.
 */

// Sum of qty x price over rental lines ([{ qty, price }]) or damage lines ([{ qty, fee }])
const rentalTotal = (lines = []) => lines.reduce((sum, line) => sum + line.qty * line.price, 0);
const damageTotal = (lines = []) => lines.reduce((sum, line) => sum + line.qty * line.fee, 0);

/**
 * Why the sent quotation is out of date, in words the admin reads on the quotation card, or '' when
 * it is current. For a buffet, the guest count or the service type changed after it was sent (a
 * buffet is charged per person, so those two are the only edits that can move the total). For a
 * rental, the items (or their count), pick-up versus delivery, and damage charges recorded after the
 * return, e.g. "Damage charges of ₱800 were recorded after it was sent." The admin sees a warning
 * and has to re-send it; nothing about what the customer owes changes on its own.
 */
export function quotationStaleReason(reservation) {
  const quote = reservation.quotation;
  if (!quote) return '';
  if (isRental(reservation.serviceType)) {
    if ((quote.rental || 0) !== rentalTotal(reservation.rentalItems)) return 'The rented items changed after it was sent.';
    if ((quote.fulfilment || 'pickup') !== reservation.fulfilment) return `It was sent for ${quote.fulfilment === 'delivery' ? 'delivery' : 'pick up'}, but this rental is now ${reservation.fulfilment === 'delivery' ? 'delivered' : 'picked up'}.`;
    const damage = damageTotal(reservation.damageCharges);
    if ((quote.damage || 0) !== damage) return `Damage charges of ₱${(damage - (quote.damage || 0)).toLocaleString('en-PH')} were recorded after it was sent.`;
    return '';
  }
  if (quote.serviceType !== reservation.serviceType) return `It was sent as ${quote.serviceType}, but this booking is now ${reservation.serviceType}.`;
  const plates = includesFood(reservation.serviceType) ? reservation.guests : 0;
  if (quote.plates !== plates) return `It was sent for ${quote.plates} guests, but this booking is now for ${reservation.guests}.`;
  return '';
}

/** True when the sent quotation no longer matches the booking it belongs to (see quotationStaleReason). */
export const quotationStale = (reservation) => Boolean(quotationStaleReason(reservation));

/**
 * Pieces of each item still free for a rental on `date`: the total, minus damaged pieces, minus what
 * other approved rentals on that date have booked, minus what is checked out for other events dated
 * that day. { itemId: pieces }. `excludeRef` leaves one booking out (the one being edited or approved).
 * Package bookings only take stock once the admin checks it out, so the admin still confirms on approval.
 *
 *   inventory     items with { id, total, damaged, allocations: { reservationRef or 'none': pieces out } }
 *   reservations  records with { ref, date, status, serviceType, rentalItems }; the browser store passes
 *                 all of them, the server only the ones dated `date` (others are skipped here anyway)
 */
export function rentalStock({ inventory, reservations }, date, excludeRef) {
  const sameDay = reservations.filter((r) => r.date === date && r.ref !== excludeRef && HOLDS_DATE.includes(r.status));
  const rentals = sameDay.filter((r) => isRental(r.serviceType));
  const events = sameDay.filter((r) => !isRental(r.serviceType));
  const stock = {};
  inventory.forEach((item) => {
    const booked = rentals.reduce((sum, r) => sum + ((r.rentalItems || []).find((line) => line.itemId === item.id) || { qty: 0 }).qty, 0);
    const atEvents = events.reduce((sum, r) => sum + (item.allocations[r.ref] || 0), 0);
    stock[item.id] = Math.max(0, item.total - item.damaged - booked - atEvents);
  });
  return stock;
}

/**
 * How many of each rentable item are free on a date, for the rental form and the admin's edit dialog:
 * { itemId: { left, status } }, status 'available', 'limited' (at or below the item's alert level
 * `lowStockAt`) or 'out'. Only items that are rentable and not archived are listed. Takes the same
 * inputs as rentalStock; `excludeRef` leaves out the booking being edited, so its own pieces count as free.
 */
export function rentalAvailability(data, date, excludeRef) {
  const stock = rentalStock(data, date, excludeRef);
  return Object.fromEntries(
    data.inventory
      .filter((item) => item.rentable && !item.archived)
      .map((item) => {
        const left = stock[item.id] || 0;
        return [item.id, { left, status: left <= 0 ? 'out' : left <= item.lowStockAt ? 'limited' : 'available' }];
      })
  );
}

/**
 * The menu as a display list, e.g. [{ key: 'pork', label: 'Pork dish', name: 'Lechon Kawali and Crispy Pata' }].
 * Empty for a Catering only booking.
 *
 * The customer writes each line themselves rather than picking from a list, so a line can name
 * more than one dish. What they typed is what the kitchen reads, word for word.
 */
export function menuDishes(reservation) {
  if (!includesFood(reservation.serviceType) || !reservation.menu) return [];
  return DISH_CATEGORIES.map(({ key, label }) => ({ key, label, name: reservation.menu[key] || '—' }));
}
