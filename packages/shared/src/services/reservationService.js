import { addDays, daysFromToday, formatDate } from '../utils/format.js';
import { CUSTOMER_EDITABLE, HOLDS_DATE, statusLabel } from '../utils/status.js';
import { downpaymentDueFor, financials, statusForPayments } from '../domain/money.js';
import { menuDishes, quotationStale, quotationStaleReason, rentalAvailability, rentalStock } from '../domain/reservation.js';
import { availabilitySnapshot, dateUnavailableReason, timeUnavailableReason } from './calendarService.js';
import { DISH_CATEGORIES, MENU_LINE_MAX, RENTAL, RENTAL_SERVICE, RULES, SERVICE_TYPES, includesFood, isRental } from './config.js';
import { pricePerPlate } from './catalogService.js';
import { computeQuote } from './pricing.js';
import { customerThread } from './messageService.js';
import { makeReservationRef } from './reservationRef.js';
import { ApiError, clone, latency, read, uid, write } from './store.js';

/**
 * Reservations and the status pipeline:
 * Pending → Approved → Downpayment paid → Confirmed → Completed (or Declined / Cancelled).
 *
 * Three kinds of booking share it: a Buffet and Catering or Catering only booking of an ordinary
 * package, and an Equipment rental (the Equipment Rental package). A rental carries `rentalItems`
 * ([{ itemId, name, qty, price, damageFee }], prices copied when booked), `fulfilment` ('pickup' or
 * 'delivery') and `damageCharges` (pieces charged after the return). It has no guests, no menu and no
 * additional charges, and it takes no event slot on the calendar.
 *
 * This is the browser-store version. The rules that need no stored data (the money figures, the
 * status for what has been paid, the downpayment due date, an out-of-date quotation, rental stock and
 * the menu list) live in domain/money.js and domain/reservation.js, shared with the API server
 * (apps/api/src/modules/reservations); `financials` is re-exported here for the other services.
 */

export { financials };

// Name of the signed-in admin, for the activity log and chat messages
const ADMIN_NAME = () => {
  try {
    const user = JSON.parse(sessionStorage.getItem('tm.admin.session') || localStorage.getItem('tm.admin.session'));
    return (user && user.user && user.user.name) || 'Tres Marias team';
  } catch (e) {
    return 'Tres Marias team';
  }
};

// Add an entry to the reservation's activity history
const log = (reservation, actor, text) => reservation.activity.push({ at: Date.now(), actor, text });

/**
 * Keep an approved booking's status matching what has been paid (the rule is statusForPayments in
 * domain/money.js). Used when a payment is verified (paymentService.js) and when a quotation is
 * re-sent. Returns true when the status changed.
 */
export function syncPaymentStatus(data, reservation) {
  const before = reservation.status;
  reservation.status = statusForPayments(before, financials(reservation, data.payments));
  return reservation.status !== before;
}

/**
 * Check what a rental asks for and turn it into booking lines: [{ itemId, name, qty, price, damageFee }].
 * `wanted` is [{ itemId, qty }] (the same item twice is added together). A line already on the booking
 * (`current`) keeps the prices it was booked at, so editing a rental never reprices what the customer
 * agreed to; a new line takes the item's price today. Every item must be for rent (or already on the
 * booking) and have enough pieces free on the date. Errors name the line: { field: 'rental.<itemId>' }.
 */
function rentalLines(data, wanted, date, { excludeRef, current = [] } = {}) {
  const qtyById = {};
  (wanted || []).forEach(({ itemId, qty }) => {
    qtyById[itemId] = (qtyById[itemId] || 0) + Number(qty);
  });
  const ids = Object.keys(qtyById);
  if (!ids.length) throw new ApiError('INVALID', 'Choose at least one item to rent.', { field: 'rentalItems' });
  const stock = rentalStock(data, date, excludeRef);
  return ids.map((itemId) => {
    const item = data.inventory.find((i) => i.id === itemId);
    const booked = current.find((line) => line.itemId === itemId);
    if (!item || (!booked && (!item.rentable || item.archived || !item.rentPrice))) {
      throw new ApiError('INVALID', 'One of the items is no longer for rent. Please remove it.', { field: `rental.${itemId}` });
    }
    const qty = qtyById[itemId];
    if (!Number.isInteger(qty) || qty < 1 || qty > RENTAL.maxQty) {
      throw new ApiError('INVALID', `Enter how many ${item.name} you need (1 to ${RENTAL.maxQty.toLocaleString('en-PH')}).`, { field: `rental.${itemId}` });
    }
    const left = stock[itemId] || 0;
    if (qty > left) {
      throw new ApiError('OUT_OF_STOCK', left ? `Only ${left} ${item.name} ${left === 1 ? 'is' : 'are'} free on ${formatDate(date)}.` : `${item.name} is fully booked on ${formatDate(date)}.`, { field: `rental.${itemId}` });
    }
    return { itemId, name: item.name, qty, price: booked ? booked.price : item.rentPrice, damageFee: booked ? booked.damageFee : item.damageFee || 0 };
  });
}

/**
 * What a rental would cost as the customer holds it now: the sent quotation's delivery fee, other
 * charges and discount (or the standard delivery fee before any quotation), with the given lines.
 */
function rentalQuote(data, reservation, { rentalItems = reservation.rentalItems, fulfilment = reservation.fulfilment } = {}) {
  const quote = reservation.quotation;
  const delivery = fulfilment !== 'delivery' ? 0 : quote && quote.fulfilment === 'delivery' ? quote.deliveryFee : RENTAL.deliveryFee;
  return computeQuote({
    pkg: data.packages.find((p) => p.id === reservation.packageId),
    serviceType: reservation.serviceType,
    rentalItems,
    deliveryFee: delivery,
    damageCharges: reservation.damageCharges || [],
    otherCharges: quote ? quote.otherCharges : 0,
    discount: quote ? quote.discount : 0
  });
}

