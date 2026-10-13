import { randomUUID } from 'node:crypto';
import { referencePhotoProblem } from '@tm/shared/src/domain/referencePhoto.js';
import { ApiError } from '../../lib/ApiError.js';
import { storage } from '../../integrations/storage/index.js';

const invalid = (message) => new ApiError('INVALID', message, { field: 'styling.referencePhoto' });

export function inspectReferencePhoto(file) {
  const buffer = file?.buffer;
  const problem = referencePhotoProblem({ size: buffer?.length, type: file?.mimetype });
  if (problem) throw invalid(problem);
  let ext;
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ext = 'png';
  else if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) ext = 'jpg';
  else if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') ext = 'webp';
  const mime = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext];
  if (!ext || mime !== file.mimetype) throw invalid('That file is not a valid JPG, PNG or WebP photo. Choose another photo.');
  const name = String(file.originalname || `Reference photo.${ext}`).toWellFormed().split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g, '').slice(0, 160);
  return { name: name || `Reference photo.${ext}`, mime, size: buffer.length, ext };
}

export async function storeReferencePhoto(file) {
  const { ext, ...photo } = inspectReferencePhoto(file);
  const key = `styling/${randomUUID()}.${ext}`;
  await storage.put(key, file.buffer);
  return { ...photo, key };
}

export async function sendReferencePhoto(res, photo) {
  const stream = storage.stream(photo.key);
  await new Promise((resolve, reject) => {
    stream.once('open', resolve);
    stream.once('error', reject);
  }).catch(() => { throw new ApiError('NOT_FOUND', 'The reference photo is missing.'); });
  res.set({
    'Content-Type': photo.mime,
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(photo.name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store'
  });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}
