import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPortalSearchIndex, searchPortalRecords } from '../../../packages/shared/src/domain/portalSearch.js';

const fixture = (overrides = {}) => ({
  reservations: [{ ref: 'RES/42', eventName: 'Santos Wedding', customerName: 'Maria', date: '2026-12-20' }],
  payments: [{ id: 'pay/1', ref: 'RES/42', eventName: 'Santos Wedding', receiptNo: 'RECEIPT-42', amount: 3000 }],
  customers: [{ id: 'customer/1', name: 'Maria Santos', email: 'maria@example.test' }],
  inventory: [{ id: 'chair/1', name: 'Gold Chair', category: 'Seating', available: 20 }],
  packages: [{ slug: 'classic', name: 'Classic', description: 'Wedding buffet' }],
  ...overrides
});

test('indexed search keeps multiword, case-insensitive matching across fields', () => {
  const index = buildPortalSearchIndex(fixture());
  const result = searchPortalRecords(index, '  WEDDING   maria ');
  assert.equal(result.total, 1);
  assert.equal(result.groups[0].items[0].key, 'reservation-RES/42');
  assert.equal(searchPortalRecords(index, '   ').total, 0);
  assert.equal(searchPortalRecords(index, 'missing receipt').total, 0);
});

test('results preserve category order, exact counts, and a bounded number of links', () => {
  const records = fixture({
    reservations: Array.from({ length: 1000 }, (_, i) => ({
      ref: `RES-${i}`,
      eventName: 'Wedding',
      date: '2026-12-20'
    }))
  });
  const result = searchPortalRecords(buildPortalSearchIndex(records), 'wedding');
  assert.equal(result.total, 1002);
  assert.deepEqual(
    result.groups.map((group) => group.name),
    ['Reservations', 'Payments', 'Packages']
  );
  assert.equal(result.groups[0].total, 1000);
  assert.equal(result.groups[0].items.length, 12);
  assert.equal(result.groups[0].items[11].key, 'reservation-RES-11');
});

test('receipt, customer, equipment and package searches retain their destinations', () => {
  const admin = buildPortalSearchIndex(fixture(), { admin: true });
  const first = (index, query) => searchPortalRecords(index, query).groups[0].items[0];
  assert.equal(first(admin, 'receipt-42').to, '/payments?verify=pay%2F1');
  assert.equal(first(admin, 'maria@example.test').to, '/customers?open=customer%2F1');
  assert.equal(first(admin, 'seating gold').to, '/inventory?q=Gold%20Chair');
  assert.equal(first(admin, 'classic').to, '/packages');
  const customer = buildPortalSearchIndex(fixture({ customers: [], inventory: [] }));
  assert.equal(first(customer, 'receipt-42').to, '/portal/payments?ref=RES%2F42');
  assert.equal(first(customer, 'maria wedding').to, '/portal/reservations/RES%2F42');
  assert.equal(first(customer, 'classic').to, '/packages/classic');
});

test('date formatting is deferred until a record is visible', () => {
  let reads = 0;
  const reservations = Array.from({ length: 1000 }, (_, i) => ({
    ref: `RES-${i}`,
    eventName: 'Wedding',
    get date() {
      reads += 1;
      return '2026-12-20';
    }
  }));
  const index = buildPortalSearchIndex(fixture({ reservations }));
  assert.equal(reads, 1000, 'index reads the raw search date once');
  searchPortalRecords(index, 'no matches');
  assert.equal(reads, 1000, 'unmatched dates are never formatted');
  searchPortalRecords(index, 'wedding');
  assert.equal(reads, 1012, 'only twelve visible dates are formatted');
});
