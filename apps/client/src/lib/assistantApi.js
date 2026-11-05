import { apiUrl } from '../../../../packages/shared/src/services/http.js';
import { emitSignedOut } from '../../../../packages/shared/src/services/events.js';

const VISITOR_KEY = 'tm.assistant.visitor';
const GUEST_CONVERSATION = 'tm.assistant.guestConversation';
let memoryVisitor = '';
const stored = (key, session = false) => {
  try {
    return (session ? sessionStorage : localStorage).getItem(key) || '';
  } catch {
    return '';
  }
};
const save = (key, value, session = false) => {
  try {
    (session ? sessionStorage : localStorage).setItem(key, value);
  } catch {
    /* Browser storage may be disabled. */
  }
};
const forget = (key) => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* No storage. */
  }
};
const sessionToken = () => {
  try {
    return JSON.parse(stored('tm.client.session', true) || stored('tm.client.session') || 'null')?.token || '';
  } catch {
    return '';
  }
};

export function createAssistantApi({
  fetcher = (...args) => fetch(...args),
  base = apiUrl('/assistant'),
  getToken = sessionToken,
  getVisitor = () => stored(VISITOR_KEY) || memoryVisitor
} = {}) {
  async function request(path, { body, signal, binary = false } = {}) {
    const token = getToken();
    const visitor = getVisitor();
    const headers = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(visitor ? { 'X-Assistant-Visitor': visitor } : {})
    };
    const form = typeof FormData !== 'undefined' && body instanceof FormData;
    if (body !== undefined && !form) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetcher(`${base}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers,
        body: form ? body : body === undefined ? undefined : JSON.stringify(body),
        signal
      });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error('Cannot reach the assistant. Your question has been kept so you can retry.');
    }
    if (response.ok && binary) return response.blob();
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401 && token && getToken() === token) emitSignedOut(result?.code || 'UNAUTHENTICATED');
      const error = new Error(result?.message || 'The assistant is temporarily unavailable. Please try again later.');
      error.code = result?.code;
      error.meta = result?.meta;
      throw error;
    }
    return result;
  }
  return {
    config: (signal) => request('/config', { signal }),
    async open(customerId, signal) {
      const key = customerId ? `tm.assistant.conversation.${customerId}` : GUEST_CONVERSATION;
      const prior = customerId ? stored(GUEST_CONVERSATION) || stored(key) : stored(key);
      let result;
      try {
        result = await request('/session', { body: prior ? { conversationId: prior } : {}, signal });
      } catch (error) {
        if (error.code !== 'NOT_FOUND' || !prior) throw error;
        result = await request('/session', { body: {}, signal });
      }
      if (result.visitorToken) {
        memoryVisitor = result.visitorToken;
        save(VISITOR_KEY, result.visitorToken);
      }
      save(key, result.conversationId);
      if (customerId) forget(GUEST_CONVERSATION);
      return result;
    },
    read: (id, signal) => request(`/conversations/${id}`, { signal }),
    async newReservation(customerId, signal) {
      const result = await request('/session', { body: { fresh: true }, signal });
      if (result.visitorToken) {
        memoryVisitor = result.visitorToken;
        save(VISITOR_KEY, result.visitorToken);
      }
      save(customerId ? `tm.assistant.conversation.${customerId}` : GUEST_CONVERSATION, result.conversationId);
      return result;
    },
    uploadPhotos: (id, files, revision, signal) => {
      const body = new FormData();
      body.append('revision', String(revision));
      for (const file of files) body.append('photos', file, file.name);
      return request(`/conversations/${id}/reference-photos?revision=${encodeURIComponent(revision)}`, {
        body,
        signal
      });
    },
    removePhoto: (id, index, revision, signal) =>
      request(`/conversations/${id}/reference-photos/remove`, { body: { index, revision }, signal }),
    photo: (id, index, signal) => request(`/conversations/${id}/reference-photos/${index}`, { signal, binary: true }),
    scheduleOptions: (id, { days = 14, weekendsOnly = false } = {}, signal) =>
      request(`/conversations/${id}/schedule-options`, { body: { days, weekendsOnly }, signal }),
    submitBooking: (id, { revision, agreeTerms, confirmSubmission }, signal) =>
      request(`/conversations/${id}/submit`, { body: { revision, agreeTerms, confirmSubmission }, signal }),
    resumeBooking: (id, form, revision, signal) => {
      const fields = [
        'packageId',
        'packageProposalRef',
        'serviceType',
        'eventName',
        'occasion',
        'occasionOther',
        'date',
        'startTime',
        'endTime',
        'guests',
        'menu',
        'foodNotes',
        'styling',
        'venueName',
        'venueAddress',
        'city',
        'accessNotes',
        'addonIds',
        'addonQty',
        'fulfilment',
        'rentalQty'
      ];
      const clean = Object.fromEntries(fields.filter((key) => Object.hasOwn(form, key)).map((key) => [key, form[key]]));
      if (form.budgetDraft)
        clean.budgetDraft = { amount: form.budgetDraft.amount, preferences: form.budgetDraft.preferences };
      if (clean.styling) {
        const { theme, themeOther, colors, notes } = clean.styling;
        clean.styling = { theme, themeOther, colors, notes };
      }
      return request(`/conversations/${id}/resume-booking`, { body: { form: clean, revision }, signal });
    },
    validateBooking: (id, draft, revision, signal) =>
      request(`/conversations/${id}/booking-draft`, { body: { draft, revision }, signal }),
    selectPackageProposal: (id, packageProposalRef, revision, signal) =>
      request(`/conversations/${id}/package-proposal-selection`, { body: { revision, packageProposalRef }, signal }),
    send: (id, body, signal) => request(`/conversations/${id}/messages`, { body, signal }),
    transcribe: (id, blob, signal) => {
      const body = new FormData();
      body.append('audio', blob, 'question.wav');
      return request(`/conversations/${id}/transcriptions`, { body, signal });
    },
    speech: (id, messageId, signal) =>
      request(`/conversations/${id}/messages/${messageId}/speech`, { body: {}, signal, binary: true })
  };
}

export const assistantApi = createAssistantApi();

// Signed-in customers can keep editing structured plans while paid assistance is unavailable.
export const canOpenAssistantSession = (config, customerId) => Boolean(config?.available || customerId);

export function readAssistantDraft(customerId) {
  try {
    return JSON.parse(stored(`tm.assistant.draft.${customerId || 'guest'}`, true) || 'null');
  } catch {
    return null;
  }
}
export function saveAssistantDraft(customerId, draft) {
  save(`tm.assistant.draft.${customerId || 'guest'}`, JSON.stringify(draft), true);
}

/** Keep synchronous storage off the typing path; flush before sending or leaving the chat. */
export function createAssistantDraftWriter(
  customerId,
  { persist = saveAssistantDraft, schedule = setTimeout, cancel = clearTimeout, delay = 250 } = {}
) {
  let timer = null;
  let pending;
  let queued = false;
  const flush = () => {
    if (timer !== null) cancel(timer);
    timer = null;
    if (!queued) return;
    queued = false;
    persist(customerId, pending);
  };
  return {
    schedule(draft) {
      if (timer !== null) cancel(timer);
      pending = draft;
      queued = true;
      timer = schedule(flush, delay);
    },
    write(draft) {
      pending = draft;
      queued = true;
      flush();
    },
    flush
  };
}
export function takeGuestAssistantDraft() {
  const draft = readAssistantDraft();
  try {
    sessionStorage.removeItem('tm.assistant.draft.guest');
  } catch {
    /* No storage. */
  }
  return draft;
}
