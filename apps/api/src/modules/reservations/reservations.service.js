import { dateUnavailableReason, timeUnavailableReason } from '@tm/shared/src/domain/availability.js';
import { financials } from '@tm/shared/src/domain/money.js';
import { menuDishes, quotationStale, quotationStaleReason, rentalAvailability, rentalStock } from '@tm/shared/src/domain/reservation.js';
import { DEFAULT_PRICE_PER_PLATE, DISH_CATEGORIES, MENU_LINE_MAX, OCCASIONS, RENTAL, RENTAL_SERVICE, RULES, SERVICE_TYPES, includesFood } from '@tm/shared/src/services/config.js';
import { computeQuote } from '@tm/shared/src/services/pricing.js';
import { makeReservationRef } from '@tm/shared/src/services/reservationRef.js';
import { formatDate } from '@tm/shared/src/utils/format.js';
import { CUSTOMER_EDITABLE } from '@tm/shared/src/utils/status.js';
import { tx } from '../../db.js';
import { ApiError } from '../../lib/ApiError.js';
import { isClockTime, isISODate, now } from '../../lib/time.js';
import { lockAvailability } from '../calendar/calendar.repo.js';
import { availabilityMap } from '../calendar/calendar.service.js';
import * as catalogRepo from '../catalog/catalog.repo.js';
import { postAdminMessage, postCustomerMessage } from '../messages/messages.repo.js';
import * as repo from './reservations.repo.js';

/**
 * The reservation rules on the server (docs/backend-development-phases.md Phase 6A, §9.4): the lists
 * and the detail page, the booking form (an event or an equipment rental), and the customer's
 * cancellation and change request. Same return shapes, error codes, messages and meta.field as the
 * browser version (reservationService.js), whose checks are repeated here in the same order because
 * the server never trusts the page (§3 rule 3). The rules that need no stored data (money, an
 * out-of-date quotation, rental stock, availability) come from @tm/shared/src/domain, the same code
 * the portals run.
 *
 * Differences from the browser version, on purpose:
 * - The customer is always the signed-in one (from the token), and every answer to a customer leaves
 *   out the admin's private `notes`.
 * - The date must be a real "YYYY-MM-DD" day, the start time "HH:MM", the occasion one of OCCASIONS,
 *   and required text is checked after trimming (spaces alone are not an event name).
 * - A booking reads the availability map, the price per person and the rental stock from the
 *   database inside its own transaction, after taking the availability lock (lockAvailability), so
 *   two bookings for the same date get different refs and every check sees the latest saved data.
 * The automatic chat messages (thank-you, change request, refund notice) are saved in the same
 * transaction; the chat endpoints that show them arrive in Phase 7. The admin actions are Phase 6B.
 */

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
 * version's summarize(). `row` is one entry of repo.findReservations().
 */
function summarize({ reservation, packageName, packageSlug, customerName, customerEmail, customerMobile, payments }) {
  return {
    ...reservation,
    packageName: packageName ?? 'Package',
    packageSlug: packageSlug ?? '',
    customerName: customerName ?? 'Customer',
    customerEmail: customerEmail ?? '',
    customerMobile: customerMobile ?? '',
    quotationStale: quotationStale(reservation),
    quotationStaleReason: quotationStaleReason(reservation),
    ...financials(reservation, payments)
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
 * order, archived ones included), the payments (newest first), the customer with their completed
 * events, and the review (without the admin's flag note). With `customerId`, only that customer's own
 * booking (another customer's is NOT_FOUND, never FORBIDDEN, so its existence is not given away) and
 * no notes. The ref must be spelled exactly as stored (see sameRef).
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
      eventName, occasion, date, startTime, guests, packageId: pkg.id, serviceType, menu, foodNotes: clean(form.foodNotes), pricePerPlate, venue, addonIds, addonQty,
      estimate: computeQuote({ pkg, serviceType, guests, pricePerPlate, addonIds, addonQty })
    },
    lines: [],
    activity: 'Submitted the reservation request.',
    thankYou: `Thank you for your reservation request for ${eventName} on ${formatDate(date)}. We are reviewing it and will send your quotation within 24 hours.`
  };
}

/**
 * Check what a rental asks for and turn it into booking lines: [{ itemId, name, qty, price, damageFee }].
 * `wanted` is [{ itemId, qty }] (the same item twice is added together). Every item must be for rent
 * (rentable, not archived, with a price) and have enough pieces free on the date; each line copies the
 * item's price and damage fee today, so a later price change never moves the booking. Errors name the
 * line: { field: 'rental.<itemId>' }. `stockData` is repo.rentalStockInputs() for the date.
 */
