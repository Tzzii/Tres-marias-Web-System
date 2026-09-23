/**
 * App-wide events, shared by the browser store (store.js) and the API client (http.js):
 *   change      some record changed (a store write, another tab, or a successful API write);
 *               every live useResource reloads quietly, so badges and lists stay current.
 *   signed out  the API rejected the session token (401); the portal ends its session.
 * Kept apart from store.js so they outlive it: the store is removed in Phase 12.
 */

const changeListeners = new Set(); // functions to call whenever data changes
const signedOutListeners = new Set(); // functions to call when the API ends the session

/** Hooks sign up here to hear about data changes. Returns an unsubscribe function. */
export function subscribe(fn) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

/** Tell every listener that data changed. */
export function emitChange() {
  changeListeners.forEach((fn) => fn());
}

/** Listen for the API ending the session (expired or invalid token). Returns an unsubscribe function. */
export function onSignedOut(fn) {
  signedOutListeners.add(fn);
  return () => signedOutListeners.delete(fn);
}

/** Tell the portal the session is no longer valid, so it signs out and shows the login page. */
export function emitSignedOut() {
  signedOutListeners.forEach((fn) => fn());
}
