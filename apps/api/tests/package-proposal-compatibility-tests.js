import test from 'node:test';
import assert from 'node:assert/strict';
import { createBody } from '../src/modules/reservations/reservations.schemas.js';
import { insertReservation } from '../src/modules/reservations/reservations.repo.js';
import {
  reservationPackageForPricing,
  computeQuote,
  INCLUSIVE_PRICING_MODEL
} from '@tm/shared/src/services/pricing.js';
import { bookingItems } from '@tm/shared/src/domain/packageItems.js';
import { dashboardSummary, report } from '@tm/shared/src/domain/reports.js';
import { todayISO } from '@tm/shared/src/utils/format.js';

const snapshot = () => ({
  id: 'custom-dining',
  slug: 'custom-dining',
  name: 'Personalized dining setup',
  kind: 'package',
  price: 18000,
  guests: 200,
  items: [
    { name: 'Dining chairs', qty: 200, grows: false },
    { name: 'Buffet station', qty: 2, grows: false }
  ]
});

test('custom setup resolves from saved data without a catalog ID and preserves its sent quotation', () => {
  const original = snapshot();
  const r = {
    packageId: null,
    packageSource: 'custom',
    packageSnapshot: original,
    guests: 200,
    estimate: { packageTotal: 18000, packageGuests: 200, pricingModel: 'legacy-package-plus-buffet-v1' }
  };
  const live = { ...snapshot(), name: 'Unrelated catalog change', price: 1, items: [] };
  assert.equal(reservationPackageForPricing(r, live).name, 'Personalized dining setup');
  assert.equal(reservationPackageForPricing(r, null).price, 18000);
  assert.deepEqual(
    bookingItems(r).map(({ name, qty }) => [name, qty]),
    [
      ['Dining chairs', 200],
      ['Buffet station', 2]
    ]
  );
  const frozen = {
    ...original,
    name: 'Quoted personalized setup',
    items: [{ name: 'Dining chairs', qty: 200, grows: false }]
  };
  r.quotation = { ...r.estimate, extraGuests: 0, packageSnapshot: frozen };
  r.packageSnapshot = { ...original, items: [] };
  assert.equal(reservationPackageForPricing(r).name, 'Quoted personalized setup');
  assert.equal(bookingItems(r)[0].qty, 200);
});

test('inclusive custom buffet does not add its setup twice and legacy catalog prices retain their saved basis', () => {
  const pkg = snapshot();
  const quote = computeQuote({
    pkg,
    pricingModel: INCLUSIVE_PRICING_MODEL,
    serviceType: 'Buffet and Catering',
    guests: 200,
    pricePerPlate: 500,
    startTime: '12:00',
    endTime: '14:00'
  });
  assert.equal(quote.net, 100000);
  assert.equal(quote.packageTotal, 0);
  const legacy = {
    package: { ...pkg, price: 99999, guests: 700 },
    estimate: { packageTotal: 18000, packageGuests: 200 }
  };
  assert.equal(reservationPackageForPricing(legacy).price, 18000);
  assert.equal(reservationPackageForPricing(legacy).guests, 200);
});

test('reservation transport schema accepts only a bounded proposal reference and discards caller snapshots', () => {
  const ref = { proposalId: 'proposal-owner', optionId: 'dining/base', revision: 1 };
  const parsed = createBody.parse({ packageProposalRef: ref, packageSnapshot: { price: 0 }, packageSource: 'custom' });
  assert.deepEqual(parsed.packageProposalRef, ref);
  assert.equal(Object.hasOwn(parsed, 'packageSnapshot'), false);
  assert.equal(Object.hasOwn(parsed, 'packageSource'), false);
  for (const bad of [
    { ...ref, revision: 0 },
    { ...ref, price: 1 },
    { ...ref, optionId: 'x'.repeat(256) }
  ])
    assert.equal(createBody.safeParse({ packageProposalRef: bad }).success, false);
});

test('custom reservation insert persists a null catalog ID and the authoritative snapshot together', async () => {
  let statement, parameters;
  const conn = {
    query: async (sql, values) => {
      statement = sql;
      parameters = values;
      return [{ affectedRows: 1 }];
    }
  };
  const r = {
    ref: 'TM-CUSTOM',
    customerId: 'owner',
    eventName: 'Birthday',
    occasion: 'Birthday',
    date: todayISO(),
    startTime: '12:00',
    endTime: '14:00',
    guests: 200,
    packageId: null,
    packageSource: 'custom',
    packageSnapshot: snapshot(),
    serviceType: 'Catering only',
    venue: { name: 'Hall', address: 'Street', city: 'Malvar', accessNotes: '' },
    menu: {},
    foodNotes: '',
    pricePerPlate: 0,
    minDownpayment: 3000,
    status: 'pending',
    estimate: {},
    quotation: null,
    downpaymentDue: null,
    notes: '',
    declineReason: '',
    cancelReason: '',
    createdAt: 1000
  };
  await insertReservation(conn, r);
  const columns = statement
    .slice(statement.indexOf('(') + 1, statement.indexOf(')'))
    .split(',')
    .map((s) => s.trim());
  assert.equal(parameters.length, columns.length);
  const inserted = Object.fromEntries(columns.map((name, index) => [name, parameters[index]]));
  assert.equal(inserted.package_id, null);
  assert.equal(inserted.package_source, 'custom');
  assert.equal(JSON.parse(inserted.package_snapshot).name, 'Personalized dining setup');
  assert.match(statement, /package_source, package_snapshot/);
});

test('dashboard and popularity reports keep custom reservations visible without fake catalog records', () => {
  const r = {
    ref: 'TM-CUSTOM',
    customerId: 'owner',
    eventName: 'Birthday',
    date: todayISO(),
    guests: 200,
    startTime: '12:00',
    endTime: '14:00',
    serviceType: 'Catering only',
    packageId: null,
    packageSource: 'custom',
    packageSnapshot: snapshot(),
    status: 'approved',
    createdAt: Date.now(),
    minDownpayment: 3000,
    estimate: { net: 18000 },
    quotation: null
  };
  const data = {
    reservations: [r],
    packages: [],
    customers: [{ id: 'owner', name: 'Customer' }],
    payments: [],
    refunds: []
  };
  assert.equal(dashboardSummary(data).eventsToday[0].packageName, 'Personalized dining setup');
  assert.deepEqual(report(data, 'all').packageCounts, [{ name: 'Customized packages', count: 1 }]);
});
