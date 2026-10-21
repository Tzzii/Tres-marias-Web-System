import test from 'node:test';
import assert from 'node:assert/strict';
import { computeQuote, otherChargeItemsFor } from '@tm/shared/src/services/pricing.js';
import { rentalQuote } from '@tm/shared/src/domain/reservation.js';
import { quotationBody } from '../src/modules/reservations/reservations.schemas.js';
import { pool } from '../src/db.js';
import { sendQuotation } from '../src/modules/reservations/reservations.service.js';
import { useMailerForTests } from '../src/modules/notify/notify.service.js';

const base = { pkg: { price: 12000, guests: 100 }, serviceType: 'Catering only', guests: 100 };
const charges = [
  { amount: 800, label: 'Extra waiter' },
  { amount: 1200, label: '2 extra hours' },
  { amount: 500, label: 'Transport' }
];

test('each charge survives request parsing and JSON storage, with the combined total charged once', () => {
  const body = quotationBody.parse({ otherChargeItems: charges, discount: 300 });
  const quote = computeQuote({ ...base, ...body });
  const saved = JSON.parse(JSON.stringify(quote));
  assert.deepEqual(otherChargeItemsFor(saved), charges);
  assert.equal(saved.otherCharges, 2500);
  assert.equal(saved.net, 14200);
  assert.equal(computeQuote({ ...base, ...saved }).net, saved.net);
});

test('removing a middle charge keeps the remaining labels and amounts paired', () => {
  const remaining = charges.filter((_, index) => index !== 1);
  const quote = computeQuote({ ...base, otherChargeItems: remaining });
  assert.deepEqual(quote.otherChargeItems, [charges[0], charges[2]]);
  assert.equal(quote.otherCharges, 1300);
  assert.equal(quote.net, 13300);
});

test('empty optional rows are ignored and removing all charges clears an earlier total', () => {
  const blank = computeQuote({ ...base, otherChargeItems: [{ amount: '', label: '  ' }] });
  assert.deepEqual(blank.otherChargeItems, []);
  assert.equal(blank.net, 12000);
  const cleared = computeQuote({ ...base, otherCharges: 2500, otherChargeItems: [] });
  assert.equal(cleared.otherCharges, 0);
  assert.equal(cleared.net, 12000);
});

test('older single-charge quotations keep their amount and description when opened and re-saved', () => {
  const legacy = { otherCharges: 2000, otherLabel: '2 extra hours' };
  const otherChargeItems = otherChargeItemsFor(legacy);
  assert.deepEqual(otherChargeItems, [{ amount: 2000, label: '2 extra hours' }]);
  assert.equal(computeQuote({ ...base, ...legacy }).net, 14000);
  const updated = computeQuote({ ...base, otherChargeItems });
  assert.deepEqual(otherChargeItemsFor(updated), otherChargeItems);
  assert.equal(updated.net, 14000);
  assert.equal(quotationBody.safeParse(legacy).success, true);
});

test('rental edits preserve itemized charges and include them once alongside delivery and damage', () => {
  const quotation = computeQuote({ serviceType: 'Equipment Rental', otherChargeItems: charges, discount: 300 });
  const result = rentalQuote(
    { price: 0, kind: 'rental' },
    {
      serviceType: 'Equipment Rental',
      rentalItems: [{ itemId: 'chair', name: 'Chair', qty: 10, price: 15 }],
      fulfilment: 'pickup',
      quotation,
      damageCharges: [{ itemId: 'chair', name: 'Chair', qty: 1, fee: 200 }]
    }
  );
  assert.deepEqual(result.otherChargeItems, charges);
  assert.equal(result.net, 2550);
});

test('itemized inputs reject invalid amounts, malformed rows and oversized descriptions', () => {
  for (const amount of [-1, 0.5, Infinity, NaN, 10000001, 'abc', null, undefined]) {
    assert.equal(quotationBody.safeParse({ otherChargeItems: [{ amount, label: 'Waiter' }] }).success, false);
  }
  for (const otherChargeItems of [{}, [null], [123], [{ amount: 100, label: 'x'.repeat(61) }]]) {
    assert.equal(quotationBody.safeParse({ otherChargeItems }).success, false);
  }
  assert.equal(quotationBody.safeParse({ otherChargeItems: [{ amount: 0, label: '' }] }).success, true);
  assert.equal(quotationBody.safeParse({ otherChargeItems: [] }).success, true);
});

test('quotation service writes and reloads itemized charges through the reservation repository', async (t) => {
  const row = {
    ref: 'TM-OTHER-TEST',
    customer_id: 'test-customer',
    package_id: 'test-package',
    event_name: 'Other charges test',
    service_type: 'Catering only',
    guests: 100,
    status: 'approved',
    date: '2090-01-01',
    estimate: JSON.stringify({ net: 12000 }),
    quotation: null,
    min_downpayment: 3000,
    menu: '{}',
    styling: '{}'
  };
  let writes = 0;
  const conn = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async (sql, values) => {
      if (sql.startsWith('SELECT ref, customer_id, status FROM reservations')) return [[row]];
      if (sql.includes('FROM reservations r') && sql.includes('LEFT JOIN customers')) return [[row]];
      if (sql.includes('FROM packages WHERE'))
        return [[{ id: row.package_id, price: 12000, guests: 100, items: '[]' }]];
      if (sql.startsWith('UPDATE reservations SET')) {
        row.quotation = values[0];
        writes++;
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('SELECT id FROM threads')) return [[{ id: 'test-thread' }]];
      if (sql.startsWith('SELECT email, first_name, name FROM customers'))
        return [[{ email: 'test@example.invalid', first_name: 'Test', name: 'Test Customer' }]];
      if (sql.startsWith('INSERT INTO')) return [{ affectedRows: 1 }];
      if (sql.startsWith('SELECT')) return [[]];
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  t.mock.method(pool, 'getConnection', async () => conn);
  t.mock.method(pool, 'query', async (sql) => {
    assert.ok(sql.startsWith('UPDATE outbox SET'));
    return [{ affectedRows: 1 }];
  });
  useMailerForTests({ name: 'test', deliver: async () => ({ status: 'sent' }) });
  t.after(() => useMailerForTests());
  const admin = { id: 'test-admin', name: 'Test Admin' };
  const send = (values) => sendQuotation(row.ref, quotationBody.parse(values), admin);
  const saved = await send({ otherChargeItems: charges });
  assert.deepEqual(saved.quotation.otherChargeItems, charges);
  assert.equal(saved.total, 14500);
  assert.equal(JSON.parse(row.quotation).otherCharges, 2500);
  const cleared = await send({ otherChargeItems: [] });
  assert.deepEqual(cleared.quotation.otherChargeItems, []);
  assert.equal(cleared.total, 12000);
  const legacy = await send({ otherCharges: 2000, otherLabel: '2 extra hours' });
  assert.deepEqual(legacy.quotation.otherChargeItems, [{ amount: 2000, label: '2 extra hours' }]);
  assert.equal(legacy.total, 14000);
  assert.equal(writes, 3);
});
