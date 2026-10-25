import { cleanMenu, menuProblem, DESSERT_ADDON_ID } from '@tm/shared/src/domain/menu.js';
import {
  dateUnavailableReason,
  endTimeProblem,
  eventHours,
  timeUnavailableReason
} from '@tm/shared/src/domain/availability.js';
import { cancelDeadline, onlineCancellation } from '@tm/shared/src/domain/cancellation.js';
import { addonPriceMap, bookableAddons, flattenAddons, packagePickProblem } from '@tm/shared/src/domain/catalog.js';
import { downpaymentDueFor, dueAfterMove, financials, statusForPayments } from '@tm/shared/src/domain/money.js';
import {
  addonShortfall,
  addonStockProblem,
  approvalMessage,
  menuDishes,
  quotationStale,
  quotationStaleReason,
  rentalAvailability,
  rentalQuote,
  rentalStock
} from '@tm/shared/src/domain/reservation.js';
import { cleanStyling, stylingProblem, themeLabel } from '@tm/shared/src/domain/styling.js';
import {
  BUSINESS,
  DEFAULT_MIN_DOWNPAYMENT,
  DEFAULT_PRICE_PER_PLATE,
  DEFAULT_SIX_HOUR_FEE,
  RENTAL,
  RENTAL_SERVICE,
  RULES,
  SERVICE_TYPES,
  bookingOccasion,
  includesFood,
  isRental
} from '@tm/shared/src/services/config.js';
import { TERMS_VERSION } from '@tm/shared/src/legal/terms.js';
import { ITEM_COUNT_MAX, itemsToConfirm } from '@tm/shared/src/domain/packageItems.js';
import { helperItemCounts } from '@tm/shared/src/utils/helperLabels.js';
import {
  computeQuote,
  extraGuestsFor,
  reservationSixHourFee,
  sixHourFeeProblem,
  durationChargeFor
} from '@tm/shared/src/services/pricing.js';
import { makeReservationRef } from '@tm/shared/src/services/reservationRef.js';
import { daysFromToday, formatDate, todayISO } from '@tm/shared/src/utils/format.js';
import { HOLDS_DATE, statusLabel } from '@tm/shared/src/utils/status.js';
import { tx } from '../../db.js';
import { ApiError } from '../../lib/ApiError.js';
import { isClockTime, isISODate, now } from '../../lib/time.js';
import { lockAvailability } from '../calendar/calendar.repo.js';
import { availabilityMap } from '../calendar/calendar.service.js';
import * as catalogRepo from '../catalog/catalog.repo.js';
import { postAdminMessage, postCustomerMessage } from '../messages/messages.repo.js';
import { queueCustomerEmail } from '../notify/notify.service.js';
import { openQrError, openQrIn } from '../payments/payments.service.js';
import * as repo from './reservations.repo.js';
import { inspectReferencePhoto, storeReferencePhoto } from './referencePhoto.js';
import { storage } from '../../integrations/storage/index.js';
import { cleanReferencePhotos, REFERENCE_PHOTO_MAX_COUNT } from '@tm/shared/src/domain/referencePhoto.js';

const MAX_REF_ATTEMPTS = 3;

const notFound = () => new ApiError('NOT_FOUND', 'We could not find this reservation.');
const invalid = (message, field) => new ApiError('INVALID', message, field ? { field } : {});

const clean = (value) => (typeof value === 'string' ? value.toWellFormed().trim() : '');

const toNumber = (value) =>
  typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
const plainObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

const sameRef = (found, ref) => found.ref === ref;

// eslint-disable-next-line no-unused-vars
const withoutNotes = ({ notes, ...rest }) => rest;
const viewFor = (customerId) => (customerId ? withoutNotes : (answer) => answer);

function summarize({
  reservation,
  packageName,
  packageSlug,
  customerName,
  customerEmail,
  customerMobile,
  payments,
  refunds,
  pendingQrs,
  piecesOut
}) {
  const money = financials(reservation, payments, refunds);
  const open = openQrIn(pendingQrs);
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
    onlineCancel: onlineCancellation(reservation, money, { piecesOut, openQrUntil: open ? open.openUntil : 0 }),
    openQr: open ? { id: open.id, amount: open.amount, expiresAt: open.expiresAt } : null
  };
}

export async function listReservations({ customerId } = {}) {
  const rows = await tx((conn) => repo.findReservations(conn, { customerId }));
  return rows.map((row) => viewFor(customerId)(summarize(row)));
}

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
      addons: flattenAddons(addons).filter((addon) => reservation.addonIds.includes(addon.id)),
      payments: row.payments,
      refunds: row.refunds,
      customer:
        row.customerName === null
          ? null
          : {
              id: reservation.customerId,
              name: row.customerName,
              email: row.customerEmail,
              mobile: row.customerMobile,
              pastEvents
            },
      testimonial
    };
  });
  return viewFor(customerId)(detail);
}

export async function getRentalAvailability(date, { excludeRef } = {}) {
  if (date === undefined || date === '') return {};
  if (!isISODate(date)) throw invalid('Choose the date you need the items.', 'date');
  const stockData = await tx((conn) => repo.rentalStockInputs(conn, date));
  return rentalAvailability(stockData, date, typeof excludeRef === 'string' ? excludeRef : undefined);
}

function startTimeOf(form) {
  const value = form.startTime ?? '';
  if (value === '') return '';
  if (!isClockTime(value)) throw invalid('Enter the start time as HH:MM, e.g. 18:00.', 'startTime');
  return value;
}

function stylingOf(value) {
  const styling = cleanStyling(value);
  const problem = stylingProblem(styling);
  if (problem) throw invalid(problem.message, problem.field);
  return styling;
}

function occasionOf(form) {
  const { occasion, problem } = bookingOccasion(clean(form.occasion), clean(form.occasionOther));
  if (problem) throw invalid(problem.message, problem.field);
  return occasion;
}

function eventTimesOf(form, date, map) {
  const startTime = startTimeOf(form);
  const startReason = timeUnavailableReason(date, startTime, map);
  if (startReason)
    throw new ApiError(
      'TIME_UNAVAILABLE',
      `That start time is not available (${startReason.toLowerCase()}). Please pick another time.`,
      { field: 'startTime' }
    );
  const endTime = typeof form.endTime === 'string' ? form.endTime : '';
  const endProblem = endTimeProblem(startTime, endTime);
  if (endProblem) throw invalid(`${endProblem}.`, 'endTime');
  const endReason = timeUnavailableReason(date, startTime, map, eventHours(startTime, endTime));
  if (endReason) throw new ApiError('TIME_UNAVAILABLE', `${endReason}.`, { field: 'endTime' });
  return { startTime, endTime };
}

