import { apiUrl } from './http.js';

// Each signed-in tab has its own lease. Closing one tab keeps the others online.
export function startAdminPresence(token) {
  // getRandomValues also works on HTTP LAN development origins.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const clientId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  let sequence = 0;
  let stopped = false;
  const send = (active) => {
    sequence += 1;
    void fetch(apiUrl('/admin/presence'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, sequence, active }),
      keepalive: !active
    }).catch(() => {}); // An unreachable browser becomes offline when the server lease expires.
  };
  const heartbeat = () => {
    if (!stopped) send(true);
  };
  const hide = () => send(false);
  const show = () => heartbeat();
  heartbeat();
  const timer = setInterval(heartbeat, 25000);
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('pageshow', show);
    send(false);
  };
}
