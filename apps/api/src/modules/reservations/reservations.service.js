import { dateUnavailableReason, timeUnavailableReason } from '@tm/shared/src/domain/availability.js';
import { cancelDeadline, onlineCancellation } from '@tm/shared/src/domain/cancellation.js';
import { downpaymentDueFor, financials, statusForPayments } from '@tm/shared/src/domain/money.js';
import { menuDishes, quotationStale, quotationStaleReason, rentalAvailability, rentalStock } from '@tm/shared/src/domain/reservation.js';
import {
  BUSINESS,
  DEFAULT_MIN_DOWNPAYMENT,
  DEFAULT_PRICE_PER_PLATE,
  DISH_CATEGORIES,
  MENU_LINE_MAX,
  OCCASIONS,
  RENTAL,
  RENTAL_SERVICE,
  RULES,
  SERVICE_TYPES,
  includesFood,
  isRental
} from '@tm/shared/src/services/config.js';
import { computeQuote } from '@tm/shared/src/services/pricing.js';
import { makeReservationRef } from '@tm/shared/src/services/reservationRef.js';
import { addDays, daysFromToday, formatDate, todayISO } from '@tm/shared/src/utils/format.js';
import { HOLDS_DATE, statusLabel } from '@tm/shared/src/utils/status.js';
import { tx } from '../../db.js';
import { ApiError } from '../../lib/ApiError.js';
import { isClockTime, isISODate, now } from '../../lib/time.js';
import { lockAvailability } from '../calendar/calendar.repo.js';
import { availabilityMap } from '../calendar/calendar.service.js';
import * as catalogRepo from '../catalog/catalog.repo.js';
import { postAdminMessage, postCustomerMessage } from '../messages/messages.repo.js';
import * as repo from './reservations.repo.js';

/**
 * The reservation rules on the server (docs/backend-development-phases.md Phase 6, §9.4): the lists
 * and the detail page, the booking form (an event or an equipment rental), the customer's cancellation
 * and change request (Phase 6A), and the admin's actions and edits: quotation, approve, decline,
 * confirm, complete, cancel, "Started preparing" and its undo, logistics, menu, notes and rented items
 * (Phase 6B). Same return shapes, error codes, messages and meta.field as the browser version
 * (reservationService.js), whose checks are repeated here in the same order because the server never
 * trusts the page (§3 rule 3). The rules that need no stored data (money, an out-of-date quotation,
 * rental stock, availability, online cancellation) come from @tm/shared/src/domain, the same code the
 * portals run.
 *
 * Differences from the browser version, on purpose:
 * - The customer is always the signed-in one (from the token), and every answer to a customer leaves
 *   out the admin's private `notes`. The admin's name in the activity log and in chat messages is the
 *   signed-in admin's (req.user.name).
 * - The date must be a real "YYYY-MM-DD" day, the start time "HH:MM", the occasion one of OCCASIONS,
 *   and required text is checked after trimming (spaces alone are not an event name or a venue).
 * - A quotation's amounts must be whole pesos from 0 to MAX_AMOUNT, and a logistics edit needs the
 *   venue, city and address (the browser version takes the page's amounts as they are, and its
 *   logistics card never saves without the venue).
 * - A booking, an approval, a logistics edit and a rented-items edit read the availability map and
 *   the rental stock from the database inside their own transaction, after taking the availability
 *   lock (lockAvailability), so two of them never pass the same check at once.
 * - Refunds reach the server in Phase 8: until then the money figures are worked out with no refunds
 *   (financials(…, [])) and a detail's `refunds` is [].
 * The automatic chat messages (thank-you, change request, refund notice, quotation, approval …) are
 * saved in the same transaction as the change they are about; the chat (modules/messages, Phase 7)
 * shows them.
 * Lock order for every write, so two of them never deadlock: the availability lock (only when the
 * write takes or moves a slot or rental stock), then the booking's row (lockOwner), then the chat thread.
 */

// Refunds are recorded in the browser store until Phase 8 (paymentService.js recordRefund), so the server has none yet
const NO_REFUNDS = [];

// Tries at a new ref when another booking took the same one first (see createReservation)
const MAX_REF_ATTEMPTS = 3;

const notFound = () => new ApiError('NOT_FOUND', 'We could not find this reservation.');
const invalid = (message, field) => new ApiError('INVALID', message, field ? { field } : {});

// Text sent by the page, trimmed; anything that is not text counts as empty. A lone half of an emoji
// (possible only in a hand-made request) becomes "�", since MySQL refuses it inside a JSON column (the menu).
const clean = (value) => (typeof value === 'string' ? value.toWellFormed().trim() : '');
// Text cut to `max` characters as the browser version counts them, without splitting an emoji in two
const cut = (text, max) => {
  const part = text.slice(0, max);
  return part.isWellFormed() ? part : part.slice(0, -1);
};
// A number sent by the page (a number, or digits as text); anything else is NaN, which fails every check
const toNumber = (value) => (typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN);
// An object sent by the page (the menu, the add-on quantities), or an empty one
const plainObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

// True when the booking found is the ref as written. The column's collation (utf8mb4_unicode_ci) ignores
// case and trailing spaces, so "res-2026-1020-01 " would find RES-2026-1020-01; the browser version
// finds only the exact ref, and writes must use the stored spelling or their rows would not group with it.
const sameRef = (found, ref) => found.ref === ref;

// The admin's private notes never reach the customer (schema.sql: "never shown to the customer")
// eslint-disable-next-line no-unused-vars
const withoutNotes = ({ notes, ...rest }) => rest;
// The answer as the asker may see it: a customer's own view (customerId set) or the admin's
const viewFor = (customerId) => (customerId ? withoutNotes : (answer) => answer);

/**
 * Reservation plus package name, customer contact and money figures, for lists: the browser
 * version's summarize(), with the same `cancelDeadline` and `onlineCancel` (whether the customer can
 * cancel online now, domain/cancellation.js, which also counts the pieces checked out for it).
 * `row` is one entry of repo.findReservations().
 */
function summarize({ reservation, packageName, packageSlug, customerName, customerEmail, customerMobile, payments, piecesOut }) {
  const money = financials(reservation, payments, NO_REFUNDS);
  return {
    ...reservation,
    packageName: packageName ?? 'Package',
    packageSlug: packageSlug ?? '',
    customerName: customerName ?? 'Customer',
    customerEmail: customerEmail ?? '',
    customerMobile: customerMobile ?? '',
    quotationStale: quotationStale(reservation),
    quotationStaleReason: quotationStaleReason(reservation),
    ...money,
    cancelDeadline: cancelDeadline(reservation),
    onlineCancel: onlineCancellation(reservation, money, { piecesOut })
  };
}

/* ============================ Reads ============================ */

/** All reservations (admin) or one customer's (`customerId`, without notes), newest request first. */
export async function listReservations({ customerId } = {}) {
  const rows = await tx((conn) => repo.findReservations(conn, { customerId }));
  return rows.map((row) => viewFor(customerId)(summarize(row)));
}

/**
 * Full detail: the summary plus the package, the menu as a list, the add-ons (in the add-on list's
 * order, archived ones included), the payments (newest first), the refunds ([] until Phase 8), the
 * customer with their completed events, and the review (without the admin's flag note). With
 * `customerId`, only that customer's own booking (another customer's is NOT_FOUND, never FORBIDDEN, so
 * its existence is not given away) and no notes. The ref must be spelled exactly as stored (see sameRef).
 */
