import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { RULES } from '../services/config.js';
import { onSignedOut, onTokenRenewed } from '../services/events.js';
import { startChangePolling } from '../services/poller.js';

/**
 * Builds the session layer for one portal. Each portal gets its own storage key,
 * so a customer session and a staff session never mix.
 *
 * - "Remember me" keeps the session in localStorage; otherwise it lives in
 *   sessionStorage and ends when the browser tab closes.
 * - Sessions end after RULES.idleMinutes without activity.
 * - `lockOnIdle` (the admin portal, 2026-10-03): instead of ending, an idle session LOCKS when its sign-in
 *   came with an unlock ticket ({ unlockTicket, unlockUntil } from the server). The token is thrown away and
 *   only a lock record is kept ({ user, unlockTicket, unlockUntil } under "<storageKey>.lock", in the same
 *   storage as the session), so nothing can be loaded until the password is entered on the lock screen
 *   (`lockPath`). Unlocking signs in again with the server's answer (signIn). Signing out, the ticket running
 *   out (unlockUntil, the end of the sign-in session) or the server refusing it ends the lock, and the
 *   next sign-in needs the emailed code again. Customers (no lockOnIdle) are signed out as before.
 * - The session also ends when the API rejects its token (expired, edited, or older than a password
 *   change): the login page then says why (?reason=expired). A token the server replaces (after a
 *   customer changes or resets the password in My profile) is saved here.
 *   While signed in, the portal also polls for changes made elsewhere (services/poller.js), so pages
 *   show the other portal's writes within about 15 seconds.
 * - <RequireAuth> sends signed-out visitors to the login page (a locked one to the lock screen) and
 *   brings them back to where they were going afterwards.
 * - `idlePath` (optional): where an idle timeout lands instead of the login page (when it doesn't lock).
 */
