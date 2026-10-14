import { ApiError, STATUS } from '../lib/ApiError.js';
import { config } from '../config.js';

const send = (res, status, code, message, meta = {}) => res.status(status).json({ code, message, meta });

export function notFound(req, res) {
  send(res, 404, 'NOT_FOUND', 'Not found.');
}

// eslint-disable-next-line no-unused-vars -- Express only treats a middleware with 4 arguments as an error handler
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof ApiError) {
    return send(res, STATUS[err.code] || 400, err.code, err.message, err.meta || {});
  }

  if (err.name === 'MulterError') {
    const field = err.field || 'proof';
    if (err.code === 'LIMIT_FILE_SIZE') {
      return send(res, 400, 'INVALID', `The file is larger than ${config.storage.maxUploadMb} MB.`, { field });
    }
    return send(res, 400, 'INVALID', 'The uploaded file could not be accepted.', { field });
  }

  if (err.type === 'entity.parse.failed') {
    return send(res, 400, 'INVALID', 'The request body is not valid JSON.');
  }
  if (err.type === 'entity.too.large') {
    return send(res, 413, 'INVALID', 'The request is too large.');
  }
  if (Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
    return send(res, err.status, 'INVALID', 'The request could not be read.');
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  return send(
    res,
    500,
    'SERVER_ERROR',
    'Something went wrong. Please try again.',
    config.isProduction ? {} : { detail: err.message }
  );
}