export async function getReservation(ref, { customerId } = {}) {
  const detail = await tx(async (conn) => {
    const [row] = await repo.findReservations(conn, { customerId, ref });
    if (!row || !sameRef(row.reservation, ref)) throw notFound();
    const { reservation } = row;
    const [pkg, addons, pastEvents, testimonial] = await Promise.all([
      catalogRepo.findPackageById(reservation.packageId, conn),
      catalogRepo.listAddons({ includeArchived: true }, conn),
      repo.countCompleted(conn, reservation.customerId),
      repo.findTestimonial(conn, reservation.ref)
    ]);
    return {
      ...summarize(row),
      package: pkg,
      menuDishes: menuDishes(reservation),
      addons: addons.filter((addon) => reservation.addonIds.includes(addon.id)),
      payments: row.payments,
      refunds: NO_REFUNDS,
      customer:
        row.customerName === null
          ? null
          : { id: reservation.customerId, name: row.customerName, email: row.customerEmail, mobile: row.customerMobile, pastEvents },
      testimonial
    };
  });
  return viewFor(customerId)(detail);
}

/**
 * How many of each rentable item are free on a date, for the rental form and the admin's edit dialog:
 * { itemId: { left, status } } (rentalAvailability in @tm/shared/src/domain/reservation.js). No date
 * gives {} like the browser version; a date that is not a real "YYYY-MM-DD" day is INVALID.
 * `excludeRef` leaves one booking's own pieces free; the route passes it for an admin only.
 */
export async function getRentalAvailability(date, { excludeRef } = {}) {
  if (date === undefined || date === '') return {};
  if (!isISODate(date)) throw invalid('Choose the date you need the items.', 'date');
  const stockData = await tx((conn) => repo.rentalStockInputs(conn, date));
  return rentalAvailability(stockData, date, typeof excludeRef === 'string' ? excludeRef : undefined);
}

/* ============================ Booking ============================ */

// The start time as sent: '' when missing (timeUnavailableReason then answers "Choose a start time",
// as in the browser version); anything else must be "HH:MM", so e.g. "18:00:00" never reaches the CHAR(5) column
function startTimeOf(form) {
  const value = form.startTime ?? '';
  if (value === '') return '';
  if (!isClockTime(value)) throw invalid('Enter the start time as HH:MM, e.g. 18:00.', 'startTime');
  return value;
}

/**
 * A Buffet and Catering or Catering only booking of an ordinary package (the browser version's
 * createReservation checks, in the same order). Because a buffet is charged per person, the estimate
 * is a real figure: package + guests x the price per person today, which is copied onto the booking so
 * a later price rise never changes it. Only the add-on prices are still missing (set in the quotation).
 * The minimum downpayment in force today is copied the same way.
 * Returns the booking's fields, its rental lines (none), and its activity and thank-you texts.
 */
async function eventBooking(conn, pkg, form) {
  const date = form.date;
  if (!isISODate(date)) throw invalid('Choose the event date.', 'date');
  const map = await availabilityMap(conn);
  const reason = dateUnavailableReason(date, map);
  if (reason) throw new ApiError('DATE_UNAVAILABLE', `That date is not available (${reason.toLowerCase()}). Please pick another date.`, { field: 'date' });
  // The start time must not overlap another event that day (pending requests hold no time)
  const startTime = startTimeOf(form);
  const timeReason = timeUnavailableReason(date, startTime, map);
  if (timeReason) throw new ApiError('TIME_UNAVAILABLE', `That start time is not available (${timeReason.toLowerCase()}). Please pick another time.`, { field: 'startTime' });

  // May be above what the package covers: the admin adds charges for that in the quotation
  const guests = toNumber(form.guests);
  if (!Number.isInteger(guests) || guests < RULES.minGuests || guests > RULES.maxGuests) {
    throw invalid(`Guests must be between ${RULES.minGuests} and ${RULES.maxGuests}.`, 'guests');
  }
  const serviceType = form.serviceType;
  if (!SERVICE_TYPES.includes(serviceType)) throw invalid('Choose whether you want a buffet or catering only.', 'serviceType');

  // A buffet names something for each of the four categories, in the customer's own words (a line may
  // name two dishes); catering only carries no menu at all. A very long line is cut, not refused.
  let menu = null;
  if (includesFood(serviceType)) {
    const wanted = plainObject(form.menu);
    menu = {};
    DISH_CATEGORIES.forEach(({ key, label }) => {
      const line = clean(wanted[key]);
      if (line.length < 2) throw invalid(`Tell us what you would like for your ${label.toLowerCase()}.`, `menu.${key}`);
      menu[key] = cut(line, MENU_LINE_MAX);
    });
  }

  // Add-ons archived while the form was open (or never offered) are dropped without an error; the rest
  // keep the order they were ticked in. Those counted by the piece need a how-many, 1 to 99.
  const offered = await catalogRepo.listAddons({}, conn);
  const ticked = [...new Set(Array.isArray(form.addonIds) ? form.addonIds : [])];
  const addons = ticked.map((id) => offered.find((addon) => addon.id === id)).filter(Boolean);
  const quantities = plainObject(form.addonQty);
  const addonQty = {};
  addons.forEach((addon) => {
    if (!addon.hasQuantity) return;
    const many = toNumber(quantities[addon.id]);
    if (!Number.isInteger(many) || many < 1 || many > 99) throw invalid(`Tell us how many you need for ${addon.name} (1 to 99).`, `addonQty.${addon.id}`);
    addonQty[addon.id] = many;
  });
  const addonIds = addons.map((addon) => addon.id);

  const eventName = clean(form.eventName);
  const occasion = clean(form.occasion);
  const venue = { name: clean(form.venueName), address: clean(form.venueAddress), city: clean(form.city), accessNotes: clean(form.accessNotes) };
  if (!eventName || !occasion || !startTime || !venue.name || !venue.address || !venue.city) throw invalid('Please complete every required field.');
  if (!OCCASIONS.includes(occasion)) throw invalid('Choose the occasion.', 'occasion');

  // The buffet price per person as it stands now, copied onto the booking (the fallback as in catalog.service.js)
  const pricePerPlate = Number(await catalogRepo.getPricePerPlate(conn)) || DEFAULT_PRICE_PER_PLATE;
  return {
    fields: {
      eventName, occasion, date, startTime, guests, packageId: pkg.id, serviceType, menu, foodNotes: clean(form.foodNotes), pricePerPlate,
      minDownpayment: await currentMinDownpayment(conn), venue, addonIds, addonQty,
      estimate: computeQuote({ pkg, serviceType, guests, pricePerPlate, addonIds, addonQty })
    },
    lines: [],
    activity: 'Submitted the reservation request.',
    thankYou: `Thank you for your reservation request for ${eventName} on ${formatDate(date)}. We are reviewing it and will send your quotation within 24 hours.`
  };
}

/**
 * Check what a rental asks for and turn it into booking lines: [{ itemId, name, qty, price, damageFee }].
 * `wanted` is [{ itemId, qty }] (the same item twice is added together). A line already on the booking
 * (`current`, the admin's edit of the rented items) keeps the price and damage fee it was booked at,
 * so editing a rental never reprices what the customer agreed to; a new line copies the item's price
 * and damage fee today, so a later price change never moves the booking. Every item must be for rent
 * (rentable, not archived, with a price, unless it is already on the booking) and have enough pieces
 * free on the date; `excludeRef` leaves the booking being edited out of the stock count, so its own
 * pieces count as free. Errors name the line: { field: 'rental.<itemId>' }. `stockData` is
 * repo.rentalStockInputs() for the date.
 */
