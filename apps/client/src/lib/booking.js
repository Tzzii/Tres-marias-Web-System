
const INTENT_KEY = 'tm.client.bookingIntent';
const draftKey = (customerId) => `tm.client.draft.${customerId}`;

export function saveIntent(patch) {
  try {
    const next = { ...readIntent(), ...patch, savedAt: Date.now() };
    sessionStorage.setItem(INTENT_KEY, JSON.stringify(next));
    return next;
  } catch (e) {
    return patch;
  }
}

export function readIntent() {
  try {
    const intent = JSON.parse(sessionStorage.getItem(INTENT_KEY));
    if (intent && Date.now() - intent.savedAt < 86400000) return intent;
  } catch (e) {
  }
  return null;
}

export function clearIntent() {
  try {
    sessionStorage.removeItem(INTENT_KEY);
  } catch (e) {
  }
}

export function readDraft(customerId) {
  try {
    return JSON.parse(localStorage.getItem(draftKey(customerId)));
  } catch (e) {
    return null;
  }
}

export function saveDraft(customerId, form) {
  try {
    localStorage.setItem(draftKey(customerId), JSON.stringify({ form, savedAt: Date.now() }));
    return true;
  } catch (e) {
    return false;
  }
}

export function clearDraft(customerId) {
  try {
    localStorage.removeItem(draftKey(customerId));
  } catch (e) {
  }
}
