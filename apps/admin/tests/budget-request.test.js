import test from 'node:test';
import assert from 'node:assert/strict';
import { quotationStaleReason } from '../../../packages/shared/src/domain/reservation.js';
import {
  quotedAddonLines,
  budgetDifference,
  selectionChanges
} from '../../../packages/shared/src/domain/budgetRequest.js';
import { computeQuote } from '../../../packages/shared/src/services/pricing.js';

test('a sent quotation becomes stale on quantity or selection edits while keeping its old amount', () => {
  const quotation = computeQuote({
    serviceType: 'Buffet and Catering',
    guests: 100,
    pricePerPlate: 600,
    addonIds: ['a'],
    addonQty: { a: 3 },
    addonPrices: { a: 800 }
  });
  const r = { serviceType: 'Buffet and Catering', guests: 100, addonIds: ['a'], addonQty: { a: 3 }, quotation };
  assert.equal(quotationStaleReason(r), '');
  assert.match(quotationStaleReason({ ...r, addonQty: { a: 2 } }), /additional services/i);
  assert.match(quotationStaleReason({ ...r, addonIds: ['b'], addonQty: { b: 3 } }), /additional services/i);
  assert.equal(r.quotation.net, 62400);
  assert.equal(
    quotationStaleReason({ ...r, quotation: { serviceType: r.serviceType, plates: 100 }, addonIds: ['b'] }),
    '',
    'Do not fabricate absent legacy history'
  );
  assert.equal(
    quotationStaleReason({
      ...r,
      quotation: { serviceType: r.serviceType, plates: 100, addonTotals: { a: 2400 }, addonPrices: { a: 800 } }
    }),
    '',
    'Infer quantities only from reliable saved amounts'
  );
  assert.equal(
    quotationStaleReason({
      ...r,
      quotation: {
        serviceType: r.serviceType,
        plates: 100,
        addonQty: {},
        addonTotals: { a: 2400 },
        addonPrices: { a: 800 }
      }
    }),
    '',
    'An empty legacy quantity map must not hide reliable saved totals'
  );
  assert.match(
    quotationStaleReason({
      ...r,
      quotation: { serviceType: r.serviceType, plates: 100, sentAt: 10 },
      estimate: { requiresQuoteSentAt: 10 }
    }),
    /older quotation/
  );
});
test('saved quote lines survive working selection edits and expose the budget difference without a blocker', () => {
  const r = {
    addonIds: ['b'],
    addons: [{ id: 'b', name: 'New service' }],
    budgetRequest: { budget: 60000 },
    quotation: {
      net: 62400,
      addonLines: [{ id: 'a', name: 'Original service', quantity: 3, unitPrice: 800, total: 2400 }]
    }
  };
  assert.equal(quotedAddonLines(r)[0].name, 'Original service');
  assert.deepEqual(budgetDifference(r, r.quotation.net), { budget: 60000, difference: 2400 });
  assert.equal(budgetDifference({ budgetRequest: null }, 1), null);
  assert.deepEqual(
    selectionChanges({ addonIds: ['a'], addonQty: { a: 3 } }, { addonIds: ['a', 'b'], addonQty: { a: 2, b: 1 } }).map(
      (c) => [c.id, c.before, c.after]
    ),
    [
      ['a', 3, 2],
      ['b', 0, 1]
    ]
  );
});