function rentalLines(stockData, wanted, date, { excludeRef, current = [] } = {}) {
  const qtyById = new Map();
  (Array.isArray(wanted) ? wanted : []).forEach((line) => {
    const itemId = line && typeof line === 'object' ? line.itemId : undefined;
    if (typeof itemId !== 'string') throw invalid('One of the items is no longer for rent. Please remove it.', 'rentalItems');
    qtyById.set(itemId, (qtyById.get(itemId) || 0) + toNumber(line.qty));
  });
  if (!qtyById.size) throw invalid('Choose at least one item to rent.', 'rentalItems');
  const stock = rentalStock(stockData, date, excludeRef);
  return [...qtyById].map(([itemId, qty]) => {
    const item = stockData.inventory.find((i) => i.id === itemId);
    const booked = current.find((line) => line.itemId === itemId);
    if (!item || (!booked && (!item.rentable || item.archived || !item.rentPrice))) {
      throw invalid('One of the items is no longer for rent. Please remove it.', `rental.${itemId}`);
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > RENTAL.maxQty) {
      throw invalid(`Enter how many ${item.name} you need (1 to ${RENTAL.maxQty.toLocaleString('en-PH')}).`, `rental.${itemId}`);
    }
    const left = stock[itemId] || 0;
    if (qty > left) {
      throw new ApiError('OUT_OF_STOCK', left ? `Only ${left} ${item.name} ${left === 1 ? 'is' : 'are'} free on ${formatDate(date)}.` : `${item.name} is fully booked on ${formatDate(date)}.`, { field: `rental.${itemId}` });
    }
    return { itemId, name: item.name, qty, price: booked ? booked.price : item.rentPrice, damageFee: booked ? booked.damageFee : item.damageFee || 0 };
  });
}

/**
 * An Equipment rental request (the browser version's createRental checks, in the same order). The
 * date only needs the usual notice and must not be blocked (a rental takes no event slot), and the
 * time is when the items are picked up or delivered, on the hour or half hour. Pick-up is at
 * RENTAL.pickupPlace and costs nothing; delivery adds the standard fee, which the admin may change in
 * the quotation. Every price is copied, so the estimate is the real rental total; so is today's
 * minimum downpayment.
 */
async function rentalBooking(conn, pkg, form) {
  const date = form.date;
  if (!isISODate(date)) throw invalid('Choose the date you need the items.', 'date');
  const map = await availabilityMap(conn);
  const reason = dateUnavailableReason(date, map, { rental: true });
  if (reason) throw new ApiError('DATE_UNAVAILABLE', `That date is not available (${reason.toLowerCase()}). Please pick another date.`, { field: 'date' });
  // Hours and half hours only; other bookings that day don't matter to a rental
  const startTime = startTimeOf(form);
  const timeReason = timeUnavailableReason(date, startTime, { ...map, events: [] });
  if (timeReason) throw new ApiError('TIME_UNAVAILABLE', `${timeReason}.`, { field: 'startTime' });

  const fulfilment = form.fulfilment;
  if (!['pickup', 'delivery'].includes(fulfilment)) throw invalid('Choose pick up or delivery.', 'fulfilment');
  const eventName = clean(form.eventName);
  const occasion = clean(form.occasion);
  if (!eventName || !occasion || !startTime) throw invalid('Please complete every required field.');
  if (!OCCASIONS.includes(occasion)) throw invalid('Choose the occasion.', 'occasion');
  const place = { name: clean(form.venueName), address: clean(form.venueAddress), city: clean(form.city) };
  if (fulfilment === 'delivery' && (!place.name || !place.address || !place.city)) {
    throw invalid('Tell us where to deliver the items.', 'venueAddress');
  }
  const lines = rentalLines(await repo.rentalStockInputs(conn, date), form.rentalItems, date);
  return {
    fields: {
      eventName, occasion, date, startTime, guests: 0, packageId: pkg.id, serviceType: RENTAL_SERVICE, menu: null, foodNotes: '', pricePerPlate: 0,
      minDownpayment: await currentMinDownpayment(conn), rentalItems: lines, fulfilment, damageCharges: [],
      venue: fulfilment === 'delivery' ? { ...place, accessNotes: clean(form.accessNotes) } : { ...RENTAL.pickupPlace, accessNotes: '' },
      addonIds: [], addonQty: {},
      estimate: computeQuote({ pkg, serviceType: RENTAL_SERVICE, rentalItems: lines, deliveryFee: fulfilment === 'delivery' ? RENTAL.deliveryFee : 0 })
    },
    lines,
    activity: 'Submitted the equipment rental request.',
    thankYou: `Thank you for your equipment rental request for ${formatDate(date)}. We are checking the items and will send your quotation within 24 hours.`
  };
}

// The minimum downpayment as it stands now, read inside the booking's transaction and copied onto it
// (the same fallback as catalog.service.js when the settings row is missing)
const currentMinDownpayment = async (conn) => Number(await catalogRepo.getMinDownpayment(conn)) || DEFAULT_MIN_DOWNPAYMENT;

// The part of a ref shared by every booking for an event date: "2026-10-20" -> "RES-2026-1020-"
// (the first ref for the date without its number, so the format stays in reservationRef.js)
const refPrefix = (date) => makeReservationRef(date, []).replace(/\d+$/, '');

// True when an insert failed because the ref was already taken (the reservations primary key)
const isRefTaken = (err) => Boolean(err) && err.code === 'ER_DUP_ENTRY' && String(err.sqlMessage || '').includes("for key 'reservations.PRIMARY'");

/**
 * One booking, inside its transaction: take the availability lock, check the form, give it the next
 * ref for its event date, and save it with its add-ons or rental lines, its first activity entry and
 * the thank-you in the customer's chat. Returns the customer's view of its summary.
 */
async function book(conn, customer, form) {
  await lockAvailability(conn); // first, before any other row: bookings and calendar writes run one at a time
  const pkg = typeof form.packageId === 'string' ? await catalogRepo.findPackageById(form.packageId, conn) : null;
  if (!pkg || !pkg.visible || pkg.archived) throw invalid('Please choose an available package.', 'packageId');
  const booking = pkg.kind === 'rental' ? await rentalBooking(conn, pkg, form) : await eventBooking(conn, pkg, form);

  const at = now();
  const { date } = booking.fields;
  const ref = makeReservationRef(date, await repo.refsWithPrefix(conn, refPrefix(date)));
  const reservation = {
    ref,
    customerId: customer.id,
    ...booking.fields,
    status: 'pending',
    quotation: null,
    downpaymentDue: null,
    preparingAt: null,
    notes: '',
    declineReason: '',
    cancelReason: '',
    cancelledBy: null,
    createdAt: at
  };
  await repo.insertReservation(conn, reservation);
  await repo.insertAddons(conn, ref, reservation.addonIds, reservation.addonQty);
  await repo.insertRentalLines(conn, ref, booking.lines);
  await repo.insertActivity(conn, ref, { at, actor: customer.name, text: booking.activity });
  await postAdminMessage(conn, reservation, booking.thankYou, null, 'Tres Marias team');

  const [row] = await repo.findReservations(conn, { ref });
  return withoutNotes(summarize(row));
}

/**
 * The signed-in customer submits the booking form; the status starts at Pending, which holds no slot
 * and no rental stock (the admin's approval does, Phase 6B). Picking the Equipment Rental package makes
 * it an Equipment rental. The ref comes from the refs already given out for the event date
 * (makeReservationRef); if another booking was saved with the same ref first, the whole booking is
 * tried again in a new transaction with a fresh read of the refs, up to MAX_REF_ATTEMPTS times (the
 * availability lock already makes this rare). `customer` is req.user: { id, name }.
 */
