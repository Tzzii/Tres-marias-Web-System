import { ApiError, STATUS } from '../lib/ApiError.js';
import { config } from '../config.js';

// Send one error in the shape every page expects
const send = (res, status, code, message, meta = {}) => res.status(status).json({ code, message, meta });

/** Unknown URL or method: a 404 in the same { code, message, meta } shape as every other error. */
export function notFound(req, res) {
  send(res, 404, 'NOT_FOUND', 'Not found.');
}

/**
 * Last middleware: turns anything thrown or passed to next(err) into { code, message, meta },
 * so the frontend's http client can rebuild the same ApiError the local services throw.
 *
 * - ApiError keeps its code, message and meta; the status comes from STATUS (400 when unlisted).
 * - Upload (multer) and body-parser failures are the client's fault: 4xx with code INVALID.
 * - Anything else is a bug: logged here with its stack, answered with a generic 500 SERVER_ERROR.
 *   No stack or SQL ever reaches the browser; in development meta.detail carries err.message.
 * - If the response already started, Express's own handler closes the connection.
 */
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
  // Other request errors from Express/body-parser (unsupported charset, aborted upload…) carry a 4xx status
  if (Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
    return send(res, err.status, 'INVALID', 'The request could not be read.');
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  return send(res, 500, 'SERVER_ERROR', 'Something went wrong. Please try again.',
    config.isProduction ? {} : { detail: err.message });
}
