import express from 'express';
import { storage } from '../../integrations/storage/index.js';
import { ApiError } from '../../lib/ApiError.js';
import { photoUpload } from '../../middleware/photoUpload.js';
import { getAppearance, getHeroPhoto, saveHeroPhoto } from './appearance.service.js';

export const appearanceRoutes = express.Router();
export const appearanceAdminRoutes = express.Router();

appearanceRoutes.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-store').json(await getAppearance());
});

appearanceRoutes.get('/hero-photo', async (req, res) => {
  const photo = await getHeroPhoto(req.query.v);
  const stream = storage.stream(photo.key);
  await new Promise((resolve, reject) => {
    stream.once('open', resolve);
    stream.once('error', reject);
  }).catch(() => {
    throw new ApiError('NOT_FOUND', 'This hero photo is no longer available.');
  });
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
});

appearanceAdminRoutes.put('/hero-photo', photoUpload('photo'), async (req, res) => {
  res.json(await saveHeroPhoto(req.file));
});

appearanceAdminRoutes.delete('/hero-photo', async (req, res) => {
  res.json(await saveHeroPhoto(null, { restore: true }));
});
