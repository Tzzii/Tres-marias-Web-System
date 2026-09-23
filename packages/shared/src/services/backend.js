/**
 * The service switchboard. VITE_API_SERVICES (in each app's .env.local) lists the services that
 * call the Express API instead of the browser store, e.g. "auth,catalog". Empty means the whole
 * app runs on the browser store, exactly as before. Each services/facade file asks here once, at startup.
 * Flip whole clusters only (docs/backend-development-phases.md §6.3) and keep both portals identical.
 */

// The names VITE_API_SERVICES can use, one per service
const SERVICES = ['auth', 'catalog', 'calendar', 'reservations', 'messages', 'payments', 'customers', 'feedback', 'inventory', 'outsource', 'reports'];

// Services switched to the API (import.meta.env is optional so this file also loads in Node)
const enabled = new Set(
  String(import.meta.env?.VITE_API_SERVICES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

// A misspelled name would silently leave that service on the browser store, so say so once at startup
enabled.forEach((name) => {
  if (!SERVICES.includes(name)) console.warn(`[backend] Unknown service "${name}" in VITE_API_SERVICES. Valid names: ${SERVICES.join(', ')}.`);
});

const warned = new Set(); // services already warned about, so each warning shows once

/** True when the service (e.g. 'reservations') is switched to the API. */
export const usesApi = (name) => enabled.has(name);

/**
 * The implementation a facade forwards to: `remote` (the API version) when the service is
 * switched on, otherwise `local` (the browser store). A service switched on before its API
 * version exists stays on the browser store with a warning, so an early flip never breaks the app.
 */
export function pickImpl(name, local, remote) {
  if (!usesApi(name)) return local;
  if (remote) return remote;
  if (!warned.has(name)) {
    warned.add(name);
    console.warn(`[backend] "${name}" is in VITE_API_SERVICES but has no API version yet (services/remote/); it stays on the browser store.`);
  }
  return local;
}
