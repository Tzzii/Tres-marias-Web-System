import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribe } from '../services/events.js';

/**
 * Loads data from a service call and keeps it fresh.
 *
 * - `loading` is true only for the first load (and after `deps` change), so a
 *   background refresh never flashes a spinner over content already on screen.
 * - When any record changes (this tab or another), the loader re-runs quietly.
 */
export function useResource(loader, deps = [], { live = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  // Always call the latest loader function (it may use new props) without re-creating `run`
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  // Counts requests so an older, slower response can't overwrite a newer one
  const requestRef = useRef(0);

  // Run the loader. quiet = true refreshes in the background without showing loading state.
  const run = useCallback((quiet) => {
    const request = ++requestRef.current;
    if (!quiet) setState((s) => ({ ...s, loading: true, error: null }));
    return Promise.resolve()
      .then(() => loaderRef.current())
      .then((data) => {
        // Ignore the result if a newer request has started since
        if (request === requestRef.current) setState({ data, error: null, loading: false });
        return data;
      })
      .catch((error) => {
        // On a quiet refresh, keep showing the old data alongside the error
        if (request === requestRef.current) setState((s) => ({ data: quiet ? s.data : null, error, loading: false }));
      });
  }, []);

  // Load on mount and again whenever `deps` change
  useEffect(() => {
    run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Live mode: reload quietly on every change event (a browser-store write, another tab, or an API write)
  useEffect(() => {
    if (!live) return undefined;
    return subscribe(() => run(true));
  }, [live, run]);

  // Replace or update the data locally without calling the loader
  const setData = useCallback((updater) => {
    setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater }));
  }, []);

  return { ...state, reload: () => run(true), setData };
}

/** Re-renders the caller on every change event, like live useResource (for functions that return data right away, such as availabilitySnapshot). */
export function useStoreVersion() {
  const [version, setVersion] = useState(0);
  useEffect(() => subscribe(() => setVersion((v) => v + 1)), []);
  return version;
}
