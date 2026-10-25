import { DEFAULT_PRICE_PER_PLATE, SIX_HOUR_FEE_RANGE, includesFood, isRental } from './config.js';
import { eventMinutes } from '../domain/availability.js';

export function sixHourFeeProblem(value) {
  const numeric = typeof value === 'number' || (typeof value === 'string' && /^\d{1,5}$/.test(value));
  const amount = numeric ? Number(value) : NaN;
  return Number.isInteger(amount) && amount >= SIX_HOUR_FEE_RANGE.min && amount <= SIX_HOUR_FEE_RANGE.max
    ? ''
    : 'Enter whole pesos from ₱0 to ₱50,000, using up to 5 digits.';
}

/** Older bookings without a saved rate retain their original price. */
export const reservationSixHourFee = (reservation) =>
  reservation.quotation?.sixHourFee ?? reservation.estimate?.sixHourFee ?? 0;

export const durationChargeFor = ({ startTime, endTime, serviceType, sixHourFee = 0 }) =>
  !isRental(serviceType) && startTime && endTime && eventMinutes(startTime, endTime) === 360
    ? Math.max(0, Number(sixHourFee) || 0)
    : 0;

/** True for the Equipment Rental package: no fixed items or price, the customer picks what to rent. */
export const isRentalPackage = (pkg) => Boolean(pkg && pkg.kind === 'rental');

/**
 * How many guests a booking has above its package's default guest count (`pkg.guests`), e.g. 600 guests
 * on a 200-guest package -> 400; 0 at or below the default, and always 0 for the Equipment Rental package
 * (no guests). The package is priced and equipped for its default count; the equipment for these extra
 * guests is priced by the admin in the quotation (extraGuestsCharge in computeQuote), and the items that
 * grow with the guests are worked out in domain/packageItems.js.
 */
export const extraGuestsFor = (pkg, guests) => {
  const base = pkg && !isRentalPackage(pkg) ? Math.floor(Number(pkg.guests) || 0) : 0;
  return base > 0 ? Math.max(0, Math.floor(Number(guests) || 0) - base) : 0;
};

/** Itemized charges, with a fallback for quotations saved with a single amount and label. */
export function otherChargeItemsFor(quote) {
  const lines = Array.isArray(quote?.otherChargeItems)
    ? quote.otherChargeItems
    : [{ amount: quote?.otherCharges, label: quote?.otherLabel }];
  return lines
    .map((line) => ({
      amount: Number.isFinite(Number(line.amount)) ? Math.max(0, Number(line.amount)) : 0,
      label: typeof line.label === 'string' ? line.label.trim() : ''
    }))
    .filter((line) => line.amount > 0 || line.label);
}

/**
 * Quotation maths shared by the customer form's summary, the admin quotation
 * panel and the printed documents, so all of them show the same figures.
 *
 *   package           = the package's flat price (0 for the Equipment Rental package). It covers the
 *                       package's default guest count; fewer guests still pay the full package price
 *   extra guests      = the admin's price for the equipment of the guests above the package's default
 *                       (extraGuestsCharge, set in the quotation; 0 until then, and ignored when there
 *                       are no extra guests). The booking form shows it as "To be quoted"
 *   food              = guests x the buffet price per person, or 0 for a catering-only booking
 *   duration          = the saved sixHourFee only when an event lasts exactly six hours (0 for rentals)
 *   rental            = for an equipment rental, each rented item's price per piece x how many
 *   delivery          = for a delivered rental, the delivery fee (standard or set by the admin)
 *   additional charges = the admin's price for each extra the customer ticked, x the quantity asked for
 *   other charges     = other itemized services set by the admin
 *   damage            = rented pieces that came back damaged or not at all, x each item's damage fee
 *   net               = package + extra guests + food + duration + rental + delivery + additional charges + other charges
 *                       + damage - discount
 *
 * The food total is worked out here, not typed by the admin, so the customer sees the real
 * price while filling the form. `pricePerPlate` is passed in by the caller and stored on the
 * reservation, so a later price rise never changes a quotation that was already sent. The same
 * goes for rental prices: `rentalItems` carries the price each piece was booked at.
 * `sixHourFee` is saved in the estimate even for shorter events, preserving the rate if the schedule changes.
 *
 * The downpayment is not part of a quote: it is the booking's own minimum (financials in
 * domain/money.js). Older saved quotes may still hold a `downpayment` field; nothing reads it.
 *
 *   rentalItems   [{ itemId, name, qty, price }]  what the customer rents, e.g. 80 Monobloc chair at ₱15
 *   deliveryFee   amount for delivering a rental (0 when the customer picks it up)
 *   damageCharges [{ itemId, name, qty, fee }]    pieces charged after the return
 *   otherChargeItems [{ amount, label }]       extra charges entered individually by the admin;
 *                                             their sum is also kept as `otherCharges` for totals
 *
 * Besides the amounts, the result keeps `packageGuests` (the package's default guest count when it was
 * worked out) and `extraGuests` (how many guests above it), so a saved quotation says which guest count
 * it priced. A quotation saved before 2026-10-09 has neither (see usesGuestRule in domain/packageItems.js).
 */
