import { ApiError } from './errors.js';

const listeners = new Set();
const active = new Map();
let sequence = 0;
const publish = () => {
  const snapshot = [...active.values()];
  listeners.forEach((listener) => listener(snapshot));
};
export const subscribeUploads = (listener) => {
  listeners.add(listener);
  listener([...active.values()]);
  return () => listeners.delete(listener);
};

// XMLHttpRequest exposes real upload progress; JSON requests continue to use fetch.
export function sendMultipart(url, { method, headers, body }, Xhr = XMLHttpRequest) {
  return new Promise((resolve, reject) => {
    const xhr = new Xhr();
    const id = ++sequence;
    const cleanup = () => {
      active.delete(id);
      publish();
    };
    xhr.open(method, url);
    xhr.timeout = 120000;
    Object.entries(headers || {}).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    xhr.upload.onprogress = (event) => {
      active.set(id, { loaded: event.loaded, total: event.lengthComputable ? event.total : 0 });
      publish();
    };
    xhr.onload = () =>
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: async () => JSON.parse(xhr.responseText)
      });
    xhr.onerror = () =>
      reject(new ApiError('NETWORK', 'The upload could not reach the server. Check your connection and try again.'));
    xhr.ontimeout = () =>
      reject(
        new ApiError('NETWORK', 'The upload took too long. Try again with a smaller photo or a stronger connection.')
      );
    xhr.onabort = () => reject(new ApiError('NETWORK', 'The upload was interrupted. Please try again.'));
    xhr.onloadend = cleanup;
    active.set(id, { loaded: 0, total: 0 });
    publish();
    try {
      xhr.send(body);
    } catch {
      cleanup();
      reject(new ApiError('NETWORK', 'The upload could not start. Please try again.'));
    }
  });
}
