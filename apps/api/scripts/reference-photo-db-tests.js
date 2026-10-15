import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config } from '../src/config.js';
import { pool, closePool } from '../src/db.js';
import {
  createReservation,
  getReferencePhoto,
  updateStyling
} from '../src/modules/reservations/reservations.service.js';
import * as repo from '../src/modules/reservations/reservations.repo.js';
import { storage } from '../src/integrations/storage/index.js';

test('reference photo booking, ownership and admin edits round trip; fixtures roll back', async (t) => {
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(config.db.host) && config.env !== 'production');
  const conn = await pool.getConnection();
  const id = `qa-${randomUUID()}`;
  const keys = [];
  try {
    await conn.beginTransaction();
    await conn.query(
      'INSERT INTO customers (id, first_name, last_name, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, 'Photo', 'QA', 'Photo QA', `${id}@example.invalid`, 'test-only-disabled-hash', Date.now()]
    );
    const [packages] = await conn.query(
      "SELECT id FROM packages WHERE kind = 'package' AND visible = 1 AND archived = 0 ORDER BY sort_order LIMIT 1"
    );
    const form = {
      packageId: packages[0].id,
      eventName: 'QA reference photo',
      occasion: 'Birthday',
      date: '2090-02-21',
      startTime: '12:00',
      endTime: '15:00',
      guests: 100,
      serviceType: 'Catering only',
      agreeTerms: true,
      venueName: 'QA venue',
      venueAddress: 'QA street',
      city: 'Malvar',
      addonIds: [],
      styling: null
    };
    const transact = (fn) => fn(conn);
    const customer = { id, name: 'Photo QA' };
    const buffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64'
    );
    const file = { buffer, mimetype: 'image/png', originalname: 'reference.png' };
    const saved = await createReservation(customer, form, {
      transact,
      referencePhotos: Array.from({ length: 5 }, (_, i) => ({ ...file, originalname: `reference-${i}.png` }))
    });
    const photos = saved.styling.referencePhotos;
    const photo = photos[0];
    keys.push(...photos.map((photo) => photo.key));
    assert.equal(photos.length, 5);
    await t.test('photo alone creates styling and persists its metadata', async () => {
      const [row] = await repo.findReservations(conn, { ref: saved.ref });
      assert.deepEqual(row.reservation.styling.referencePhotos, photos);
      assert.equal(row.reservation.styling.theme, '');
      assert.deepEqual(await getReferencePhoto(saved.ref, { customerId: id, transact }), photo);
      assert.deepEqual(await getReferencePhoto(saved.ref, { transact }), photo);
    });
    await t.test('all five photos are readable in order by the owner and admin', async () => {
      for (let photoIndex = 0; photoIndex < 5; photoIndex++) {
        assert.deepEqual(
          await getReferencePhoto(saved.ref, { customerId: id, photoIndex, transact }),
          photos[photoIndex]
        );
        assert.deepEqual(await getReferencePhoto(saved.ref, { photoIndex, transact }), photos[photoIndex]);
        await assert.rejects(
          getReferencePhoto(saved.ref, { customerId: 'another-customer', photoIndex, transact }),
          (e) => e.code === 'NOT_FOUND'
        );
      }
      await assert.rejects(getReferencePhoto(saved.ref, { photoIndex: 5, transact }), (e) => e.code === 'NOT_FOUND');
    });
    await t.test('another customer and a differently spelled reference cannot read the photo', async () => {
      for (const [ref, customerId] of [
        [saved.ref, 'another-customer'],
        [saved.ref.toLowerCase(), id]
      ])
        await assert.rejects(getReferencePhoto(ref, { customerId, transact }), (e) => e.code === 'NOT_FOUND');
    });
    await t.test('admin edits and clearing design text preserve the customer photo', async () => {
      await updateStyling(
        saved.ref,
        { theme: 'Royal', notes: 'Gold table runners' },
        { name: 'Photo QA Admin' },
        { transact }
      );
      let [row] = await repo.findReservations(conn, { ref: saved.ref });
      assert.equal(row.reservation.styling.theme, 'Royal');
      assert.deepEqual(row.reservation.styling.referencePhotos, photos);
      await updateStyling(saved.ref, {}, { name: 'Photo QA Admin' }, { transact });
      [row] = await repo.findReservations(conn, { ref: saved.ref });
      assert.equal(row.reservation.styling.notes, '');
      assert.deepEqual(row.reservation.styling.referencePhotos, photos);
    });
    await t.test('legacy single-photo metadata remains readable', async () => {
      await repo.updateReservation(conn, saved.ref, {
        styling: { theme: '', themeOther: '', colors: [], notes: '', referencePhoto: photo }
      });
      assert.deepEqual(await getReferencePhoto(saved.ref, { customerId: id, transact }), photo);
      await repo.updateReservation(conn, saved.ref, {
        styling: { theme: '', themeOther: '', colors: [], notes: '', referencePhotos: photos }
      });
    });
    await t.test('a booking without an upload cannot attach another booking photo through JSON', async () => {
      const other = await createReservation(
        customer,
        { ...form, styling: { referencePhoto: photo, referencePhotos: photos } },
        { transact }
      );
      assert.equal(other.styling, null);
      await assert.rejects(getReferencePhoto(other.ref, { customerId: id, transact }), (e) => e.code === 'NOT_FOUND');
    });
  } finally {
    await conn.rollback();
    conn.release();
    await Promise.all(keys.map((key) => storage.remove(key)));
    await closePool();
  }
});
