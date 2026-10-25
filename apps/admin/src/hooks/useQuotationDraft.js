import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  quotationDraftKey,
  readQuotationDraft,
  removeQuotationDraft,
  writeQuotationDraft
} from '../lib/quotationDraft.js';

export function useQuotationDraft({ adminId, reservation, closed, initial }) {
  const key = quotationDraftKey(adminId, reservation.ref);
  const revision = JSON.stringify(reservation.quotation || null);
  const scope = JSON.stringify([key, revision, closed]);
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const storage = () => {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  };
  const restore = () => {
    const defaults = initialRef.current();
    return (!closed && readQuotationDraft(storage(), key, revision, defaults)) || defaults;
  };
  const [draft, setDraft] = useState(() => ({ scope, values: restore() }));
  const [saved, setSaved] = useState(false);

  useLayoutEffect(() => {
    if (draft.scope !== scope) {
      setSaved(false);
      setDraft({ scope, values: restore() });
    }
  }, [scope, draft.scope]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (draft.scope !== scope) return;
    if (closed || JSON.stringify(draft.values) === JSON.stringify(initialRef.current())) {
      removeQuotationDraft(storage(), key);
      setSaved(false);
    } else {
      setSaved(writeQuotationDraft(storage(), key, revision, draft.values));
    }
  }, [draft, scope, key, revision, closed]);

  return {
    values: draft.scope === scope ? draft.values : initial(),
    setValues: (updater) =>
      setDraft((current) => ({
        scope,
        values: typeof updater === 'function' ? updater(current.values) : updater
      })),
    draftSaved: saved,
    clearDraft: () => {
      removeQuotationDraft(storage(), key);
      setSaved(false);
    }
  };
}
