import assert from 'node:assert/strict';
import test from 'node:test';
import { pool } from '../src/db.js';
import { getPricingSettings } from '../src/modules/catalog/catalog.service.js';
import { sniffPhoto } from '../src/lib/photos.js';

test('pricing settings use one database query and preserve a waived duration charge', async (t) => {
  const query = t.mock.method(pool, 'query', async () => [
    [{ price_per_plate: 750, min_downpayment: 4000, six_hour_fee: 0 }]
  ]);
  assert.deepEqual(await getPricingSettings(), { pricePerPlate: 750, minDownpayment: 4000, sixHourFee: 0 });
  assert.equal(query.mock.callCount(), 1);
  assert.match(query.mock.calls[0].arguments[0], /price_per_plate, min_downpayment, six_hour_fee/);
});

test('shared image sniffing accepts supported signatures and rejects partial or non-image headers', () => {
  assert.deepEqual(sniffPhoto(Buffer.from([255, 216, 255, 0])), { mime: 'image/jpeg', ext: 'jpg' });
  assert.deepEqual(sniffPhoto(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), { mime: 'image/png', ext: 'png' });
  assert.deepEqual(sniffPhoto(Buffer.from('RIFF1234WEBP')), { mime: 'image/webp', ext: 'webp' });
  for (const buffer of [
    null,
    undefined,
    [],
    Buffer.from([137, 80, 78, 71]),
    Buffer.from('%PDF-1.7'),
    Buffer.from('not an image')
  ])
    assert.equal(sniffPhoto(buffer), null);
});