export async function createReservation(customer, form) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await tx((conn) => book(conn, customer, form));
    } catch (err) {
      if (attempt >= MAX_REF_ATTEMPTS || !isRefTaken(err)) throw err;
    }
  }
}

/* ============================ Customer actions ============================ */

/**
 * The customer cancels their own reservation online, when onlineCancellation (domain/cancellation.js,
 * the browser version's rule) allows it: an unpaid booking any time before the event day; a paid one
 * only until its cancel deadline and before "Started preparing"; never while pieces are checked out
 * for it (inventory_allocations: an event's equipment or a rental's items) or while a payment is being
 * verified (so that payment can't be verified after the cancellation). A refusal carries that rule's
 * code and reason, the same answer as the summary's `onlineCancel`. When money was paid, an unread
 * message from the customer tells the team it has to be returned. A cancelled approved booking frees
 * its slot (the portals then reload the availability map). Returns the customer's view of its summary.
 * Lock order as every write (Phase 6A): the booking's row (lockOwner), then the chat thread.
 */
export async function cancelReservation(ref, customer, reason) {
  const text = clean(reason);
  if (!text) throw invalid('Tell us why you are cancelling.', 'reason');
  return tx(async (conn) => {
    // Locked until the end, so an admin action on the same booking waits and then sees the cancellation
    const owner = await repo.lockOwner(conn, ref);
    if (!owner || !sameRef(owner, ref) || owner.customerId !== customer.id) throw notFound();
    const [row] = await repo.findReservations(conn, { ref });
    const money = financials(row.reservation, row.payments, NO_REFUNDS);
    const online = onlineCancellation(row.reservation, money, { piecesOut: row.piecesOut });
    if (!online.allowed) throw new ApiError(online.code, online.reason);
    await repo.setCancelled(conn, ref, text, 'customer');
    await repo.insertActivity(conn, ref, { at: now(), actor: customer.name, text: `Cancelled the reservation. Reason: ${text}` });
    if (money.paid > 0) {
      await postCustomerMessage(
        conn,
        row.reservation,
        `Cancellation: ${row.reservation.eventName}. Reason: ${text}. ₱${money.paid.toLocaleString('en-PH')} was paid and needs to be returned.`,
        customer.name
      );
    }
    const [updated] = await repo.findReservations(conn, { ref });
    return withoutNotes(summarize(updated));
  });
}

/**
 * The customer asks for a change: "Change request: …" in their chat with the admin (tagged with the
 * reservation, unread for the admin) and an activity entry. Any status, as in the browser version.
 * The booking's row is locked before the chat is touched, the same order as cancelReservation (and
 * every write that posts a chat message: the booking first, then the conversation), so a cancel and a
 * change request sent at the same moment wait for each other instead of deadlocking.
 * Returns { threadId }, the conversation the page opens next.
 */
export async function requestChange(ref, customer, message) {
  const text = clean(message);
  if (!text) throw invalid('Describe the change you would like.', 'message');
  return tx(async (conn) => {
    const owner = await repo.lockOwner(conn, ref);
    if (!owner || !sameRef(owner, ref) || owner.customerId !== customer.id) throw notFound();
    const { threadId } = await postCustomerMessage(conn, owner, `Change request: ${text}`, customer.name);
    await repo.insertActivity(conn, ref, { at: now(), actor: customer.name, text: 'Requested a change to the reservation.' });
    return { threadId };
  });
}

/* ============================ Admin actions and edits (Phase 6B) ============================ */

// Bookings that are over: nothing on them is edited or re-quoted any more
const CLOSED = ['completed', 'declined', 'cancelled'];
// The most one amount in a quotation may be (the outsourcing contract limit too): anything above is a typo
const MAX_AMOUNT = 10000000;

const closedError = () => new ApiError('INVALID_STATE', 'This reservation is closed and can no longer be edited.');
// "₱1,200"
const pesoText = (value) => `₱${Number(value).toLocaleString('en-PH')}`;
// A reason typed by the admin as a sentence of its own, e.g. "Our kitchen is closed" -> "Our kitchen is closed."
const asSentence = (text) => (/[.!?]$/.test(text) ? text : `${text}.`);
// "pick up" / "delivery", for log lines and chat messages
const fulfilmentWord = (value) => (value === 'delivery' ? 'delivery' : 'pick up');
// The rental lines with too few pieces free, e.g. "Monobloc chair (40 of 80), Round table (2 of 5)"
const shortList = (short, stock) => short.map((line) => `${line.name} (${stock[line.itemId] || 0} of ${line.qty})`).join(', ');

// The admin's reason for a decline or a cancellation: at least 5 characters, as the admin's reason dialogs ask
function reasonOf(value) {
  const text = clean(value);
  if (text.length < 5) throw invalid('Please give a short reason (at least 5 characters).', 'reason');
  return text;
}

// An amount typed into the quotation: a whole number of pesos from 0 to MAX_AMOUNT (a box left out is 0)
function quotationAmount(value, field, message = `Enter an amount in whole pesos, up to ${pesoText(MAX_AMOUNT)}.`) {
  const amount = value === undefined ? 0 : toNumber(value);
  if (!Number.isInteger(amount) || amount < 0 || amount > MAX_AMOUNT) throw invalid(message, field);
  return amount;
}

// One entry in the booking's audit trail, by the signed-in admin
const logAdmin = (conn, ref, admin, text) => repo.insertActivity(conn, ref, { at: now(), actor: admin.name, text });

// The booking's summary as saved so far in the transaction (the admin's view, notes included)
async function savedSummary(conn, ref) {
  const [row] = await repo.findReservations(conn, { ref });
  return summarize(row);
}

/**
 * One admin action on a booking, in its own transaction: the availability lock first when the action
 * takes or moves a slot or rental stock (`availability: true`), then the booking's row, locked until
 * the end (it must exist and be spelled exactly as stored, see sameRef), then `action(conn, row)` with
 * the booking as saved (an entry of repo.findReservations(), piecesOut included). A chat message the
 * action posts locks the customer's thread last.
 */
function adminWrite(ref, action, { availability = false } = {}) {
  return tx(async (conn) => {
    if (availability) await lockAvailability(conn);
    const owner = await repo.lockOwner(conn, ref);
    if (!owner || !sameRef(owner, ref)) throw notFound();
    const [row] = await repo.findReservations(conn, { ref });
    return action(conn, row);
  });
}

/**
 * What a rental would cost as the customer holds it now: the sent quotation's delivery fee, other
 * charges and discount (or the standard delivery fee before any quotation), with the given lines or
 * pick up / delivery. The browser version's rentalQuote; `pkg` is the booking's package.
 */
