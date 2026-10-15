import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { storage } from '../src/integrations/storage/index.js';
import { signToken } from '../src/lib/tokens.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

test('hero photo: admin uploads, public reads, validation, rollback, replacement and restore', async (t) => {
  let stored = { key: null, mime: null };
  let snapshot;
  let failSave = false;
  const files = new Map();
  const query = async (sql, values) => {
    if (sql.includes('FROM admins WHERE'))
      return [[{ name: 'Test Admin', password_changed_at: 0, session_id: 'hero-test-session' }]];
    if (sql.includes('FROM customers WHERE')) return [[{ name: 'Test Customer', password_changed_at: 0 }]];
    if (sql.startsWith('SELECT hero_photo_key')) return [[{ ...stored }]];
    if (sql.startsWith('UPDATE catalog_settings')) {
      if (failSave) throw new Error('Simulated database save failure');
      stored = { key: values[0], mime: values[1] };
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO counters')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected query: ${sql}`);
  };
  t.mock.method(pool, 'query', query);
  t.mock.method(pool, 'getConnection', async () => ({
    query,
    beginTransaction: async () => {
      snapshot = { ...stored };
    },
    commit: async () => {},
    rollback: async () => {
      stored = snapshot;
    },
    release() {}
  }));
  t.mock.method(storage, 'put', async (key, bytes) => {
    files.set(key, bytes);
    return key;
  });
  t.mock.method(storage, 'remove', async (key) => {
    files.delete(key);
  });
  t.mock.method(storage, 'stream', (key) => {
    const stream = Readable.from([files.get(key)]);
    queueMicrotask(() => stream.emit('open'));
    return stream;
  });
  const tokens = Object.fromEntries(
    ['admin', 'customer'].map((role) => [
      role,
      signToken(
        {
          id: `hero-test-${role}`,
          role,
          name: role,
          passwordChangedAt: 0,
          sessionId: role === 'admin' ? 'hero-test-session' : undefined
        },
        { expiresAt: Math.floor(Date.now() / 1000) + 3600 }
      )
    ])
  );
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (method, path, { role, bytes, type = 'image/png' } = {}) => {
    const body = bytes === undefined ? undefined : new FormData();
    if (body) body.append('photo', new Blob([bytes], { type }), 'hero.png');
    const response = await fetch(`${base}${path}`, {
      method,
      body,
      headers: role ? { Authorization: `Bearer ${tokens[role]}` } : {}
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  const publicPath = '/appearance';
  const adminPath = '/admin/appearance/hero-photo';
  const initial = await request('GET', publicPath);
  assert.equal(initial.status, 200);
  assert.deepEqual(initial.body, { heroPhotoVersion: null });
  assert.equal(initial.headers.get('cache-control'), 'no-store');
  assert.equal((await request('GET', `${publicPath}/hero-photo`)).status, 404);
  for (const method of ['PUT', 'DELETE']) {
    assert.equal((await request(method, adminPath, { bytes: method === 'PUT' ? PNG : undefined })).status, 401);
    assert.equal(
      (await request(method, adminPath, { role: 'customer', bytes: method === 'PUT' ? PNG : undefined })).status,
      403
    );
  }
  assert.equal(files.size, 0);
  assert.equal((await request('PUT', adminPath, { role: 'admin' })).status, 400);
  const saved = await request('PUT', adminPath, { role: 'admin', bytes: PNG });
  assert.equal(saved.status, 200);
  const firstVersion = saved.body.heroPhotoVersion;
  assert.ok(firstVersion);
  assert.deepEqual(Object.keys(saved.body), ['heroPhotoVersion']);
  assert.equal(files.size, 1);
  assert.deepEqual((await request('GET', publicPath)).body, saved.body);
  const photo = await fetch(`${base}${publicPath}/hero-photo?v=${encodeURIComponent(firstVersion)}`);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get('content-type'), 'image/png');
  assert.equal(photo.headers.get('cross-origin-resource-policy'), 'cross-origin');
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), PNG);
  for (const options of [
    { bytes: Buffer.from('<svg>invalid image</svg>') },
    { bytes: PNG, type: 'image/jpeg' },
    { bytes: PNG, type: 'image/svg+xml' },
    { bytes: Buffer.alloc(0) },
    { bytes: Buffer.alloc(20 * 1024 * 1024 + 1) }
  ]) {
    const rejected = await request('PUT', adminPath, { role: 'admin', ...options });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.meta.field, 'photo');
    assert.deepEqual((await request('GET', publicPath)).body, saved.body);
    assert.equal(files.size, 1);
  }
  failSave = true;
  assert.equal((await request('PUT', adminPath, { role: 'admin', bytes: PNG })).status, 500);
  assert.equal(files.size, 1, 'failed saves clean the new file and keep the saved image');
  assert.deepEqual((await request('GET', publicPath)).body, saved.body);
  failSave = false;
  const replacement = await request('PUT', adminPath, { role: 'admin', bytes: PNG });
  assert.equal(replacement.status, 200);
  assert.notEqual(replacement.body.heroPhotoVersion, firstVersion);
  assert.equal(files.size, 1, 'replacing cleans the previous file');
  assert.equal((await request('GET', `${publicPath}/hero-photo?v=${firstVersion}`)).status, 404);
  const atLimit = Buffer.alloc(20 * 1024 * 1024);
  PNG.copy(atLimit);
  assert.equal((await request('PUT', adminPath, { role: 'admin', bytes: atLimit })).status, 200);
  assert.equal(files.size, 1, 'exactly 20 MB is accepted and replaces the previous image');
  const restored = await request('DELETE', adminPath, { role: 'admin' });
  assert.equal(restored.status, 200);
  assert.deepEqual(restored.body, { heroPhotoVersion: null });
  assert.equal(files.size, 0);
  assert.equal((await request('GET', `${publicPath}/hero-photo`)).status, 404);
  assert.deepEqual((await request('GET', publicPath)).body, restored.body);
  assert.equal((await request('DELETE', adminPath, { role: 'admin' })).status, 200, 'restoring twice is safe');
});
