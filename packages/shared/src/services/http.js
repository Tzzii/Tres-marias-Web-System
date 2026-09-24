import { ApiError } from './errors.js';
import { emitChange, emitSignedOut } from './events.js';

/**
 * The API client used by the services' API versions (services/remote/*). Only services switched on
 * in VITE_API_SERVICES call it (see backend.js; `auth` since Phase 3); the rest use the browser store.
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

// Send the request; a failure to reach the server at all becomes a NETWORK error pages can show
async function send(path, options) {
  try {
    return await fetch(`${BASE}${path}`, options);
  } catch (e) {
    throw new ApiError('NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }
}

// 401 codes that mean a wrong password or code was typed into a form, not that the session is gone
const WRONG_ANSWER = ['INVALID_CREDENTIALS', 'INVALID_CODE'];

/**
 * Turn a failed response into the ApiError pages already handle. A 401 ends the session
 * (UNAUTHENTICATED: the token is missing, expired, edited, or older than a password change), except:
 * - a wrong password or code (INVALID_CREDENTIALS, INVALID_CODE): on the sign-in forms (/auth/…), and
 *   for the current password asked before a password, email or mobile change; the form shows it;
 * - when the session's token changed while the request was on its way (`sentToken` is the token the
 *   request carried): the 401 is about the old token, and the new one is still good.
 */
function failure(res, data, path, sentToken, fallback = { code: 'SERVER_ERROR', message: 'Something went wrong.' }) {
  const code = (data && data.code) || fallback.code;
  if (res.status === 401 && !path.startsWith('/auth/') && !WRONG_ANSWER.includes(code) && token() === sentToken) emitSignedOut();
  return new ApiError(code, (data && data.message) || fallback.message, (data && data.meta) || {});
}

/**
 * One call to the API. Errors come back as ApiError with the server's code, so pages keep
 * handling them exactly as they did with the browser store. Successful writes emit a change
 * event, which quietly reloads every live useResource on the page, unless `quiet` is set: the
 * caller then emits it itself when ready (e.g. after saving a renewed token, so the reloads
 * carry the new one). A 204 returns null.
 */
async function request(method, path, body, { quiet = false } = {}) {
  const sentToken = token();
  const headers = sentToken ? { Authorization: `Bearer ${sentToken}` } : {};
  // FormData (file uploads) sets its own multipart Content-Type; everything else is JSON
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

  const res = await send(path, { method, headers, body: isForm || body === undefined ? body : JSON.stringify(body) });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw failure(res, data, path, sentToken);
  if (method !== 'GET' && !quiet) emitChange();
  return data;
}

/**
 * GET / POST / PUT / PATCH / DELETE against the API, e.g. http.get('/calendar').
 * The writes take an optional last argument { quiet: true } to skip the automatic change event.
 */
export const http = {
  get: (path) => request('GET', path),
  post: (path, body = {}, options) => request('POST', path, body, options),
  put: (path, body = {}, options) => request('PUT', path, body, options),
  patch: (path, body = {}, options) => request('PATCH', path, body, options),
  delete: (path, options) => request('DELETE', path, undefined, options)
};

/**
 * GET a protected file (e.g. a payment proof) with the session token and return a local object URL
 * for <img> / <iframe>, since those tags cannot send the Authorization header themselves.
 * The caller revokes the URL (URL.revokeObjectURL) when it is no longer shown.
 */
export async function fetchFileUrl(path) {
  const sentToken = token();
  const res = await send(path, { headers: sentToken ? { Authorization: `Bearer ${sentToken}` } : {} });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw failure(res, data, path, sentToken, { code: 'NOT_FOUND', message: 'This file is not available.' });
  }
  return URL.createObjectURL(await res.blob());
}
