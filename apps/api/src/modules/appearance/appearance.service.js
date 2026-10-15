import crypto from 'node:crypto';
import { pool, tx } from '../../db.js';
import { storage } from '../../integrations/storage/index.js';
import { ApiError } from '../../lib/ApiError.js';
import { readPhoto } from '../../lib/photos.js';

async function currentPhoto(db = pool, lock = false) {
  const [[row]] = await db.query(
    `SELECT hero_photo_key AS \`key\`, hero_photo_mime AS mime FROM catalog_settings WHERE id = 1${lock ? ' FOR UPDATE' : ''}`
  );
  if (!row) throw new Error('The catalog_settings row is missing. Run the database migration and seed setup.');
  return row;
}

const appearance = (photo) => ({ heroPhotoVersion: photo.key ? photo.key.split('/').pop() : null });

export async function getAppearance() {
  return appearance(await currentPhoto());
}

export async function saveHeroPhoto(file, { restore = false } = {}) {
  if (!restore && !file) throw new ApiError('INVALID', 'Choose a hero photo to upload.', { field: 'photo' });
  const type = restore ? null : readPhoto(file);
  let newKey;
  let oldKey;
  let saved;
  try {
    saved = await tx(async (conn) => {
      oldKey = (await currentPhoto(conn, true)).key;
      if (type) newKey = await storage.put(`hero/${crypto.randomUUID()}.${type.ext}`, file.buffer);
      await conn.query(
        'UPDATE catalog_settings SET hero_photo_key = ?, hero_photo_mime = ?, updated_at = ? WHERE id = 1',
        [newKey || null, type?.mime || null, Date.now()]
      );
      return appearance({ key: newKey });
    });
  } catch (error) {
    if (newKey) await storage.remove(newKey).catch(() => {});
    throw error;
  }
  if (oldKey) await storage.remove(oldKey).catch((error) => console.error('[hero-photo] Cleanup failed:', error.code));
  return saved;
}

export async function getHeroPhoto(version) {
  const photo = await currentPhoto();
  if (!photo.key || (version && version !== photo.key.split('/').pop())) {
    throw new ApiError('NOT_FOUND', 'This hero photo is no longer available.');
  }
  return photo;
}
