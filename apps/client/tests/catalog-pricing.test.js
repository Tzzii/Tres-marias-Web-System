import assert from 'node:assert/strict';
import test from 'node:test';
import { http } from '../../../packages/shared/src/services/http.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
let caseId = 0;
const catalog = () => import(`../../../packages/shared/src/services/remote/catalog.js?pricing-test=${caseId++}`);

test('concurrent catalogue lists load all three pricing settings with one request', async (t) => {
  const api = await catalog();
  const pricing = deferred();
  const reads = [];
  t.mock.method(http, 'get', async (path) => {
    reads.push(path);
    return path === '/catalog/pricing' ? pricing.promise : [];
  });
  const loaded = Promise.all([api.listPackages(), api.listAddons(), api.listDishes()]);
  assert.equal(reads.filter((path) => path === '/catalog/pricing').length, 1);
  assert.equal(reads.length, 4);
  pricing.resolve({ pricePerPlate: 750, minDownpayment: 4000, sixHourFee: 12000 });
  await loaded;
  assert.equal(api.pricePerPlate(), 750);
  assert.equal(api.minDownpayment(), 4000);
  assert.equal(api.sixHourFee(), 12000);
});

test('a slow pricing read cannot undo an admin save, and a later load starts a fresh pricing request', async (t) => {
  const api = await catalog();
  const before = deferred();
  const after = deferred();
  let reads = 0;
  t.mock.method(http, 'get', (path) =>
    path === '/catalog/pricing' ? (++reads === 1 ? before.promise : after.promise) : Promise.resolve([])
  );
  t.mock.method(http, 'put', async () => ({ sixHourFee: 15000 }));
  const old = api.listPackages();
  await api.setSixHourFee(15000);
  const newer = api.listPackages();
  assert.equal(reads, 2);
  before.resolve({ pricePerPlate: 600, minDownpayment: 3000, sixHourFee: 5000 });
  await old;
  assert.equal(api.sixHourFee(), 15000);
  after.resolve({ pricePerPlate: 800, minDownpayment: 3500, sixHourFee: 15000 });
  await newer;
  assert.equal(api.pricePerPlate(), 800);
  assert.equal(api.sixHourFee(), 15000);
});

test('the combined booking catalogue accepts a waived zero rate', async (t) => {
  const api = await catalog();
  t.mock.method(http, 'get', async () => ({ packages: [], pricePerPlate: 600, minDownpayment: 3000, sixHourFee: 0 }));
  await api.getCatalog();
  assert.equal(api.sixHourFee(), 0);
});
