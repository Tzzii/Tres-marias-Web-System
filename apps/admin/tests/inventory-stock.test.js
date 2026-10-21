import assert from 'node:assert/strict';
import test from 'node:test';
import { changeStockValues, stockQuantityLimit } from '../src/lib/inventoryStock.js';

const item = {
  available: 8,
  damaged: 3,
  out: [
    { ref: 'RES-A', qty: 10 },
    { ref: 'RES-B', qty: 4 }
  ]
};

test('switching the return event clears damage from the previous event', () => {
  const previous = { ref: 'RES-A', qty: '7', damagedQty: '3', note: 'Inspect on arrival' };
  const next = changeStockValues(previous, 'ref', 'RES-B', 'return', item);
  assert.deepEqual(next, { ref: 'RES-B', qty: '4', damagedQty: '0', note: 'Inspect on arrival' });
  assert.equal(Number(next.qty) + Number(next.damagedQty), 4);
  assert.equal(previous.damagedQty, '3');
});

test('return quantities share the selected event allocation', () => {
  const values = { ref: 'RES-B', qty: '2', damagedQty: '1', note: '' };
  assert.equal(changeStockValues(values, 'qty', '9', 'return', item).qty, '3');
  assert.equal(changeStockValues(values, 'damagedQty', '9', 'return', item).damagedQty, '2');
  assert.equal(changeStockValues(values, 'qty', '', 'return', item).qty, '');
  assert.equal(stockQuantityLimit('return', item, { ...values, damagedQty: '8' }, 'qty'), 0);
});

test('an event without an allocation cannot carry return quantities from another event', () => {
  const values = { ref: 'RES-A', qty: '7', damagedQty: '3', note: '' };
  const next = changeStockValues(values, 'ref', 'RES-MISSING', 'return', item);
  assert.equal(next.qty, '0');
  assert.equal(next.damagedQty, '0');
});

test('checkout and damage use available stock; repair and disposal use damaged stock', () => {
  const values = { ref: 'RES-A', qty: '', damagedQty: '0', note: '' };
  for (const action of ['checkout', 'damage']) {
    assert.equal(changeStockValues(values, 'qty', '20', action, item).qty, '8');
  }
  for (const action of ['repair', 'dispose']) {
    assert.equal(changeStockValues(values, 'qty', '20', action, item).qty, '3');
  }
  assert.equal(changeStockValues(values, 'note', 'Updated note', 'checkout', item).note, 'Updated note');
});
