import { useEffect, useState } from 'react';

export function useColumnChoice(storageKey, options) {
  const [columns, setColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved && typeof saved === 'object')
        return Object.fromEntries(options.map(([key]) => [key, saved[key] !== false]));
    } catch (e) {
    }
    return Object.fromEntries(options.map(([key]) => [key, true]));
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(columns));
    } catch (e) {
    }
  }, [storageKey, columns]);

  return [columns, setColumns];
}
