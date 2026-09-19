import { buildSeed } from './seed.js';

/**
 * The front-end data store behind every service module.
 *
 * Services read and write through `read()` / `write()` and return deep copies,
 * the same way a JSON API would. When the Express backend is connected, each
 * service function's body becomes a fetch to its endpoint and this file goes away;
 * the pages do not change.
 */

// localStorage key holding all app data. v2: package IDs are English (pkg-gathering, pkg-wedding, ...).
// v3: no staff list or crew on reservations; chat messages use 'admin' instead of 'staff'.
// v4: reservation references are RES-YYYY-MMDD-NN (event date) instead of TM-YYYY-NNNN; the seed also includes the inventory.
// v5: the admin account uses emmamariaobet@gmail.com and 09515621060.
// v6: outsourcing partners and their contracts are part of the data.
// v7: feedback carries the per-part ratings and the admin's moderation state (published, featured, flagged, archived, read, reply).
// v8: packages are flat-priced equipment packages (price, guests, items); no dishes or menus. Reservations carry a food request,
//     add-ons have no fixed price, and quotations hold the admin's food, add-on and other-charge amounts.
// v9: each package lists the setup styles it can be booked with (`setups`).
// v10: demo customer Jherson Gabrial Tabra with every reservation, payment, chat and review situation.
// v11: one chat conversation per customer; each message can carry the `ref` of the reservation it is about.
// Data saved under an older key is ignored and the app starts again from the seed.
const STORAGE_KEY = 'tm.data.v11';
const DATA_VERSION = 11; // must match `version` in seed.js
const OLD_STORAGE_KEYS = ['tm.data.v1', 'tm.data.v2', 'tm.data.v3', 'tm.data.v4', 'tm.data.v5', 'tm.data.v6', 'tm.data.v7', 'tm.data.v8', 'tm.data.v9', 'tm.data.v10']; // removed on load so old data doesn't linger in the browser
const listeners = new Set(); // functions to call whenever data changes
let cache = null; // data kept in memory after the first load

/**
 * Get the data: from memory, else from localStorage, else build the starting data set.
 * Data from an old storage key is deleted first, and saved data with another version is replaced by the seed.
 */
function load() {
  if (cache) return cache;
  try {
    OLD_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === DATA_VERSION) {
        cache = parsed;
        return cache;
      }
    }
  } catch (e) {
    /* storage unavailable or corrupt: start from the seed */
  }
  cache = buildSeed();
  persist();
  return cache;
}

/** Save the in-memory data to localStorage. */
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (e) {
    /* private mode or quota: keep working in memory */
  }
}

/** Deep copy, so pages can't accidentally change stored data directly. */
export const clone = (value) => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

/** Read-only snapshot access for service functions. */
export function read() {
  return load();
}

/** Apply a mutation, persist it and notify subscribers. */
export function write(mutator) {
  const data = load();
  const result = mutator(data);
  persist();
  listeners.forEach((fn) => fn());
  return result;
}

/** Re-render hooks subscribe here so badges and lists stay current. */
export function subscribe(fn) {
  listeners.add(fn);
  // Returns an unsubscribe function
  return () => listeners.delete(fn);
}

// Another tab of the same portal changed the data: drop the cache and notify
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    cache = null;
    listeners.forEach((fn) => fn());
  });
}

/** Network-like latency so loading states behave as they will against the API. */
export const latency = (min = 180, max = 520) =>
  new Promise((resolve) => setTimeout(resolve, min + Math.random() * (max - min)));

/**
 * Error thrown by services. `code` is a machine-readable type (e.g. 'NOT_FOUND', 'LOCKED')
 * and `meta` carries extras such as { field: 'email' } so forms can show the error under the right input.
 */
export class ApiError extends Error {
  constructor(code, message, meta = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.meta = meta;
  }
}

/** Next sequential ID from a named counter, e.g. nextId(data, 'receipt', 'OR-') -> "OR-0042". */
export const nextId = (data, counter, prefix, width = 4) => {
  data.counters[counter] = (data.counters[counter] || 0) + 1;
  return `${prefix}${String(data.counters[counter]).padStart(width, '0')}`;
};

/**
 * Unique record ID: the prefix, the time in base 36 and four random characters, e.g. uid('m') -> "m-mfq2x9k1a7c3".
 * The random part keeps two records saved in the same millisecond from getting the same ID.
 */
export const uid = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`;
