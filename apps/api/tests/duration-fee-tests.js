import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeQuote,
  durationChargeFor,
  reservationSixHourFee,
  sixHourFeeProblem
} from '@tm/shared/src/services/pricing.js';
import { initialEndTime, eventHours, endTimeProblem } from '@tm/shared/src/domain/availability.js';
import { quotationStaleReason } from '@tm/shared/src/domain/reservation.js';
import { DEFAULT_SIX_HOUR_FEE } from '@tm/shared/src/services/config.js';
import { setSixHourFee, getSixHourFee } from '../src/modules/catalog/catalog.service.js';
import { createBody, quotationBody } from '../src/modules/reservations/reservations.schemas.js';
import { pool } from '../src/db.js';

const base = {
  pkg: { price: 10000, guests: 100 },
  serviceType: 'Catering only',
  guests: 100,
  startTime: '12:00',
  sixHourFee: DEFAULT_SIX_HOUR_FEE
};

test('new bookings default to two hours, including midnight; legacy missing end times keep four hours', () => {
  assert.equal(initialEndTime('18:00'), '20:00');
  assert.equal(initialEndTime('23:30'), '01:30');
  assert.equal(initialEndTime(''), '');
  assert.equal(eventHours('18:00', undefined), 4);
  assert.equal(endTimeProblem('12:00', '18:00'), '');
  assert.ok(endTimeProblem('12:00', '18:30'));
});

test('only exactly six hours adds the fee, including overnight events and buffet bookings', () => {
  for (const serviceType of ['Catering only', 'Buffet and Catering']) {
    for (let halfHours = 4; halfHours <= 12; halfHours++) {
      const minutes = 12 * 60 + halfHours * 30;
      const endTime = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${minutes % 60 ? '30' : '00'}`;
      const quote = computeQuote({ ...base, serviceType, endTime });
      const charge = halfHours === 12 ? 5000 : 0;
      assert.equal(quote.durationCharge, charge, `${serviceType}, ${halfHours / 2} hours`);
      assert.equal(quote.net, 10000 + quote.food + charge);
    }
  }
  assert.equal(durationChargeFor({ ...base, startTime: '22:00', endTime: '04:00' }), 5000);
  assert.equal(durationChargeFor({ ...base, endTime: undefined }), 0);
  assert.equal(durationChargeFor({ ...base, serviceType: 'Equipment rental', endTime: '18:00' }), 0);
});

test('saved rate survives a later setting change; overrides, waivers, and the maximum affect totals', () => {
  for (const sixHourFee of [0, 5000, 10000, 15000, 50000]) {
    const quote = computeQuote({ ...base, endTime: '18:00', sixHourFee, discount: 500 });
    assert.equal(quote.net, 9500 + sixHourFee);
    assert.equal(reservationSixHourFee({ estimate: quote }), sixHourFee);
    assert.equal(reservationSixHourFee({ quotation: quote, estimate: { sixHourFee: 3000 } }), sixHourFee);
  }
  assert.equal(reservationSixHourFee({ estimate: { net: 10000 } }), 0);
  const quote = computeQuote({ ...base, endTime: '18:00' });
  assert.equal(computeQuote({ ...base, endTime: '18:00', ...JSON.parse(JSON.stringify(quote)) }).net, 15000);
});

test('changing duration across the fee boundary requires a revised quotation', () => {
  const short = { ...base, endTime: '17:00' };
  const quotation = computeQuote(short);
  assert.equal(quotationStaleReason({ ...short, quotation }), '');
  assert.match(quotationStaleReason({ ...short, endTime: '18:00', quotation }), /duration/);
  const longQuote = computeQuote({ ...base, endTime: '18:00' });
  assert.match(quotationStaleReason({ ...short, quotation: longQuote }), /duration/);
});

test('fee validation enforces whole pesos, at most five digits, and the 50000 cap', () => {
  for (const value of [0, '0', 5000, '10000', 15000, '50000']) assert.equal(sixHourFeeProblem(value), '');
  for (const value of [
    '',
    ' ',
    null,
    undefined,
    true,
    {},
    [],
    -1,
    50001,
    100000,
    15000.5,
    '1e4',
    '000001',
    NaN,
    Infinity
  ])
    assert.ok(sixHourFeeProblem(value), String(value));
  assert.equal(quotationBody.parse({ sixHourFee: 15000 }).sixHourFee, 15000);
  assert.equal(createBody.parse({ sixHourFee: 0, durationCharge: 0 }).sixHourFee, undefined);
});

test('catalog service saves valid rates and rejects invalid rates before querying the database', async (t) => {
  let current = 5000;
  const query = t.mock.method(pool, 'query', async (sql, params) => {
    if (sql.startsWith('UPDATE catalog_settings SET six_hour_fee')) {
      current = params[0];
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT six_hour_fee')) return [[{ six_hour_fee: current }]];
    throw new Error(`Unexpected query: ${sql}`);
  });
  for (const amount of [0, 5000, 10000, 15000, 50000]) {
    assert.deepEqual(await setSixHourFee(amount), { sixHourFee: amount });
    assert.deepEqual(await getSixHourFee(), { sixHourFee: amount });
  }
  const count = query.mock.callCount();
  for (const value of [50001, '100000', -1, 0.5, '', null])
    await assert.rejects(
      setSixHourFee(value),
      (error) => error.code === 'INVALID' && error.meta.field === 'sixHourFee'
    );
  assert.equal(query.mock.callCount(), count);
});