/**
 * How many of each rentable item are free on a date, for the rental form and the admin's edit dialog:
 * { itemId: { left, status } }, status 'available', 'limited' (at or below the item's alert level) or 'out'
 * (rentalAvailability in domain/reservation.js). `excludeRef` leaves out the booking being edited, so
 * its own pieces count as free.
 */
export async function getRentalAvailability(date, { excludeRef } = {}) {
  await latency(150, 350);
  const data = read();
  if (!date) return {};
  return rentalAvailability(data, date, excludeRef);
}

/** Reservation plus package name, customer contact and money figures, for lists. */
function summarize(reservation, data) {
  const pkg = data.packages.find((p) => p.id === reservation.packageId);
  const customer = data.customers.find((c) => c.id === reservation.customerId);
  return {
    ...clone(reservation),
    packageName: pkg ? pkg.name : 'Package',
    packageSlug: pkg ? pkg.slug : '',
    customerName: customer ? customer.name : 'Customer',
    customerEmail: customer ? customer.email : '',
    customerMobile: customer ? customer.mobile : '',
    quotationStale: quotationStale(reservation),
    quotationStaleReason: quotationStaleReason(reservation),
    ...financials(reservation, data.payments)
  };
}

/** All reservations (admin) or one customer's, newest request first. */
export async function listReservations({ customerId } = {}) {
  await latency(180, 450);
  const data = read();
  return data.reservations
    .filter((r) => !customerId || r.customerId === customerId)
    .map((r) => summarize(r, data))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Full detail: summary plus the full package, add-ons and payments. */
export async function getReservation(ref, { customerId } = {}) {
  await latency(180, 420);
  const data = read();
  const reservation = data.reservations.find((r) => r.ref === ref);
  if (!reservation || (customerId && reservation.customerId !== customerId)) {
    throw new ApiError('NOT_FOUND', 'We could not find this reservation.');
  }
  const pkg = data.packages.find((p) => p.id === reservation.packageId);
  const customer = data.customers.find((c) => c.id === reservation.customerId);
  return {
    ...summarize(reservation, data),
    package: clone(pkg),
    menuDishes: menuDishes(reservation),
    addons: clone(data.addons.filter((a) => reservation.addonIds.includes(a.id))),
    payments: clone(data.payments.filter((p) => p.ref === ref).sort((a, b) => b.submittedAt - a.submittedAt)),
    customer: customer
      ? {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          mobile: customer.mobile,
          pastEvents: data.reservations.filter((r) => r.customerId === customer.id && r.status === 'completed').length
        }
      : null,
    testimonial: testimonialFor(data, ref)
  };
}

/**
 * The review left for an event, without the admin's private note on a flag: that note belongs
 * to the Feedbacks page (see feedbackService.js), not to the reservation both sides can open.
 */
function testimonialFor(data, ref) {
  const testimonial = data.testimonials.find((t) => t.ref === ref);
  if (!testimonial) return null;
  const { flagReason, ...rest } = clone(testimonial);
  return rest;
}

/** Next reservation reference for an event date, e.g. an event on 20 Oct 2026 -> "RES-2026-1020-01" (see reservationRef.js). */
function nextRef(data, eventDate) {
  return makeReservationRef(eventDate, data.reservations.map((r) => r.ref));
}

/**
 * Customer submits the reservation form. Status starts at Pending.
 *
 * The customer first says what they are booking: a Buffet (the package's equipment plus food we
 * cook, one dish from each of the four categories) or Catering only (the equipment on its own).
 * Any package can be picked for any occasion, and the guest count may be above what the package
 * covers (the admin adds charges for that in the quotation).
 *
 * Because a buffet is charged per person, the food total is already known here and the estimate
 * is a real figure, not just the package price. The rate is copied onto the reservation, so a
 * later price rise never changes this booking. Only the add-on prices are still missing.
 *
 * Picking the Equipment Rental package makes it an Equipment rental instead (see createRental).
 */
export async function createReservation(customerId, form) {
  await latency(600, 1000);
  return write((data) => {
    // Re-check everything on the "server" side: package, date, start time, guests, food request, required fields
    const pkg = data.packages.find((p) => p.id === form.packageId && p.visible && !p.archived);
    if (!pkg) throw new ApiError('INVALID', 'Please choose an available package.', { field: 'packageId' });
    if (pkg.kind === 'rental') return createRental(data, customerId, pkg, form);

    if (!form.date) throw new ApiError('INVALID', 'Choose the event date.', { field: 'date' });
    const snapshot = availabilitySnapshot();
    const reason = dateUnavailableReason(form.date, snapshot);
    if (reason) throw new ApiError('DATE_UNAVAILABLE', `That date is not available (${reason.toLowerCase()}). Please pick another date.`, { field: 'date' });
    // The start time must not overlap another event that day
    const timeReason = timeUnavailableReason(form.date, form.startTime, snapshot);
    if (timeReason) throw new ApiError('TIME_UNAVAILABLE', `That start time is not available (${timeReason.toLowerCase()}). Please pick another time.`, { field: 'startTime' });

    const guests = Number(form.guests);
    if (!Number.isInteger(guests) || guests < RULES.minGuests || guests > RULES.maxGuests) {
      throw new ApiError('INVALID', `Guests must be between ${RULES.minGuests} and ${RULES.maxGuests}.`, { field: 'guests' });
    }

    // Buffet or Catering only, chosen before the package
    const serviceType = form.serviceType;
    if (!SERVICE_TYPES.includes(serviceType)) {
      throw new ApiError('INVALID', 'Choose whether you want a buffet or catering only.', { field: 'serviceType' });
    }

    // A buffet names something for each of the four categories; catering only carries no menu at all.
    // Each line is the customer's own words, so they can ask for two pork dishes on the pork line.
    let menu = null;
    if (includesFood(serviceType)) {
      menu = {};
      DISH_CATEGORIES.forEach(({ key, label }) => {
        const wanted = String((form.menu || {})[key] || '').trim();
        if (wanted.length < 2) throw new ApiError('INVALID', `Tell us what you would like for your ${label.toLowerCase()}.`, { field: `menu.${key}` });
        menu[key] = wanted.slice(0, MENU_LINE_MAX);
      });
    }
    const foodNotes = (form.foodNotes || '').trim();

    // Silently drop add-ons that were archived while the form was open
    const addonIds = (form.addonIds || []).filter((id) => data.addons.some((a) => a.id === id && !a.archived));
    // Add-ons counted by the piece need a how-many; the rest are just ticked
    const addonQty = {};
    addonIds.forEach((id) => {
      const addon = data.addons.find((a) => a.id === id);
      if (!addon.hasQuantity) return;
      const many = Number((form.addonQty || {})[id]);
      if (!Number.isInteger(many) || many < 1 || many > 99) {
        throw new ApiError('INVALID', `Tell us how many you need for ${addon.name} (1 to 99).`, { field: `addonQty.${id}` });
      }
      addonQty[id] = many;
    });

    if (!form.eventName || !form.occasion || !form.startTime || !form.venueName || !form.venueAddress || !form.city) {
      throw new ApiError('INVALID', 'Please complete every required field.');
    }

    const customer = data.customers.find((c) => c.id === customerId);
    // The buffet price per person as it stands today, copied onto the booking so it cannot move later
    const rate = pricePerPlate();
    const estimate = computeQuote({ pkg, serviceType, guests, pricePerPlate: rate, addonIds, addonQty });
    const reservation = {
      ref: nextRef(data, form.date),
      customerId,
      eventName: form.eventName.trim(),
      occasion: form.occasion,
      date: form.date,
      startTime: form.startTime,
      guests,
      packageId: pkg.id,
      serviceType,
      menu,
      foodNotes,
      pricePerPlate: rate,
      venue: {
        name: form.venueName.trim(),
        address: form.venueAddress.trim(),
        city: form.city.trim(),
        accessNotes: (form.accessNotes || '').trim()
      },
      addonIds,
      addonQty,
      status: 'pending',
      estimate,
      quotation: null,
      downpaymentDue: null,
      notes: '',
      declineReason: '',
      cancelReason: '',
      activity: [],
      createdAt: Date.now()
    };
    log(reservation, customer.name, 'Submitted the reservation request.');
    data.reservations.push(reservation);

    // Automatic thank-you in the customer's chat, tagged with the new reservation
    postAdminMessage(
      data,
      reservation,
      `Thank you for your reservation request for ${reservation.eventName} on ${formatDate(reservation.date)}. We are reviewing it and will send your quotation within 24 hours.`,
      null,
      'Tres Marias team'
    );
    return summarize(reservation, data);
  });
}

/**
 * An Equipment rental request (inside createReservation's write). The customer picks items and how
 * many of each; every price is copied from the inventory onto the booking, so the estimate is the real
 * rental total. Pick-up is at RENTAL.pickupAddress and costs nothing; delivery adds the standard fee,
 * which the admin may change in the quotation for a big order. The date only needs the usual notice
 * and must not be blocked (a rental takes no event slot), and the time is when the items are picked
 * up or delivered.
 */
function createRental(data, customerId, pkg, form) {
  if (!form.date) throw new ApiError('INVALID', 'Choose the date you need the items.', { field: 'date' });
  const snapshot = availabilitySnapshot();
  const reason = dateUnavailableReason(form.date, snapshot, { rental: true });
  if (reason) throw new ApiError('DATE_UNAVAILABLE', `That date is not available (${reason.toLowerCase()}). Please pick another date.`, { field: 'date' });
  // Hours and half hours only; other bookings that day don't matter to a rental
  const timeReason = timeUnavailableReason(form.date, form.startTime, { ...snapshot, events: [] });
  if (timeReason) throw new ApiError('TIME_UNAVAILABLE', `${timeReason}.`, { field: 'startTime' });

  const fulfilment = form.fulfilment;
  if (!['pickup', 'delivery'].includes(fulfilment)) throw new ApiError('INVALID', 'Choose pick up or delivery.', { field: 'fulfilment' });
  if (!form.eventName || !form.occasion || !form.startTime) throw new ApiError('INVALID', 'Please complete every required field.');
  if (fulfilment === 'delivery' && (!form.venueName || !form.venueAddress || !form.city)) {
    throw new ApiError('INVALID', 'Tell us where to deliver the items.', { field: 'venueAddress' });
  }
  const lines = rentalLines(data, form.rentalItems, form.date);

  const customer = data.customers.find((c) => c.id === customerId);
  const estimate = computeQuote({ pkg, serviceType: RENTAL_SERVICE, rentalItems: lines, deliveryFee: fulfilment === 'delivery' ? RENTAL.deliveryFee : 0 });
  const venue =
    fulfilment === 'delivery'
      ? { name: form.venueName.trim(), address: form.venueAddress.trim(), city: form.city.trim(), accessNotes: (form.accessNotes || '').trim() }
      : { ...RENTAL.pickupPlace, accessNotes: '' };
  const reservation = {
    ref: nextRef(data, form.date),
    customerId,
    eventName: form.eventName.trim(),
    occasion: form.occasion,
    date: form.date,
    startTime: form.startTime,
    guests: 0,
    packageId: pkg.id,
    serviceType: RENTAL_SERVICE,
    menu: null,
    foodNotes: '',
    pricePerPlate: 0,
    rentalItems: lines,
    fulfilment,
    damageCharges: [],
    venue,
    addonIds: [],
    addonQty: {},
    status: 'pending',
    estimate,
    quotation: null,
    downpaymentDue: null,
    notes: '',
    declineReason: '',
    cancelReason: '',
    activity: [],
    createdAt: Date.now()
  };
  log(reservation, customer.name, 'Submitted the equipment rental request.');
  data.reservations.push(reservation);
  postAdminMessage(
    data,
    reservation,
    `Thank you for your equipment rental request for ${formatDate(reservation.date)}. We are checking the items and will send your quotation within 24 hours.`,
    null,
    'Tres Marias team'
  );
  return summarize(reservation, data);
}

// Find a reservation by REF or throw NOT_FOUND
const findOrThrow = (data, ref) => {
  const reservation = data.reservations.find((r) => r.ref === ref);
  if (!reservation) throw new ApiError('NOT_FOUND', 'We could not find this reservation.');
  return reservation;
};

/**
 * Post an admin message in the customer's chat (creating the conversation if needed),
 * tagged with the reservation it is about. `senderName` defaults to the signed-in admin.
 */
export function postAdminMessage(data, reservation, body, attachment = null, senderName = ADMIN_NAME()) {
  customerThread(data, reservation.customerId).messages.push({
    id: uid('m'),
    from: 'admin',
    senderName,
    body,
    ref: reservation.ref,
    at: Date.now(),
    readByCustomer: false,
    readByAdmin: true,
    attachment
  });
}

/* ============================ Customer actions ============================ */

/**
 * Customer cancels their own reservation (only while Pending or Approved).
 * Not while a payment is still being verified, so that payment can't be verified after the cancellation.
 * When money was already paid, an unread message in the customer's chat tells the team a refund has to be arranged.
 */
export async function cancelReservation(ref, customerId, reason) {
  await latency(450, 800);
  const text = String(reason || '').trim();
  if (!text) throw new ApiError('INVALID', 'Tell us why you are cancelling.', { field: 'reason' });
  return write((data) => {
    const reservation = findOrThrow(data, ref);
    if (reservation.customerId !== customerId) throw new ApiError('NOT_FOUND', 'We could not find this reservation.');
    if (!CUSTOMER_EDITABLE.includes(reservation.status)) {
      throw new ApiError('INVALID_STATE', 'This reservation can no longer be cancelled online. Please message our team.');
    }
    const money = financials(reservation, data.payments);
    if (money.awaitingCount > 0) {
      throw new ApiError('PENDING_PAYMENT', 'A payment for this reservation is still being verified. Please wait until our team checks it, or message us to cancel.');
    }
    const customer = data.customers.find((c) => c.id === customerId);
    reservation.status = 'cancelled';
    reservation.cancelReason = text;
    log(reservation, customer.name, `Cancelled the reservation. Reason: ${text}`);
    if (money.paid > 0) {
      customerThread(data, customerId).messages.push({
        id: uid('m'),
        from: 'customer',
        senderName: customer.name,
        body: `Cancellation: ${reservation.eventName}. Reason: ${text}. ₱${money.paid.toLocaleString('en-PH')} was already paid, so the refund needs to be arranged.`,
        ref,
        at: Date.now(),
        readByCustomer: true,
        readByAdmin: false,
        attachment: null
      });
    }
    return summarize(reservation, data);
  });
}

/** Customer asks for a change: posted in their chat with the admin (tagged with the reservation), returns the thread to open. */
export async function requestChange(ref, customerId, message) {
  await latency(400, 700);
  const text = String(message || '').trim();
  if (!text) throw new ApiError('INVALID', 'Describe the change you would like.', { field: 'message' });
  return write((data) => {
    const reservation = findOrThrow(data, ref);
    if (reservation.customerId !== customerId) throw new ApiError('NOT_FOUND', 'We could not find this reservation.');
    const customer = data.customers.find((c) => c.id === customerId);
    const thread = customerThread(data, customerId);
    thread.messages.push({
      id: uid('m'),
      from: 'customer',
      senderName: customer.name,
      body: `Change request: ${text}`,
      ref,
      at: Date.now(),
      readByCustomer: true,
      readByAdmin: false,
      attachment: null
    });
    log(reservation, customer.name, 'Requested a change to the reservation.');
    return { threadId: thread.id };
  });
}

/* ============================ Admin actions ============================ */

/**
 * Admin: price each add-on and any other charges (e.g. guests above what the package covers),
 * apply an optional discount, and send the quotation to the customer's chat.
 *
 * The food is not priced here: a buffet is guests x the rate stored on the booking, and a
 * Catering only booking has no food at all. `addonPrices` is { addonId: amount } for the add-ons
 * on the reservation; for one counted by the piece the amount is the price of a single one.
 *
 * For an Equipment rental the items are priced at what they were booked at and any damage charges
 * are added; the admin only sets `deliveryFee` for a delivered rental (standard RENTAL.deliveryFee,
 * more for a big order). A picked-up rental has no delivery fee. The quotation remembers whether it
 * was for pick up or delivery, so switching later flags it as out of date.
 *
 * Re-sending a quotation on an approved booking re-checks the status against the new total
 * (see syncPaymentStatus): a higher total can move Downpayment paid back to Approved with a new
 * due date, and a lower one can move it forward.
 */
export async function sendQuotation(ref, { addonPrices = {}, otherCharges = 0, otherLabel = '', discount = 0, deliveryFee = RENTAL.deliveryFee, note = '' } = {}) {
  await latency(450, 800);
  return write((data) => {
    const reservation = findOrThrow(data, ref);
    if (['declined', 'cancelled', 'completed'].includes(reservation.status)) {
      throw new ApiError('INVALID_STATE', `A ${statusLabel(reservation.status).toLowerCase()} reservation cannot be re-quoted.`);
    }
    const pkg = data.packages.find((p) => p.id === reservation.packageId);
    const paid = financials(reservation, data.payments).paid;
    const rental = isRental(reservation.serviceType);
    const delivered = rental && reservation.fulfilment === 'delivery';
    if (delivered && (!Number.isFinite(Number(deliveryFee)) || Number(deliveryFee) < 0)) {
      throw new ApiError('INVALID', 'Enter the delivery fee.', { field: 'deliveryFee' });
    }
    const quote = computeQuote({
      pkg,
      serviceType: reservation.serviceType,
      guests: reservation.guests,
      // The rate this booking was made at, never today's, so a price rise leaves old bookings alone
      pricePerPlate: reservation.pricePerPlate,
      rentalItems: rental ? reservation.rentalItems : [],
      deliveryFee: delivered ? Number(deliveryFee) : 0,
      damageCharges: rental ? reservation.damageCharges || [] : [],
      addonIds: reservation.addonIds,
      addonQty: reservation.addonQty,
      addonPrices,
      otherCharges,
      discount
    });
    if (quote.net < paid) throw new ApiError('INVALID', 'The net total cannot be lower than what the customer has already paid.');
    reservation.quotation = {
      ...quote,
      ...(rental ? { fulfilment: reservation.fulfilment } : {}),
      otherLabel: quote.otherCharges ? otherLabel.trim() : '',
      sentAt: Date.now(),
      note: note.trim()
    };
    const actor = ADMIN_NAME();
    log(reservation, actor, `Sent the quotation (₱${quote.net.toLocaleString('en-PH')}).`);

    // The new total may change where the booking stands; when it moves back to Approved the customer gets a new due date
    let extra = '';
    if (syncPaymentStatus(data, reservation)) {
      if (reservation.status === 'approved') {
        reservation.downpaymentDue = downpaymentDueFor(reservation.date);
        const money = financials(reservation, data.payments);
        log(reservation, actor, 'Status moved back to Approved: the payments are below the new downpayment.');
        extra = ` Your new 50% downpayment is ₱${money.downpayment.toLocaleString('en-PH')}; please pay the remaining ₱${(money.downpayment - money.paid).toLocaleString('en-PH')} by ${formatDate(reservation.downpaymentDue)}.`;
      } else {
        log(reservation, actor, `Status moved to ${statusLabel(reservation.status)} under the new quotation.`);
      }
    }
    postAdminMessage(
      data,
      reservation,
      `Your quotation for ${reservation.eventName} is ready. Net total: ₱${quote.net.toLocaleString('en-PH')}.${note.trim() ? ` ${note.trim()}` : ''}${extra}`,
      { name: `Quotation-${ref}.pdf`, kind: 'quotation', ref }
    );
    return summarize(reservation, data);
  });
}

/**
 * Admin: approve a pending request and set the downpayment due date.
 * The quotation must be sent first, because the food and add-ons only have a price once the admin sets it.
 * The date must still be open: not past, not blocked, under the daily capacity, and the start time
 * clear of the events already approved that day (pending requests don't hold their time, so two of
 * them can ask for overlapping times). An equipment rental takes no event slot, so instead of the
 * capacity and time checks it needs every rented item to still have enough pieces free that day.
 */
export async function approveReservation(ref) {
  await latency(450, 800);
  return write((data) => {
    const reservation = findOrThrow(data, ref);
    if (reservation.status !== 'pending') throw new ApiError('INVALID_STATE', 'Only pending reservations can be approved.');
    if (!reservation.quotation) {
      throw new ApiError('NO_QUOTATION', 'Send the quotation first so the food and additional charges are priced.');
    }
    if (daysFromToday(reservation.date) < 0) {
      throw new ApiError('INVALID_STATE', 'This event date has passed. Move the event to a new date before approving.');
    }
    const blocked = data.calendar.blocked.find((b) => b.date === reservation.date);
    if (blocked) {
      throw new ApiError('DATE_UNAVAILABLE', `${formatDate(reservation.date)} is blocked (${blocked.reason.toLowerCase()}). Move the event to another date before approving.`);
    }

    if (isRental(reservation.serviceType)) {
      // Refuse if another approved rental (or an event's checked-out equipment) took the pieces meanwhile
      const stock = rentalStock(data, reservation.date, ref);
      const short = reservation.rentalItems.filter((line) => line.qty > (stock[line.itemId] || 0));
      if (short.length) {
        throw new ApiError('OUT_OF_STOCK', `Not enough free on ${formatDate(reservation.date)}: ${short.map((line) => `${line.name} (${stock[line.itemId] || 0} of ${line.qty})`).join(', ')}. Change the items or the date before approving.`);
      }
    } else {
      // Refuse if the date already has as many approved events as the daily capacity (rentals don't count)
      const others = data.reservations.filter((r) => r.date === reservation.date && r.ref !== ref && HOLDS_DATE.includes(r.status) && !isRental(r.serviceType)).length;
      if (others >= data.calendar.dailyCapacity) {
        throw new ApiError('CAPACITY', `${formatDate(reservation.date)} is already at the daily capacity of ${data.calendar.dailyCapacity} events.`);
      }

      // Refuse if the start time overlaps an event already approved that day (with the setup buffer around it)
      const snapshot = availabilitySnapshot();
      const timeReason = timeUnavailableReason(reservation.date, reservation.startTime, { ...snapshot, events: snapshot.events.filter((e) => e.ref !== ref) });
      if (timeReason) {
        throw new ApiError('TIME_UNAVAILABLE', `${timeReason} on ${formatDate(reservation.date)}. Change the start time before approving.`);
      }
    }

    // Downpayment due in 7 days, but no later than 3 days before the event (and never before today)
    reservation.downpaymentDue = downpaymentDueFor(reservation.date);
    reservation.status = 'approved';
    log(reservation, ADMIN_NAME(), 'Approved the reservation.');
    postAdminMessage(
      data,
      reservation,
      `Good news! ${reservation.eventName} is approved. Please pay the 50% downpayment of ₱${Math.round(reservation.quotation.net * RULES.downpaymentRate).toLocaleString('en-PH')} by ${formatDate(reservation.downpaymentDue)} to secure your date.`,
      { name: `Quotation-${ref}.pdf`, kind: 'quotation', ref }
    );
    return summarize(reservation, data);
  });
}

/** Admin: decline a pending request with a reason shown to the customer. */
export async function declineReservation(ref, reason) {
  await latency(450, 800);
  if (!reason || !reason.trim()) throw new ApiError('INVALID', 'A reason is required.', { field: 'reason' });
  return write((data) => {
    const reservation = findOrThrow(data, ref);
    if (reservation.status !== 'pending') throw new ApiError('INVALID_STATE', 'Only pending reservations can be declined.');
    reservation.status = 'declined';
    reservation.declineReason = reason.trim();
    log(reservation, ADMIN_NAME(), `Declined the reservation. Reason: ${reason.trim()}`);
    postAdminMessage(data, reservation, `We are sorry, we are unable to accept ${reservation.eventName}. ${reason.trim()}`);
    return summarize(reservation, data);
  });
}

/** Admin: confirm a booking after the downpayment is verified; the contract becomes available. */
export async function confirmReservation(ref) {
  await latency(400, 700);
  return write((data) => {
    const reservation = findOrThrow(data, ref);
    if (reservation.status !== 'downpayment_paid') {
      throw new ApiError('INVALID_STATE', 'The downpayment must be verified before the booking is confirmed.');
    }
    reservation.status = 'confirmed';
    log(reservation, ADMIN_NAME(), 'Confirmed the booking.');
    postAdminMessage(data, reservation, `${reservation.eventName} is now confirmed. Your contract is available in Documents.`, {
      name: `Contract-${ref}.pdf`,
      kind: 'contract',
      ref
    });
    return summarize(reservation, data);
  });
}

/**
 * Admin: mark a confirmed event completed (on or after its date) and invite a testimonial.
 * A rental can only be completed once every rented piece is back and the customer holds a quotation
 * with any damage charges on it, because a completed booking can't be re-quoted.
 */
export async function completeReservation(ref) {
  await latency(400, 700);
  return write((data) => {
    const reservation = findOrThrow(data, ref);
    if (reservation.status !== 'confirmed') throw new ApiError('INVALID_STATE', 'Only confirmed bookings can be marked completed.');
    if (daysFromToday(reservation.date) > 0) throw new ApiError('INVALID_STATE', 'An event can be completed on or after its date.');
    if (isRental(reservation.serviceType)) {
      if (data.inventory.some((item) => item.allocations[ref])) {
        throw new ApiError('INVALID_STATE', 'Record the return of the rented items before completing this rental.');
      }
      if (quotationStale(reservation)) {
        throw new ApiError('INVALID_STATE', 'Re-send the quotation first, so the customer has the final total with any damage charges.');
      }
    }
    reservation.status = 'completed';
    log(reservation, ADMIN_NAME(), 'Marked the event as completed.');
    postAdminMessage(data, reservation, `Thank you for celebrating with Tres Marias! We would love to hear how ${reservation.eventName} went. You can leave a testimonial from your account.`);
    return summarize(reservation, data);
  });
}

/**
 * Admin: edit date, time, guests and venue. Logs what changed, old value and new.
 *
 * A buffet is charged per person, so changing the guest count changes what the booking costs.
 * This never edits a quotation that was already sent: instead the customer is told in their chat
 * straight away, the reservation is flagged as out of date (`quotationStale`), and the admin has
 * to re-send the quotation for the new amount to count. That way nobody's bill can move without
 * the customer seeing it first.
 *
 * A new date or start time goes through the same start-time check as a customer booking. Moving an
 * approved booking earlier also pulls its downpayment due date in, so it stays at least 3 days
 * before the event (it is never pushed later).
 *
 * An equipment rental is handled by updateRentalLogistics: it has no guests, and pick up versus
 * delivery (`patch.fulfilment`) is edited here too.
 */
export async function updateLogistics(ref, patch) {
  await latency(400, 700);
  return write((data) => {
    const reservation = findOrThrow(data, ref);
    if (['completed', 'declined', 'cancelled'].includes(reservation.status)) {
      throw new ApiError('INVALID_STATE', 'This reservation is closed and can no longer be edited.');
    }
    if (isRental(reservation.serviceType)) return updateRentalLogistics(data, reservation, patch);
    const guests = Number(patch.guests);
    if (!Number.isInteger(guests) || guests < RULES.minGuests || guests > RULES.maxGuests) {
      throw new ApiError('INVALID', `Guests must be between ${RULES.minGuests} and ${RULES.maxGuests}.`, { field: 'guests' });
    }
    if (patch.date !== reservation.date) {
      if (daysFromToday(patch.date) < 0) throw new ApiError('INVALID', 'An event cannot be moved to a past date.', { field: 'date' });
      // The admin may move an event inside the lead time, but not onto a blocked or full date
      const reason = dateUnavailableReason(patch.date, availabilitySnapshot(), { enforceLeadTime: false });
      if (reason) throw new ApiError('DATE_UNAVAILABLE', `${formatDate(patch.date)} is not available (${reason.toLowerCase()}).`, { field: 'date' });
    }
    // A new date or start time must be within booking hours, on the hour or half hour, and not overlap
    // another event that day (this event is left out of its own check)
    if (patch.date !== reservation.date || patch.startTime !== reservation.startTime) {
      const snapshot = availabilitySnapshot();
      const others = { ...snapshot, events: snapshot.events.filter((e) => e.ref !== reservation.ref) };
      const timeReason = timeUnavailableReason(patch.date, patch.startTime, others);
      if (timeReason) throw new ApiError('TIME_UNAVAILABLE', `${timeReason}.`, { field: 'startTime' });
    }
    // List the changes for the activity log, both values, e.g. "Updated guests from 100 to 150, venue."
    // The old value is kept in the trail so a change can be checked later, not just its result.
    const guestsBefore = reservation.guests;
    const changes = [];
    if (patch.date !== reservation.date) changes.push(`date from ${formatDate(reservation.date)} to ${formatDate(patch.date)}`);
    if (patch.startTime !== reservation.startTime) changes.push(`start time from ${reservation.startTime} to ${patch.startTime}`);
    if (guests !== guestsBefore) changes.push(`guests from ${guestsBefore} to ${guests}`);
    if (patch.venueName !== reservation.venue.name || patch.venueAddress !== reservation.venue.address || patch.city !== reservation.venue.city) changes.push('venue');

    // The downpayment must still fall due at least 3 days before the (new) event date
    let due = reservation.downpaymentDue;
    if (reservation.status === 'approved' && due && patch.date !== reservation.date && due > addDays(patch.date, -3)) {
      due = downpaymentDueFor(patch.date, due);
      changes.push(`downpayment due date to ${formatDate(due)}`);
    }

    reservation.downpaymentDue = due;
    reservation.date = patch.date;
    reservation.startTime = patch.startTime;
    reservation.guests = guests;
    reservation.venue = { ...reservation.venue, name: patch.venueName.trim(), address: patch.venueAddress.trim(), city: patch.city.trim(), accessNotes: (patch.accessNotes || '').trim() };
    if (changes.length) log(reservation, ADMIN_NAME(), `Updated ${changes.join(', ')}.`);

    // The guest count moved on a quoted buffet: tell the customer what it does to their total
    // before anyone re-sends anything, so a change can never pass unnoticed.
    if (guests !== guestsBefore && reservation.quotation && includesFood(reservation.serviceType)) {
      const was = reservation.quotation.food;
      const now = guests * (reservation.pricePerPlate || 0);
      postAdminMessage(
        data,
        reservation,
        `The guest count for ${reservation.eventName} was changed from ${guestsBefore} to ${guests}. Your buffet is charged per person, so the food total changes from ₱${was.toLocaleString('en-PH')} to ₱${now.toLocaleString('en-PH')}. We will send you a revised quotation, and the amount you owe only changes once that quotation reaches you.`
      );
    }
    return { changed: changes.length };
  });
}

/**
 * Admin: change what the customer is having (e.g. after agreeing it in chat) - the service type,
 * the four menu dishes and the notes. Switching between Buffet and Catering only changes the
 * total, because only a buffet is charged per person, so the customer is told in their chat and
 * the quotation is left flagged as out of date until the admin re-sends it.
 */
export async function updateMenu(ref, { serviceType, menu = {}, foodNotes = '' } = {}) {
  await latency(400, 700);
  return write((data) => {
    const reservation = findOrThrow(data, ref);
    if (['completed', 'declined', 'cancelled'].includes(reservation.status)) {
      throw new ApiError('INVALID_STATE', 'This reservation is closed and can no longer be edited.');
    }
    if (isRental(reservation.serviceType)) throw new ApiError('INVALID', 'An equipment rental has no menu. Edit the rented items instead.');
    if (!SERVICE_TYPES.includes(serviceType)) {
      throw new ApiError('INVALID', 'Choose a buffet or catering only.', { field: 'serviceType' });
    }

    let nextMenu = null;
    if (includesFood(serviceType)) {
      nextMenu = {};
      DISH_CATEGORIES.forEach(({ key, label }) => {
        const wanted = String(menu[key] || '').trim();
        if (wanted.length < 2) throw new ApiError('INVALID', `Fill in the ${label.toLowerCase()}.`, { field: `menu.${key}` });
        nextMenu[key] = wanted.slice(0, MENU_LINE_MAX);
      });
    }

    const before = reservation.serviceType;
    reservation.serviceType = serviceType;
    reservation.menu = nextMenu;
    reservation.foodNotes = String(foodNotes || '').trim();
    log(reservation, ADMIN_NAME(), before === serviceType ? 'Updated the menu.' : `Changed the booking from ${before} to ${serviceType}.`);

    // Switching to or from a buffet changes what the customer owes: tell them before re-quoting
    if (before !== serviceType && reservation.quotation) {
      postAdminMessage(
        data,
        reservation,
        `${reservation.eventName} was changed from ${before} to ${serviceType}. ${
          includesFood(serviceType)
            ? `A buffet is charged per person, so food for ${reservation.guests} guests will be added to your total.`
            : 'Catering only has no per-person charge, so the food will be taken off your total.'
        } We will send you a revised quotation, and the amount you owe only changes once that quotation reaches you.`
      );
    }
    return { ok: true };
  });
}

/** Admin: save internal notes (never shown to the customer). */
export async function saveNotes(ref, notes) {
  await latency(250, 450);
  return write((data) => {
    const reservation = findOrThrow(data, ref);
    reservation.notes = notes;
    return { ok: true };
  });
}

/* ============================ Equipment rental (admin) ============================ */

// "pick up" / "delivery", for log lines and chat messages
const fulfilmentWord = (value) => (value === 'delivery' ? 'delivery' : 'pick up');
// "₱1,200"
const pesoText = (value) => `₱${Number(value).toLocaleString('en-PH')}`;

/**
 * updateLogistics for an equipment rental (inside its write): the date, the pick-up or delivery time,
 * pick up versus delivery, and the delivery address. A new date needs an open (not blocked) day and
 * enough of every rented item free that day. Switching between pick up and delivery adds or removes
 * the delivery fee, so the customer is told in their chat (old and new total), the audit trail keeps
 * both, and a sent quotation is flagged as out of date until the admin re-sends it. Before any
 * quotation the estimate simply follows the change.
 */
function updateRentalLogistics(data, reservation, patch) {
  const fulfilment = patch.fulfilment || reservation.fulfilment;
  if (!['pickup', 'delivery'].includes(fulfilment)) throw new ApiError('INVALID', 'Choose pick up or delivery.', { field: 'fulfilment' });
  if (patch.date !== reservation.date) {
    if (daysFromToday(patch.date) < 0) throw new ApiError('INVALID', 'A rental cannot be moved to a past date.', { field: 'date' });
    const reason = dateUnavailableReason(patch.date, availabilitySnapshot(), { enforceLeadTime: false, rental: true });
    if (reason) throw new ApiError('DATE_UNAVAILABLE', `${formatDate(patch.date)} is not available (${reason.toLowerCase()}).`, { field: 'date' });
    const stock = rentalStock(data, patch.date, reservation.ref);
    const short = reservation.rentalItems.filter((line) => line.qty > (stock[line.itemId] || 0));
    if (short.length) {
      throw new ApiError('OUT_OF_STOCK', `Not enough free on ${formatDate(patch.date)}: ${short.map((line) => `${line.name} (${stock[line.itemId] || 0} of ${line.qty})`).join(', ')}.`, { field: 'date' });
    }
  }
  if (patch.date !== reservation.date || patch.startTime !== reservation.startTime) {
    // Hours and half hours only: a rental does not clash with events
    const timeReason = timeUnavailableReason(patch.date, patch.startTime, { ...availabilitySnapshot(), events: [] });
    if (timeReason) throw new ApiError('TIME_UNAVAILABLE', `${timeReason}.`, { field: 'startTime' });
  }
  const text = (value) => String(value || '').trim();
  if (fulfilment === 'delivery' && (!text(patch.venueName) || !text(patch.venueAddress) || !text(patch.city))) {
    throw new ApiError('INVALID', 'Enter where to deliver the items.', { field: 'venueAddress' });
  }
  const venue = fulfilment === 'delivery' ? { name: text(patch.venueName), address: text(patch.venueAddress), city: text(patch.city), accessNotes: text(patch.accessNotes) } : { ...RENTAL.pickupPlace, accessNotes: '' };

  // What changed, old value and new, for the audit trail
  const changes = [];
  if (patch.date !== reservation.date) changes.push(`date from ${formatDate(reservation.date)} to ${formatDate(patch.date)}`);
  if (patch.startTime !== reservation.startTime) changes.push(`${fulfilmentWord(fulfilment)} time from ${reservation.startTime} to ${patch.startTime}`);
  const switched = fulfilment !== reservation.fulfilment;
  if (switched) changes.push(`from ${fulfilmentWord(reservation.fulfilment)} to ${fulfilmentWord(fulfilment)}`);
  else if (fulfilment === 'delivery' && JSON.stringify(venue) !== JSON.stringify(reservation.venue)) changes.push('delivery address');

  // The downpayment must still fall due at least 3 days before the (new) date
  let due = reservation.downpaymentDue;
  if (reservation.status === 'approved' && due && patch.date !== reservation.date && due > addDays(patch.date, -3)) {
    due = downpaymentDueFor(patch.date, due);
    changes.push(`downpayment due date to ${formatDate(due)}`);
  }

  // The total before and after a switch between pick up and delivery (the delivery fee comes or goes)
  const was = financials(reservation, data.payments).total;
  const now = rentalQuote(data, reservation, { fulfilment }).net;
  const previous = reservation.fulfilment;

  Object.assign(reservation, { date: patch.date, startTime: patch.startTime, fulfilment, venue, downpaymentDue: due });
  if (!reservation.quotation) reservation.estimate = rentalQuote(data, reservation);
  if (changes.length) {
    log(reservation, ADMIN_NAME(), `Updated ${changes.join(', ')}.${switched && was !== now ? ` Total from ${pesoText(was)} to ${pesoText(now)}${reservation.quotation ? ' once the revised quotation is sent' : ''}.` : ''}`);
  }
  if (switched && was !== now) {
    postAdminMessage(
      data,
      reservation,
      `Your equipment rental for ${formatDate(reservation.date)} was changed from ${fulfilmentWord(previous)} to ${fulfilmentWord(fulfilment)}. ${
        fulfilment === 'delivery' ? `Delivery is ${pesoText(RENTAL.deliveryFee)} (our standard fee; a large order may be quoted more)` : `Picking up at ${RENTAL.pickupAddress} is free`
      }, so your total changes from ${pesoText(was)} to ${pesoText(now)}.${reservation.quotation ? ' We will send you a revised quotation, and the amount you owe only changes once that quotation reaches you.' : ''}`
    );
  }
  return { changed: changes.length };
}

/**
 * Admin: change what a rental includes (e.g. after agreeing it in chat). `items` is the whole new list,
 * [{ itemId, qty }]. Lines already booked keep their prices; an added item takes today's price. Every
 * item needs enough pieces free on the date (this booking's own pieces count as free), and no line can
 * drop below what is already checked out for it (record those pieces' return first).
 *
 * The new total is never written into a sent quotation: the customer is told in their chat (old and
 * new total), the audit trail keeps both values, and the quotation is flagged as out of date until the
 * admin re-sends it. Before any quotation, the estimate follows the new list at once.
 */
export async function updateRentalItems(ref, { items = [] } = {}) {
  await latency(400, 700);
  return write((data) => {
    const reservation = findOrThrow(data, ref);
    if (!isRental(reservation.serviceType)) throw new ApiError('INVALID', 'Only an equipment rental has rented items.');
    if (['completed', 'declined', 'cancelled'].includes(reservation.status)) {
      throw new ApiError('INVALID_STATE', 'This reservation is closed and can no longer be edited.');
    }
    const lines = rentalLines(data, items, reservation.date, { excludeRef: ref, current: reservation.rentalItems });
    data.inventory.forEach((item) => {
      const out = item.allocations[ref] || 0;
      const line = lines.find((l) => l.itemId === item.id);
      if (out && (!line || line.qty < out)) {
        throw new ApiError('INVALID', `${out} ${item.name} ${out === 1 ? 'is' : 'are'} already checked out for this rental. Record their return first.`, { field: `rental.${item.id}` });
      }
    });

    // Describe the change line by line, e.g. "Monobloc chair from 50 to 80, added 5 × Round table"
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

    const was = financials(reservation, data.payments).total;
    const now = rentalQuote(data, reservation, { rentalItems: lines }).net;
    reservation.rentalItems = lines;
    if (!reservation.quotation) reservation.estimate = rentalQuote(data, reservation);
    const pending = reservation.quotation ? ' once the revised quotation is sent' : '';
    log(reservation, ADMIN_NAME(), `Changed the rented items: ${changes.join(', ')}. Total from ${pesoText(was)} to ${pesoText(now)}${pending}.`);
    postAdminMessage(
      data,
      reservation,
      `The items you are renting for ${formatDate(reservation.date)} were changed: ${changes.join(', ')}. Your total changes from ${pesoText(was)} to ${pesoText(now)}.${reservation.quotation ? ' We will send you a revised quotation, and the amount you owe only changes once that quotation reaches you.' : ''}`
    );
    return { changed: changes.length };
  });
}
