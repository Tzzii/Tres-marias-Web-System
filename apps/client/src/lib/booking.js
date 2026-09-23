/**
 * The booking a visitor starts before signing in (package, date, start time,
 * guests, occasion) and the reservation form draft a signed-in customer is filling.
 *
 * The started booking is kept through sign-up / log-in in sessionStorage; drafts are kept per
 * customer in localStorage so they survive closing the tab.
 */

// Storage key for the booking picked before signing in
const INTENT_KEY = 'tm.client.bookingIntent';
// Each customer gets their own draft key
const draftKey = (customerId) => `tm.client.draft.${customerId}`;

/** Add new details to the saved booking and record the time. */
export function saveIntent(patch) {
  try {
    const next = { ...readIntent(), ...patch, savedAt: Date.now() };
    sessionStorage.setItem(INTENT_KEY, JSON.stringify(next));
    return next;
  } catch (e) {
    // Storage blocked (e.g. private browsing): just return the details without saving
    return patch;
  }
}

/** Read the saved booking, or null if there is none or it's older than a day. */
export function readIntent() {
  try {
    const intent = JSON.parse(sessionStorage.getItem(INTENT_KEY));
    // A booking started more than a day ago is too old to use
    if (intent && Date.now() - intent.savedAt < 86400000) return intent;
  } catch (e) {
    /* ignore */
  }
  return null;
}

/** Remove the saved booking (after it has been used). */
export function clearIntent() {
  try {
    sessionStorage.removeItem(INTENT_KEY);
  } catch (e) {
    /* ignore */
  }
}

/** Load this customer's unfinished reservation form, or null. */
export function readDraft(customerId) {
  try {
    return JSON.parse(localStorage.getItem(draftKey(customerId)));
  } catch (e) {
    return null;
  }
}

/** Save the reservation form so it can be continued later. Returns false if storage failed. */
export function saveDraft(customerId, form) {
  try {
    localStorage.setItem(draftKey(customerId), JSON.stringify({ form, savedAt: Date.now() }));
    return true;
  } catch (e) {
    return false;
  }
}

/** Delete the saved draft (after the reservation is submitted or discarded). */
export function clearDraft(customerId) {
  try {
    localStorage.removeItem(draftKey(customerId));
  } catch (e) {
    /* ignore */
  }
}