async function eventBooking(conn, pkg, form) {
  const date = form.date;
  if (!isISODate(date)) throw invalid('Choose the event date.', 'date');
  const map = await availabilityMap(conn);
  const reason = dateUnavailableReason(date, map);
  if (reason)
    throw new ApiError(
      'DATE_UNAVAILABLE',
      `That date is not available (${reason.toLowerCase()}). Please pick another date.`,
      { field: 'date' }
    );
  const { startTime, endTime } = eventTimesOf(form, date, map);

  const guests = toNumber(form.guests);
  if (!Number.isInteger(guests) || guests < RULES.minGuests || guests > RULES.maxGuests) {
    throw invalid(`Guests must be between ${RULES.minGuests} and ${RULES.maxGuests}.`, 'guests');
  }
  const serviceType = form.serviceType;
  if (!SERVICE_TYPES.includes(serviceType))
    throw invalid('Choose whether you want a buffet or catering only.', 'serviceType');

  const styling = stylingOf(form.styling);

  const offered = bookableAddons(await catalogRepo.listAddons({}, conn));
  const ticked = [...new Set(Array.isArray(form.addonIds) ? form.addonIds : [])];
  const addons = ticked.map((id) => offered.find((addon) => addon.id === id)).filter(Boolean);
  const pickProblem = packagePickProblem(addons);
  if (pickProblem) throw invalid(pickProblem.message, pickProblem.field);
  const quantities = plainObject(form.addonQty);
  const addonQty = {};
  addons.forEach((addon) => {
    if (!addon.hasQuantity) return;
    const many = toNumber(quantities[addon.id]);
    if (!Number.isInteger(many) || many < 1 || many > 99)
      throw invalid(`Tell us how many you need for ${addon.name} (1 to 99).`, `addonQty.${addon.id}`);
    addonQty[addon.id] = many;
  });
  const addonIds = addons.map((addon) => addon.id);
  const menuOptions = { buffet: includesFood(serviceType), dessert: addonIds.includes(DESSERT_ADDON_ID) };
  const menuCheck = menuProblem(form.menu, menuOptions);
  if (menuCheck) throw invalid(menuCheck.message, menuCheck.field);
  const menu = cleanMenu(form.menu, menuOptions);
  const stockProblem = addonStockProblem(
    await repo.rentalStockInputs(conn, date),
    { addonIds, addonQty },
    date,
    addons
  );
  if (stockProblem) throw invalid(stockProblem.message, stockProblem.field);

  const eventName = clean(form.eventName);
  const venue = {
    name: clean(form.venueName),
    address: clean(form.venueAddress),
    city: clean(form.city),
    accessNotes: clean(form.accessNotes)
  };
  if (!eventName || !clean(form.occasion) || !startTime || !venue.name || !venue.address || !venue.city)
    throw invalid('Please complete every required field.');
  const occasion = occasionOf(form);

  const pricePerPlate = Number(await catalogRepo.getPricePerPlate(conn)) || DEFAULT_PRICE_PER_PLATE;
  const sixHourFee = Number((await catalogRepo.getSixHourFee(conn)) ?? DEFAULT_SIX_HOUR_FEE);
  return {
    fields: {
      eventName,
      occasion,
      date,
      startTime,
      endTime,
      guests,
      packageId: pkg.id,
      serviceType,
      menu,
      foodNotes: clean(form.foodNotes),
      styling,
      pricePerPlate,
      minDownpayment: await currentMinDownpayment(conn),
      venue,
      addonIds,
      addonQty,
      estimate: computeQuote({
        pkg,
        serviceType,
        guests,
        pricePerPlate,
        startTime,
        endTime,
        sixHourFee,
        addonIds,
        addonQty,
        addonPrices: addonPriceMap(addons)
      })
    },
    lines: [],
    activity: 'Submitted the reservation request.',
    thankYou: `Thank you for your reservation request for ${eventName} on ${formatDate(date)}. We are reviewing it and will send your quotation within 24 hours.`
  };
}

function rentalLines(stockData, wanted, date, { excludeRef, current = [] } = {}) {
  const qtyById = new Map();
  (Array.isArray(wanted) ? wanted : []).forEach((line) => {
    const itemId = line && typeof line === 'object' ? line.itemId : undefined;
    if (typeof itemId !== 'string')
      throw invalid('One of the items is no longer for rent. Please remove it.', 'rentalItems');
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
      throw invalid(
        `Enter how many ${item.name} you need (1 to ${RENTAL.maxQty.toLocaleString('en-PH')}).`,
        `rental.${itemId}`
      );
    }
    const left = stock[itemId] || 0;
    if (qty > left) {
      throw new ApiError(
        'OUT_OF_STOCK',
        left
          ? `Only ${left} ${item.name} ${left === 1 ? 'is' : 'are'} free on ${formatDate(date)}.`
          : `${item.name} is fully booked on ${formatDate(date)}.`,
        { field: `rental.${itemId}` }
      );
    }
    return {
      itemId,
      name: item.name,
      qty,
      price: booked ? booked.price : item.rentPrice,
      damageFee: booked ? booked.damageFee : item.damageFee || 0
    };
  });
}

async function rentalBooking(conn, pkg, form) {
  const date = form.date;
  if (!isISODate(date)) throw invalid('Choose the date you need the items.', 'date');
  const map = await availabilityMap(conn);
  const reason = dateUnavailableReason(date, map, { rental: true });
  if (reason)
    throw new ApiError(
      'DATE_UNAVAILABLE',
      `That date is not available (${reason.toLowerCase()}). Please pick another date.`,
      { field: 'date' }
    );
  const startTime = startTimeOf(form);
  const timeReason = timeUnavailableReason(date, startTime, { ...map, events: [] });
  if (timeReason) throw new ApiError('TIME_UNAVAILABLE', `${timeReason}.`, { field: 'startTime' });

  const fulfilment = form.fulfilment;
  if (!['pickup', 'delivery'].includes(fulfilment)) throw invalid('Choose pick up or delivery.', 'fulfilment');
  const eventName = clean(form.eventName);
  if (!eventName || !clean(form.occasion) || !startTime) throw invalid('Please complete every required field.');
  const occasion = occasionOf(form);
  const place = { name: clean(form.venueName), address: clean(form.venueAddress), city: clean(form.city) };
  if (fulfilment === 'delivery' && (!place.name || !place.address || !place.city)) {
    throw invalid('Tell us where to deliver the items.', 'venueAddress');
  }
  const lines = rentalLines(await repo.rentalStockInputs(conn, date), form.rentalItems, date);
  return {
    fields: {
      eventName,
      occasion,
      date,
      startTime,
      endTime: null,
      guests: 0,
      packageId: pkg.id,
      serviceType: RENTAL_SERVICE,
      menu: null,
      foodNotes: '',
      styling: null,
      pricePerPlate: 0,
      minDownpayment: await currentMinDownpayment(conn),
      rentalItems: lines,
      fulfilment,
      damageCharges: [],
      venue:
        fulfilment === 'delivery'
          ? { ...place, accessNotes: clean(form.accessNotes) }
          : { ...RENTAL.pickupPlace, accessNotes: '' },
      addonIds: [],
      addonQty: {},
      estimate: computeQuote({
        pkg,
        serviceType: RENTAL_SERVICE,
        rentalItems: lines,
        deliveryFee: fulfilment === 'delivery' ? RENTAL.deliveryFee : 0
      })
    },
    lines,
    activity: 'Submitted the equipment rental request.',
    thankYou: `Thank you for your equipment rental request for ${formatDate(date)}. We are checking the items and will send your quotation within 24 hours.`
  };
}

