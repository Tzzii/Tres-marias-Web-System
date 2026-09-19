import { useEffect, useState } from 'react';

/**
 * Whole seconds left until `targetMs` (0 when past or null). Ticks every second.
 * The seconds are worked out on every render, so a new target shows the right number
 * straight away (not 0 for one render, which made pages think a new lockout had already ended).
 */
export function useCountdown(targetMs) {
  // Seconds between now and the target, rounded up, never below 0
  const compute = () => (targetMs ? Math.max(0, Math.ceil((targetMs - Date.now()) / 1000)) : 0);
  const [, setTick] = useState(0); // only used to re-render once per second

  // Restart the ticking whenever the target time changes
  useEffect(() => {
    if (!targetMs) return undefined;
    // Re-render once per second and stop at 0
    const timer = setInterval(() => {
      setTick((t) => t + 1);
      if (compute() <= 0) clearInterval(timer);
    }, 1000);
    // Stop the timer when the target changes or the component unmounts
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMs]);

  return compute();
}

/** Seconds -> "m:ss", e.g. 125 -> "2:05". */
export const formatCountdown = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
