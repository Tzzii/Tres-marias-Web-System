import { RULES } from '../services/config.js';

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PHOTO_ACCEPT = PHOTO_TYPES.join(',');

/** Shared form checks; the server additionally checks the actual bytes. */
export function photoProblem(file) {
  if (!file || !PHOTO_TYPES.includes(file.type)) return 'Choose a JPG, PNG or WebP photo.';
  if (file.size > RULES.photoMaxMb * 1024 * 1024) return `The file is larger than ${RULES.photoMaxMb} MB.`;
  if (!file.size) return 'Choose a photo that is not empty.';
  return '';
}