const currentMinDownpayment = async (conn) =>
  Number(await catalogRepo.getMinDownpayment(conn)) || DEFAULT_MIN_DOWNPAYMENT;

const refPrefix = (date) => makeReservationRef(date, []).replace(/\d+$/, '');

const isRefTaken = (err) =>
  Boolean(err) &&
  err.code === 'ER_DUP_ENTRY' &&
  String(err.sqlMessage || '').includes("for key 'reservations.PRIMARY'");

async function book(conn, customer, form, referencePhotos) {
  await lockAvailability(conn);
  if (form.agreeTerms !== true)
    throw invalid('Please read and agree to the Terms of Service before sending your request.', 'agreeTerms');
  const pkg = typeof form.packageId === 'string' ? await catalogRepo.findPackageById(form.packageId, conn) : null;
  if (!pkg || !pkg.visible || pkg.archived) throw invalid('Please choose an available package.', 'packageId');
  const booking = pkg.kind === 'rental' ? await rentalBooking(conn, pkg, form) : await eventBooking(conn, pkg, form);
  if (referencePhotos.length) {
    if (pkg.kind === 'rental')
      throw invalid(
        'Reference photos are for event styling. Remove the photos for an equipment rental.',
        'styling.referencePhoto'
      );
    booking.fields.styling = {
      theme: '',
      themeOther: '',
      colors: [],
      notes: '',
      ...booking.fields.styling,
      referencePhotos
    };
  }

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
    createdAt: at,
    termsVersion: TERMS_VERSION
  };
  await repo.insertReservation(conn, reservation);
  await repo.insertAddons(conn, ref, reservation.addonIds, reservation.addonQty);
  await repo.insertRentalLines(conn, ref, booking.lines);
  await repo.insertActivity(conn, ref, { at, actor: customer.name, text: booking.activity });
  await postAdminMessage(conn, reservation, booking.thankYou, null, 'Tres Marias team');

  const [row] = await repo.findReservations(conn, { ref });
  return withoutNotes(summarize(row));
}

export async function createReservation(
  customer,
  form,
  { transact = tx, referencePhoto: file, referencePhotos: files = file ? [file] : [] } = {}
) {
  const safeForm = { ...form, styling: { ...plainObject(form.styling), referencePhoto: null, referencePhotos: [] } };
  if (!Array.isArray(files) || files.length > REFERENCE_PHOTO_MAX_COUNT)
    throw invalid(`Upload up to ${REFERENCE_PHOTO_MAX_COUNT} reference photos.`, 'styling.referencePhoto');
  // Validate all files before writing any of them; clean up partial writes on failure.
  files.forEach(inspectReferencePhoto);
  const referencePhotos = [];
  try {
    for (const photo of files) referencePhotos.push(await storeReferencePhoto(photo));
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await transact((conn) => book(conn, customer, safeForm, referencePhotos));
      } catch (err) {
        if (attempt >= MAX_REF_ATTEMPTS || !isRefTaken(err)) throw err;
      }
    }
  } catch (err) {
    await Promise.all(
      referencePhotos.map((photo) =>
        storage
          .remove(photo.key)
          .catch((cleanupError) => console.error('[reference-photo] Cleanup failed:', cleanupError.message))
      )
    );
    throw err;
  }
}

export async function getReferencePhoto(ref, { customerId, photoIndex = 0, transact = tx } = {}) {
  return transact(async (conn) => {
    const [row] = await repo.findReservations(conn, { customerId, ref });
    if (!row || !sameRef(row.reservation, ref)) throw notFound();
    const styling = row.reservation.styling;
    const photos = cleanReferencePhotos(styling?.referencePhotos ?? styling?.referencePhoto);
    const photo = Number.isInteger(photoIndex) && photoIndex >= 0 ? photos[photoIndex] : null;
    if (!photo) throw new ApiError('NOT_FOUND', 'No reference photo was attached to this reservation.');
    return photo;
  });
}

export async function cancelReservation(ref, customer, reason) {
  const text = clean(reason);
  if (!text) throw invalid('Tell us why you are cancelling.', 'reason');
  return tx(async (conn) => {
    const owner = await repo.lockOwner(conn, ref);
    if (!owner || !sameRef(owner, ref) || owner.customerId !== customer.id) throw notFound();
    const [row] = await repo.findReservations(conn, { ref });
    const money = financials(row.reservation, row.payments, row.refunds);
    const open = openQrIn(row.pendingQrs);
    const online = onlineCancellation(row.reservation, money, {
      piecesOut: row.piecesOut,
      openQrUntil: open ? open.openUntil : 0
    });
    if (!online.allowed) throw new ApiError(online.code, online.reason);
    await repo.setCancelled(conn, ref, text, 'customer');
    await repo.insertActivity(conn, ref, {
      at: now(),
      actor: customer.name,
      text: `Cancelled the reservation. Reason: ${text}`
    });
    if (money.paid > 0) {
      await postCustomerMessage(
        conn,
        row.reservation,
        `Cancellation: ${row.reservation.eventName}. Reason: ${text}. ₱${money.paid.toLocaleString('en-PH')} was paid and needs to be returned.`,
        customer.name
      );
    }
    await queueCustomerEmail(conn, {
      customerId: row.reservation.customerId,
      ref: row.reservation.ref,
      purpose: 'reservation_cancelled',
      data: { reservation: row.reservation, by: 'customer', reason: text, paid: money.paid, at: now() }
    });
    const [updated] = await repo.findReservations(conn, { ref });
    return withoutNotes(summarize(updated));
  });
}

export async function requestChange(ref, customer, message) {
  const text = clean(message);
  if (!text) throw invalid('Describe the change you would like.', 'message');
  return tx(async (conn) => {
    const owner = await repo.lockOwner(conn, ref);
    if (!owner || !sameRef(owner, ref) || owner.customerId !== customer.id) throw notFound();
    const { threadId } = await postCustomerMessage(conn, owner, `Change request: ${text}`, customer.name);
    await repo.insertActivity(conn, ref, {
      at: now(),
      actor: customer.name,
      text: 'Requested a change to the reservation.'
    });
    return { threadId };
  });
}

