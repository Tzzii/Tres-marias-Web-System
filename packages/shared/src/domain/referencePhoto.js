import { RULES } from '../services/config.js';

export const REFERENCE_PHOTO_MAX_MB = RULES.photoMaxMb;
export const REFERENCE_PHOTO_MAX_BYTES = REFERENCE_PHOTO_MAX_MB * 1024 * 1024;
export const REFERENCE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function referencePhotoProblem({ size, type } = {}) {
  if (!REFERENCE_PHOTO_TYPES.includes(type)) return 'Choose a JPG, PNG or WebP reference photo.';
  if (!Number.isFinite(size) || size <= 0) return 'That photo is empty. Choose another photo.';
  if (size > REFERENCE_PHOTO_MAX_BYTES) return `Choose a reference photo up to ${REFERENCE_PHOTO_MAX_MB} MB.`;
  return null;
}

/** A photo in a locally saved booking draft, limited before it is decoded or rendered. */
export function cleanDraftReferencePhoto(value) {
  if (!value || typeof value.dataUrl !== 'string' || typeof value.name !== 'string') return null;
  if (value.dataUrl.length > Math.ceil(REFERENCE_PHOTO_MAX_BYTES / 3) * 4 + 64) return null;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value.dataUrl);
  if (!match || match[2].length % 4 !== 0) return null;
  const size = (match[2].length * 3) / 4 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
  if (referencePhotoProblem({ size, type: match[1] })) return null;
  return { name: value.name.slice(0, 160), dataUrl: value.dataUrl };
}

// Only metadata written by the server belongs in stored styling; never a URL or file path from a customer.
export function cleanReferencePhoto(value) {
  if (!value || typeof value !== 'object') return null;
  const match = /^styling\/[0-9a-f-]{36}\.(jpg|png|webp)$/.exec(value.key || '');
  const type = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[match?.[1]];
  if (!match || value.mime !== type || referencePhotoProblem({ size: value.size, type })) return null;
  return {
    key: value.key,
    name: typeof value.name === 'string' ? value.name.slice(0, 160) : 'Reference photo',
    mime: type,
    size: value.size
  };
}