function rentalQuote(pkg, reservation, { rentalItems = reservation.rentalItems, fulfilment = reservation.fulfilment } = {}) {
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
 * An approved booking moved to `date` keeps its downpayment due date at least 3 days before the event:
 * the due date is pulled in, never pushed later. Returns { due, moved }: the due date to save, and
 * whether this rule changed it (the audit trail then lists it).
 */
function dueAfterMove(reservation, date) {
  const due = reservation.downpaymentDue;
  if (reservation.status !== 'approved' || !due || date === reservation.date || due <= addDays(date, -3)) return { due, moved: false };
  return { due: downpaymentDueFor(date, due), moved: true };
}

/**
 * Admin: price the add-ons and any other charges, apply a discount, and send the quotation to the
 * customer's chat (the browser version's sendQuotation). The food is never typed: a buffet is guests x
 * the rate stored on the booking (never today's), and a rental is its items at the prices they were
 * booked at plus any damage charges, with `deliveryFee` for a delivered rental (the standard fee when
 * left out). `values` is { addonPrices: { addonId: price of one }, otherCharges, otherLabel, discount,
 * deliveryFee, note }; every amount is whole pesos from 0 to MAX_AMOUNT.
 *
 * The new total can move the status (statusForPayments): forward when what was paid covers it (e.g. to
 * Confirmed), or back to Approved with a new due date when the payments fall below the downpayment.
 * It may be lower than what was paid: the quotation is sent as it is (a sent quotation is never edited
 * afterwards), the chat says how much was paid above it and that it will be returned, and the audit
 * trail keeps the old and new totals and the overpaid amount. Returns the booking's summary.
 */
export async function sendQuotation(ref, values, admin) {
  return adminWrite(ref, async (conn, row) => {
    const { reservation, payments } = row;
    if (CLOSED.includes(reservation.status)) {
      throw new ApiError('INVALID_STATE', `A ${statusLabel(reservation.status).toLowerCase()} reservation cannot be re-quoted.`);
    }
    const rental = isRental(reservation.serviceType);
    const delivered = rental && reservation.fulfilment === 'delivery';
    const fee = values.deliveryFee === undefined ? RENTAL.deliveryFee : values.deliveryFee;
    const deliveryFee = delivered ? quotationAmount(fee, 'deliveryFee', 'Enter the delivery fee.') : 0;
    const addonPrices = Object.fromEntries(Object.entries(plainObject(values.addonPrices)).map(([id, price]) => [id, quotationAmount(price, `addonPrices.${id}`)]));
    const otherCharges = quotationAmount(values.otherCharges, 'otherCharges');
    const discount = quotationAmount(values.discount, 'discount');
    const note = clean(values.note);

    // The total the customer held before this quotation, for the audit trail
    const totalBefore = financials(reservation, payments, NO_REFUNDS).total;
    const quote = computeQuote({
      pkg: await catalogRepo.findPackageById(reservation.packageId, conn),
      serviceType: reservation.serviceType,
      guests: reservation.guests,
      pricePerPlate: reservation.pricePerPlate,
      rentalItems: rental ? reservation.rentalItems : [],
      deliveryFee,
      damageCharges: rental ? reservation.damageCharges : [],
      addonIds: reservation.addonIds,
      addonQty: reservation.addonQty,
      addonPrices,
      otherCharges,
      discount
    });
    const quotation = { ...quote, ...(rental ? { fulfilment: reservation.fulfilment } : {}), otherLabel: quote.otherCharges ? clean(values.otherLabel) : '', sentAt: now(), note };
    const quoted = { ...reservation, quotation };
    const saved = { quotation };
    const log = [`Sent the quotation (${pesoText(quote.net)}).`];

    // The new total may change where the booking stands; back at Approved it gets a new due date
    let extra = '';
    const money = financials(quoted, payments, NO_REFUNDS);
    const status = statusForPayments(reservation.status, money);
    if (status !== reservation.status) {
      saved.status = status;
      if (status === 'approved') {
        saved.downpaymentDue = downpaymentDueFor(reservation.date);
        log.push('Status moved back to Approved: the payments are below the minimum downpayment.');
        extra = ` Please pay ${pesoText(money.downpayment - money.paid)} more by ${formatDate(saved.downpaymentDue)} to reach the minimum downpayment of ${pesoText(money.downpayment)}.`;
      } else {
        log.push(`Status moved to ${statusLabel(status)} under the new quotation.`);
      }
    }
    // Paid more than the new total: say so in the chat and keep both totals in the audit trail
    const after = financials({ ...quoted, status }, payments, NO_REFUNDS);
    if (after.overpaid > 0) {
      log.push(`Total from ${pesoText(totalBefore)} to ${pesoText(quote.net)}, below the ${pesoText(after.paid)} paid: ${pesoText(after.overpaid)} was paid above the new total and is to be returned.`);
      extra += ` You've paid ${pesoText(after.overpaid)} more than the new total. We'll return it and tell you here when it's sent.`;
    }

    await repo.updateReservation(conn, ref, saved);
    for (const text of log) await logAdmin(conn, ref, admin, text);
    await postAdminMessage(conn, reservation, `Your quotation for ${reservation.eventName} is ready. Net total: ${pesoText(quote.net)}.${note ? ` ${note}` : ''}${extra}`, { name: `Quotation-${ref}.pdf`, kind: 'quotation', ref }, admin.name);
    return savedSummary(conn, ref);
  });
}

/**
 * The chat message an approval sends (`money` is financials() for the approved booking), word for word
 * the browser version's: pay at least the booking's minimum downpayment by the due date (up to the full
 * total; a total below the minimum is paid in full), and until when the booking can be cancelled online
 * after paying, or how to cancel when that date has already passed (a late approval).
 */
function approvalMessage(reservation, money) {
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
 * Admin: approve a pending request and set the downpayment due date. The quotation must be sent first
 * (NO_QUOTATION); the date must not have passed or be blocked. Then an event needs a slot under the
 * daily capacity (CAPACITY) and a start time clear of the events already approved that day
 * (TIME_UNAVAILABLE; pending requests hold no time), while an equipment rental, which takes no slot,
 * needs enough of every item still free that day (OUT_OF_STOCK). It runs under the availability lock,
 * so two approvals for the last slot never both pass. The chat message (approvalMessage) comes with the
 * quotation. Returns the booking's summary.
 */
export async function approveReservation(ref, admin) {
  return adminWrite(
    ref,
    async (conn, row) => {
      const { reservation } = row;
      const { date } = reservation;
      if (reservation.status !== 'pending') throw new ApiError('INVALID_STATE', 'Only pending reservations can be approved.');
      if (!reservation.quotation) throw new ApiError('NO_QUOTATION', 'Send the quotation first so the food and additional charges are priced.');
      if (daysFromToday(date) < 0) throw new ApiError('INVALID_STATE', 'This event date has passed. Move the event to a new date before approving.');
      const map = await availabilityMap(conn);
      const blocked = map.blocked.find((b) => b.date === date);
      if (blocked) throw new ApiError('DATE_UNAVAILABLE', `${formatDate(date)} is blocked (${blocked.reason.toLowerCase()}). Move the event to another date before approving.`);

      if (isRental(reservation.serviceType)) {
        // Refused if another approved rental (or an event's checked-out equipment) took the pieces meanwhile
        const stock = rentalStock(await repo.rentalStockInputs(conn, date), date, ref);
        const short = reservation.rentalItems.filter((line) => line.qty > (stock[line.itemId] || 0));
        if (short.length) throw new ApiError('OUT_OF_STOCK', `Not enough free on ${formatDate(date)}: ${shortList(short, stock)}. Change the items or the date before approving.`);
      } else {
        // The events already holding the date (this pending one holds none yet; rentals never do)
        if ((map.booked[date] || 0) >= map.capacity) throw new ApiError('CAPACITY', `${formatDate(date)} is already at the daily capacity of ${map.capacity} events.`);
        // The start time must be clear of the events approved that day, with the setup buffer around them
        const timeReason = timeUnavailableReason(date, reservation.startTime, { ...map, events: map.events.filter((e) => e.ref !== ref) });
        if (timeReason) throw new ApiError('TIME_UNAVAILABLE', `${timeReason} on ${formatDate(date)}. Change the start time before approving.`);
      }

      // Due in RULES.downpaymentDueDays, but no later than 3 days before the event (and never before today)
      const approved = { ...reservation, status: 'approved', downpaymentDue: downpaymentDueFor(date) };
      await repo.updateReservation(conn, ref, { status: approved.status, downpaymentDue: approved.downpaymentDue });
      await logAdmin(conn, ref, admin, 'Approved the reservation.');
      await postAdminMessage(conn, reservation, approvalMessage(approved, financials(approved, row.payments, NO_REFUNDS)), { name: `Quotation-${ref}.pdf`, kind: 'quotation', ref }, admin.name);
      return savedSummary(conn, ref);
    },
    { availability: true }
  );
}

/** Admin: decline a pending request, with a reason (5+ characters) sent to the customer's chat. Returns the summary. */
export async function declineReservation(ref, reason, admin) {
  const text = reasonOf(reason);
  return adminWrite(ref, async (conn, { reservation }) => {
    if (reservation.status !== 'pending') throw new ApiError('INVALID_STATE', 'Only pending reservations can be declined.');
    await repo.updateReservation(conn, ref, { status: 'declined', declineReason: text });
    await logAdmin(conn, ref, admin, `Declined the reservation. Reason: ${text}`);
    await postAdminMessage(conn, reservation, `We are sorry, we are unable to accept ${reservation.eventName}. ${text}`, null, admin.name);
    return savedSummary(conn, ref);
  });
}

/** Admin: confirm a booking once its downpayment is verified; the contract becomes available in the customer's Documents. Returns the summary. */
export async function confirmReservation(ref, admin) {
  return adminWrite(ref, async (conn, { reservation }) => {
    if (reservation.status !== 'downpayment_paid') throw new ApiError('INVALID_STATE', 'The downpayment must be verified before the booking is confirmed.');
    await repo.updateReservation(conn, ref, { status: 'confirmed' });
    await logAdmin(conn, ref, admin, 'Confirmed the booking.');
    await postAdminMessage(conn, reservation, `${reservation.eventName} is now confirmed. Your contract is available in Documents.`, { name: `Contract-${ref}.pdf`, kind: 'contract', ref }, admin.name);
    return savedSummary(conn, ref);
  });
}

/**
 * Admin: mark a confirmed event completed, on or after its date, and invite a testimonial. A rental can
 * only be completed once every rented piece is back (no inventory_allocations left) and the customer
 * holds a quotation with any damage charges on it, because a completed booking can't be re-quoted.
 * Returns the summary.
 */
export async function completeReservation(ref, admin) {
  return adminWrite(ref, async (conn, row) => {
    const { reservation } = row;
    if (reservation.status !== 'confirmed') throw new ApiError('INVALID_STATE', 'Only confirmed bookings can be marked completed.');
    if (daysFromToday(reservation.date) > 0) throw new ApiError('INVALID_STATE', 'An event can be completed on or after its date.');
    if (isRental(reservation.serviceType)) {
      if (row.piecesOut > 0) throw new ApiError('INVALID_STATE', 'Record the return of the rented items before completing this rental.');
      if (quotationStale(reservation)) throw new ApiError('INVALID_STATE', 'Re-send the quotation first, so the customer has the final total with any damage charges.');
    }
    await repo.updateReservation(conn, ref, { status: 'completed' });
    await logAdmin(conn, ref, admin, 'Marked the event as completed.');
    await postAdminMessage(conn, reservation, `Thank you for celebrating with Tres Marias! We would love to hear how ${reservation.eventName} went. You can leave a testimonial from your account.`, null, admin.name);
    return savedSummary(conn, ref);
  });
}

/**
 * Admin: cancel an Approved, Downpayment paid or Confirmed booking, with a reason (5+ characters) shown
 * to the customer; a pending request is declined instead. Refused while a payment waits for
 * verification (PENDING_PAYMENT: verify or reject it first) and while pieces are still checked out for
 * it (record their return first). Saves cancelled_by = 'admin', releases the date, keeps the reason in
 * the audit trail and tells the customer in their chat; when money was paid the message says it will be
 * returned, and the booking shows under "Refunds to send". Returns the summary.
 */
export async function cancelReservationByAdmin(ref, reason, admin) {
  const text = reasonOf(reason);
  return adminWrite(ref, async (conn, row) => {
    const { reservation } = row;
    if (!HOLDS_DATE.includes(reservation.status)) {
      throw new ApiError('INVALID_STATE', reservation.status === 'pending' ? 'A pending request is declined, not cancelled.' : `A ${statusLabel(reservation.status).toLowerCase()} reservation cannot be cancelled.`);
    }
    const money = financials(reservation, row.payments, NO_REFUNDS);
    if (money.awaitingCount > 0) throw new ApiError('PENDING_PAYMENT', 'A payment for this reservation is waiting for verification. Verify or reject it first.');
    if (row.piecesOut > 0) throw new ApiError('INVALID_STATE', 'Some items are still checked out for this booking. Record the return first.');
    await repo.setCancelled(conn, ref, text, 'admin');
    await logAdmin(conn, ref, admin, `Cancelled the reservation. Reason: ${text}`);
    const refund = money.paid > 0 ? ` We'll return ${pesoText(money.paid)} and tell you here when it's sent.` : '';
    await postAdminMessage(conn, reservation, `We are sorry, we had to cancel ${reservation.eventName} on ${formatDate(reservation.date)}. ${asSentence(text)}${refund}`, null, admin.name);
    return savedSummary(conn, ref);
  });
}

/**
 * Admin: mark that preparation has started ("Started preparing") on a booking whose downpayment is paid
 * (Downpayment paid or Confirmed). A mark (preparing_at), not a status: from now on the customer can no
 * longer cancel online (onlineCancellation), and their chat says to message us or call instead.
 * undoPreparing takes it back. Returns the summary.
 */
export async function startPreparing(ref, admin) {
  return adminWrite(ref, async (conn, { reservation }) => {
    if (!['downpayment_paid', 'confirmed'].includes(reservation.status)) throw new ApiError('INVALID_STATE', 'Preparation can be marked once the downpayment is paid.');
    if (reservation.preparingAt) throw new ApiError('INVALID_STATE', 'This booking is already marked as started preparing.');
    await repo.updateReservation(conn, ref, { preparingAt: now() });
    await logAdmin(conn, ref, admin, 'Marked the booking as started preparing. The customer can no longer cancel online.');
    await postAdminMessage(conn, reservation, `We've started preparing for ${reservation.eventName}. To cancel from now on, message us here or call ${BUSINESS.phone}.`, null, admin.name);
    return savedSummary(conn, ref);
  });
}

/**
 * Admin: take back "Started preparing" (marked by mistake), while it is set and the booking is still
 * open, so a closed booking never gets a message about cancelling online. The customer is told in their
 * chat, with the date online cancellation stays open until when that date hasn't passed. Returns the summary.
 */
export async function undoPreparing(ref, admin) {
  return adminWrite(ref, async (conn, { reservation }) => {
    if (!reservation.preparingAt) throw new ApiError('INVALID_STATE', 'This booking is not marked as started preparing.');
    if (CLOSED.includes(reservation.status)) throw closedError();
    await repo.updateReservation(conn, ref, { preparingAt: null });
    await logAdmin(conn, ref, admin, 'Removed the "Started preparing" mark (marked by mistake).');
    const deadline = cancelDeadline(reservation);
    const until = deadline >= todayISO() ? ` You can cancel online until ${formatDate(deadline)}.` : '';
    await postAdminMessage(conn, reservation, `Our note that we started preparing for ${reservation.eventName} was marked by mistake.${until}`, null, admin.name);
    return savedSummary(conn, ref);
  });
}

/**
 * Admin: edit an event's date, start time, guests and venue (the browser version's updateLogistics); an
 * equipment rental goes to updateRentalLogistics. `patch` is the logistics card's fields: { date,
 * startTime, guests, venueName, venueAddress, city, accessNotes } (and fulfilment for a rental).
 *
 * A new date must not be past, blocked or full (the admin may move an event inside the lead time), and a
 * new date or start time must be clear of the other events that day (this one left out). Moving an
 * approved booking earlier pulls its downpayment due date in (dueAfterMove). The audit trail lists what
 * changed, old value and new.
 *
 * A buffet is charged per person, so a new guest count changes what the booking costs. The sent
 * quotation is never edited: the customer is told in their chat straight away (old and new food total),
 * the booking shows as out of date (quotationStale), and the new amount only counts once the admin
 * re-sends the quotation. Before any quotation an event's estimate stays as booked, like the browser
 * version. Runs under the availability lock. Returns { changed }: how many things changed.
 */
export async function updateLogistics(ref, patch, admin) {
  const values = plainObject(patch);
  return adminWrite(
    ref,
    async (conn, row) => {
      const { reservation } = row;
      if (CLOSED.includes(reservation.status)) throw closedError();
      if (isRental(reservation.serviceType)) return updateRentalLogistics(conn, row, values, admin);
      const guests = toNumber(values.guests);
      if (!Number.isInteger(guests) || guests < RULES.minGuests || guests > RULES.maxGuests) {
        throw invalid(`Guests must be between ${RULES.minGuests} and ${RULES.maxGuests}.`, 'guests');
      }
      const { date } = values;
      if (!isISODate(date)) throw invalid('Choose the event date.', 'date');
      const startTime = startTimeOf(values);
      const map = await availabilityMap(conn);
      if (date !== reservation.date) {
        if (daysFromToday(date) < 0) throw invalid('An event cannot be moved to a past date.', 'date');
        const reason = dateUnavailableReason(date, map, { enforceLeadTime: false });
        if (reason) throw new ApiError('DATE_UNAVAILABLE', `${formatDate(date)} is not available (${reason.toLowerCase()}).`, { field: 'date' });
      }
      // A new date or start time: within booking hours, on the hour or half hour, and clear of the other
      // events that day (this event is left out of its own check)
      if (date !== reservation.date || startTime !== reservation.startTime) {
        const timeReason = timeUnavailableReason(date, startTime, { ...map, events: map.events.filter((e) => e.ref !== ref) });
        if (timeReason) throw new ApiError('TIME_UNAVAILABLE', `${timeReason}.`, { field: 'startTime' });
      }
      const venue = { name: clean(values.venueName), address: clean(values.venueAddress), city: clean(values.city), accessNotes: clean(values.accessNotes) };
      if (!venue.name || !venue.address || !venue.city) throw invalid('Enter the venue, city and address.', 'venueName');

      // What changed, both values, e.g. "Updated guests from 100 to 150, venue."
      const changes = [];
      if (date !== reservation.date) changes.push(`date from ${formatDate(reservation.date)} to ${formatDate(date)}`);
      if (startTime !== reservation.startTime) changes.push(`start time from ${reservation.startTime} to ${startTime}`);
      if (guests !== reservation.guests) changes.push(`guests from ${reservation.guests} to ${guests}`);
      if (venue.name !== reservation.venue.name || venue.address !== reservation.venue.address || venue.city !== reservation.venue.city) changes.push('venue');
      const { due, moved } = dueAfterMove(reservation, date);
      if (moved) changes.push(`downpayment due date to ${formatDate(due)}`);

      await repo.updateReservation(conn, ref, { date, startTime, guests, venue, downpaymentDue: due });
      if (changes.length) await logAdmin(conn, ref, admin, `Updated ${changes.join(', ')}.`);
      // The guest count moved on a quoted buffet: tell the customer what it does to their total before
      // anyone re-sends anything, so a change can never pass unnoticed
      if (guests !== reservation.guests && reservation.quotation && includesFood(reservation.serviceType)) {
        const food = guests * (reservation.pricePerPlate || 0);
        await postAdminMessage(
          conn,
          reservation,
          `The guest count for ${reservation.eventName} was changed from ${reservation.guests} to ${guests}. Your buffet is charged per person, so the food total changes from ${pesoText(reservation.quotation.food)} to ${pesoText(food)}. We will send you a revised quotation, and the amount you owe only changes once that quotation reaches you.`,
          null,
          admin.name
        );
      }
      return { changed: changes.length };
    },
    { availability: true }
  );
}

/**
 * updateLogistics for an equipment rental (inside its transaction): the date, the pick-up or delivery
 * time, pick up versus delivery, and the delivery address. A new date needs an open (not blocked) day
 * and enough of every rented item free that day. Switching between pick up and delivery adds or removes
 * the delivery fee, so the customer is told in their chat (old and new total), the audit trail keeps
 * both, and a sent quotation shows as out of date until the admin re-sends it. Before any quotation the
 * estimate simply follows the change.
 */
async function updateRentalLogistics(conn, row, values, admin) {
  const { reservation } = row;
  const { ref } = reservation;
  const fulfilment = values.fulfilment || reservation.fulfilment;
  if (!['pickup', 'delivery'].includes(fulfilment)) throw invalid('Choose pick up or delivery.', 'fulfilment');
  const { date } = values;
  if (!isISODate(date)) throw invalid('Choose the date you need the items.', 'date');
  const startTime = startTimeOf(values);
  if (date !== reservation.date) {
    if (daysFromToday(date) < 0) throw invalid('A rental cannot be moved to a past date.', 'date');
    const reason = dateUnavailableReason(date, await availabilityMap(conn), { enforceLeadTime: false, rental: true });
    if (reason) throw new ApiError('DATE_UNAVAILABLE', `${formatDate(date)} is not available (${reason.toLowerCase()}).`, { field: 'date' });
    const stock = rentalStock(await repo.rentalStockInputs(conn, date), date, ref);
    const short = reservation.rentalItems.filter((line) => line.qty > (stock[line.itemId] || 0));
    if (short.length) throw new ApiError('OUT_OF_STOCK', `Not enough free on ${formatDate(date)}: ${shortList(short, stock)}.`, { field: 'date' });
  }
  if (date !== reservation.date || startTime !== reservation.startTime) {
    // Hours and half hours only: a rental does not clash with events, so no events are passed
    const timeReason = timeUnavailableReason(date, startTime, { events: [] });
    if (timeReason) throw new ApiError('TIME_UNAVAILABLE', `${timeReason}.`, { field: 'startTime' });
  }
  const place = { name: clean(values.venueName), address: clean(values.venueAddress), city: clean(values.city) };
  if (fulfilment === 'delivery' && (!place.name || !place.address || !place.city)) throw invalid('Enter where to deliver the items.', 'venueAddress');
  const venue = fulfilment === 'delivery' ? { ...place, accessNotes: clean(values.accessNotes) } : { ...RENTAL.pickupPlace, accessNotes: '' };

  // What changed, old value and new, for the audit trail
  const changes = [];
  if (date !== reservation.date) changes.push(`date from ${formatDate(reservation.date)} to ${formatDate(date)}`);
  if (startTime !== reservation.startTime) changes.push(`${fulfilmentWord(fulfilment)} time from ${reservation.startTime} to ${startTime}`);
  const switched = fulfilment !== reservation.fulfilment;
  if (switched) changes.push(`from ${fulfilmentWord(reservation.fulfilment)} to ${fulfilmentWord(fulfilment)}`);
  else if (fulfilment === 'delivery' && JSON.stringify(venue) !== JSON.stringify(reservation.venue)) changes.push('delivery address');
  const { due, moved } = dueAfterMove(reservation, date);
  if (moved) changes.push(`downpayment due date to ${formatDate(due)}`);

  // The total before and after a switch between pick up and delivery (the delivery fee comes or goes)
  const pkg = await catalogRepo.findPackageById(reservation.packageId, conn);
  const was = financials(reservation, row.payments, NO_REFUNDS).total;
  const total = rentalQuote(pkg, reservation, { fulfilment }).net;
  const saved = { date, startTime, fulfilment, venue, downpaymentDue: due };
  if (!reservation.quotation) saved.estimate = rentalQuote(pkg, { ...reservation, ...saved });
  await repo.updateReservation(conn, ref, saved);

  const repriced = switched && was !== total;
  const pending = reservation.quotation ? ' We will send you a revised quotation, and the amount you owe only changes once that quotation reaches you.' : '';
  if (changes.length) {
    await logAdmin(conn, ref, admin, `Updated ${changes.join(', ')}.${repriced ? ` Total from ${pesoText(was)} to ${pesoText(total)}${reservation.quotation ? ' once the revised quotation is sent' : ''}.` : ''}`);
  }
  if (repriced) {
    const how = fulfilment === 'delivery' ? `Delivery is ${pesoText(RENTAL.deliveryFee)} (our standard fee; a large order may be quoted more)` : `Picking up at ${RENTAL.pickupAddress} is free`;
    await postAdminMessage(
      conn,
      reservation,
      `Your equipment rental for ${formatDate(date)} was changed from ${fulfilmentWord(reservation.fulfilment)} to ${fulfilmentWord(fulfilment)}. ${how}, so your total changes from ${pesoText(was)} to ${pesoText(total)}.${pending}`,
      null,
      admin.name
    );
  }
  return { changed: changes.length };
}

/**
 * Admin: change what the customer is having (e.g. after agreeing it in chat): the service type, the four
 * menu lines and the food notes. Switching between a buffet and catering only changes the total (only a
 * buffet is charged per person), so when a quotation was sent the customer is told in their chat and the
 * quotation shows as out of date until the admin re-sends it. Returns { ok: true }.
 */
export async function updateMenu(ref, body, admin) {
  const values = plainObject(body);
  return adminWrite(ref, async (conn, { reservation }) => {
    if (CLOSED.includes(reservation.status)) throw closedError();
    if (isRental(reservation.serviceType)) throw invalid('An equipment rental has no menu. Edit the rented items instead.');
    const { serviceType } = values;
    if (!SERVICE_TYPES.includes(serviceType)) throw invalid('Choose a buffet or catering only.', 'serviceType');
    // A buffet names something for each of the four categories (cut at MENU_LINE_MAX); catering only has no menu
    let menu = null;
    if (includesFood(serviceType)) {
      const wanted = plainObject(values.menu);
      menu = {};
      DISH_CATEGORIES.forEach(({ key, label }) => {
        const line = clean(wanted[key]);
        if (line.length < 2) throw invalid(`Fill in the ${label.toLowerCase()}.`, `menu.${key}`);
        menu[key] = cut(line, MENU_LINE_MAX);
      });
    }
    const before = reservation.serviceType;
    await repo.updateReservation(conn, ref, { serviceType, menu, foodNotes: clean(values.foodNotes) });
    await logAdmin(conn, ref, admin, before === serviceType ? 'Updated the menu.' : `Changed the booking from ${before} to ${serviceType}.`);
    // Switching to or from a buffet changes what the customer owes: tell them before re-quoting
    if (before !== serviceType && reservation.quotation) {
      const food = includesFood(serviceType)
        ? `A buffet is charged per person, so food for ${reservation.guests} guests will be added to your total.`
        : 'Catering only has no per-person charge, so the food will be taken off your total.';
      await postAdminMessage(conn, reservation, `${reservation.eventName} was changed from ${before} to ${serviceType}. ${food} We will send you a revised quotation, and the amount you owe only changes once that quotation reaches you.`, null, admin.name);
    }
    return { ok: true };
  });
}

/** Admin: save the private notes on a booking, as typed (never shown to the customer). Returns { ok: true }. */
export async function saveNotes(ref, notes) {
  return adminWrite(ref, async (conn) => {
    await repo.updateReservation(conn, ref, { notes });
    return { ok: true };
  });
}

/**
 * Admin: change what a rental includes (e.g. after agreeing it in chat). `items` is the whole new list,
 * [{ itemId, qty }]. Lines already booked keep their prices; an added item takes today's price. Every
 * item needs enough pieces free on the date (this booking's own pieces count as free), and no line can
 * drop below what is already checked out for it (record those pieces' return first).
 *
 * The new total is never written into a sent quotation: the customer is told in their chat (old and new
 * total), the audit trail keeps both, and the quotation shows as out of date until the admin re-sends
 * it. Before any quotation the estimate follows the new list at once. Runs under the availability lock.
 * Returns { changed }: how many lines changed (0 when the list is the same, and nothing is written).
 */
export async function updateRentalItems(ref, body, admin) {
  const { items } = plainObject(body);
  return adminWrite(
    ref,
    async (conn, row) => {
      const { reservation } = row;
      if (!isRental(reservation.serviceType)) throw invalid('Only an equipment rental has rented items.');
      if (CLOSED.includes(reservation.status)) throw closedError();
      const stockData = await repo.rentalStockInputs(conn, reservation.date);
      const lines = rentalLines(stockData, items, reservation.date, { excludeRef: ref, current: reservation.rentalItems });
      stockData.inventory.forEach((item) => {
        const out = item.allocations[ref] || 0;
        const line = lines.find((l) => l.itemId === item.id);
        if (out && (!line || line.qty < out)) {
          throw invalid(`${out} ${item.name} ${out === 1 ? 'is' : 'are'} already checked out for this rental. Record their return first.`, `rental.${item.id}`);
        }
      });

      // The change line by line, e.g. "Monobloc chair from 50 to 80, added 5 × Round table"
      const before = reservation.rentalItems;
      const changes = [];
      lines.forEach((line) => {
        const old = before.find((b) => b.itemId === line.itemId);
        if (!old) changes.push(`added ${line.qty} × ${line.name}`);
        else if (old.qty !== line.qty) changes.push(`${line.name} from ${old.qty} to ${line.qty}`);
      });
      before.forEach((old) => {
        if (!lines.some((l) => l.itemId === old.itemId)) changes.push(`removed ${old.qty} × ${old.name}`);
      });
      if (!changes.length) return { changed: 0 };

      const pkg = await catalogRepo.findPackageById(reservation.packageId, conn);
      const was = financials(reservation, row.payments, NO_REFUNDS).total;
      const total = rentalQuote(pkg, reservation, { rentalItems: lines }).net;
      await repo.replaceRentalLines(conn, ref, lines);
      if (!reservation.quotation) await repo.updateReservation(conn, ref, { estimate: rentalQuote(pkg, { ...reservation, rentalItems: lines }) });
      await logAdmin(conn, ref, admin, `Changed the rented items: ${changes.join(', ')}. Total from ${pesoText(was)} to ${pesoText(total)}${reservation.quotation ? ' once the revised quotation is sent' : ''}.`);
      const pending = reservation.quotation ? ' We will send you a revised quotation, and the amount you owe only changes once that quotation reaches you.' : '';
      await postAdminMessage(
        conn,
        reservation,
        `The items you are renting for ${formatDate(reservation.date)} were changed: ${changes.join(', ')}. Your total changes from ${pesoText(was)} to ${pesoText(total)}.${pending}`,
        null,
        admin.name
      );
      return { changed: changes.length };
    },
    { availability: true }
  );
}