export async function acceptQuotation(ref, customer, sentAt) {
  return tx(async (conn) => {
    await lockAvailability(conn);
    const owner = await repo.lockOwner(conn, ref);
    if (!owner || !sameRef(owner, ref) || owner.customerId !== customer.id) throw notFound();
    const [row] = await repo.findReservations(conn, { ref });
    const { reservation } = row;
    if (reservation.status !== 'pending') {
      throw new ApiError(
        'INVALID_STATE',
        CLOSED.includes(reservation.status) && reservation.status !== 'completed'
          ? `This reservation is ${statusLabel(reservation.status).toLowerCase()}, so its quotation can no longer be accepted.`
          : 'You already accepted this quotation.'
      );
    }
    const quote = reservation.quotation;
    if (!quote)
      throw new ApiError(
        'NO_QUOTATION',
        'We have not sent your quotation yet. We will tell you in your chat when it is ready.'
      );
    if (quotationStale(reservation))
      throw new ApiError(
        'INVALID_STATE',
        'Your reservation changed after this quotation was sent. We will send you a revised quotation to accept.'
      );
    if (toNumber(sentAt) !== quote.sentAt)
      throw new ApiError('INVALID_STATE', 'We sent you a newer quotation. Please review it before accepting.');
    const blocked = await slotProblem(conn, reservation);
    if (blocked)
      throw new ApiError(
        blocked.code,
        `${blocked.problem} Please message us so we can find another ${blocked.fix === 'time' ? 'time' : 'date'} for you.`
      );

    const approved = { ...reservation, status: 'approved', downpaymentDue: downpaymentDueFor(reservation.date) };
    await repo.updateReservation(conn, ref, { status: approved.status, downpaymentDue: approved.downpaymentDue });
    await repo.insertActivity(conn, ref, {
      at: now(),
      actor: customer.name,
      text: `Accepted the quotation (${pesoText(quote.net)}). The reservation is approved.`
    });
    await postCustomerMessage(
      conn,
      reservation,
      `I accept the quotation for ${reservation.eventName}: ${pesoText(quote.net)}.`,
      customer.name
    );
    const money = financials(approved, row.payments, row.refunds);
    await postAdminMessage(
      conn,
      reservation,
      approvalMessage(approved, money),
      { name: `Quotation-${ref}.pdf`, kind: 'quotation', ref },
      'Tres Marias team'
    );
    await queueCustomerEmail(conn, {
      customerId: reservation.customerId,
      ref: reservation.ref,
      purpose: 'reservation_approved',
      data: { reservation: approved, total: money.total, downpayment: money.downpayment, acceptedAt: now() }
    });
    const [updated] = await repo.findReservations(conn, { ref });
    return withoutNotes(summarize(updated));
  });
}

const CLOSED = ['completed', 'declined', 'cancelled'];
const MAX_AMOUNT = 10000000;

const closedError = () => new ApiError('INVALID_STATE', 'This reservation is closed and can no longer be edited.');
const pesoText = (value) => `₱${Number(value).toLocaleString('en-PH')}`;
const asSentence = (text) => (/[.!?]$/.test(text) ? text : `${text}.`);
const fulfilmentWord = (value) => (value === 'delivery' ? 'delivery' : 'pick up');
const shortList = (short, stock) =>
  short.map((line) => `${line.name} (${stock[line.itemId] || 0} of ${line.qty})`).join(', ');

function reasonOf(value) {
  const text = clean(value);
  if (text.length < 5) throw invalid('Please give a short reason (at least 5 characters).', 'reason');
  return text;
}

function quotationAmount(value, field, message = `Enter an amount in whole pesos, up to ${pesoText(MAX_AMOUNT)}.`) {
  const amount = value === undefined ? 0 : toNumber(value);
  if (!Number.isInteger(amount) || amount < 0 || amount > MAX_AMOUNT) throw invalid(message, field);
  return amount;
}

const logAdmin = (conn, ref, admin, text) => repo.insertActivity(conn, ref, { at: now(), actor: admin.name, text });

async function savedSummary(conn, ref) {
  const [row] = await repo.findReservations(conn, { ref });
  return summarize(row);
}

function adminWrite(ref, action, { availability = false, transact = tx } = {}) {
  return transact(async (conn) => {
    if (availability) await lockAvailability(conn);
    const owner = await repo.lockOwner(conn, ref);
    if (!owner || !sameRef(owner, ref)) throw notFound();
    const [row] = await repo.findReservations(conn, { ref });
    return action(conn, row);
  });
}

async function slotProblem(conn, reservation) {
  const { date, ref } = reservation;
  if (daysFromToday(date) < 0) return { code: 'INVALID_STATE', problem: 'This event date has passed.', fix: 'date' };
  const map = await availabilityMap(conn);
  const blocked = map.blocked.find((b) => b.date === date);
  if (blocked)
    return {
      code: 'DATE_UNAVAILABLE',
      problem: `${formatDate(date)} is blocked (${blocked.reason.toLowerCase()}).`,
      fix: 'date'
    };

  if (isRental(reservation.serviceType)) {
    const stock = rentalStock(await repo.rentalStockInputs(conn, date), date, ref);
    const short = reservation.rentalItems.filter((line) => line.qty > (stock[line.itemId] || 0));
    return short.length
      ? {
          code: 'OUT_OF_STOCK',
          problem: `Not enough free on ${formatDate(date)}: ${shortList(short, stock)}.`,
          fix: 'items'
        }
      : null;
  }
  if ((map.booked[date] || 0) >= map.capacity)
    return {
      code: 'CAPACITY',
      problem: `${formatDate(date)} is already at the daily capacity of ${map.capacity} events.`,
      fix: 'date'
    };
  const stockData = await repo.rentalStockInputs(conn, date);
  const short = addonShortfall(stockData, reservation, date, ref);
  if (short.length)
    return {
      code: 'OUT_OF_STOCK',
      problem: `Not enough free on ${formatDate(date)}: ${shortList(short, rentalStock(stockData, date, ref))}.`,
      fix: 'date'
    };
  const timeReason = timeUnavailableReason(
    date,
    reservation.startTime,
    { ...map, events: map.events.filter((e) => e.ref !== ref) },
    eventHours(reservation.startTime, reservation.endTime)
  );
  return timeReason
    ? { code: 'TIME_UNAVAILABLE', problem: `${timeReason} on ${formatDate(date)}.`, fix: 'time' }
    : null;
}

const ADMIN_FIX = {
  date: 'Move the event to another date',
  time: 'Change the time',
  items: 'Change the items or the date'
};

