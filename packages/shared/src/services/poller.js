import { emitChange } from './events.js';
import { http } from './http.js';
import { getCalendar } from './remote/calendar.js';

/**
 * Change polling (docs/backend-development-phases.md Phase 7). While a portal is signed in,
 * it asks the server for the change stamp every 15 seconds (GET /api/changes: a number that moves on
 * every saved write), but only while the tab is visible, and at once when a hidden tab comes back into
 * view. When the stamp moved since the last answer, the availability map is reloaded first, then one
 * change event goes out, so every live page reloads quietly: a message, a booking or an approval made
 * in the other portal or on another device shows up within about 15 seconds, without a refresh.
 *
 * A failed ask (offline, the server restarting, the rate limit) is just tried again at the next tick,
 * and the first answer after it also reloads every live page once, so a page that could not load
 * meanwhile recovers by itself. An ended session is handled by http.js (UNAUTHENTICATED signs the
 * portal out). createAuth starts it on sign-in.
 */

const POLL_MS = 15 * 1000;

/** Start polling. Returns stop(), which ends it (on sign-out). */
export function startChangePolling() {
  let last = null; // the stamp of the last answer; null until the first one
  let asking = false; // an ask is on its way, so a slow answer never overlaps the next tick
  let missed = false; // the last ask failed: the next answer reloads the pages even if the stamp stayed
  let stopped = false;

  async function ask() {
    if (asking || stopped || document.visibilityState !== 'visible') return;
    asking = true;
    try {
      const { stamp } = await http.get('/changes');
      const moved = (last !== null && stamp !== last) || missed;
      last = stamp;
      missed = false;
      if (moved && !stopped) {
        await getCalendar().catch(() => {});
        emitChange();
      }
    } catch (e) {
      missed = true; // tried again at the next tick
    } finally {
      asking = false;
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible') ask();
  };
  const timer = setInterval(ask, POLL_MS);
  document.addEventListener('visibilitychange', onVisibility);
  ask();

  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