function rentalLines(stockData, wanted, date) {
  const qtyById = new Map();
  (Array.isArray(wanted) ? wanted : []).forEach((line) => {
    const itemId = line && typeof line === 'object' ? line.itemId : undefined;
    if (typeof itemId !== 'string') throw invalid('One of the items is no longer for rent. Please remove it.', 'rentalItems');
    qtyById.set(itemId, (qtyById.get(itemId) || 0) + toNumber(line.qty));
  });
  if (!qtyById.size) throw invalid('Choose at least one item to rent.', 'rentalItems');
  const stock = rentalStock(stockData, date);
  return [...qtyById].map(([itemId, qty]) => {
    const item = stockData.inventory.find((i) => i.id === itemId);
    if (!item || !item.rentable || item.archived || !item.rentPrice) {
      throw invalid('One of the items is no longer for rent. Please remove it.', `rental.${itemId}`);
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > RENTAL.maxQty) {
      throw invalid(`Enter how many ${item.name} you need (1 to ${RENTAL.maxQty.toLocaleString('en-PH')}).`, `rental.${itemId}`);
    }
    const left = stock[itemId] || 0;
    if (qty > left) {
      throw new ApiError('OUT_OF_STOCK', left ? `Only ${left} ${item.name} ${left === 1 ? 'is' : 'are'} free on ${formatDate(date)}.` : `${item.name} is fully booked on ${formatDate(date)}.`, { field: `rental.${itemId}` });
    }
    return { itemId, name: item.name, qty, price: item.rentPrice, damageFee: item.damageFee || 0 };
  });
}

/**
 * An Equipment rental request (the browser version's createRental checks, in the same order). The
 * date only needs the usual notice and must not be blocked (a rental takes no event slot), and the
 * time is when the items are picked up or delivered, on the hour or half hour. Pick-up is at
 * RENTAL.pickupPlace and costs nothing; delivery adds the standard fee, which the admin may change in
 * the quotation. Every price is copied, so the estimate is the real rental total.
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
      rentalItems: lines, fulfilment, damageCharges: [],
      venue: fulfilment === 'delivery' ? { ...place, accessNotes: clean(form.accessNotes) } : { ...RENTAL.pickupPlace, accessNotes: '' },
      addonIds: [], addonQty: {},
      estimate: computeQuote({ pkg, serviceType: RENTAL_SERVICE, rentalItems: lines, deliveryFee: fulfilment === 'delivery' ? RENTAL.deliveryFee : 0 })
    },
    lines,
    activity: 'Submitted the equipment rental request.',
    thankYou: `Thank you for your equipment rental request for ${formatDate(date)}. We are checking the items and will send your quotation within 24 hours.`
  };
}

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
    notes: '',
    declineReason: '',
    cancelReason: '',
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
 * The customer cancels their own reservation, only while Pending or Approved, and not while a payment
 * is still being verified (so that payment can't be verified after the cancellation). When money was
 * already paid, an unread message from the customer tells the team a refund has to be arranged. A
 * cancelled approved booking frees its slot (the portals then reload the availability map).
 * Returns the customer's view of its summary.
 */
export async function cancelReservation(ref, customer, reason) {
  const text = clean(reason);
  if (!text) throw invalid('Tell us why you are cancelling.', 'reason');
  return tx(async (conn) => {
    // Locked until the end, so an admin action on the same booking waits and then sees the cancellation
    const owner = await repo.lockOwner(conn, ref);
    if (!owner || !sameRef(owner, ref) || owner.customerId !== customer.id) throw notFound();
    if (!CUSTOMER_EDITABLE.includes(owner.status)) {
      throw new ApiError('INVALID_STATE', 'This reservation can no longer be cancelled online. Please message our team.');
    }
    const [row] = await repo.findReservations(conn, { ref });
    const money = financials(row.reservation, row.payments);
    if (money.awaitingCount > 0) {
      throw new ApiError('PENDING_PAYMENT', 'A payment for this reservation is still being verified. Please wait until our team checks it, or message us to cancel.');
    }
    await repo.setCancelled(conn, ref, text);
    await repo.insertActivity(conn, ref, { at: now(), actor: customer.name, text: `Cancelled the reservation. Reason: ${text}` });
    if (money.paid > 0) {
      await postCustomerMessage(
        conn,
        row.reservation,
        `Cancellation: ${row.reservation.eventName}. Reason: ${text}. ₱${money.paid.toLocaleString('en-PH')} was already paid, so the refund needs to be arranged.`,
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