function extraGuestValues(pkg, reservation, values) {
  const extra = isRental(reservation.serviceType) ? 0 : extraGuestsFor(pkg, reservation.guests);
  if (!extra) return { extraGuestsCharge: 0, itemCounts: {} };
  const charge = values.extraGuestsCharge;
  if (charge === undefined || charge === null || charge === '')
    throw invalid(
      `Enter the price of the equipment for the ${extra} extra guests (0 to waive it).`,
      'extraGuestsCharge'
    );
  const extraGuestsCharge = quotationAmount(charge, 'extraGuestsCharge');
  const sent = helperItemCounts(plainObject(values.itemCounts));
  const itemCounts = {};
  itemsToConfirm(pkg, reservation.guests).forEach((item) => {
    const count = toNumber(sent[item.name]);
    if (!Number.isInteger(count) || count < 1 || count > ITEM_COUNT_MAX) {
      throw invalid(
        `Enter how many ${item.name} for ${reservation.guests} guests (1 to ${ITEM_COUNT_MAX.toLocaleString('en-PH')}).`,
        `itemCounts.${item.name}`
      );
    }
    itemCounts[item.name] = count;
  });
  return { extraGuestsCharge, itemCounts };
}

export async function sendQuotation(ref, values, admin, { transact = tx } = {}) {
  return adminWrite(
    ref,
    async (conn, row) => {
      const { reservation, payments, refunds } = row;
      if (CLOSED.includes(reservation.status)) {
        throw new ApiError(
          'INVALID_STATE',
          `A ${statusLabel(reservation.status).toLowerCase()} reservation cannot be re-quoted.`
        );
      }
      if (reservation.status === 'pending') {
        const blocked = await slotProblem(conn, reservation);
        if (blocked)
          throw new ApiError(
            blocked.code,
            `${blocked.problem} ${ADMIN_FIX[blocked.fix]} before sending the quotation.`
          );
      }
      const rental = isRental(reservation.serviceType);
      const delivered = rental && reservation.fulfilment === 'delivery';
      const fee = values.deliveryFee === undefined ? RENTAL.deliveryFee : values.deliveryFee;
      const deliveryFee = delivered ? quotationAmount(fee, 'deliveryFee', 'Enter the delivery fee.') : 0;
      const addonPrices = Object.fromEntries(
        Object.entries(plainObject(values.addonPrices)).map(([id, price]) => [
          id,
          quotationAmount(price, `addonPrices.${id}`)
        ])
      );
      const otherCharges = quotationAmount(values.otherCharges, 'otherCharges');
      const otherChargeItems = values.otherChargeItems?.map((line, index) => ({
        amount: quotationAmount(line.amount, `otherChargeItems.${index}.amount`),
        label: clean(line.label)
      })) ?? [{ amount: otherCharges, label: clean(values.otherLabel) }];
      const discount = quotationAmount(values.discount, 'discount');
      const note = clean(values.note);
      const sixHourFee = values.sixHourFee ?? reservationSixHourFee(reservation);
      const durationProblem = sixHourFeeProblem(sixHourFee);
      if (durationProblem) throw invalid(durationProblem, 'sixHourFee');
      const pkg = await catalogRepo.findPackageById(reservation.packageId, conn);
      const { extraGuestsCharge, itemCounts } = extraGuestValues(pkg, reservation, values);

      const totalBefore = financials(reservation, payments, refunds).total;
      const quote = computeQuote({
        pkg,
        serviceType: reservation.serviceType,
        guests: reservation.guests,
        pricePerPlate: reservation.pricePerPlate,
        startTime: reservation.startTime,
        endTime: reservation.endTime,
        sixHourFee,
        rentalItems: rental ? reservation.rentalItems : [],
        deliveryFee,
        damageCharges: rental ? reservation.damageCharges : [],
        addonIds: reservation.addonIds,
        addonQty: reservation.addonQty,
        addonPrices,
        extraGuestsCharge,
        otherCharges,
        otherChargeItems,
        discount
      });
      const quotation = {
        ...quote,
        itemCounts,
        ...(rental ? { fulfilment: reservation.fulfilment } : {}),
        otherLabel: quote.otherChargeItems.length === 1 ? quote.otherChargeItems[0].label : '',
        sentAt: now(),
        note
      };
      const quoted = { ...reservation, quotation };
      const saved = { quotation };
      const log = [`Sent the quotation (${pesoText(quote.net)}).`];

      let extra = '';
      let downpaymentStillNeeded = 0;
      let downpaymentDue = null;
      const money = financials(quoted, payments, refunds);
      const status = statusForPayments(reservation.status, money);
      if (status !== reservation.status) {
        saved.status = status;
        if (status === 'approved') {
          saved.downpaymentDue = downpaymentDueFor(reservation.date);
          downpaymentStillNeeded = money.downpayment - money.paid;
          downpaymentDue = saved.downpaymentDue;
          log.push('Status moved back to Approved: the payments are below the minimum downpayment.');
          extra = ` Please pay ${pesoText(money.downpayment - money.paid)} more by ${formatDate(saved.downpaymentDue)} to reach the minimum downpayment of ${pesoText(money.downpayment)}.`;
        } else {
          log.push(`Status moved to ${statusLabel(status)} under the new quotation.`);
        }
      }
      const after = financials({ ...quoted, status }, payments, refunds);
      if (after.overpaid > 0) {
        log.push(
          `Total from ${pesoText(totalBefore)} to ${pesoText(quote.net)}, below the ${pesoText(after.paid)} paid: ${pesoText(after.overpaid)} was paid above the new total and is to be returned.`
        );
        extra += ` You've paid ${pesoText(after.overpaid)} more than the new total. We'll return it and tell you here when it's sent.`;
      }

      if (reservation.status === 'pending') extra += ' Open your reservation and tap Accept Quotation to approve it.';

      await repo.updateReservation(conn, ref, saved);
      for (const text of log) await logAdmin(conn, ref, admin, text);
      await postAdminMessage(
        conn,
        reservation,
        `Your quotation for ${reservation.eventName} is ready. Net total: ${pesoText(quote.net)}.${note ? ` ${note}` : ''}${extra}`,
        { name: `Quotation-${ref}.pdf`, kind: 'quotation', ref },
        admin.name
      );
      const variant = reservation.status === 'pending' ? (reservation.quotation ? 'revised' : 'new') : 'updated';
      await queueCustomerEmail(conn, {
        customerId: reservation.customerId,
        ref: reservation.ref,
        purpose: 'quotation_ready',
        data: {
          reservation: { ...reservation, ...saved },
          variant,
          net: quote.net,
          note,
          totalBefore,
          statusBefore: reservation.status,
          statusAfter: status,
          downpaymentStillNeeded,
          downpaymentDue,
          overpaid: after.overpaid,
          damageLines: quote.damageCharges.map((line) => ({ name: line.name, qty: line.qty, amount: line.total }))
        }
      });
      return savedSummary(conn, ref);
    },
    { transact }
  );
}

export async function declineReservation(ref, reason, admin) {
  const text = reasonOf(reason);
  return adminWrite(ref, async (conn, { reservation }) => {
    if (reservation.status !== 'pending')
      throw new ApiError('INVALID_STATE', 'Only pending reservations can be declined.');
    await repo.updateReservation(conn, ref, { status: 'declined', declineReason: text });
    await logAdmin(conn, ref, admin, `Declined the reservation. Reason: ${text}`);
    await postAdminMessage(
      conn,
      reservation,
      `We are sorry, we are unable to accept ${reservation.eventName}. ${text}`,
      null,
      admin.name
    );
    await queueCustomerEmail(conn, {
      customerId: reservation.customerId,
      ref: reservation.ref,
      purpose: 'reservation_declined',
      data: { reservation, reason: text }
    });
    return savedSummary(conn, ref);
  });
}

