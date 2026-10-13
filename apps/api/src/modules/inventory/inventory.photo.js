import { getInventoryPhoto } from './inventory.service.js';
import { storage } from '../../integrations/storage/index.js';
import { ApiError } from '../../lib/ApiError.js';

export async function sendInventoryPhoto(req, res, admin = false) {
  const photo = await getInventoryPhoto(req.valid.params.id, { admin, version: req.query.v });
  const stream = storage.stream(photo.key);
  await new Promise((resolve, reject) => {
    stream.once('open', resolve);
    stream.once('error', reject);
  }).catch(() => { throw new ApiError('NOT_FOUND', 'This photo is no longer available.'); });
  res.set({
    'Content-Type': photo.mime,
    'Content-Disposition': 'inline',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'cross-origin'
  });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}
