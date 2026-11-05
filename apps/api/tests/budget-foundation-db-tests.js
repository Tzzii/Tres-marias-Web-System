import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config } from '../src/config.js';
import { pool, closePool } from '../src/db.js';
import {
  createReservation,
  sendQuotation,
  updateLogistics,
  updateMenu
} from '../src/modules/reservations/reservations.service.js';
import { itemsToConfirm } from '@tm/shared/src/domain/packageItems.js';
import { listAddons, setBudgetPolicy } from '../src/modules/catalog/catalog.repo.js';
import * as repo from '../src/modules/reservations/reservations.repo.js';

test('inclusive pricing and budget policy JSON persist locally; all fixtures roll back without delivery', async () => {
  assert.ok(
    config.env !== 'production' && ['127.0.0.1', 'localhost', '::1'].includes(config.db.host),
    'Local development database required'
  );
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    conn.afterCommit = () => {};
    const customer = { id: `qa-${randomUUID()}`, name: 'Budget QA' };
    await conn.query(
      'INSERT INTO customers (id, first_name, last_name, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [customer.id, 'Budget', 'QA', customer.name, `${customer.id}@example.invalid`, 'test-disabled-hash', Date.now()]
    );
    const [[pkg]] = await conn.query(
      "SELECT id, price, guests, items FROM packages WHERE kind = 'package' AND visible = 1 AND archived = 0 ORDER BY sort_order LIMIT 1"
    );
    assert.ok(pkg);
    if (typeof pkg.items === 'string') pkg.items = JSON.parse(pkg.items);
    const form = {
      packageId: pkg.id,
      eventName: 'Budget QA event',
      occasion: 'Birthday',
      date: '2091-06-20',
      startTime: '12:00',
      endTime: '16:00',
      guests: Math.max(200, pkg.guests),
      serviceType: 'Buffet and Catering',
      agreeTerms: true,
      venueName: 'QA venue',
      venueAddress: 'QA street',
      city: 'Malvar',
      addonIds: [],
      menu: { pork: ['Adobo'], chicken: ['Inasal'], fish: ['Fish fillet'], vegetable: ['Chopsuey'] }
    };
    const transact = (fn) => fn(conn);
    const read = async (ref) => (await repo.findReservations(conn, { ref }))[0].reservation;
    const created = await createReservation(customer, form, { transact });
    let saved = await read(created.ref);
    assert.equal(saved.estimate.pricingModel, 'inclusive-buffet-v2');
    assert.equal(saved.estimate.net, form.guests * saved.pricePerPlate);
    const admin = { name: 'Budget QA admin' };
    const itemCounts = Object.fromEntries(itemsToConfirm(pkg, form.guests).map((item) => [item.name, item.defaultQty]));
    await sendQuotation(created.ref, { itemCounts, extraGuestsCharge: 99999 }, admin, { transact });
    saved = await read(created.ref);
    assert.equal(saved.quotation.extraGuestsCharge, 0);
    assert.equal(saved.quotation.net, form.guests * saved.pricePerPlate);
    const originalQuote = structuredClone(saved.quotation);
    await updateLogistics(created.ref, { ...form, guests: form.guests + 1 }, admin, { transact });
    assert.deepEqual((await read(created.ref)).quotation, originalQuote);
    // Simulate an existing unmarked historical request: explicit re-quotation remains legacy.
    await repo.updateReservation(conn, created.ref, {
      guests: form.guests,
      quotation: null,
      estimate: { ...saved.estimate, packageTotal: pkg.price, pricingModel: undefined }
    });
    await conn.query('UPDATE packages SET price = price + 1000 WHERE id = ?', [pkg.id]);
    await sendQuotation(created.ref, { itemCounts, extraGuestsCharge: 0 }, admin, { transact });
    assert.equal((await read(created.ref)).quotation.net, form.guests * saved.pricePerPlate + pkg.price);
    const unquoted = await createReservation(customer, { ...form, date: '2091-06-21' }, { transact });
    await updateLogistics(unquoted.ref, { ...form, date: '2091-06-21', guests: form.guests + 1 }, admin, { transact });
    const moved = await read(unquoted.ref);
    assert.equal(moved.estimate.food, (form.guests + 1) * moved.pricePerPlate);
    assert.equal(moved.estimate.net, moved.estimate.food);
    const catering = await createReservation(
      customer,
      { ...form, date: '2091-06-22', serviceType: 'Catering only', menu: {} },
      { transact }
    );
    await updateMenu(catering.ref, { serviceType: 'Buffet and Catering', menu: form.menu }, admin, { transact });
    await updateLogistics(catering.ref, { ...form, date: '2091-06-22', guests: form.guests + 1 }, admin, { transact });
    const switched = await read(catering.ref);
    assert.equal(
      switched.estimate.food,
      (form.guests + 1) * switched.pricePerPlate,
      'Service switching keeps the booked buffet rate'
    );
    await updateMenu(catering.ref, { serviceType: 'Catering only', menu: {} }, admin, { transact });
    await updateLogistics(catering.ref, { ...form, date: '2091-06-22' }, admin, { transact });
    await updateMenu(catering.ref, { serviceType: 'Buffet and Catering', menu: form.menu }, admin, { transact });
    assert.equal(
      (await read(catering.ref)).estimate.food,
      form.guests * switched.pricePerPlate,
      'Switching back refreshes an unquoted estimate immediately'
    );
    const addons = await listAddons({}, conn);
    const addon = addons.find((a) => !a.sizes.length && a.id !== 'add-dessert');
    assert.ok(addon);
    const policy = { allowRemove: true, minQty: null, replacementIds: [], requires: [] };
    await setBudgetPolicy(addon.id, policy, conn);
    assert.deepEqual((await listAddons({}, conn)).find((a) => a.id === addon.id).budgetPolicy, policy);
  } finally {
    await conn.rollback();
    delete conn.afterCommit;
    conn.release();
    await closePool();
  }
});
