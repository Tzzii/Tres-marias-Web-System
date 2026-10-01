import { BUSINESS, DISH_CATEGORIES, RENTAL, includesFood, isRental } from '../services/config.js';
import { computeQuote } from '../services/pricing.js';
import { formatDate, todayISO } from '../utils/format.js';
import { HOLDS_DATE } from '../utils/status.js';
import { cancelDeadline } from './cancellation.js';

/**
 * Reservation rules that need no stored data: whether a sent quotation is out of date, how many
 * pieces of each item are free for a rental on a date, what a rental costs after an edit, the menu as
 * a display list, and the chat message an approval sends.
 *
 * Pure (no database, no localStorage, no React), so the API server (apps/api/src/modules/reservations)
 * and the pages give the same answers (docs/backend-development-phases.md §7.8). The money rules are in domain/money.js.
 */

// "₱1,200", as the chat messages write amounts
const pesoText = (value) => `₱${Number(value).toLocaleString('en-PH')}`;

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
 * Pieces of an item an event booking holds through its additional charges: the booked quantity of the
 * charge or size the item is linked to (`item.addonId`, e.g. Tent 10x10 for the Tent's 10 × 10 size),
 * 1 for a charge not counted by the piece, 0 when the booking has none of it.
 */
export function addonPieces(reservation, item) {
  if (!item.addonId || !(reservation.addonIds || []).includes(item.addonId)) return 0;
  return (reservation.addonQty || {})[item.addonId] || 1;
}

/**
 * Pieces of each item still free on `date`: the total, minus damaged pieces, minus what other approved
 * rentals on that date have booked, minus what other events dated that day hold. { itemId: pieces }.
 * An event holds what is checked out for it, or what its additional charges book from the item
 * (addonPieces) when that is more, so a tent booked as an additional charge is held from approval and
 * never counted twice once it is checked out. `excludeRef` leaves one booking out (the one being
 * edited or approved). A package's own items only take stock once the admin checks them out, so the
 * admin still confirms them on approval.
 *
 *   inventory     items with { id, total, damaged, addonId?, allocations: { reservationRef or 'none': pieces out } }
 *   reservations  records with { ref, date, status, serviceType, rentalItems, addonIds, addonQty }; the
 *                 server passes only the ones dated `date` (others are skipped here anyway)
 */
export function rentalStock({ inventory, reservations }, date, excludeRef) {
  const sameDay = reservations.filter((r) => r.date === date && r.ref !== excludeRef && HOLDS_DATE.includes(r.status));
  const rentals = sameDay.filter((r) => isRental(r.serviceType));
  const events = sameDay.filter((r) => !isRental(r.serviceType));
  const stock = {};
  inventory.forEach((item) => {
    const booked = rentals.reduce((sum, r) => sum + ((r.rentalItems || []).find((line) => line.itemId === item.id) || { qty: 0 }).qty, 0);
    const atEvents = events.reduce((sum, r) => sum + Math.max(item.allocations[r.ref] || 0, addonPieces(r, item)), 0);
    stock[item.id] = Math.max(0, item.total - item.damaged - booked - atEvents);
  });
  return stock;
}

/**
 * The stock-tracked additional charges an event books that `date` can't supply: [{ itemId, addonId,
 * name, qty }] (name = the item's, e.g. "Tent 10x10"), empty when everything fits. `booking` is
 * { addonIds, addonQty }; `excludeRef` leaves the booking itself out of the count (an approval or a
 * date move). Takes the same `data` as rentalStock.
 */
export function addonShortfall(data, booking, date, excludeRef) {
  const stock = rentalStock(data, date, excludeRef);
  return data.inventory
    .map((item) => ({ itemId: item.id, addonId: item.addonId, name: item.name, qty: addonPieces(booking, item) }))
    .filter((line) => line.qty > 0 && line.qty > (stock[line.itemId] || 0));
}

/**
 * Why a new booking's stock-tracked charges can't be had on `date`, or null: the first one short, as
 * { message, field }, e.g. "Only 1 Tent 10 × 10 is free on 03 Oct 2026." for 'addonQty.add-tent-10x10'.
 * `addons` are the booked charges and sizes (a size named in full); the rest as addonShortfall.
 */
export function addonStockProblem(data, booking, date, addons, excludeRef) {
  const [line] = addonShortfall(data, booking, date, excludeRef);
  if (!line) return null;
  const left = rentalStock(data, date, excludeRef)[line.itemId] || 0;
  const addon = addons.find((a) => a.id === line.addonId);
  const what = addon ? addon.name : line.name;
  const message = left ? `Only ${left} ${what} ${left === 1 ? 'is' : 'are'} free on ${formatDate(date)}.` : `${what} is fully booked on ${formatDate(date)}.`;
  return { message, field: `addonQty.${line.addonId}` };
}

/**
 * How many of each rentable item are free on a date, for the rental form and the admin's edit dialog,
 * and of each item an additional charge books (a tent size), for the booking form: { itemId: { left,
 * status } }, status 'available', 'limited' (at or below the item's alert level `lowStockAt`) or 'out'.
 * Only items that are rentable or linked to an additional charge, and not archived, are listed. Takes
 * the same inputs as rentalStock; `excludeRef` leaves out the booking being edited, so its own pieces
 * count as free.
 */
export function rentalAvailability(data, date, excludeRef) {
  const stock = rentalStock(data, date, excludeRef);
  return Object.fromEntries(
    data.inventory
      .filter((item) => (item.rentable || item.addonId) && !item.archived)
      .map((item) => {
        const left = stock[item.id] || 0;
        return [item.id, { left, status: left <= 0 ? 'out' : left <= item.lowStockAt ? 'limited' : 'available' }];
      })
  );
}

/**
 * What an equipment rental would cost as the customer holds it now: the sent quotation's delivery fee,
 * other charges and discount (or the standard delivery fee before any quotation), with the given lines
 * or pick up / delivery instead of the booking's own (e.g. an edit of the rented items, or a switch to
 * delivery). `pkg` is the booking's package. Gives the estimate of a rental with no quotation yet, and
 * the old and new totals the audit trail and the customer's chat show after an edit.
 */
export function rentalQuote(pkg, reservation, { rentalItems = reservation.rentalItems, fulfilment = reservation.fulfilment } = {}) {
  const quote = reservation.quotation;
  const delivery = fulfilment !== 'delivery' ? 0 : quote && quote.fulfilment === 'delivery' ? quote.deliveryFee : RENTAL.deliveryFee;
  return computeQuote({
    pkg,
    serviceType: reservation.serviceType,
    rentalItems,
    deliveryFee: delivery,
    damageCharges: reservation.damageCharges || [],
    otherCharges: quote ? quote.otherCharges : 0,
    discount: quote ? quote.discount : 0
  });
}

/**
 * The chat message an approval sends (`reservation` is the approved booking, with its due date; `money`
 * is financials() for it), e.g. "Good news! Lim Family Lunch is approved. Please pay a downpayment of at
 * least ₱3,000 by 03 Oct 2026 to secure your date. You can pay more, up to the full ₱48,500. After you
 * pay, you can cancel online until 10 Oct 2026." A total below the minimum asks for the full amount.
 * When the online cancel deadline has already passed (a late approval), it says how to cancel instead
 * of naming a date in the past.
 */
export function approvalMessage(reservation, money) {
  const due = formatDate(reservation.downpaymentDue);
  const pay =
    money.downpayment < money.total
      ? `Please pay a downpayment of at least ${pesoText(money.downpayment)} by ${due} to secure your date. You can pay more, up to the full ${pesoText(money.total)}.`
      : `Please pay the full ${pesoText(money.total)} by ${due} to secure your date.`;
  const deadline = cancelDeadline(reservation);
  const cancel =
    deadline >= todayISO()
      ? `After you pay, you can cancel online until ${formatDate(deadline)}.`
      : `Online cancellation for paid bookings ended on ${formatDate(deadline)}, so after you pay, message us here or call ${BUSINESS.phone} to cancel.`;
  return `Good news! ${reservation.eventName} is approved. ${pay} ${cancel}`;
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
