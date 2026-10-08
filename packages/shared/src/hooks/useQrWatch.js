import { useEffect, useRef, useState } from 'react';
import { QR_GRACE_MS } from '../domain/payment.js';

// After a QR's grace ends, wait this much more before asking the server (its own check comes first)
const SETTLE_DELAY_MS = 3000;
// A QR still pending after its grace (PayMongo could not be reached): ask again this often
const RETRY_MS = 60 * 1000;

/**
 * Keeps a page's QR Ph codes (Phase 8B) up to date while it is open, for lists that show where each
 * code stands (QrStatusChip). `qrs` is the page's list ([{ id, status, expiresAt }]); `reload` loads it
 * again quietly (useResource's reload).
 *
 * - When a waiting QR's time runs out, the page renders again, so its chip turns from "Waiting for
 *   payment" to "Checking payment" without a reload.
 * - When its grace ends (QR_GRACE_MS), `reload` is called: reading the list makes the server check the
 *   code with PayMongo and record it as paid or expired, and the change reaches every open page.
 * - A QR still pending after that is asked about again every minute.
 * Nothing runs while no QR is pending. Only one timer at a time: the next moment anything changes.
 */
export function useQrWatch(qrs, reload) {
  const [tick, setTick] = useState(0);
  // Always the latest reload (useResource gives a new function on every render)
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  // The pending QRs and their times, as text, so a reload with the same answer keeps the same timer
  const pending = (qrs || []).filter((qr) => qr.status === 'pending');
  const key = pending.map((qr) => `${qr.id}:${qr.expiresAt}`).join(',');

  useEffect(() => {
    if (!pending.length) return undefined;
    const at = Date.now();
    // The moments still ahead: a QR's time running out (render again) and its grace ending (ask the server)
    const ends = pending.map((qr) => qr.expiresAt).filter((t) => t > at);
    const settles = pending.map((qr) => qr.expiresAt + QR_GRACE_MS + SETTLE_DELAY_MS).filter((t) => t > at);
    // A QR already past its grace and still pending: ask again in a minute
    const overdue = settles.length < pending.length;
    const next = Math.min(...ends, ...settles, ...(overdue ? [at + RETRY_MS] : []));
    if (!Number.isFinite(next)) return undefined;
    const timer = setTimeout(() => {
      // Past a grace (or the retry minute): ask the server; a time running out only needs a render
      if (!ends.includes(next)) reloadRef.current();
      setTick((t) => t + 1);
    }, next - at);
    return () => clearTimeout(timer);
    // `pending` is described by `key`; `tick` starts the next timer after each one fires
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
}
