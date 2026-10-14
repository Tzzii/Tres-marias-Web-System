import multer from 'multer';
import { RULES } from '@tm/shared/src/services/config.js';

export function photoUpload(field) {
  const maxBytes = RULES.photoMaxMb * 1024 * 1024;
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
