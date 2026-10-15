import { useCallback, useEffect, useState } from 'react';
import { proofUrl } from '../services/remote/payment.js';

/** Load only this payment's protected upload, and release it on replacement or close. */
export function useReceiptProof(paymentId) {
  const [attempt, setAttempt] = useState(0);
  const [proof, setProof] = useState({ paymentId: null, status: 'idle', url: null });

  useEffect(() => {
    if (!paymentId) {
      setProof({ paymentId: null, status: 'idle', url: null });
      return undefined;
    }
    let active = true;
    let url = null;
    setProof({ paymentId, status: 'loading', url: null });
    proofUrl(paymentId)
      .then((loaded) => {
        url = loaded;
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        // Export stays disabled until the rendered image fires onLoad.
        setProof({ paymentId, status: 'loading', url });
      })
      .catch((error) => {
        if (active) setProof({ paymentId, status: error.code === 'NOT_FOUND' ? 'missing' : 'error', url: null });
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [paymentId, attempt]);

  const setStatus = useCallback(
    (status) => setProof((current) => (current.paymentId === paymentId ? { ...current, status } : current)),
    [paymentId]
  );
  const retry = useCallback(() => {
    setProof({ paymentId, status: 'loading', url: null });
    setAttempt((value) => value + 1);
  }, [paymentId]);

  const current = !paymentId
    ? { status: 'idle', url: null }
    : proof.paymentId === paymentId
      ? proof
      : { status: 'loading', url: null };
  return { ...current, retry, onLoad: () => setStatus('ready'), onError: () => setStatus('error') };
}
