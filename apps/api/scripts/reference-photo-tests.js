import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { cleanStyling, stylingEmpty } from '@tm/shared/src/domain/styling.js';
import { REFERENCE_PHOTO_MAX_BYTES, referencePhotoProblem, cleanDraftReferencePhoto } from '@tm/shared/src/domain/referencePhoto.js';
import { createReservation as submitBooking } from '@tm/shared/src/services/remote/reservation.js';
import { http } from '@tm/shared/src/services/http.js';
import { inspectReferencePhoto, storeReferencePhoto } from '../src/modules/reservations/referencePhoto.js';
import { createReservation } from '../src/modules/reservations/reservations.service.js';
import { reservationRoutes, reservationAdminRoutes } from '../src/modules/reservations/reservations.routes.js';
import { requireAuth, requireRole } from '../src/middleware/auth.js';
import { storage } from '../src/integrations/storage/index.js';
import { config } from '../src/config.js';
import { errorHandler } from '../src/middleware/errors.js';

const buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const file = { buffer, mimetype: 'image/png', originalname: 'table-setup.png' };
const draft = { name: file.originalname, dataUrl: `data:image/png;base64,${buffer.toString('base64')}` };

test('draft photo survives JSON and malformed or external URLs cannot be rendered as a photo', () => {
  assert.deepEqual(cleanDraftReferencePhoto(JSON.parse(JSON.stringify(draft))), draft);
  for (const bad of [{ ...draft, name: {} }, { ...draft, dataUrl: 'https://example.invalid/tracker' }, { ...draft, dataUrl: 'data:image/png;base64,abc' }]) assert.equal(cleanDraftReferencePhoto(bad), null);
});

test('client uses multipart only for a selected photo and keeps typed booking values intact', async () => {
  const original = http.post;
  http.post = async (url, body) => ({ url, body });
  try {
    const result = await submitBooking('qa', { eventName: 'Photo QA', agreeTerms: true, guests: 100, referencePhoto: draft });
    assert.ok(result.body instanceof FormData);
    assert.deepEqual(JSON.parse(result.body.get('booking')), { eventName: 'Photo QA', agreeTerms: true, guests: 100 });
    const uploaded = result.body.get('referencePhoto');
    assert.equal(uploaded.type, 'image/png');
    assert.equal(uploaded.name, file.originalname);
    assert.deepEqual(Buffer.from(await uploaded.arrayBuffer()), buffer);
    assert.deepEqual((await submitBooking('qa', { eventName: 'No photo', referencePhoto: null })).body, { eventName: 'No photo' });
    await assert.rejects(submitBooking('qa', { referencePhoto: { name: 'Bad', dataUrl: 'not a photo' } }), (e) => e.meta.field === 'styling.referencePhoto');
  } finally { http.post = original; }
});

test('optional reference photos keep old styling blank and accept only supported sizes/types', () => {
  assert.equal(cleanStyling({}), null);
  assert.equal(stylingEmpty(null), true);
  assert.equal(referencePhotoProblem({ size: buffer.length, type: 'image/png' }), null);
  assert.equal(referencePhotoProblem({ size: REFERENCE_PHOTO_MAX_BYTES, type: 'image/jpeg' }), null);
  assert.match(referencePhotoProblem({ size: REFERENCE_PHOTO_MAX_BYTES + 1, type: 'image/png' }), /20 MB/);
  assert.match(referencePhotoProblem({ size: 0, type: 'image/png' }), /empty/);
  assert.match(referencePhotoProblem({ size: 20, type: 'image/svg+xml' }), /JPG, PNG or WebP/);
});

test('server verifies file signatures and rejects renamed files, MIME mismatches and oversized photos', () => {
  assert.equal(inspectReferencePhoto(file).mime, 'image/png');
  for (const bad of [{ ...file, buffer: Buffer.from('<script>not an image</script>') }, { ...file, mimetype: 'image/jpeg' }, { ...file, buffer: Buffer.alloc(REFERENCE_PHOTO_MAX_BYTES + 1) }]) {
    assert.throws(() => inspectReferencePhoto(bad), (e) => e.code === 'INVALID' && e.meta.field === 'styling.referencePhoto');
  }
});

test('photo-only styling survives JSON storage; arbitrary paths and URLs do not', async () => {
  const photo = await storeReferencePhoto(file);
  try {
    const styling = cleanStyling({ referencePhoto: photo });
    assert.equal(stylingEmpty(styling), false);
    assert.deepEqual(cleanStyling(JSON.parse(JSON.stringify(styling))), styling);
    for (const key of ['../proofs/other.png', '/etc/passwd', 'https://example.invalid/photo.png']) assert.equal(cleanStyling({ referencePhoto: { ...photo, key } }), null);
  } finally { await storage.remove(photo.key); }
});

test('failed booking cleans up its uploaded photo', async () => {
  const dir = path.join(config.storage.uploadDir, 'styling');
  const before = await readdir(dir).catch(() => []);
  await assert.rejects(createReservation({ id: 'qa', name: 'QA' }, {}, { referencePhoto: file, transact: async () => { throw new Error('QA transaction failure'); } }), /QA transaction failure/);
  assert.deepEqual(await readdir(dir).catch(() => []), before);
});

test('multipart endpoint rejects bad JSON, wrong file fields and oversized files with usable errors', async () => {
  const app = express();
  app.use((req, res, next) => { req.user = { id: 'qa', role: 'customer' }; next(); });
  app.use('/reservations', reservationRoutes);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    for (const [field, content, booking] of [['referencePhoto', buffer, '{bad'], ['wrongField', buffer, '{}'], ['referencePhoto', Buffer.alloc(REFERENCE_PHOTO_MAX_BYTES + 1), '{}']]) {
      const body = new FormData();
      body.append('booking', booking);
      body.append(field, new Blob([content], { type: 'image/png' }), 'reference.png');
      const response = await fetch(`http://127.0.0.1:${server.address().port}/reservations`, { method: 'POST', body });
      assert.equal(response.status, 400);
      const error = await response.json();
      assert.equal(error.code, 'INVALID');
      if (booking !== '{bad') assert.equal(error.meta.field, 'styling.referencePhoto');
    }
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('customer/admin photo routes and upload require authentication before reading a file', async () => {
  const app = express();
  app.use('/reservations', requireAuth, requireRole('customer'), reservationRoutes);
  app.use('/admin/reservations', requireAuth, requireRole('admin'), reservationAdminRoutes);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ['/reservations/QA/reference-photo', '/admin/reservations/QA/reference-photo']) assert.equal((await fetch(base + path)).status, 401);
    const body = new FormData();
    body.append('booking', '{bad');
    body.append('referencePhoto', new Blob([buffer], { type: 'image/png' }), 'reference.png');
    assert.equal((await fetch(base + '/reservations', { method: 'POST', body })).status, 401);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
