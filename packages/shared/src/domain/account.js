/**
 * Account rules that need no stored data: how an email, a mobile number and a full name are
 * cleaned before they are compared or saved, the full-name check of the profile forms, and the
 * short device label shown in the admin's sign-in activity.
 *
 * Pure (no store.js, no localStorage, no React), so the browser service (authService.js) and the
 * API server (apps/api/src/modules/auth) apply the same rules with the same messages
 * (docs/backend-development-phases.md §7.8). Format checks (validateEmail, validateMobile,
 * validatePassword, validateAdminPassword) live in utils/validation.js and are shared the same way.
 */

/** An email as it is stored and compared: no surrounding spaces, lower case. */
export const normaliseEmail = (email) => String(email || '').trim().toLowerCase();

/** A mobile number as it is stored: spaces and dashes removed ("0917-123 4567" -> "09171234567"). */
export const cleanMobile = (mobile) => String(mobile || '').replace(/[\s-]/g, '');

/** A full name as it is stored: no surrounding spaces and one space between words. */
export const cleanName = (name) => String(name || '').trim().replace(/\s+/g, ' ');

/**
 * What is wrong with a cleaned full name, or '' when it is fine: it is required, needs a first and
 * a last name (two words or more), and may not be longer than `max` characters when a limit is
 * given (the admin's name is limited to 80).
 */
export function fullNameProblem(clean, max) {
  if (!clean) return 'Full name is required.';
  if (clean.split(' ').length < 2) return 'Enter your first and last name.';
  if (max && clean.length > max) return `Use ${max} characters or fewer.`;
  return '';
}

/**
 * Browser and system from a User-Agent string, e.g. "Chrome · Windows", for the admin's sign-in
 * activity. The browser passes navigator.userAgent; the API passes the request's User-Agent header.
 * Edge and Opera are checked before Chrome because their user agents also contain "Chrome/".
 */
export function describeDevice(userAgent = '') {
  const ua = String(userAgent || '');
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const system = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown system';
  return `${browser} · ${system}`;
}
