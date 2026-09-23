/**
 * Error thrown by services. `code` is a machine-readable type (e.g. 'NOT_FOUND', 'LOCKED')
 * and `meta` carries extras such as { field: 'email' } so forms can show the error under the right input.
 * The browser store and the API client (http.js) both throw it, so pages handle errors the same way on either.
 */
export class ApiError extends Error {
  constructor(code, message, meta = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.meta = meta;
  }
}
