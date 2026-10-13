import net from 'node:net';
import { Server } from 'socket.io';
import { ipKeyGenerator } from 'express-rate-limit';
import { config } from './config.js';
import { readSessionToken } from './middleware/auth.js';
import { onChange } from './modules/changes/changes.events.js';

export const REALTIME_PATH = '/api/realtime';
const AUTH_CODES = new Set(['UNAUTHENTICATED', 'SESSION_REPLACED']);

/**
 * Read-only change notifications. Data and mutations ALWAYS go through guarded HTTP routes.
 * Authentication is shared with HTTP, checked on connection, before each notification and every
 * 15 seconds while idle. There are no client-controlled rooms or client-to-server app handlers.
 * Dependency overrides let the security tests exercise real sockets without modifying a database.
 */
export function createRealtimeServer(
  server,
  {
    authenticate = readSessionToken,
    subscribe = onChange,
    origins = config.corsOrigins,
    authCheckMs = 15000,
    batchMs = 500,
    maxPerAccount = 8,
    maxConnections = 1000,
    maxAttempts = 60
  } = {}
) {
  const attempts = new Map();
  const counts = new Map();
  let closed = false;
  let checking = false;
  let pendingChange = false;
  let batchTimer = null;

  function clientAddress(req) {
    const peer = req.socket.remoteAddress || '';
    // Only our local production proxy is trusted. Ignore spoofed forwarded headers in development
    // or from non-loopback peers. Nginx appends the actual caller as the last forwarded address.
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer);
    const forwarded =
      config.isProduction && local
        ? String(req.headers['x-forwarded-for'] || '')
            .split(',')
            .at(-1)
            .trim()
        : '';
    return ipKeyGenerator(net.isIP(forwarded) ? forwarded : peer);
  }

  const io = new Server(server, {
    path: REALTIME_PATH,
    serveClient: false,
    cookie: false,
    connectTimeout: 5000,
    maxHttpBufferSize: 4096,
    perMessageDeflate: false,
    cors: { origin: origins, methods: ['GET', 'POST'], credentials: false },
    // WebSockets do not enforce browser CORS. Explicitly check Origin for both transports.
    allowRequest(req, done) {
      if (!origins.includes(req.headers.origin) || closed || io.engine.clientsCount >= maxConnections)
        return done(null, false);
      const address = clientAddress(req);
      const now = Date.now();
      let entry = attempts.get(address);
      if (!entry || entry.until <= now) {
        if (!entry && attempts.size >= 10000) return done(null, false);
        entry = { count: 0, until: now + 60000 };
        attempts.set(address, entry);
      }
      entry.count += 1;
      done(null, entry.count <= maxAttempts);
    }
  });

  // Enforce the allowlist on subsequent Engine.IO polling and upgrade requests too.
  io.engine.use((req, res, next) => {
    if (!origins.includes(req.headers.origin)) {
      res.writeHead(403);
      res.end();
      return;
    }
    next();
  });

  function authError(code) {
    const err = new Error('Connection refused.');
    err.data = { code }; // no database errors or token contents exposed
    return err;
  }

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string' || !token || token.length > 2048) return next(authError('UNAUTHENTICATED'));
      const { user, replaced } = await authenticate(token);
      if (replaced) return next(authError('SESSION_REPLACED'));
      if (!user || user.exp * 1000 <= Date.now()) return next(authError('UNAUTHENTICATED'));
      if (closed || socket.conn.readyState !== 'open') return next(authError('SERVER_ERROR'));
      const key = `${user.role}:${user.id}`;
      if ((counts.get(key) || 0) >= maxPerAccount) return next(authError('RATE_LIMITED'));
      counts.set(key, (counts.get(key) || 0) + 1);
      // Reserve synchronously after validation, and release even if the handshake is abandoned.
      socket.conn.once('close', () => {
        const count = (counts.get(key) || 1) - 1;
        if (count) counts.set(key, count);
        else counts.delete(key);
      });
      socket.data.token = token;
      socket.data.exp = user.exp;
      next();
    } catch {
      next(authError('SERVER_ERROR')); // fail closed on database errors; the browser can retry
    }
  });

  function endSession(socket, code) {
    if (!socket.connected) return;
    if (AUTH_CODES.has(code)) socket.emit('session-ended', { code });
    socket.disconnect(true);
  }

  io.on('connection', (socket) => {
    // Even a quiet connection ends at JWT expiry. The chunked timer supports long remember-me TTLs.
    let expiryTimer;
    function watchExpiry() {
      const remaining = socket.data.exp * 1000 - Date.now();
      if (remaining <= 0) return endSession(socket, 'UNAUTHENTICATED');
      expiryTimer = setTimeout(watchExpiry, Math.min(remaining, 2147483647));
      expiryTimer.unref();
    }
    watchExpiry();
    socket.once('disconnect', () => clearTimeout(expiryTimer));
    // A client cannot trigger broadcasts, impersonate an account, join a room or mutate data.
    socket.onAny(() => socket.disconnect(true));
  });

  function schedule() {
    if (closed || checking || batchTimer || !pendingChange) return;
    batchTimer = setTimeout(() => {
      batchTimer = null;
      void checkSessions(true);
    }, batchMs);
    batchTimer.unref();
  }

  async function checkSessions(notify = false) {
    if (closed || checking) return;
    checking = true;
    if (notify) pendingChange = false;
    // One lookup per token, even when the same signed-in account has multiple tabs.
    const groups = new Map();
    for (const socket of io.of('/').sockets.values()) {
      const group = groups.get(socket.data.token) || [];
      group.push(socket);
      groups.set(socket.data.token, group);
    }
    try {
      // Sequential lookups keep bursts bounded by the existing database connection pool.
      for (const [token, sockets] of groups) {
        try {
          const { user, replaced } = await authenticate(token);
          for (const socket of sockets) {
            if (closed || !socket.connected) continue;
            if (!user || replaced || user.exp * 1000 <= Date.now()) {
              endSession(socket, replaced ? 'SESSION_REPLACED' : 'UNAUTHENTICATED');
            } else if (notify) {
              socket.emit('change'); // deliberately NO payload: HTTP guards decide what can be read
            }
          }
        } catch {
          sockets.forEach((socket) => endSession(socket, 'SERVER_ERROR'));
        }
      }
    } finally {
      checking = false;
      schedule();
    }
  }

  const unsubscribe = subscribe(() => {
    pendingChange = true;
    schedule();
  });
  const authTimer = setInterval(() => void checkSessions(), authCheckMs);
  authTimer.unref();
  const pruneTimer = setInterval(() => {
    const now = Date.now();
    for (const [address, entry] of attempts) if (entry.until <= now) attempts.delete(address);
  }, 60000);
  pruneTimer.unref();

  return {
    io,
    close() {
      closed = true;
      unsubscribe();
      clearInterval(authTimer);
      clearInterval(pruneTimer);
      clearTimeout(batchTimer);
      return new Promise((resolve) => io.close(resolve));
    }
  };
}
