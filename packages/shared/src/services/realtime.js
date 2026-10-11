import { io } from 'socket.io-client';
import { emitChange, emitSignedOut } from './events.js';
import { getCalendar } from './remote/calendar.js';
import { startChangePolling } from './poller.js';
import { createLiveRefresh } from './liveRefresh.js';

const BASE = String(import.meta.env?.VITE_API_URL || 'http://localhost:4000/api').replace(/\/+$/, '');
const AUTH_CODES = new Set(['UNAUTHENTICATED', 'SESSION_REPLACED']);

/** Signed-in portals receive read-only invalidations. Token never goes in URLs or logs. */
export function startRealtimeSync(token, { getToken = () => token, base = BASE, connect = io } = {}) {
  const endpoint = new URL(base, window.location.origin);
  const refresh = createLiveRefresh({
    loadCalendar: getCalendar,
    emit: emitChange,
    isVisible: () => document.visibilityState === 'visible' && getToken() === token
  });
  let stopped = false;
  let retryTimer = null;
  const socket = connect(endpoint.origin, {
    path: `${endpoint.pathname.replace(/\/+$/, '')}/realtime`,
    auth: { token },
    autoConnect: false,
    // Try a persistent WebSocket first. HTTP polling is available when a proxy blocks upgrades.
    transports: ['websocket', 'polling'],
    tryAllTransports: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 8000,
    forceNew: true,
    withCredentials: false
  });

  function retry() {
    if (stopped || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (!stopped && !socket.connected) socket.connect();
    }, 10000);
  }

  function ended({ code } = {}) {
    if (stopped || !AUTH_CODES.has(code)) return;
    stop();
    // A password update can save a new token before React cleans up this old connection.
    // An old socket must never sign out that replacement session.
    if (getToken() !== token) return;
    emitSignedOut(code);
  }

  socket.on('connect', () => {
    if (getToken() !== token) return stop();
    clearTimeout(retryTimer);
    retryTimer = null;
    refresh.request(); // a reconnect may have missed events: always fetch current state
  });
  socket.on('change', () => refresh.request());
  socket.on('session-ended', ended);
  socket.on('connect_error', (error) => {
    if (AUTH_CODES.has(error.data?.code)) ended(error.data);
    else retry(); // middleware rejection isn't automatically retried by Socket.IO
  });
  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') retry();
  });

  // Preserve the stamp check as a recovery path (including another API worker or a blocked proxy).
  const stopPolling = startChangePolling({ onChange: refresh.request });
  const resume = () => {
    if (stopped || document.visibilityState !== 'visible') return;
    refresh.request();
    if (!socket.connected) socket.connect();
  };
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('online', resume);
  socket.connect();

  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(retryTimer);
    stopPolling();
    refresh.stop();
    socket.removeAllListeners();
    socket.disconnect();
    document.removeEventListener('visibilitychange', resume);
    window.removeEventListener('online', resume);
  }
  return stop;
}
