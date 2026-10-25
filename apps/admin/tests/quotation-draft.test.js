import assert from 'node:assert/strict';
import test from 'node:test';
import {
  quotationDraftKey,
  readQuotationDraft,
  removeQuotationDraft,
  writeQuotationDraft
} from '../src/lib/quotationDraft.js';

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
};
const initial = {
  sixHourFee: '5000',
  extraGuestsCharge: '',
  deliveryFee: '1500',
  discount: '',
  note: '',
  addonPrices: { waiter: '1000' },
  itemCounts: { 'Buffet table': '' },
  otherChargeItems: [{ id: 'saved-0', amount: '', label: '' }]
};
const changed = {
  ...initial,
  sixHourFee: '15000',
  extraGuestsCharge: '2000',
  discount: '500',
  note: 'Please review the updated setup.',
  addonPrices: { waiter: '1800', removedAddon: '999' },
  itemCounts: { 'Buffet table': '4', removedItem: '30' },
  otherChargeItems: [
    { id: 'new-0', amount: '1200', label: 'Extra setup' },
    { id: 'new-1', amount: '', label: 'Still editing' }
  ]
};

test('quotation drafts retain unfinished fields and reconcile current add-ons and equipment', () => {
  const storage = memoryStorage();
  const key = quotationDraftKey('admin-a', 'RES-001');
  assert.equal(writeQuotationDraft(storage, key, 'revision-1', changed), true);
  const restored = readQuotationDraft(storage, key, 'revision-1', {
    ...initial,
    addonPrices: { waiter: '1000', newAddon: '700' }
  });
  assert.equal(restored.sixHourFee, '15000');
  assert.equal(restored.extraGuestsCharge, '2000');
  assert.equal(restored.discount, '500');
  assert.equal(restored.note, changed.note);
  assert.deepEqual(restored.addonPrices, { waiter: '1800', newAddon: '700' });
  assert.deepEqual(restored.itemCounts, { 'Buffet table': '4' });
  assert.deepEqual(
    restored.otherChargeItems,
    changed.otherChargeItems.map((line, index) => ({ ...line, id: `draft-${index}` }))
  );
});

test('drafts never cross administrator or reservation boundaries', () => {
  const storage = memoryStorage();
  const key = quotationDraftKey('admin-a', 'RES-001');
  writeQuotationDraft(storage, key, 'revision-1', changed);
  assert.equal(readQuotationDraft(storage, quotationDraftKey('admin-b', 'RES-001'), 'revision-1', initial), null);
  assert.equal(readQuotationDraft(storage, quotationDraftKey('admin-a', 'RES-002'), 'revision-1', initial), null);
});

test('a newer server quotation supersedes the old local draft', () => {
  const storage = memoryStorage();
  writeQuotationDraft(storage, 'quote', 'old-revision', changed);
  assert.equal(readQuotationDraft(storage, 'quote', 'new-revision', initial), null);
  assert.equal(storage.getItem('quote'), null);
});

test('invalid or corrupted saved data falls back to the current quotation', () => {
  for (const invalid of [
    '{',
    JSON.stringify({ schemaVersion: 99, revision: 'v1', values: changed }),
    JSON.stringify({ schemaVersion: 1, revision: 'v1', values: { ...changed, otherChargeItems: null } })
  ]) {
    const storage = memoryStorage();
    storage.setItem('quote', invalid);
    assert.equal(readQuotationDraft(storage, 'quote', 'v1', initial), null);
    assert.equal(storage.getItem('quote'), null);
  }
});

test('successful sending can remove a draft, and blocked browser storage never breaks editing', () => {
  const storage = memoryStorage();
  writeQuotationDraft(storage, 'quote', 'v1', changed);
  removeQuotationDraft(storage, 'quote');
  assert.equal(storage.getItem('quote'), null);
  const blocked = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
    removeItem() {
      throw new Error('blocked');
    }
  };
  assert.equal(readQuotationDraft(blocked, 'quote', 'v1', initial), null);
  assert.equal(writeQuotationDraft(blocked, 'quote', 'v1', changed), false);
  assert.doesNotThrow(() => removeQuotationDraft(blocked, 'quote'));
});
