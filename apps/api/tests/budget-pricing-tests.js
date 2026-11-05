import test from 'node:test';
import assert from 'node:assert/strict';
import * as pricing from '@tm/shared/src/services/pricing.js';
import { menuProblem } from '@tm/shared/src/domain/menu.js';
import { packageItemsFor } from '@tm/shared/src/domain/packageItems.js';

const inclusive = 'inclusive-buffet-v2';
const legacy = 'legacy-package-plus-buffet-v1';
const pkg = {
  price: 12000,
  guests: 100,
  items: [
    { name: 'Plates', qty: 100, grows: true },
    { name: 'Helpers', qty: 2, grows: false }
  ]
};
const input = {
  pkg,
  serviceType: 'Buffet and Catering',
  guests: 200,
  pricePerPlate: 600,
  addonIds: ['stage'],
  addonPrices: { stage: 5000 }
};

test('inclusive buffet charges the base once and includes standard extra-guest equipment', () => {
  const quote = pricing.computeQuote({ ...input, pricingModel: inclusive, extraGuestsCharge: 9000 });
  assert.equal(quote.pricingModel, inclusive);
  assert.equal(quote.packageTotal, 0);
  assert.equal(quote.food, 120000);
  assert.equal(quote.extraGuests, 100);
  assert.equal(quote.extraGuestsCharge, 0);
  assert.equal(quote.net, 125000);
});

test('legacy buffet keeps its saved model and legacy default', () => {
  assert.equal(pricing.computeQuote(input).net, 137000);
  assert.equal(pricing.computeQuote({ ...input, pricingModel: legacy, extraGuestsCharge: 9000 }).net, 146000);
  assert.equal(pricing.reservationPricingModel({ estimate: { pricingModel: inclusive } }), inclusive);
  assert.equal(
    pricing.reservationPricingModel({ estimate: { pricingModel: inclusive }, quotation: { net: 137000 } }),
    legacy
  );
  assert.equal(pricing.reservationPricingModel({ quotation: { pricingModel: inclusive } }), inclusive);
  assert.equal(pricing.reservationPricingModel({}), legacy);
});

test('inclusive buffet retains configured duration fees and saved rates', () => {
  const quote = pricing.computeQuote({
    ...input,
    pricingModel: inclusive,
    startTime: '12:00',
    endTime: '18:00',
    sixHourFee: 5000
  });
  assert.equal(quote.net, 130000);
  assert.equal(quote.sixHourFee, 5000);
  assert.equal(pricing.reservationSixHourFee({ estimate: quote }), 5000);
  assert.equal(pricing.computeQuote({ ...input, pricingModel: inclusive, pricePerPlate: 750 }).food, 150000);
});

test('four ulam remain required and guest equipment still scales with confirmations', () => {
  const menu = { pork: ['Adobo'], chicken: ['Inasal'], fish: ['Fish fillet'], vegetable: ['Chopsuey'] };
  assert.equal(menuProblem(menu), null);
  assert.equal(menuProblem({ ...menu, fish: [] }).field, 'menu.total');
  const items = packageItemsFor(pkg, 200);
  assert.equal(items[0].qty, 200);
  assert.equal(items[1].toConfirm, true);
});

test('other service pricing is unchanged even with an inclusive marker', () => {
  const quote = pricing.computeQuote({
    ...input,
    pricingModel: inclusive,
    serviceType: 'Catering only',
    extraGuestsCharge: 9000
  });
  assert.equal(quote.net, 26000);
  assert.equal(quote.food, 0);
  assert.equal(pricing.isInclusiveBuffet(quote), false);
});

test('historical package prices and guest baselines survive catalog edits in quote previews and re-quotations', () => {
  const reservation = {
    serviceType: 'Buffet and Catering',
    package: { ...pkg, price: 30000, guests: 300 },
    estimate: { packageTotal: 12000, packageGuests: 100 },
    quotation: { packageTotal: 12000, packageGuests: 100 }
  };
  const savedPackage = pricing.reservationPackageForPricing(reservation);
  assert.equal(savedPackage.price, 12000);
  assert.equal(savedPackage.guests, 100);
  assert.equal(pricing.computeQuote({ ...input, pkg: savedPackage }).net, 137000);
  const v2 = {
    ...reservation,
    quotation: { pricingModel: inclusive, serviceType: 'Buffet and Catering', packageTotal: 0 }
  };
  assert.equal(
    pricing.reservationPackageForPricing(v2).price,
    30000,
    'An included zero surcharge is not a catering-only catalog price'
  );
});
