import '../src/config.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSampleSeed } from '../src/seedData/sampleLoader.js';
import { buildBusinessSeed } from '../src/seedData/seed.js';
import { TABLES, toRows } from '../src/seed.js';
import { TERMS_VERSION } from '@tm/shared/src/legal/terms.js';
import { validateEmail, validateMobile } from '@tm/shared/src/utils/validation.js';
import { computeQuote } from '@tm/shared/src/services/pricing.js';
import { financials, statusForPayments } from '@tm/shared/src/domain/money.js';
import { onlineCancellation } from '@tm/shared/src/domain/cancellation.js';
import { pendingStep, quotationStaleReason, rentalStock } from '@tm/shared/src/domain/reservation.js';
import { itemsToConfirm } from '@tm/shared/src/domain/packageItems.js';
import { menuProblem, menuCount, DESSERT_ADDON_ID } from '@tm/shared/src/domain/menu.js';
import { todayISO } from '@tm/shared/src/utils/format.js';

const buildSample = await loadSampleSeed();
const fixture = buildSample ? buildSample(buildBusinessSeed()) : null;
const check = (name, fn) => test(name, { skip: !fixture && 'Local sample folder is absent.' }, fn);
const money = (r) => financials(r, fixture.payments, fixture.refunds);

check('one current customer with valid identity, accepted terms and linked records', () => {
  assert.equal(fixture.customers.length, 1);
  const customer = fixture.customers[0];
  assert.equal(validateEmail(customer.email), '');
  assert.equal(validateMobile(customer.mobile), '');
  assert.equal(customer.name, [customer.firstName, customer.middleName, customer.lastName].filter(Boolean).join(' '));
  assert.equal(customer.termsVersion, TERMS_VERSION);
  assert.ok(customer.termsAcceptedAt <= Date.now());
  for (const collection of ['reservations', 'payments', 'refunds', 'testimonials', 'threads']) {
    assert.ok(fixture[collection].every((row) => row.customerId === customer.id));
  }
});

check('quotations match current guest, child addon, rental fulfilment and damage rules', () => {
  const packages = new Map(fixture.packages.map((p) => [p.id, p]));
  const addons = new Map(fixture.addons.map((a) => [a.id, a]));
  assert.ok(fixture.reservations.some((r) => r.quotation?.extraGuests > 0));
  assert.ok(fixture.reservations.some((r) => r.addonIds.some((id) => addons.get(id).parentId)));
  for (const r of fixture.reservations) {
    assert.equal(r.termsVersion, TERMS_VERSION);
    assert.equal(quotationStaleReason(r), '', r.eventName);
    assert.ok(
      r.activity.every((entry) => entry.at >= r.createdAt && entry.at <= Date.now()),
      r.eventName
    );
    if (!r.quotation) continue;
    const quote = r.quotation;
    const computed = computeQuote({
      pkg: packages.get(r.packageId),
      ...r,
      addonPrices: quote.addonPrices,
      extraGuestsCharge: quote.extraGuestsCharge,
      discount: quote.discount,
      deliveryFee: quote.deliveryFee,
      otherCharges: quote.otherCharges
    });
    assert.equal(quote.net, computed.net, r.eventName);
    for (const item of itemsToConfirm(packages.get(r.packageId), r.guests)) {
      assert.ok(Number.isInteger(quote.itemCounts[item.name]) && quote.itemCounts[item.name] > 0);
    }
  }
  assert.ok(fixture.reservations.some((r) => pendingStep(r) === 'accept'));
  assert.ok(fixture.reservations.some((r) => pendingStep(r) === 'quote'));
});

check('all booking/payment states plus actionable cancellation, overdue and refund cases', () => {
  assert.deepEqual(
    new Set(fixture.reservations.map((r) => r.status)),
    new Set(['pending', 'approved', 'downpayment_paid', 'confirmed', 'completed', 'declined', 'cancelled'])
  );
  assert.deepEqual(new Set(fixture.payments.map((p) => p.status)), new Set(['awaiting', 'rejected', 'verified']));
  assert.deepEqual(new Set(fixture.payments.map((p) => p.method)), new Set(['bank', 'cash', 'qrph']));
  assert.ok(fixture.reservations.some((r) => money(r).balanceState === 'overdue'));
  assert.ok(
    fixture.reservations.some((r) => r.status === 'downpayment_paid' && onlineCancellation(r, money(r)).allowed)
  );
  assert.ok(fixture.reservations.some((r) => r.preparingAt && !onlineCancellation(r, money(r)).allowed));
  assert.ok(
    fixture.reservations.some(
      (r) => money(r).awaitingCount && onlineCancellation(r, money(r)).code === 'PENDING_PAYMENT'
    )
  );
  assert.ok(fixture.reservations.some((r) => r.status === 'cancelled' && money(r).refundDue > 0));
  assert.ok(
    fixture.reservations.some((r) => r.status === 'cancelled' && money(r).refunded > 0 && money(r).refundDue === 0)
  );
  assert.ok(fixture.reservations.some((r) => money(r).overpaid > 0));
  for (const r of fixture.reservations) assert.equal(statusForPayments(r.status, money(r)), r.status, r.eventName);
});

