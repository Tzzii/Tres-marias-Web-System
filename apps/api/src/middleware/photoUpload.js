import multer from 'multer';
import { RULES } from '@tm/shared/src/services/config.js';

/**
 * One photo, held in memory for the service to check its type before saving.
 * Mount behind the route's auth guard. Exactly 20 MB is accepted; larger files
 * produce the same field-specific error for receipts and other photo uploads.
 */
export function photoUpload(field) {
  const maxBytes = RULES.photoMaxMb * 1024 * 1024;
  // Multer signals its size limit at equality. Allow one extra byte in the parser
  // and check the buffer so the advertised maximum itself remains uploadable.
  const read = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes + 1, files: 1, fields: 10, parts: 12 }
  }).single(field);

  return (req, res, next) => {
    read(req, res, (err) => {
      if (err) return next(err);
      if (req.file && req.file.buffer.length > maxBytes) {
        return next(new multer.MulterError('LIMIT_FILE_SIZE', field));
      }
      return next();
    });
  };
}
