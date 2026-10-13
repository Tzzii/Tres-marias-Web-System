import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  adminAccount,
  client,
  closePool,
  pool,
  requireWriteConsent,
  runDir,
  startApi,
  tokenFor
} from './lib/harness.js';

// Creates only its own temporary packages; every one and its photos is cleaned up in finally.
requireWriteConsent({ writesOk: process.argv.includes('--writes-test-data') }, 'Package photo integration check');
const uploadDir = path.join(runDir(), 'package-photos');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const values = {
  name: `Photo Check ${crypto.randomBytes(6).toString('hex')}`,
  price: 1000,
  guests: 60,
  description: 'A temporary setup used only for package photo checks.',
  items: [{ name: 'Buffet Table', qty: null }],
  visible: true
};
const ids = [];
let api;
let checks = 0;
const passed = (label) => {
  checks += 1;
  console.log(`PASS ${label}`);
};
const files = () =>
  fs.existsSync(path.join(uploadDir, 'packages')) ? fs.readdirSync(path.join(uploadDir, 'packages')) : [];
const form = (body, bytes = PNG) => {
  const data = new FormData();
  data.append('package', JSON.stringify(body));
  data.append('photo', new Blob([bytes], { type: 'image/png' }), 'setup.png');
  return data;
};
try {
  const admin = tokenFor(await adminAccount(), 'admin');
  api = await startApi({ env: { UPLOAD_DIR: uploadDir }, label: 'package-photo-check' });
  const call = client(api.base);
  let result = await call('POST', '/admin/packages', { token: admin, form: form(values) });
  assert.equal(result.status, 201);
  const id = result.body.id;
  ids.push(id);
  let version = result.body.photoVersion;
  assert.ok(version);
  assert.equal(result.body.photo_key, undefined);
  assert.equal(files().length, 1);
  passed('create package and photo together; storage keys stay private');
  const url = () => `${api.base}/packages/${id}/photo?v=${encodeURIComponent(version)}`;
  let response = await fetch(url());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'cross-origin');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), PNG);
  passed('public photo streams the stored bytes across portal origins');
  result = await call('PUT', `/admin/packages/${id}`, { form: form(values) });
  assert.equal(result.status, 401);
  const [[customer]] = await pool.query(
    'SELECT id, name, password_changed_at AS passwordChangedAt FROM customers LIMIT 1'
  );
  if (customer) {
    result = await call('PUT', `/admin/packages/${id}`, { token: tokenFor(customer, 'customer'), form: form(values) });
    assert.equal(result.status, 403);
  }
  assert.equal(files().length, 1);
  passed('anonymous and customer sessions cannot upload admin package photos');
  await call('PATCH', `/admin/packages/${id}/visibility`, { token: admin, body: { visible: false } });
  assert.equal((await fetch(url())).status, 404);
  assert.equal((await call('GET', `/admin/packages/${id}/photo`, { token: admin })).status, 200);
  passed('hidden photos are private to the admin');
  await call('PATCH', `/admin/packages/${id}/visibility`, { token: admin, body: { visible: true } });
  const oldVersion = version;
  result = await call('PUT', `/admin/packages/${id}`, {
    token: admin,
    form: form(values, Buffer.concat([PNG, Buffer.from('replacement')]))
  });
  assert.equal(result.status, 200);
  version = result.body.photoVersion;
  assert.notEqual(version, oldVersion);
  assert.equal(files().length, 1);
  assert.equal((await fetch(`${api.base}/packages/${id}/photo?v=${oldVersion}`)).status, 404);
  passed('replace photo, discard the old file and reject the stale version');
  result = await call('PUT', `/admin/packages/${id}`, {
    token: admin,
    form: form({ ...values, description: 'This edit must not save.' }, Buffer.from('<svg>not a photo</svg>'))
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.meta.field, 'photo');
  const unchanged = await call(
    'GET',
    `/packages/by-slug/${result.body.slug || values.name.toLowerCase().replaceAll(' ', '-')}`
  );
  assert.equal(unchanged.body.description, values.description);
  assert.equal(unchanged.body.photoVersion, version);
  passed('invalid photo leaves the package details and saved photo unchanged');
  const large = Buffer.alloc(20 * 1024 * 1024 + 1);
  PNG.copy(large);
  result = await call('PUT', `/admin/packages/${id}`, { token: admin, form: form(values, large) });
  assert.equal(result.status, 400);
  assert.equal(result.body.message, 'The file is larger than 20 MB.');
  assert.equal(files().length, 1);
  passed('over 20 MB rejected without storing a file');
  result = await call('PUT', `/admin/packages/${id}`, {
    token: admin,
    form: form(values, large.subarray(0, 20 * 1024 * 1024))
  });
  assert.equal(result.status, 200);
  version = result.body.photoVersion;
  assert.equal(files().length, 1);
  passed('exactly 20 MB accepted through the real package save route');
  await call('PATCH', `/admin/packages/${id}/archived`, { token: admin, body: { archived: true } });
  assert.equal((await fetch(url())).status, 404);
  assert.equal((await call('GET', `/admin/packages/${id}/photo`, { token: admin })).status, 200);
  passed('archived photos are unavailable to public browsing');
  result = await call('PUT', `/admin/packages/${id}`, { token: admin, body: { ...values, removePhoto: true } });
  assert.equal(result.status, 200);
  assert.equal(result.body.photoVersion, null);
  assert.equal(files().length, 0);
  assert.equal((await call('GET', `/admin/packages/${id}/photo`, { token: admin })).status, 404);
  passed('remove photo resets to the sample fallback and cleans stored file');
  result = await call('POST', '/admin/packages', { token: admin, body: { ...values, name: `${values.name} JSON` } });
  assert.equal(result.status, 201);
  ids.push(result.body.id);
  assert.equal(result.body.photoVersion, null);
  passed('existing JSON saves without a photo remain compatible');
  result = await call('POST', '/admin/packages', { token: admin, form: form({ ...values, removePhoto: true }) });
  assert.equal(result.status, 400);
  assert.equal(files().length, 0);
  passed('conflicting upload and remove request refused before any write');
  console.log(`${checks} package photo integration checks passed.`);
} finally {
  if (api) await api.stop();
  for (const id of ids) await pool.query('DELETE FROM packages WHERE id = ? AND name LIKE ?', [id, `${values.name}%`]);
  // Remove only files inside this check's dedicated storage directory.
  for (const file of files()) fs.unlinkSync(path.join(uploadDir, 'packages', file));
  await closePool();
  console.log('Temporary test packages and photos cleaned up. Existing packages unchanged.');
}
