/**
 * The error a service throws on purpose, e.g. new ApiError('INVALID_STATE', 'Only pending requests can be approved.').
 *
 * Same constructor as the frontend's ApiError (packages/shared/src/services/errors.js), which the API
 * client (services/http.js) rebuilds from the { code, message, meta } that middleware/errors.js sends:
 * the pages branch on `code`, never on the HTTP status, so a page and this file must spell a code the same.
 */
export class ApiError extends Error {
  constructor(code, message, meta = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.meta = meta; // extra detail for the page, e.g. { field: 'email' } or { lockedUntil }
  }
}

/**
 * HTTP status for each code (docs/backend-development-phases.md §7.4). A code missing here is sent as 400.
 * OVER_BALANCE and NO_QUOTATION are not in §7.4; like NO_CHANNEL they mean "not possible in the record's
 * current state", so they use 409. (NO_MOBILE, the forgot-password error for an account without a mobile
 * number, went away in Phase 12, when the reset code moved from SMS to email.)
 * OUT_OF_STOCK (Phase 6A): not enough pieces of a rental item free on the date; 409 like CAPACITY.
 * DELIVERY_FAILED (Phase 3): the email provider refused a one-time code, so the code never left; 502
 * like PAYMENT_PROVIDER, since another service failed, not the request.
 */
export const STATUS = Object.freeze({
  INVALID: 400,
  INVALID_CREDENTIALS: 401, INVALID_CODE: 401, UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_STATE: 409, NAME_TAKEN: 409, EMAIL_TAKEN: 409, IN_USE: 409,
  DATE_UNAVAILABLE: 409, TIME_UNAVAILABLE: 409, CAPACITY: 409, PENDING_PAYMENT: 409, NO_CHANNEL: 409,
  OVER_BALANCE: 409, NO_QUOTATION: 409, OUT_OF_STOCK: 409,
  CODE_EXPIRED: 410, CHALLENGE_EXPIRED: 410,
  TOO_SOON: 422,
  LOCKED: 423,
  RATE_LIMITED: 429,
  SERVER_ERROR: 500,
  PAYMENT_PROVIDER: 502, DELIVERY_FAILED: 502
});
