import { apiUrl, http } from '../http.js';

export const getAppearance = () => http.get('/appearance');

export function heroPhotoUrl(settings) {
  return settings?.heroPhotoVersion
    ? apiUrl(`/appearance/hero-photo?v=${encodeURIComponent(settings.heroPhotoVersion)}`)
    : null;
}

export function saveHeroPhoto(file) {
  const data = new FormData();
  data.append('photo', file);
  return http.put('/admin/appearance/hero-photo', data);
}

export const restoreHeroPhoto = () => http.delete('/admin/appearance/hero-photo');