export function createAuth({ storageKey, loginPath, idlePath = loginPath, lockOnIdle = false, lockPath = loginPath }) {
  // Shares the session with every component inside AuthProvider
  const AuthContext = createContext(null);
  const lockKey = `${storageKey}.lock`;

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

  // Remove the lock record from both storages
  const clearLock = () => {
    try {
      sessionStorage.removeItem(lockKey);
      localStorage.removeItem(lockKey);
    } catch (e) {
      /* ignore */
    }
  };

  // The lock record of a locked session, or null. One whose ticket has run out is removed (and null returned):
  // the session it belonged to is over, so the next sign-in needs the code.
  const readLock = () => {
    for (const store of [sessionStorage, localStorage]) {
      try {
        const raw = store.getItem(lockKey);
        if (!raw) continue;
        const lock = JSON.parse(raw);
        if (lock && lock.unlockTicket && lock.user && lock.unlockUntil > Date.now()) return { ...lock, persistent: store === localStorage };
        store.removeItem(lockKey);
      } catch (e) {
        /* ignore unreadable storage */
      }
    }
    return null;
  };

  // True when an idle session can be locked rather than ended: this portal locks, and its ticket is still good
  const canLock = (session) => lockOnIdle && Boolean(session && session.unlockTicket && session.unlockUntil > Date.now());

  // Turn an idle session into a lock record: write the record first (so other tabs see it when the session
  // disappears), then drop the session and its token. Returns the record.
  const writeLock = (session) => {
    const lock = { user: session.user, unlockTicket: session.unlockTicket, unlockUntil: session.unlockUntil };
    try {
      (session.persistent ? localStorage : sessionStorage).setItem(lockKey, JSON.stringify(lock));
    } catch (e) {
      /* ignore */
    }
    clearSession();
    return { ...lock, persistent: Boolean(session.persistent) };
  };

  // True when the last activity was longer ago than the idle limit
  const isExpired = (session) => session && session.lastActivity && Date.now() - session.lastActivity > RULES.idleMinutes * 60000;

  /** Holds the current session and provides signIn / signOut / updateUser to the app. */
  function AuthProvider({ children }) {
    // Start with the saved session, unless it already timed out (e.g. the tab was reopened after the idle limit):
    // then it is locked (lockOnIdle with a good ticket) or ended. A page reloaded while locked stays locked.
    const [initial] = useState(() => {
      const existing = readSession();
      if (existing && isExpired(existing)) {
        if (canLock(existing)) return { session: null, endReason: 'idle', locked: writeLock(existing) };
        clearSession();
        return { session: null, endReason: 'idle', locked: null };
      }
      if (existing) return { session: existing, endReason: null, locked: null };
      const lock = lockOnIdle ? readLock() : null;
      return { session: null, endReason: lock ? 'idle' : null, locked: lock };
    });
    const [session, setSession] = useState(initial.session);
    const [endReason, setEndReason] = useState(initial.endReason); // why the session ended ('idle', 'signed_out', 'expired')
    const [locked, setLocked] = useState(initial.locked); // the lock record while the screen is locked, else null
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

    // The fields of a session that are saved (the unlock ticket travels with the token)
    const stored = (s) => ({ token: s.token, user: s.user, lastActivity: s.lastActivity, unlockTicket: s.unlockTicket, unlockUntil: s.unlockUntil });

    // Start a session after a successful login (or an unlock); a lock record left over is removed
    const signIn = useCallback(
      ({ token, user, unlockTicket, unlockUntil }, { remember = false } = {}) => {
        const next = { token, user, lastActivity: Date.now(), ...(unlockTicket ? { unlockTicket, unlockUntil } : {}) };
        clearLock();
        persist(next, remember);
        setLocked(null);
        setEndReason(null);
        setSession({ ...next, persistent: remember });
      },
      [persist]
    );

    // End the session (and any lock: the next sign-in needs the code); `reason` is shown on the login page
    const signOut = useCallback((reason = null) => {
      clearSession();
      clearLock();
      setLocked(null);
      setEndReason(reason);
      setSession(null);
    }, []);

    // Idle: lock the session when this portal locks and the ticket is good, otherwise end it
    const goIdle = useCallback(
      (current) => {
        if (!canLock(current)) {
          signOut('idle');
          return;
        }
        setLocked(writeLock(current));
        setEndReason('idle');
        setSession(null);
      },
      [signOut]
    );

    // The session was removed by another tab: follow it into the lock screen when it was locked, else sign out
    const followOtherTab = useCallback(() => {
      const lock = lockOnIdle ? readLock() : null;
      if (lock) {
        setLocked(lock);
        setEndReason('idle');
        setSession(null);
      } else signOut('signed_out');
    }, [signOut]);

    // Change details of the signed-in user (e.g. after editing the profile) and save them
    const updateUser = useCallback(
      (patch) => {
        setSession((current) => {
          if (!current) return current;
          const next = { ...current, user: { ...current.user, ...patch } };
          persist(stored(next), current.persistent);
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
        persist(stored({ ...current, lastActivity: now }), current.persistent);
      };
      const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
      events.forEach((name) => window.addEventListener(name, touch, { passive: true }));

      // Every 20 seconds: follow a session removed elsewhere, or lock / end one idle too long
      const timer = setInterval(() => {
        const current = readSession();
        if (!current) followOtherTab();
        else if (isExpired(current)) goIdle(current);
      }, 20000);

      return () => {
        events.forEach((name) => window.removeEventListener(name, touch));
        clearInterval(timer);
      };
    }, [session, persist, goIdle, followOtherTab]);

    // Signing out (or locking) in another tab does the same here
    useEffect(() => {
      const onStorage = (event) => {
        if (event.key === storageKey && !event.newValue && !readSession()) followOtherTab();
      };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    }, [followOtherTab]);

    // The API rejected this session's token (services/http.js): end the session and say why on the login page
    useEffect(() => onSignedOut(() => signOut('expired')), [signOut]);

    // Signed in: watch for changes made elsewhere until sign-out (services/poller.js)
    const signedIn = Boolean(session);
    useEffect(() => (signedIn ? startChangePolling() : undefined), [signedIn]);

    // The API replaced the token (a customer changed or reset their password; older tokens stopped working).
    // Saved to storage right away, not in a state updater that React may run later: the API client
    // reads the token from storage, and the reloads that follow must already carry the new one.
    useEffect(
      () =>
        onTokenRenewed((token) => {
          const current = readSession();
          if (!current) return;
          persist(stored({ ...current, token }), current.persistent);
          setSession((s) => (s ? { ...s, token } : s));
        }),
      [persist]
    );

    const value = useMemo(
      () => ({ session, user: session ? session.user : null, isAuthenticated: Boolean(session), signIn, signOut, updateUser, endReason, locked }),
      [session, signIn, signOut, updateUser, endReason, locked]
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
   * Route guard: shows the page when signed in. Otherwise it redirects, with ?next=, to the lock screen
   * (`lockPath`) while the session is locked, else to login (or idlePath after a timeout) with
   * ?reason=idle (inactivity) or ?reason=expired (the server ended the session).
   */
  function RequireAuth({ children }) {
    const { isAuthenticated, endReason, locked } = useAuth();
    const location = useLocation();
    if (!isAuthenticated) {
      const params = new URLSearchParams();
      params.set('next', location.pathname + location.search);
      if (locked) return <Navigate to={`${lockPath}?${params.toString()}`} replace />;
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
