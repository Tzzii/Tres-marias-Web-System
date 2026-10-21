import assert from 'node:assert/strict';
import { test } from 'node:test';
import { helperLabel, helperItemCounts } from '@tm/shared/src/utils/helperLabels.js';
import { bookingItems, packageItemsFor } from '@tm/shared/src/domain/packageItems.js';
import { findPackageById } from '../src/modules/catalog/catalog.repo.js';

test('old staff labels and descriptions become Helper/Helpers', () => {
  assert.equal(helperLabel('Water/Dishwasher'), 'Helper');
  assert.equal(helperLabel('Waiter/Dishwasher'), 'Helper');
  assert.equal(helperLabel('Waiters/Dishwashers'), 'Helpers');
  assert.equal(helperLabel('With 2 waiters/dishwashers.'), 'With 2 helpers.');
  assert.equal(
    helperLabel('Extra waiters or dishwashers on top of the package.'),
    'Extra helpers on top of the package.'
  );
  assert.equal(helperLabel('Water Jugs'), 'Water Jugs');
});

test('old quotation counts survive a package label rename without changing the input', () => {
  const original = { 'Waiters/Dishwashers': 12, 'Elegant Food Warmers': 10 };
  assert.deepEqual(helperItemCounts(original), { Helpers: 12, 'Elegant Food Warmers': 10 });
  assert.equal(original['Waiters/Dishwashers'], 12);
  const pkg = { guests: 100, items: [{ name: 'Helpers', qty: 2, grows: false }] };
  assert.deepEqual(packageItemsFor(pkg, 200, original)[0], {
    name: 'Helpers',
    qty: 12,
    defaultQty: 2,
    grows: false,
    toConfirm: false
  });
});

test('an explicitly saved current count wins over a legacy alias in either key order', () => {
  for (const counts of [
    { Helpers: 8, 'Waiters/Dishwashers': 12 },
    { 'Waiters/Dishwashers': 12, Helpers: 8 }
  ]) {
    assert.equal(helperItemCounts(counts).Helpers, 8);
  }
});

test('older quoted bookings display Helpers and preserve the original package quantities', () => {
  const items = bookingItems({
    guests: 200,
    quotation: {},
    package: { guests: 100, items: [{ name: 'Waiters/Dishwashers', qty: 2 }] }
  });
  assert.equal(items[0].name, 'Helpers');
  assert.equal(items[0].qty, 2);
});

test('catalogue reads normalize existing stored labels while preserving prices and IDs', async () => {
  const saved = {
    id: 'pkg-1-waiters',
    slug: 'classic-full-service',
    name: 'Classic Full Service',
    price: 16000,
    description: 'Includes 2 waiters/dishwashers.',
    items: JSON.stringify([{ name: 'Waiters/Dishwashers', qty: 2 }])
  };
  const pkg = await findPackageById(saved.id, { query: async () => [[saved]] });
  assert.equal(pkg.id, saved.id);
  assert.equal(pkg.price, saved.price);
  assert.equal(pkg.description, 'Includes 2 helpers.');
  assert.deepEqual(pkg.items, [{ name: 'Helpers', qty: 2 }]);
});