export function computeQuote({
  pkg,
  serviceType = 'Buffet and Catering',
  guests = 0,
  pricePerPlate = DEFAULT_PRICE_PER_PLATE,
  startTime,
  endTime,
  sixHourFee = 0,
  rentalItems = [],
  deliveryFee = 0,
  damageCharges = [],
  addonIds = [],
  addonQty = {},
  addonPrices = {},
  otherCharges = 0,
  otherLabel = '',
  otherChargeItems,
  extraGuestsCharge = 0,
  discount = 0
}) {
  // Blank, negative or non-numeric amounts count as 0
  const amount = (value) => Math.max(0, Number(value) || 0);
  // A quantity is at least 1, so an add-on is never priced as nothing
  const count = (value) => Math.max(1, Math.floor(Number(value) || 1));

  const packageTotal = pkg ? pkg.price : 0;
  // Guests above the package's default; their equipment is only charged once the admin prices it
  const packageGuests = pkg && !isRentalPackage(pkg) ? Math.floor(Number(pkg.guests) || 0) : 0;
  const extraGuests = extraGuestsFor(pkg, guests);
  const extraCharge = extraGuests ? amount(extraGuestsCharge) : 0;
  // Only a buffet is charged per person; catering only is the equipment alone
  const plates = includesFood(serviceType) ? Math.max(0, Math.floor(Number(guests) || 0)) : 0;
  const rate = includesFood(serviceType) ? amount(pricePerPlate) : 0;
  const foodTotal = plates * rate;
  const durationCharge = durationChargeFor({ startTime, endTime, serviceType, sixHourFee });

  // Keep the unit price and the quantity only for the extras the customer picked,
  // e.g. prices { 'add-waiters': 800 } with quantities { 'add-waiters': 3 } -> totals { 'add-waiters': 2400 }
  const prices = addonIds.reduce((all, id) => ({ ...all, [id]: amount(addonPrices[id]) }), {});
  const quantities = addonIds.reduce((all, id) => ({ ...all, [id]: count(addonQty[id]) }), {});
  const totals = addonIds.reduce((all, id) => ({ ...all, [id]: prices[id] * quantities[id] }), {});
  const addonsTotal = Object.values(totals).reduce((sum, line) => sum + line, 0);

  // Rented items, each line priced per piece, e.g. 80 chairs at ₱15 -> line total ₱1,200.
  // A line with no pieces is dropped, so an emptied row never prints as "0 x ...".
  const rentalLines = rentalItems
    .map((line) => ({
      itemId: line.itemId,
      name: line.name,
      qty: Math.max(0, Math.floor(Number(line.qty) || 0)),
      price: amount(line.price)
    }))
    .filter((line) => line.qty > 0)
    .map((line) => ({ ...line, total: line.qty * line.price }));
  const rentalTotal = rentalLines.reduce((sum, line) => sum + line.total, 0);
  const delivery = amount(deliveryFee);
  // Damaged or missing rented pieces, charged at each item's damage fee after the return
  const damageLines = damageCharges
    .map((line) => ({
      itemId: line.itemId,
      name: line.name,
      qty: Math.max(0, Math.floor(Number(line.qty) || 0)),
      fee: amount(line.fee)
    }))
    .filter((line) => line.qty > 0)
    .map((line) => ({ ...line, total: line.qty * line.fee }));
  const damageTotal = damageLines.reduce((sum, line) => sum + line.total, 0);

  const otherLines = otherChargeItemsFor({ otherChargeItems, otherCharges, otherLabel });
  const other = otherLines.reduce((sum, line) => sum + line.amount, 0);
  const cleanDiscount = amount(discount);
  // The total can't go below 0
  const net = Math.max(
    0,
    packageTotal +
      extraCharge +
      foodTotal +
      durationCharge +
      rentalTotal +
      delivery +
      addonsTotal +
      other +
      damageTotal -
      cleanDiscount
  );

  return {
    packageTotal,
    packageGuests,
    extraGuests,
    extraGuestsCharge: extraCharge,
    serviceType,
    plates,
    pricePerPlate: rate,
    food: foodTotal,
    sixHourFee: amount(sixHourFee),
    durationCharge,
    rentalItems: rentalLines,
    rental: rentalTotal,
    deliveryFee: delivery,
    damageCharges: damageLines,
    damage: damageTotal,
    addonPrices: prices,
    addonQty: quantities,
    addonTotals: totals,
    addons: addonsTotal,
    otherCharges: other,
    otherChargeItems: otherLines,
    discount: cleanDiscount,
    net
  };
}