export async function confirmReservation(ref, admin) {
  return adminWrite(ref, async (conn, row) => {
    const { reservation } = row;
    if (reservation.status !== 'downpayment_paid')
      throw new ApiError('INVALID_STATE', 'The downpayment must be verified before the booking is confirmed.');
    await repo.updateReservation(conn, ref, { status: 'confirmed' });
    await logAdmin(conn, ref, admin, 'Confirmed the booking.');
    await postAdminMessage(
      conn,
      reservation,
      `${reservation.eventName} is now confirmed. Your contract is available in Documents.`,
      { name: `Contract-${ref}.pdf`, kind: 'contract', ref },
      admin.name
    );
    const { balance } = financials(reservation, row.payments, row.refunds);
    await queueCustomerEmail(conn, {
      customerId: reservation.customerId,
      ref: reservation.ref,
      purpose: 'booking_confirmed',
      data: { reservation, balance }
    });
    return savedSummary(conn, ref);
  });
}

export async function completeReservation(ref, admin) {
  return adminWrite(ref, async (conn, row) => {
    const { reservation } = row;
    if (reservation.status !== 'confirmed')
      throw new ApiError('INVALID_STATE', 'Only confirmed bookings can be marked completed.');
    if (daysFromToday(reservation.date) > 0)
      throw new ApiError('INVALID_STATE', 'An event can be completed on or after its date.');
    if (isRental(reservation.serviceType)) {
      if (row.piecesOut > 0)
        throw new ApiError('INVALID_STATE', 'Record the return of the rented items before completing this rental.');
      if (quotationStale(reservation))
        throw new ApiError(
          'INVALID_STATE',
          'Re-send the quotation first, so the customer has the final total with any damage charges.'
        );
    }
    await repo.updateReservation(conn, ref, { status: 'completed' });
    await logAdmin(conn, ref, admin, 'Marked the event as completed.');
    await postAdminMessage(
      conn,
      reservation,
      `Thank you for celebrating with Tres Marias! We would love to hear how ${reservation.eventName} went. You can leave a testimonial from your account.`,
      null,
      admin.name
    );
    await queueCustomerEmail(conn, {
      customerId: reservation.customerId,
      ref: reservation.ref,
      purpose: 'event_completed',
      data: { reservation }
    });
    return savedSummary(conn, ref);
  });
}

export async function cancelReservationByAdmin(ref, reason, admin) {
  const text = reasonOf(reason);
  return adminWrite(ref, async (conn, row) => {
    const { reservation } = row;
    if (!HOLDS_DATE.includes(reservation.status)) {
      throw new ApiError(
        'INVALID_STATE',
        reservation.status === 'pending'
          ? 'A pending request is declined, not cancelled.'
          : `A ${statusLabel(reservation.status).toLowerCase()} reservation cannot be cancelled.`
      );
    }
    const money = financials(reservation, row.payments, row.refunds);
    if (money.awaitingCount > 0)
      throw new ApiError(
        'PENDING_PAYMENT',
        'A payment for this reservation is waiting for verification. Verify or reject it first.'
      );
    const open = openQrIn(row.pendingQrs);
    if (open) throw openQrError(open, 'admin');
    if (row.piecesOut > 0)
      throw new ApiError(
        'INVALID_STATE',
        'Some items are still checked out for this booking. Record the return first.'
      );
    await repo.setCancelled(conn, ref, text, 'admin');
    await logAdmin(conn, ref, admin, `Cancelled the reservation. Reason: ${text}`);
    const refund = money.paid > 0 ? ` We'll return ${pesoText(money.paid)} and tell you here when it's sent.` : '';
    await postAdminMessage(
      conn,
      reservation,
      `We are sorry, we had to cancel ${reservation.eventName} on ${formatDate(reservation.date)}. ${asSentence(text)}${refund}`,
      null,
      admin.name
    );
    await queueCustomerEmail(conn, {
      customerId: reservation.customerId,
      ref: reservation.ref,
      purpose: 'reservation_cancelled',
      data: { reservation, by: 'admin', reason: text, paid: money.paid, at: now() }
    });
    return savedSummary(conn, ref);
  });
}

export async function startPreparing(ref, admin) {
  return adminWrite(ref, async (conn, { reservation }) => {
    if (!['downpayment_paid', 'confirmed'].includes(reservation.status))
      throw new ApiError('INVALID_STATE', 'Preparation can be marked once the downpayment is paid.');
    if (reservation.preparingAt)
      throw new ApiError('INVALID_STATE', 'This booking is already marked as started preparing.');
    await repo.updateReservation(conn, ref, { preparingAt: now() });
    await logAdmin(
      conn,
      ref,
      admin,
      'Marked the booking as started preparing. The customer can no longer cancel online.'
    );
    await postAdminMessage(
      conn,
      reservation,
      `We've started preparing for ${reservation.eventName}. To cancel from now on, message us here or call ${BUSINESS.phone}.`,
      null,
      admin.name
    );
    return savedSummary(conn, ref);
  });
}

export async function undoPreparing(ref, admin) {
  return adminWrite(ref, async (conn, { reservation }) => {
    if (!reservation.preparingAt)
      throw new ApiError('INVALID_STATE', 'This booking is not marked as started preparing.');
    if (CLOSED.includes(reservation.status)) throw closedError();
    await repo.updateReservation(conn, ref, { preparingAt: null });
    await logAdmin(conn, ref, admin, 'Removed the "Started preparing" mark (marked by mistake).');
    const deadline = cancelDeadline(reservation);
    const until = deadline >= todayISO() ? ` You can cancel online until ${formatDate(deadline)}.` : '';
    await postAdminMessage(
      conn,
      reservation,
      `Our note that we started preparing for ${reservation.eventName} was marked by mistake.${until}`,
      null,
      admin.name
    );
    return savedSummary(conn, ref);
  });
}

