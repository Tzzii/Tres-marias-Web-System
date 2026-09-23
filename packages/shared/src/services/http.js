import { ApiError } from './errors.js';
import { emitChange, emitSignedOut } from './events.js';

/**
 * The API client used by the services' API versions (services/remote/*). Nothing calls it until
 * a service is switched on in VITE_API_SERVICES (see backend.js); until then the browser store answers.
 */

// Where the API lives, from each app's .env.local; without a trailing slash so paths join cleanly
const BASE = String(import.meta.env?.VITE_API_URL || 'http://localhost:4000/api').replace(/\/+$/, '');
// Session keys written by apps/admin/src/auth.js and apps/client/src/auth.js
const SESSION_KEYS = ['tm.admin.session', 'tm.client.session'];

// The token of whichever portal is running (each portal runs on its own origin, so only its own key exists).
// Checks sessionStorage first, then localStorage ("Remember me"), the same order as createAuth.
function token() {
  for (const key of SESSION_KEYS) {
    try {
      const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
      const session = raw ? JSON.parse(raw) : null;
      if (session && session.token) return session.token;
    } catch (e) {
      /* storage unavailable or a damaged session: try the next key */
    }
  }
  return null;
}

// Authorization header for the current session, or none when signed out
function authHeaders() {
  const auth = token();
  return auth ? { Authorization: `Bearer ${auth}` } : {};
}

// Send the request; a failure to reach the server at all becomes a NETWORK error pages can show
async function send(path, options) {
  try {
    return await fetch(`${BASE}${path}`, options);
  } catch (e) {
    throw new ApiError('NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }
}

// Turn a failed response into the ApiError pages already handle. A 401 anywhere except the
// sign-in forms (/auth/…, where it means a wrong password or code) ends the session.
function failure(res, data, path, fallback = { code: 'SERVER_ERROR', message: 'Something went wrong.' }) {
  if (res.status === 401 && !path.startsWith('/auth/')) emitSignedOut();
  return new ApiError((data && data.code) || fallback.code, (data && data.message) || fallback.message, (data && data.meta) || {});
}

/**
 * One call to the API. Errors come back as ApiError with the server's code, so pages keep
 * handling them exactly as they did with the browser store. Successful writes emit a change
 * event, which quietly reloads every live useResource on the page. A 204 returns null.
 */
async function request(method, path, body) {
  const headers = authHeaders();
  // FormData (file uploads) sets its own multipart Content-Type; everything else is JSON
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

  const res = await send(path, { method, headers, body: isForm || body === undefined ? body : JSON.stringify(body) });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw failure(res, data, path);
  if (method !== 'GET') emitChange();
  return data;
}

/** GET / POST / PUT / PATCH / DELETE against the API, e.g. http.get('/calendar'). */
export const http = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
  put: (path, body = {}) => request('PUT', path, body),
  patch: (path, body = {}) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path)
};

/**
 * GET a protected file (e.g. a payment proof) with the session token and return a local object URL
 * for <img> / <iframe>, since those tags cannot send the Authorization header themselves.
 * The caller revokes the URL (URL.revokeObjectURL) when it is no longer shown.
 */
export async function fetchFileUrl(path) {
  const res = await send(path, { headers: authHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw failure(res, data, path, { code: 'NOT_FOUND', message: 'This file is not available.' });
  }
  return URL.createObjectURL(await res.blob());
}
