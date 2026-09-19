import { useEffect } from 'react';

/** Sets the browser tab title: "Page · Tres Marias <suffix>". */
export function useDocumentTitle(title, suffix = 'Tres Marias Catering') {
  useEffect(() => {
    document.title = title ? `${title} · ${suffix}` : suffix;
  }, [title, suffix]);
}
