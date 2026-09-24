import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { RULES } from '../services/config.js';
import { onSignedOut, onTokenRenewed } from '../services/events.js';

/**
 * Builds the session layer for one portal. Each portal gets its own storage key,
 * so a customer session and a staff session never mix.
 *
 * - "Remember me" keeps the session in localStorage; otherwise it lives in
 *   sessionStorage and ends when the browser tab closes.
 * - Sessions end after RULES.idleMinutes without activity.
 * - With the API (VITE_API_SERVICES includes "auth"), the session also ends when the server rejects
 *   its token (expired, edited, or older than a password change): the login page then says why
 *   (?reason=expired). A token the server replaces (after a customer's password change) is saved here.
 * - <RequireAuth> sends signed-out visitors to the login page and brings them
 *   back to where they were going afterwards.
 * - `idlePath` (optional): where an idle timeout lands instead of the login page.
 */
export function createAuth({ storageKey, loginPath, idlePath = loginPath }) {
  // Shares the session with every component inside AuthProvider
  const AuthContext = createContext(null);

  // Find a saved session: check sessionStorage first, then localStorage ("Remember me")
  const readSession = () => {
    for (const store of [sessionStorage, localStorage]) {
      try {
        const raw = store.getItem(storageKey);
        if (!raw) continue;
        const session = JSON.parse(raw);
        if (session && session.token && session.user) return { ...session, persistent: store === localStorage };
      } catch (e) {
        /* ignore unreadable storage */
      }
    }
    return null;
  };

  // Remove the session from both storages
  const clearSession = () => {
    try {
      sessionStorage.removeItem(storageKey);
      localStorage.removeItem(storageKey);
    } catch (e) {
      /* ignore */
    }
  };

  // True when the last activity was longer ago than the idle limit
  const isExpired = (session) => session && session.lastActivity && Date.now() - session.lastActivity > RULES.idleMinutes * 60000;

  /** Holds the current session and provides signIn / signOut / updateUser to the app. */
  function AuthProvider({ children }) {
    // Start with the saved session, unless it already timed out (e.g. the tab was reopened after the idle limit)
    const [initial] = useState(() => {
      const existing = readSession();
      if (existing && isExpired(existing)) {
        clearSession();
        return { session: null, endReason: 'idle' };
      }
      return { session: existing, endReason: null };
    });
    const [session, setSession] = useState(initial.session);
    const [endReason, setEndReason] = useState(initial.endReason); // why the session ended ('idle', 'signed_out', 'expired')
    const lastWrite = useRef(0); // time activity was last saved

    // Save the session to localStorage (remember me) or sessionStorage (this tab only)
    const persist = useCallback((next, persistent) => {
      clearSession();
      if (!next) return;
      try {
        (persistent ? localStorage : sessionStorage).setItem(storageKey, JSON.stringify(next));
      } catch (e) {
        /* ignore */
      }
    }, []);

    // Start a session after a successful login
    const signIn = useCallback(
      ({ token, user }, { remember = false } = {}) => {
        const next = { token, user, lastActivity: Date.now() };
        persist(next, remember);
        setEndReason(null);
        setSession({ ...next, persistent: remember });
      },
      [persist]
    );

    // End the session; `reason` is shown on the login page (e.g. idle timeout)
    const signOut = useCallback((reason = null) => {
      clearSession();
      setEndReason(reason);
      setSession(null);
    }, []);

    // Change details of the signed-in user (e.g. after editing the profile) and save them
    const updateUser = useCallback(
      (patch) => {
        setSession((current) => {
          if (!current) return current;
          const next = { ...current, user: { ...current.user, ...patch } };
          persist({ token: next.token, user: next.user, lastActivity: next.lastActivity }, current.persistent);
          return next;
        });
      },
      [persist]
    );

    // Idle timeout: record activity (at most once every 15 seconds) and check every 20 seconds
    useEffect(() => {
      if (!session) return undefined;

      // On any click, key press, scroll or touch: update lastActivity (at most every 15 seconds)
      const touch = () => {
        const now = Date.now();
        if (now - lastWrite.current < 15000) return;
        lastWrite.current = now;
        const current = readSession();
        if (!current) return;
        persist({ token: current.token, user: current.user, lastActivity: now }, current.persistent);
      };
      const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
      events.forEach((name) => window.addEventListener(name, touch, { passive: true }));

      // Every 20 seconds: sign out if the session was removed or has been idle too long
      const timer = setInterval(() => {
        const current = readSession();
        if (!current) signOut('signed_out');
        else if (isExpired(current)) signOut('idle');
      }, 20000);

      return () => {
        events.forEach((name) => window.removeEventListener(name, touch));
        clearInterval(timer);
      };
    }, [session, persist, signOut]);

    // Signing out in another tab signs this tab out too
    useEffect(() => {
      const onStorage = (event) => {
        if (event.key === storageKey && !event.newValue && !readSession()) signOut('signed_out');
      };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    }, [signOut]);

    // The API rejected this session's token (services/http.js): end the session and say why on the login page
    useEffect(() => onSignedOut(() => signOut('expired')), [signOut]);

    // The API replaced the token (a customer changed their password; older tokens stopped working).
    // Saved to storage right away, not in a state updater that React may run later: the API client
    // reads the token from storage, and the reloads that follow must already carry the new one.
    useEffect(
      () =>
        onTokenRenewed((token) => {
          const current = readSession();
          if (!current) return;
          persist({ token, user: current.user, lastActivity: current.lastActivity }, current.persistent);
          setSession((s) => (s ? { ...s, token } : s));
        }),
      [persist]
    );

    const value = useMemo(
      () => ({ session, user: session ? session.user : null, isAuthenticated: Boolean(session), signIn, signOut, updateUser, endReason }),
      [session, signIn, signOut, updateUser, endReason]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  }

  /** Hook to read the session in any page. */
  const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
    return ctx;
  };

  /**
   * Route guard: shows the page when signed in, otherwise redirects to login (or idlePath after a timeout)
   * with ?next=, plus ?reason=idle (inactivity) or ?reason=expired (the server ended the session).
   */
  function RequireAuth({ children }) {
    const { isAuthenticated, endReason } = useAuth();
    const location = useLocation();
    if (!isAuthenticated) {
      const params = new URLSearchParams();
      params.set('next', location.pathname + location.search);
      if (endReason === 'idle' || endReason === 'expired') params.set('reason', endReason);
      const target = endReason === 'idle' ? idlePath : loginPath;
      return <Navigate to={`${target}?${params.toString()}`} replace />;
    }
    return children;
  }

  return { AuthProvider, useAuth, RequireAuth };
}

/**
 * Only follow in-app `next` paths, never absolute or protocol-relative URLs.
 * Backslashes and control characters are rejected too: browsers read "/\evil.com"
 * as "//evil.com" (GHSA-wrjc-x8rr-h8h6).
 */
export const safeNextPath = (value, fallback) =>
  value && /^\/(?![/\\])/.test(value) && !/[\\\u0000-\u001f]/.test(value) ? value : fallback;
