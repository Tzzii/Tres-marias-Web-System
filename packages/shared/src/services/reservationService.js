import { addDays, daysFromToday, formatDate, todayISO } from '../utils/format.js';
import { CUSTOMER_EDITABLE, HOLDS_DATE, statusLabel } from '../utils/status.js';
import { availabilitySnapshot, dateUnavailableReason, timeUnavailableReason } from './calendarService.js';
import { RULES, setupsFor } from './config.js';
import { computeQuote } from './pricing.js';
import { customerThread } from './messageService.js';
import { makeReservationRef } from './reservationRef.js';
import { ApiError, clone, latency, read, uid, write } from './store.js';

/**
 * Reservations and the status pipeline:
 * Pending → Approved → Downpayment paid → Confirmed → Completed (or Declined / Cancelled).
 */

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

/** Money and standing for one reservation, derived from its verified payments. */
export function financials(reservation, payments) {
  // Use the sent quotation's total, or the estimate if no quotation yet
  const total = reservation.quotation ? reservation.quotation.net : reservation.estimate.net;
  const mine = payments.filter((p) => p.ref === reservation.ref);
  // Only verified payments count as paid
  const paid = mine.filter((p) => p.status === 'verified').reduce((sum, p) => sum + p.amount, 0);
  const awaiting = mine.filter((p) => p.status === 'awaiting');
  const balance = Math.max(0, total - paid);
  const downpayment = Math.round(total * RULES.downpaymentRate);

  // full = paid everything; overdue = approved, due date passed, downpayment not reached; partial = some paid
  let balanceState = 'unpaid';
  if (paid >= total && total > 0) balanceState = 'full';
  else if (
    reservation.status === 'approved' &&
    reservation.downpaymentDue &&
    daysFromToday(reservation.downpaymentDue) < 0 &&
    paid < downpayment
  )
    balanceState = 'overdue';
  else if (paid > 0) balanceState = 'partial';

  return {
    total,
    paid,
    balance,
    downpayment,
    downpaymentPaid: paid >= downpayment,
    awaitingAmount: awaiting.reduce((sum, p) => sum + p.amount, 0),
    awaitingCount: awaiting.length,
    balanceState
  };
}

/**
 * Keep an approved booking's status in step with what has been paid:
 *   paid in full        -> Confirmed
 *   downpayment reached -> Downpayment paid
 *   below the downpayment again (a new, higher quotation) -> back to Approved
 * Statuses only move forward when something has been paid, and Confirmed or later never moves back.
 * Used when a payment is verified (paymentService.js) and when a quotation is re-sent. Returns true when the status changed.
 */
export function syncPaymentStatus(data, reservation) {
  const money = financials(reservation, data.payments);
  const before = reservation.status;
  if (['approved', 'downpayment_paid'].includes(before) && money.paid > 0 && money.paid >= money.total) reservation.status = 'confirmed';
  else if (before === 'approved' && money.paid > 0 && money.downpaymentPaid) reservation.status = 'downpayment_paid';
  else if (before === 'downpayment_paid' && !money.downpaymentPaid) reservation.status = 'approved';
  return reservation.status !== before;
}

/**
 * Downpayment due date for an event: `due` (by default RULES.downpaymentDueDays from today),
 * but no later than 3 days before the event and never before today.
 */