check('current menu choices, juice preference and separately quoted desserts are covered', () => {
  for (const r of fixture.reservations.filter((r) => !r.fulfilment)) {
    const buffet = r.serviceType === 'Buffet and Catering';
    const dessert = r.addonIds.includes(DESSERT_ADDON_ID);
    assert.equal(menuProblem(r.menu, { buffet, dessert }), null, r.eventName);
    if (buffet) {
      assert.equal(menuCount(r.menu), 4);
      assert.ok(['pork', 'chicken', 'fish', 'vegetable'].every((key) => Array.isArray(r.menu[key])));
      assert.ok(r.menu.juice);
    }
  }
  assert.ok(fixture.reservations.some((r) => r.menu?.pork?.length === 2 && r.menu.fish.length === 0));
  assert.ok(fixture.reservations.some((r) => r.serviceType === 'Catering only' && r.menu?.dessert?.name));
  assert.ok(fixture.reservations.some((r) => r.quotation?.addonTotals[DESSERT_ADDON_ID] > 0));
  assert.ok(fixture.reservations.some((r) => r.styling?.theme === 'Royal'));
});

check('rental allocation and dispatch tracking are consistent and no stock is overdrawn', () => {
  const refs = new Set(fixture.reservations.map((r) => r.ref));
  for (const item of fixture.inventory) {
    assert.ok(Object.keys(item.allocations).every((ref) => refs.has(ref)));
    assert.ok(Object.values(item.allocations).reduce((sum, n) => sum + n, 0) + item.damaged <= item.total);
    assert.ok(item.history.every((h) => !h.ref || refs.has(h.ref)));
  }
  assert.ok(fixture.reservations.some((r) => r.fulfilment === 'delivery' && r.rentalDispatches));
  assert.ok(fixture.reservations.some((r) => r.fulfilment === 'pickup'));
  assert.ok(fixture.reservations.some((r) => r.damageCharges?.length && money(r).balance > 0));
  assert.ok(
    Object.values(rentalStock({ inventory: fixture.inventory, reservations: fixture.reservations }, todayISO())).every(
      (n) => n >= 0
    )
  );
  const rows = toRows(fixture, new Map([[fixture.customers[0].id, 'test-hash']]), Date.now());
  assert.ok(rows.rental_dispatches.length > 0);
  for (const table of Object.keys(rows)) assert.ok(TABLES.includes(table));
  assert.equal(
    rows.counters.find((c) => c.name === 'payment').value,
    Math.max(...fixture.payments.map((p) => Number(p.id.slice(4))))
  );
  assert.equal(
    rows.counters.find((c) => c.name === 'receipt').value,
    Math.max(...fixture.payments.map((p) => Number(p.receiptNo.slice(3)) || 0))
  );
});

check('feedback and document/chat records refer to valid customer activity', () => {
  const reservations = new Map(fixture.reservations.map((r) => [r.ref, r]));
  assert.ok(
    fixture.reservations.some((r) => r.status === 'completed' && !fixture.testimonials.some((t) => t.ref === r.ref))
  );
  assert.ok(fixture.testimonials.some((t) => t.status === 'published' && t.featured && t.reply));
  assert.ok(fixture.testimonials.some((t) => !t.readByAdmin));
  assert.ok(fixture.testimonials.some((t) => t.flagged));
  assert.ok(fixture.testimonials.some((t) => t.archived));
  for (const t of fixture.testimonials) assert.equal(reservations.get(t.ref).status, 'completed');
  const messages = fixture.threads.flatMap((t) => t.messages);
  assert.ok(messages.some((m) => !m.readByCustomer));
  assert.ok(messages.some((m) => !m.readByAdmin));
  assert.ok(messages.every((m) => reservations.has(m.ref) && m.at <= Date.now()));
  assert.ok(messages.some((m) => m.typed && m.editedAt && m.history.length));
  assert.ok(messages.some((m) => m.typed && m.deletedAt));
  for (const kind of ['quotation', 'contract', 'receipt']) assert.ok(messages.some((m) => m.attachment?.kind === kind));
});
