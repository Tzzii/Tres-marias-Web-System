const pending = new WeakMap();

/** Load Google's maintained SDK once; a blocked or failed download can be retried. */
export function loadGoogleIdentity({ windowObject = window, documentObject = document, timeoutMs = 15000 } = {}) {
  if (windowObject.google?.accounts?.id) return Promise.resolve(windowObject.google.accounts.id);
  if (pending.has(windowObject)) return pending.get(windowObject);
  const request = new Promise((resolve, reject) => {
    const script = documentObject.createElement('script');
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (error) {
        script.remove?.();
        reject(new Error('Google sign-in could not load. Please try again.'));
      } else resolve(windowObject.google.accounts.id);
    };
    const timer = setTimeout(() => finish(true), timeoutMs);
    script.src = 'https://accounts.google.com/gsi/client?hl=en';
    script.async = true;
    script.onload = () => finish(!windowObject.google?.accounts?.id);
    script.onerror = () => finish(true);
    documentObject.head.appendChild(script);
  });
  pending.set(windowObject, request);
  request.catch(() => {
    if (pending.get(windowObject) === request) pending.delete(windowObject);
  });
  return request;
}
