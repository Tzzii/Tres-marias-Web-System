/**
 * App-wide events, sent by the API client (http.js), the services and the change poller (poller.js):
 *   change         some record changed (a successful API write here, or a change the poller saw);
 *                  every live useResource reloads quietly, so badges and lists stay current.
 *   signed out     the API rejected the session token (401); the portal ends its session. Listeners get the
 *                  error code: SESSION_REPLACED when a newer admin sign-in replaced the session, so the
 *                  login page can say so; otherwise UNAUTHENTICATED (expired, edited, older than a password change).
 *   token renewed  the API replaced the session token (after the customer changed or reset their password
 *                  in My profile, every older token stops working); the portal saves the new one and stays signed in.
 * (Until Phase 12 the browser data store sent them too; it was removed then.)
 */

const changeListeners = new Set(); // functions to call whenever data changes
const signedOutListeners = new Set(); // functions to call when the API ends the session
const tokenListeners = new Set(); // functions to call with a replacement session token

/** Hooks sign up here to hear about data changes. Returns an unsubscribe function. */
export function subscribe(fn) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

/** Tell every listener that data changed. */
export function emitChange() {
  changeListeners.forEach((fn) => fn());
}

/** Listen for the API ending the session; `fn` gets the error code (see above). Returns an unsubscribe function. */
export function onSignedOut(fn) {
  signedOutListeners.add(fn);
  return () => signedOutListeners.delete(fn);
}

/** Tell the portal the session is no longer valid (`code`: the API's error code), so it signs out and shows the login page. */
export function emitSignedOut(code) {
  signedOutListeners.forEach((fn) => fn(code));
}

/** Listen for a replacement session token from the API. Returns an unsubscribe function. */
export function onTokenRenewed(fn) {
  tokenListeners.add(fn);
  return () => tokenListeners.delete(fn);
}

/**
 * Hand the portal a new token for the current session. The listener (createAuth) saves it before
 * this returns, so a request sent right after already carries the new token.
 */
export function emitTokenRenewed(token) {
  tokenListeners.forEach((fn) => fn(token));
}
