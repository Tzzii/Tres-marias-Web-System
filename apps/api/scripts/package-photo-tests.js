import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { RULES } from '@tm/shared/src/services/config.js';
import { photoProblem } from '@tm/shared/src/domain/photos.js';
import { readPhoto } from '../src/lib/photos.js';
import { photoUpload } from '../src/middleware/photoUpload.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const maxBytes = RULES.photoMaxMb * 1024 * 1024;

test('all photo forms accept exactly 20 MB and reject larger or unsupported files', () => {
  assert.equal(RULES.photoMaxMb, 20);
  assert.equal(photoProblem({ type: 'image/png', size: maxBytes }), '');
  assert.match(photoProblem({ type: 'image/png', size: maxBytes + 1 }), /20 MB/);
  assert.match(photoProblem({ type: 'image/svg+xml', size: 100 }), /JPG, PNG or WebP/);
  assert.match(photoProblem({ type: 'image/jpeg', size: 0 }), /empty/);
});

test('server checks photo bytes and MIME rather than accepting renamed files', () => {
  assert.deepEqual(readPhoto({ mimetype: 'image/png', buffer: PNG }), { mime: 'image/png', ext: 'png' });
  for (const file of [
    { mimetype: 'image/png', buffer: Buffer.from('<svg><script/></svg>') },
    { mimetype: 'image/jpeg', buffer: PNG },
    { mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7') },
    { mimetype: 'image/png', buffer: Buffer.from([137, 80, 78, 71]) }
  ]) assert.throws(() => readPhoto(file), (err) => err.code === 'INVALID' && err.meta.field === 'photo');
});

test('multipart package photo parser enforces the inclusive limit and single photo field', async () => {
  const app = express();
  app.post('/', photoUpload('photo'), (req, res) => res.json({ bytes: req.file.buffer.length }));
  app.use((err, req, res, next) => res.status(400).json({ code: err.code, field: err.field }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    for (const size of [maxBytes - 1, maxBytes, maxBytes + 1]) {
      const form = new FormData();
      form.append('photo', new Blob([Buffer.alloc(size)], { type: 'image/png' }), 'photo.png');
      const response = await fetch(`http://127.0.0.1:${server.address().port}`, { method: 'POST', body: form });
      assert.equal(response.status, size <= maxBytes ? 200 : 400);
      const body = await response.json();
      if (size <= maxBytes) assert.equal(body.bytes, size);
      else assert.deepEqual(body, { code: 'LIMIT_FILE_SIZE', field: 'photo' });
    }
    const form = new FormData();
    form.append('unexpected', new Blob([PNG], { type: 'image/png' }), 'photo.png');
    const response = await fetch(`http://127.0.0.1:${server.address().port}`, { method: 'POST', body: form });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'LIMIT_UNEXPECTED_FILE');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
