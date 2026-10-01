/**
 * Error thrown by services. `code` is a machine-readable type (e.g. 'NOT_FOUND', 'LOCKED')
 * and `meta` carries extras such as { field: 'email' } so forms can show the error under the right input.
 * The API client (http.js) rebuilds it from the server's { code, message, meta }, and the services' own
 * checks before a call throw it too, so pages handle every error the same way.
 */
export class ApiError extends Error {
  constructor(code, message, meta = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.meta = meta;
  }
}
