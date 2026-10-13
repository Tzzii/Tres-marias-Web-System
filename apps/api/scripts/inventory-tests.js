import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  rentalCheckOut,
  rentalCheckoutDue,
  legacyRentalDispatched,
  stockMove,
  availableOf
} from '@tm/shared/src/domain/inventory.js';
import { rentalStock } from '@tm/shared/src/domain/reservation.js';
import { businessClock } from '../src/lib/time.js';
import { createRentalCheckoutScheduler } from '../src/modules/inventory/inventory.scheduler.js';

const rental = (changes = {}) => ({
  ref: 'RES-QA',
  serviceType: 'Equipment rental',
  status: 'confirmed',
  date: '2026-11-20',
  startTime: '09:00',
  rentalItems: [{ itemId: 'chairs', qty: 10 }],
  ...changes
});
const item = (changes = {}) => ({
  id: 'chairs',
  name: 'Chairs',
  total: 60,
  damaged: 0,
  archived: false,
  lowStockAt: 5,
  allocations: {},
  history: [],
  ...changes
});
const at = { date: '2026-11-20', time: '09:00' };

test('only confirmed equipment rentals on the current date at or after pickup/delivery time are due', () => {
  assert.equal(rentalCheckoutDue(rental(), at), true);
  assert.equal(rentalCheckoutDue(rental({ fulfilment: 'delivery' }), { ...at, time: '15:30' }), true);
  for (const status of ['pending', 'approved', 'downpayment_paid', 'cancelled', 'declined', 'completed'])
    assert.equal(rentalCheckoutDue(rental({ status }), at), false);
  for (const changes of [
    { date: '2026-11-21' },
    { date: '2026-11-19' },
    { startTime: '09:30' },
    { startTime: '' },
    { serviceType: 'Catering only' }
  ])
    assert.equal(rentalCheckoutDue(rental(changes), at), false);
});

test('the worker clock follows Manila at midnight even on UTC hosts', () => {
  assert.deepEqual(businessClock(new Date('2026-11-19T15:59:59Z')), { date: '2026-11-19', time: '23:59' });
  assert.deepEqual(businessClock(new Date('2026-11-19T16:00:00Z')), { date: '2026-11-20', time: '00:00' });
});

test('checkout deducts physical available stock and return restores only good pieces', () => {
  const start = item();
  const dispatched = stockMove(start, 'checkout', { qty: 10, ref: 'RES-QA' }, 'confirmed');
  const out = { ...start, ...dispatched.counts };
  assert.equal(availableOf(out), 50);
  const returned = stockMove(out, 'return', { qty: 8, damagedQty: 2, ref: 'RES-QA' });
  assert.equal(availableOf({ ...out, ...returned.counts }), 58);
  assert.equal(returned.counts.damaged, 2);
});

test('fully dispatched rentals cannot be checked out again after partial or full returns', () => {
  for (const qty of [10, 4, 0]) {
    const current = item({ allocations: qty ? { 'RES-QA': qty } : {} });
    assert.equal(rentalCheckOut(rental(), () => current, { chairs: 10 }).problem.code, 'INVALID_STATE');
  }
});

test('partial manual checkout and return only leave the never-dispatched quantity for automation', () => {
  const current = item({ allocations: { 'RES-QA': 2 } });
  assert.equal(rentalCheckOut(rental(), () => current, { chairs: 4 }).moves[0].qty, 6);
  assert.equal(rentalCheckOut(rental(), () => current).moves[0].qty, 8);
});

test('increasing an item quantity dispatches only the additional pieces', () => {
  const plan = rentalCheckOut(rental({ rentalItems: [{ itemId: 'chairs', qty: 15 }] }), () => item(), { chairs: 10 });
  assert.equal(plan.moves[0].qty, 5);
});

test('short, archived or missing items refuse the whole rental without a partial plan', () => {
  const r = rental({
    rentalItems: [
      { itemId: 'chairs', qty: 10 },
      { itemId: 'tables', qty: 5 }
    ]
  });
  for (const bad of [item({ id: 'tables', total: 4 }), item({ id: 'tables', archived: true }), null]) {
    const plan = rentalCheckOut(r, (id) => (id === 'chairs' ? item() : bad));
    assert.ok(plan.problem);
    assert.equal(plan.moves, undefined);
  }
});

test('legacy checkout audit history prevents old returned rentals from being dispatched again', () => {
  const current = item({
    history: [
      { ref: 'RES-QA', text: 'Checked out 6 pcs for RES-QA.' },
      { ref: 'RES-QA', text: 'Checked out 4 pcs for RES-QA. Reason: Extra load.' },
      { ref: 'RES-QA', text: 'Returned 10 pcs from RES-QA.' },
      { ref: 'OTHER', text: 'Checked out 80 pcs for OTHER.' },
      { ref: 'RES-QA', text: 'Reported 2 pcs damaged. Reason: Checked out 90 pcs for RES-QA.' }
    ]
  });
  assert.equal(legacyRentalDispatched(current, 'RES-QA'), 10);
  assert.equal(
    rentalCheckOut(rental(), () => current, { chairs: legacyRentalDispatched(current, 'RES-QA') }).problem.code,
    'INVALID_STATE'
  );
});

test('date reservations and physical checkouts are counted once, including no-event and overdue items', () => {
  const r = rental();
  const inventory = [item({ damaged: 2, allocations: { 'RES-QA': 10, earlier: 5, none: 3 } })];
  assert.equal(rentalStock({ inventory, reservations: [r] }, r.date).chairs, 40);
  assert.equal(rentalStock({ inventory, reservations: [r] }, r.date, r.ref).chairs, 50);
  assert.equal(rentalStock({ inventory, reservations: [rental({ status: 'cancelled' })] }, r.date).chairs, 40);
});

test('cancelled and rescheduled reservations release the hold on the old date', () => {
  const data = { inventory: [item()], reservations: [rental()] };
  assert.equal(rentalStock(data, at.date).chairs, 50);
  data.reservations = [rental({ status: 'cancelled' })];
  assert.equal(rentalStock(data, at.date).chairs, 60);
  data.reservations = [rental({ date: '2026-11-21' })];
  assert.equal(rentalStock(data, at.date).chairs, 60);
  assert.equal(rentalStock(data, '2026-11-21').chairs, 50);
});

test('the scheduler isolates failures and publishes only saved changes', async () => {
  const errors = [],
    published = [],
    checked = [];
  const job = createRentalCheckoutScheduler({
    clock: () => at,
    loadDue: async () => ['bad', 'changed', 'unchanged'],
    checkout: async (ref, clock) => {
      assert.deepEqual(clock, at);
      checked.push(ref);
      if (ref === 'bad') throw new Error('failure');
      return { changed: ref === 'changed' };
    },
    publish: async () => published.push(true),
    report: (err) => errors.push(err.message)
  });
  await job.run();
  assert.deepEqual(checked, ['bad', 'changed', 'unchanged']);
  assert.equal(published.length, 1);
  assert.deepEqual(errors, ['failure']);
  await job.stop();
});

test('overlapping ticks share one run and stopped jobs cannot dispatch', async () => {
  let release,
    loads = 0,
    writes = 0;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  const job = createRentalCheckoutScheduler({
    loadDue: async () => {
      loads++;
      await barrier;
      return ['RES-QA'];
    },
    checkout: async () => {
      writes++;
      return { changed: false };
    }
  });
  const first = job.run();
  assert.equal(job.run(), first);
  const stopped = job.stop();
  release();
  await stopped;
  await first;
  await job.run();
  assert.equal(loads, 1);
  assert.equal(writes, 0);
});
