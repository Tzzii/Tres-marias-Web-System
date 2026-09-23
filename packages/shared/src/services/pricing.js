import { DEFAULT_PRICE_PER_PLATE, RULES, includesFood } from './config.js';

/** True for the Equipment Rental package: no fixed items or price, the customer picks what to rent. */
export const isRentalPackage = (pkg) => Boolean(pkg && pkg.kind === 'rental');

/**
 * Quotation maths shared by the customer form's summary, the admin quotation
 * panel and the printed documents, so all of them show the same figures.
 *
 *   package           = the package's flat price (0 for the Equipment Rental package)
 *   food              = guests x the buffet price per person, or 0 for a catering-only booking
 *   rental            = for an equipment rental, each rented item's price per piece x how many
 *   delivery          = for a delivered rental, the delivery fee (standard or set by the admin)
 *   additional charges = the admin's price for each extra the customer ticked, x the quantity asked for
 *   other charges     = set by the admin, e.g. extra guests above what the package covers
 *   damage            = rented pieces that came back damaged or not at all, x each item's damage fee
 *   net               = package + food + rental + delivery + additional charges + other charges + damage - discount
 *
 * The food total is worked out here, not typed by the admin, so the customer sees the real
 * price while filling the form. `pricePerPlate` is passed in by the caller and stored on the
 * reservation, so a later price rise never changes a quotation that was already sent. The same
 * goes for rental prices: `rentalItems` carries the price each piece was booked at.
 *
 *   rentalItems   [{ itemId, name, qty, price }]  what the customer rents, e.g. 80 Monobloc chair at ₱15
 *   deliveryFee   amount for delivering a rental (0 when the customer picks it up)
 *   damageCharges [{ itemId, name, qty, fee }]    pieces charged after the return
 */
export function computeQuote({
  pkg,
  serviceType = 'Buffet and Catering',
  guests = 0,
  pricePerPlate = DEFAULT_PRICE_PER_PLATE,
  rentalItems = [],
  deliveryFee = 0,
  damageCharges = [],
  addonIds = [],
  addonQty = {},
  addonPrices = {},
  otherCharges = 0,
  discount = 0
}) {
  // Blank, negative or non-numeric amounts count as 0
  const amount = (value) => Math.max(0, Number(value) || 0);
  // A quantity is at least 1, so an add-on is never priced as nothing
  const count = (value) => Math.max(1, Math.floor(Number(value) || 1));

  const packageTotal = pkg ? pkg.price : 0;
  // Only a buffet is charged per person; catering only is the equipment alone
  const plates = includesFood(serviceType) ? Math.max(0, Math.floor(Number(guests) || 0)) : 0;
  const rate = includesFood(serviceType) ? amount(pricePerPlate) : 0;
  const foodTotal = plates * rate;

  // Keep the unit price and the quantity only for the extras the customer picked,
  // e.g. prices { 'add-waiters': 800 } with quantities { 'add-waiters': 3 } -> totals { 'add-waiters': 2400 }
  const prices = addonIds.reduce((all, id) => ({ ...all, [id]: amount(addonPrices[id]) }), {});
  const quantities = addonIds.reduce((all, id) => ({ ...all, [id]: count(addonQty[id]) }), {});
  const totals = addonIds.reduce((all, id) => ({ ...all, [id]: prices[id] * quantities[id] }), {});
  const addonsTotal = Object.values(totals).reduce((sum, line) => sum + line, 0);

  // Rented items, each line priced per piece, e.g. 80 chairs at ₱15 -> line total ₱1,200.
  // A line with no pieces is dropped, so an emptied row never prints as "0 x ...".
  const rentalLines = rentalItems
    .map((line) => ({ itemId: line.itemId, name: line.name, qty: Math.max(0, Math.floor(Number(line.qty) || 0)), price: amount(line.price) }))
    .filter((line) => line.qty > 0)
    .map((line) => ({ ...line, total: line.qty * line.price }));
  const rentalTotal = rentalLines.reduce((sum, line) => sum + line.total, 0);
  const delivery = amount(deliveryFee);
  // Damaged or missing rented pieces, charged at each item's damage fee after the return
  const damageLines = damageCharges
    .map((line) => ({ itemId: line.itemId, name: line.name, qty: Math.max(0, Math.floor(Number(line.qty) || 0)), fee: amount(line.fee) }))
    .filter((line) => line.qty > 0)
    .map((line) => ({ ...line, total: line.qty * line.fee }));
  const damageTotal = damageLines.reduce((sum, line) => sum + line.total, 0);

  const other = amount(otherCharges);
  const cleanDiscount = amount(discount);
  // The total can't go below 0
  const net = Math.max(0, packageTotal + foodTotal + rentalTotal + delivery + addonsTotal + other + damageTotal - cleanDiscount);

  return {
    packageTotal,
    serviceType,
    plates,
    pricePerPlate: rate,
    food: foodTotal,
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
    discount: cleanDiscount,
    net,
    downpayment: Math.round(net * RULES.downpaymentRate)
  };
}

/**
 * How many guests are above what the package's tableware and chairs cover (0 when they fit).
 * Always 0 for the Equipment Rental package, which has no guest count.
 */
export function extraGuests(pkg, guests) {
  if (!pkg || isRentalPackage(pkg)) return 0;
  return Math.max(0, (Number(guests) || 0) - pkg.guests);
}
