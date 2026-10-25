import { randomUUID } from 'node:crypto';
import { referencePhotoProblem } from '@tm/shared/src/domain/referencePhoto.js';
import { ApiError } from '../../lib/ApiError.js';
import { storage } from '../../integrations/storage/index.js';
import { sniffPhoto } from '../../lib/photos.js';

const invalid = (message) => new ApiError('INVALID', message, { field: 'styling.referencePhoto' });

export function inspectReferencePhoto(file) {
  const buffer = file?.buffer;
  const problem = referencePhotoProblem({ size: buffer?.length, type: file?.mimetype });
  if (problem) throw invalid(problem);
  const { ext, mime } = sniffPhoto(buffer) || {};
  if (!ext || mime !== file.mimetype)
    throw invalid('That file is not a valid JPG, PNG or WebP photo. Choose another photo.');
  const name = String(file.originalname || `Reference photo.${ext}`)
    .toWellFormed()
    .split(/[\\/]/)
    .pop()
    .replace(/[\x00-\x1f\x7f]/g, '')
    .slice(0, 160);
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
  }).catch(() => {
    throw new ApiError('NOT_FOUND', 'The reference photo is missing.');
  });
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
