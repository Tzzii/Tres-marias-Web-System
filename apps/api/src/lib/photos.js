import { PHOTO_TYPES, photoProblem } from '@tm/shared/src/domain/photos.js';
import { ApiError } from './ApiError.js';

/** Identify supported raster files from their bytes, independently of each upload's field rules. */
export function sniffPhoto(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  let type;
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    type = { mime: 'image/jpeg', ext: 'jpg' };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    type = { mime: 'image/png', ext: 'png' };
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP')
    type = { mime: 'image/webp', ext: 'webp' };
  return type || null;
}

export function readPhoto(file) {
  const buffer = file?.buffer;
  const problem = photoProblem({ type: file?.mimetype, size: buffer?.length || 0 });
  if (problem) throw new ApiError('INVALID', problem, { field: 'photo' });
  const type = sniffPhoto(buffer);
  if (!type || !PHOTO_TYPES.includes(type.mime) || type.mime !== file.mimetype) {
    throw new ApiError('INVALID', 'Choose a valid JPG, PNG or WebP photo.', { field: 'photo' });
  }
  return type;
}
