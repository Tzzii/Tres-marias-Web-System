import { RULES } from './config.js';

/**
 * Quotation maths shared by the customer form's summary, the admin quotation
 * panel and the printed documents, so all of them show the same figures.
 *
 *   package           = the package's flat price
 *   food              = set by the admin (the customer only describes the food they want)
 *   additional charges = the admin's price for each extra the customer ticked
 *   other charges     = set by the admin, e.g. extra guests above what the package covers
 *   net               = package + food + additional charges + other charges − discount
 *
 * Before the admin sends a quotation only the package price is known, so the
 * estimate is the package price alone.
 */
export function computeQuote({ pkg, addonIds = [], food = 0, addonPrices = {}, otherCharges = 0, discount = 0 }) {
  // Blank, negative or non-numeric amounts count as 0
  const amount = (value) => Math.max(0, Number(value) || 0);
  const packageTotal = pkg ? pkg.price : 0;
  const foodTotal = amount(food);

  // Keep a price only for the extras the customer picked, e.g. { 'add-tent': 7000 }
  const prices = addonIds.reduce((all, id) => ({ ...all, [id]: amount(addonPrices[id]) }), {});
  const addonsTotal = Object.values(prices).reduce((sum, price) => sum + price, 0);

  const other = amount(otherCharges);
  const cleanDiscount = amount(discount);
  // The total can't go below 0
  const net = Math.max(0, packageTotal + foodTotal + addonsTotal + other - cleanDiscount);

  return {
    packageTotal,
    food: foodTotal,
    addonPrices: prices,
    addons: addonsTotal,
    otherCharges: other,
    discount: cleanDiscount,
    net,
    downpayment: Math.round(net * RULES.downpaymentRate)
  };
}

/** How many guests are above what the package's tableware and chairs cover (0 when they fit). */
export function extraGuests(pkg, guests) {
  if (!pkg) return 0;
  return Math.max(0, (Number(guests) || 0) - pkg.guests);
}