function downpaymentDueFor(eventDate, due = addDays(todayISO(), RULES.downpaymentDueDays)) {
  const latest = addDays(eventDate, -3);
  const capped = due < latest ? due : latest;
  return capped < todayISO() ? todayISO() : capped;
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

/** Full detail: summary plus the resolved package, add-ons and payments. */
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
 * Any package can be picked for any occasion, and the guest count may be above what the
 * package covers (the admin adds charges for that in the quotation). The food is a written
 * request; its price, and the price of each add-on, come later in the quotation.
 */
export async function createReservation(customerId, form) {
  await latency(600, 1000);
  return write((data) => {
    // Re-check everything on the "server" side: package, date, start time, guests, food request, required fields
    const pkg = data.packages.find((p) => p.id === form.packageId && p.visible && !p.archived);
    if (!pkg) throw new ApiError('INVALID', 'Please choose an available package.', { field: 'packageId' });

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

    const foodRequest = (form.foodRequest || '').trim();
    if (foodRequest.length < 5) throw new ApiError('INVALID', 'Tell us the food you would like us to cook.', { field: 'foodRequest' });
    // Silently drop add-ons that were archived while the form was open
    const addonIds = (form.addonIds || []).filter((id) => data.addons.some((a) => a.id === id && !a.archived));
    if (!form.eventName || !form.occasion || !form.startTime || !form.venueName || !form.venueAddress || !form.city || !form.setup) {
      throw new ApiError('INVALID', 'Please complete every required field.');
    }
    // The setup style must be one the chosen package offers
    if (!setupsFor(pkg).includes(form.setup)) {
      throw new ApiError('INVALID', `${pkg.name} is not available as ${form.setup}. Choose another setup style.`, { field: 'setup' });
    }

    const customer = data.customers.find((c) => c.id === customerId);
    // Only the package price is known until the admin sends the quotation
    const estimate = computeQuote({ pkg, addonIds });
    const reservation = {
      ref: nextRef(data, form.date),
      customerId,
      eventName: form.eventName.trim(),
      occasion: form.occasion,
      date: form.date,
      startTime: form.startTime,
      guests,
      packageId: pkg.id,
      foodRequest,
      venue: {
        name: form.venueName.trim(),
        address: form.venueAddress.trim(),
        city: form.city.trim(),
        setup: form.setup,
        accessNotes: (form.accessNotes || '').trim()
      },
      addonIds,
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
 * Admin: price the food, each add-on and any other charges (e.g. guests above what the
 * package covers), apply an optional discount, and send the quotation to the customer's chat.
 * `addonPrices` is { addonId: amount } for the add-ons on the reservation.
 * Re-sending a quotation on an approved booking re-checks the status against the new total
 * (see syncPaymentStatus): a higher total can move Downpayment paid back to Approved with a new
 * due date, and a lower one can move it forward.
 */
export async function sendQuotation(ref, { food = 0, addonPrices = {}, otherCharges = 0, otherLabel = '', discount = 0, note = '' } = {}) {
  await latency(450, 800);
  return write((data) => {
    const reservation = findOrThrow(data, ref);
    if (['declined', 'cancelled', 'completed'].includes(reservation.status)) {
      throw new ApiError('INVALID_STATE', `A ${statusLabel(reservation.status).toLowerCase()} reservation cannot be re-quoted.`);
    }
    const pkg = data.packages.find((p) => p.id === reservation.packageId);
    const paid = financials(reservation, data.payments).paid;
    const quote = computeQuote({ pkg, addonIds: reservation.addonIds, food, addonPrices, otherCharges, discount });
    if (quote.net < paid) throw new ApiError('INVALID', 'The net total cannot be lower than what the customer has already paid.');
    reservation.quotation = { ...quote, otherLabel: quote.otherCharges ? otherLabel.trim() : '', sentAt: Date.now(), note: note.trim() };
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
 * them can ask for overlapping times).
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

    // Refuse if the date already has as many approved events as the daily capacity
    const others = data.reservations.filter((r) => r.date === reservation.date && r.ref !== ref && HOLDS_DATE.includes(r.status)).length;
    if (others >= data.calendar.dailyCapacity) {
      throw new ApiError('CAPACITY', `${formatDate(reservation.date)} is already at the daily capacity of ${data.calendar.dailyCapacity} events.`);
    }

    // Refuse if the start time overlaps an event already approved that day (with the setup buffer around it)
    const snapshot = availabilitySnapshot();
    const timeReason = timeUnavailableReason(reservation.date, reservation.startTime, { ...snapshot, events: snapshot.events.filter((e) => e.ref !== ref) });
    if (timeReason) {
      throw new ApiError('TIME_UNAVAILABLE', `${timeReason} on ${formatDate(reservation.date)}. Change the start time before approving.`);
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

/** Admin: mark a confirmed event completed (on or after its date) and invite a testimonial. */
export async function completeReservation(ref) {
  await latency(400, 700);
  return write((data) => {
    const reservation = findOrThrow(data, ref);
    if (reservation.status !== 'confirmed') throw new ApiError('INVALID_STATE', 'Only confirmed bookings can be marked completed.');
    if (daysFromToday(reservation.date) > 0) throw new ApiError('INVALID_STATE', 'An event can be completed on or after its date.');
    reservation.status = 'completed';
    log(reservation, ADMIN_NAME(), 'Marked the event as completed.');
    postAdminMessage(data, reservation, `Thank you for celebrating with Tres Marias! We would love to hear how ${reservation.eventName} went. You can leave a testimonial from your account.`);
    return summarize(reservation, data);
  });
}

/**
 * Admin: edit date, time, guests, venue and setup style. Logs what changed. (The price doesn't depend on
 * these; re-send the quotation to change it.) A new setup style must be one the package offers, and a new
 * date or start time goes through the same start-time check as a customer booking.
 * Moving an approved booking earlier also pulls its downpayment due date in, so it stays at least
 * 3 days before the event (it is never pushed later).
 */
export async function updateLogistics(ref, patch) {
  await latency(400, 700);
  return write((data) => {
    const reservation = findOrThrow(data, ref);
    if (['completed', 'declined', 'cancelled'].includes(reservation.status)) {
      throw new ApiError('INVALID_STATE', 'This reservation is closed and can no longer be edited.');
    }
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
    if (patch.setup !== reservation.venue.setup) {
      const pkg = data.packages.find((p) => p.id === reservation.packageId);
      if (!setupsFor(pkg).includes(patch.setup)) {
        throw new ApiError('INVALID', `${pkg ? pkg.name : 'This package'} is not available as ${patch.setup}.`, { field: 'setup' });
      }
    }
    // List the changes for the activity log, e.g. "Updated guests to 150, venue."
    const changes = [];
    if (patch.date !== reservation.date) changes.push(`date to ${formatDate(patch.date)}`);
    if (patch.startTime !== reservation.startTime) changes.push(`start time to ${patch.startTime}`);
    if (guests !== reservation.guests) changes.push(`guests to ${guests}`);
    if (patch.setup !== reservation.venue.setup) changes.push(`setup to ${patch.setup}`);
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
    reservation.venue = { ...reservation.venue, name: patch.venueName.trim(), address: patch.venueAddress.trim(), city: patch.city.trim(), setup: patch.setup, accessNotes: (patch.accessNotes || '').trim() };
    if (changes.length) log(reservation, ADMIN_NAME(), `Updated ${changes.join(', ')}.`);
    return { changed: changes.length };
  });
}

/** Admin: replace the food the customer asked for (e.g. after agreeing changes in chat). Re-send the quotation to update the food price. */
export async function updateFoodRequest(ref, foodRequest) {
  await latency(400, 700);
  return write((data) => {
    const reservation = findOrThrow(data, ref);
    if (['completed', 'declined', 'cancelled'].includes(reservation.status)) {
      throw new ApiError('INVALID_STATE', 'This reservation is closed and can no longer be edited.');
    }
    const text = (foodRequest || '').trim();
    if (text.length < 5) throw new ApiError('INVALID', 'Describe the food to cook (at least 5 characters).', { field: 'foodRequest' });
    reservation.foodRequest = text;
    log(reservation, ADMIN_NAME(), 'Updated the food request.');
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