export async function updateLogistics(ref, patch, admin, { transact = tx } = {}) {
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
      const endTime =
        typeof values.endTime === 'string' && values.endTime ? values.endTime : reservation.endTime ? '' : null;
      if (endTime !== null) {
        const endProblem = endTimeProblem(startTime, endTime);
        if (endProblem) throw invalid(`${endProblem}.`, 'endTime');
      }
      const map = await availabilityMap(conn);
      if (date !== reservation.date) {
        if (daysFromToday(date) < 0) throw invalid('An event cannot be moved to a past date.', 'date');
        const reason = dateUnavailableReason(date, map, { enforceLeadTime: false });
        if (reason)
          throw new ApiError('DATE_UNAVAILABLE', `${formatDate(date)} is not available (${reason.toLowerCase()}).`, {
            field: 'date'
          });
        const stockData = await repo.rentalStockInputs(conn, date);
        const short = addonShortfall(stockData, reservation, date, ref);
        if (short.length)
          throw new ApiError(
            'OUT_OF_STOCK',
            `Not enough free on ${formatDate(date)}: ${shortList(short, rentalStock(stockData, date, ref))}.`,
            { field: 'date' }
          );
      }
      if (date !== reservation.date || startTime !== reservation.startTime || endTime !== reservation.endTime) {
        const others = { ...map, events: map.events.filter((e) => e.ref !== ref) };
        const startReason = timeUnavailableReason(date, startTime, others);
        if (startReason) throw new ApiError('TIME_UNAVAILABLE', `${startReason}.`, { field: 'startTime' });
        const endReason = timeUnavailableReason(date, startTime, others, eventHours(startTime, endTime));
        if (endReason)
          throw new ApiError('TIME_UNAVAILABLE', `${endReason}.`, { field: endTime ? 'endTime' : 'startTime' });
      }
      const venue = {
        name: clean(values.venueName),
        address: clean(values.venueAddress),
        city: clean(values.city),
        accessNotes: clean(values.accessNotes)
      };
      if (!venue.name || !venue.address || !venue.city)
        throw invalid('Enter the venue, city and address.', 'venueName');

      const changes = [];
      if (date !== reservation.date) changes.push(`date from ${formatDate(reservation.date)} to ${formatDate(date)}`);
      if (startTime !== reservation.startTime) changes.push(`start time from ${reservation.startTime} to ${startTime}`);
      if (endTime !== reservation.endTime) changes.push(`end time from ${reservation.endTime || 'none'} to ${endTime}`);
      if (guests !== reservation.guests) changes.push(`guests from ${reservation.guests} to ${guests}`);
      if (
        venue.name !== reservation.venue.name ||
        venue.address !== reservation.venue.address ||
        venue.city !== reservation.venue.city
      )
        changes.push('venue');
      const { due, moved } = dueAfterMove(reservation, date);
      if (moved) changes.push(`downpayment due date to ${formatDate(due)}`);

      const durationCharge = durationChargeFor({
        ...reservation,
        startTime,
        endTime,
        sixHourFee: reservationSixHourFee(reservation)
      });
      const estimate =
        !reservation.quotation && reservation.estimate
          ? {
              ...reservation.estimate,
              durationCharge,
              net: Math.max(0, reservation.estimate.net - (reservation.estimate.durationCharge || 0) + durationCharge)
            }
          : undefined;
      await repo.updateReservation(conn, ref, {
        date,
        startTime,
        endTime,
        guests,
        venue,
        downpaymentDue: due,
        ...(estimate ? { estimate } : {})
      });
      if (changes.length) await logAdmin(conn, ref, admin, `Updated ${changes.join(', ')}.`);
      const quote = reservation.quotation;
      if (quote && (quote.durationCharge || 0) !== durationCharge) {
        await postAdminMessage(
          conn,
          reservation,
          `The duration for ${reservation.eventName} was changed to ${eventHours(startTime, endTime)} hours. The six-hour event charge changes from ${pesoText(quote.durationCharge || 0)} to ${pesoText(durationCharge)}. We will send a revised quotation; the amount you owe changes when that quotation reaches you.`,
          null,
          admin.name
        );
      }
      if (guests !== reservation.guests && quote) {
        const reasons = [];
        if (includesFood(reservation.serviceType)) {
          const food = guests * (reservation.pricePerPlate || 0);
          reasons.push(
            `Your buffet is charged per person, so the food total changes from ${pesoText(quote.food)} to ${pesoText(food)}.`
          );
        }
        if (quote.extraGuests !== undefined && quote.packageGuests) {
          const extraNow = Math.max(0, guests - quote.packageGuests);
          if (extraNow !== quote.extraGuests) {
            reasons.push(
              extraNow
                ? `Your package covers ${quote.packageGuests} guests, so the equipment for ${extraNow} extra guests (before: ${quote.extraGuests || 'none'}) is priced in the revised quotation.`
                : `Your package covers ${quote.packageGuests} guests, so the charge for extra guests comes off.`
            );
          }
        }
        if (reasons.length) {
          await postAdminMessage(
            conn,
            reservation,
            `The guest count for ${reservation.eventName} was changed from ${reservation.guests} to ${guests}. ${reasons.join(' ')} We will send you a revised quotation, and the amount you owe only changes once that quotation reaches you.`,
            null,
            admin.name
          );
        }
      }
      return { changed: changes.length };
    },
    { availability: true, transact }
  );
}

