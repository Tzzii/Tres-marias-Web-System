import { useEffect, useState } from 'react';

/**
 * Which optional table columns are shown ("Filter columns"), remembered in this browser under `storageKey`.
 * `options` is the list of optional columns as [key, label]. Every column is shown when nothing is saved
 * or storage is blocked. Returns [columns, setColumns], where columns is e.g. { category: true, total: false }.
 */
export function useColumnChoice(storageKey, options) {
  const [columns, setColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved && typeof saved === 'object') return Object.fromEntries(options.map(([key]) => [key, saved[key] !== false]));
    } catch (e) {
      /* storage unavailable: use the default */
    }
    return Object.fromEntries(options.map(([key]) => [key, true]));
  });

  // Remember the choice in this browser
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(columns));
    } catch (e) {
      /* storage unavailable: the choice lasts until the page closes */
    }
  }, [storageKey, columns]);

  return [columns, setColumns];
}