async function updateRentalLogistics(conn, row, values, admin) {
  const { reservation } = row;
  const { ref } = reservation;
  const fulfilment = values.fulfilment || reservation.fulfilment;
  if (!['pickup', 'delivery'].includes(fulfilment)) throw invalid('Choose pick up or delivery.', 'fulfilment');
  const { date } = values;
  if (!isISODate(date)) throw invalid('Choose the date you need the items.', 'date');
  const startTime = startTimeOf(values);
  if ((date !== reservation.date || startTime !== reservation.startTime) && row.piecesOut > 0) {
    throw invalid('Record the return of checked-out items before changing the pickup or delivery schedule.', 'date');
  }
  if (date !== reservation.date) {
    if (daysFromToday(date) < 0) throw invalid('A rental cannot be moved to a past date.', 'date');
    const reason = dateUnavailableReason(date, await availabilityMap(conn), { enforceLeadTime: false, rental: true });
    if (reason)
      throw new ApiError('DATE_UNAVAILABLE', `${formatDate(date)} is not available (${reason.toLowerCase()}).`, {
        field: 'date'
      });
    const stock = rentalStock(await repo.rentalStockInputs(conn, date), date, ref);
    const short = reservation.rentalItems.filter((line) => line.qty > (stock[line.itemId] || 0));
    if (short.length)
      throw new ApiError('OUT_OF_STOCK', `Not enough free on ${formatDate(date)}: ${shortList(short, stock)}.`, {
        field: 'date'
      });
  }
  if (date !== reservation.date || startTime !== reservation.startTime) {
    const timeReason = timeUnavailableReason(date, startTime, { events: [] });
    if (timeReason) throw new ApiError('TIME_UNAVAILABLE', `${timeReason}.`, { field: 'startTime' });
  }
  const place = { name: clean(values.venueName), address: clean(values.venueAddress), city: clean(values.city) };
  if (fulfilment === 'delivery' && (!place.name || !place.address || !place.city))
    throw invalid('Enter where to deliver the items.', 'venueAddress');
  const venue =
    fulfilment === 'delivery'
      ? { ...place, accessNotes: clean(values.accessNotes) }
      : { ...RENTAL.pickupPlace, accessNotes: '' };

  const changes = [];
  if (date !== reservation.date) changes.push(`date from ${formatDate(reservation.date)} to ${formatDate(date)}`);
  if (startTime !== reservation.startTime)
    changes.push(`${fulfilmentWord(fulfilment)} time from ${reservation.startTime} to ${startTime}`);
  const switched = fulfilment !== reservation.fulfilment;
  if (switched) changes.push(`from ${fulfilmentWord(reservation.fulfilment)} to ${fulfilmentWord(fulfilment)}`);
  else if (fulfilment === 'delivery' && JSON.stringify(venue) !== JSON.stringify(reservation.venue))
    changes.push('delivery address');
  const { due, moved } = dueAfterMove(reservation, date);
  if (moved) changes.push(`downpayment due date to ${formatDate(due)}`);

  const pkg = await catalogRepo.findPackageById(reservation.packageId, conn);
  const was = financials(reservation, row.payments, row.refunds).total;
  const total = rentalQuote(pkg, reservation, { fulfilment }).net;
  const saved = { date, startTime, fulfilment, venue, downpaymentDue: due };
  if (!reservation.quotation) saved.estimate = rentalQuote(pkg, { ...reservation, ...saved });
  await repo.updateReservation(conn, ref, saved);

  const repriced = switched && was !== total;
  const pending = reservation.quotation
    ? ' We will send you a revised quotation, and the amount you owe only changes once that quotation reaches you.'
    : '';
  if (changes.length) {
    await logAdmin(
      conn,
      ref,
      admin,
      `Updated ${changes.join(', ')}.${repriced ? ` Total from ${pesoText(was)} to ${pesoText(total)}${reservation.quotation ? ' once the revised quotation is sent' : ''}.` : ''}`
    );
  }
  if (repriced) {
    const how =
      fulfilment === 'delivery'
        ? `Delivery is ${pesoText(RENTAL.deliveryFee)} (our standard fee; a large order may be quoted more)`
        : `Picking up at ${RENTAL.pickupAddress} is free`;
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

export async function updateMenu(ref, body, admin) {
  const values = plainObject(body);
  return adminWrite(ref, async (conn, { reservation }) => {
    if (CLOSED.includes(reservation.status)) throw closedError();
    if (isRental(reservation.serviceType))
      throw invalid('An equipment rental has no menu. Edit the rented items instead.');
    const { serviceType } = values;
    if (!SERVICE_TYPES.includes(serviceType)) throw invalid('Choose a buffet or catering only.', 'serviceType');
    const options = { buffet: includesFood(serviceType), dessert: reservation.addonIds.includes(DESSERT_ADDON_ID) };
    const check = menuProblem(values.menu, options);
    if (check) throw invalid(check.message, check.field);
    const menu = cleanMenu(values.menu, options);
    const before = reservation.serviceType;
    await repo.updateReservation(conn, ref, { serviceType, menu, foodNotes: clean(values.foodNotes) });
    await logAdmin(
      conn,
      ref,
      admin,
      before === serviceType ? 'Updated the menu.' : `Changed the booking from ${before} to ${serviceType}.`
    );
    if (before !== serviceType && reservation.quotation) {
      const food = includesFood(serviceType)
        ? `A buffet is charged per person, so food for ${reservation.guests} guests will be added to your total.`
        : 'Catering only has no per-person charge, so the food will be taken off your total.';
      await postAdminMessage(
        conn,
        reservation,
        `${reservation.eventName} was changed from ${before} to ${serviceType}. ${food} We will send you a revised quotation, and the amount you owe only changes once that quotation reaches you.`,
        null,
        admin.name
      );
    }
    return { ok: true };
  });
}

const stylingKey = (styling) =>
  styling
    ? JSON.stringify([
        styling.theme,
        styling.themeOther,
        styling.notes,
        (styling.colors || []).map((c) => [c.hex, c.name, Boolean(c.metallic)])
      ])
    : 'none';

const stylingWords = (styling) => {
  const colors = styling.colors.map((c) => c.name).join(', ');
  return `${themeLabel(styling) || 'no theme'}${colors ? `; ${colors}` : ''}`;
};

export async function updateStyling(ref, body, admin, { transact = tx } = {}) {
  return adminWrite(
    ref,
    async (conn, { reservation }) => {
      if (CLOSED.includes(reservation.status)) throw closedError();
      if (isRental(reservation.serviceType)) throw invalid('An equipment rental has no theme or colors.');
      const styling = stylingOf({
        ...plainObject(body),
        referencePhoto: reservation.styling?.referencePhoto,
        referencePhotos: reservation.styling?.referencePhotos
      });
      if (stylingKey(styling) === stylingKey(reservation.styling)) return { ok: true };
      await repo.updateReservation(conn, ref, { styling });
      await logAdmin(
        conn,
        ref,
        admin,
        styling ? `Updated the theme and colors (${stylingWords(styling)}).` : 'Cleared the theme and colors.'
      );
      return { ok: true };
    },
    { transact }
  );
}

export async function saveNotes(ref, notes) {
  return adminWrite(ref, async (conn) => {
    await repo.updateReservation(conn, ref, { notes });
    return { ok: true };
  });
}

export async function updateRentalItems(ref, body, admin) {
  const { items } = plainObject(body);
  return adminWrite(
    ref,
    async (conn, row) => {
      const { reservation } = row;
      if (!isRental(reservation.serviceType)) throw invalid('Only an equipment rental has rented items.');
      if (CLOSED.includes(reservation.status)) throw closedError();
      const stockData = await repo.rentalStockInputs(conn, reservation.date);
      const lines = rentalLines(stockData, items, reservation.date, {
        excludeRef: ref,
        current: reservation.rentalItems
      });
      stockData.inventory.forEach((item) => {
        const out = item.allocations[ref] || 0;
        const line = lines.find((l) => l.itemId === item.id);
        if (out && (!line || line.qty < out)) {
          throw invalid(
            `${out} ${item.name} ${out === 1 ? 'is' : 'are'} already checked out for this rental. Record their return first.`,
            `rental.${item.id}`
          );
        }
      });

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
      const was = financials(reservation, row.payments, row.refunds).total;
      const total = rentalQuote(pkg, reservation, { rentalItems: lines }).net;
      await repo.replaceRentalLines(conn, ref, lines);
      if (!reservation.quotation)
        await repo.updateReservation(conn, ref, { estimate: rentalQuote(pkg, { ...reservation, rentalItems: lines }) });
      await logAdmin(
        conn,
        ref,
        admin,
        `Changed the rented items: ${changes.join(', ')}. Total from ${pesoText(was)} to ${pesoText(total)}${reservation.quotation ? ' once the revised quotation is sent' : ''}.`
      );
      const pending = reservation.quotation
        ? ' We will send you a revised quotation, and the amount you owe only changes once that quotation reaches you.'
        : '';
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
