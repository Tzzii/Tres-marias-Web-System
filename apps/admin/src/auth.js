import { createAuth } from '@tm/shared';

/**
 * Admin session. The key "tm.admin.session" is also read by the service layer to
 * show which admin made each activity-log entry.
 */
// createAuth returns three pieces:
//  - AuthProvider: wraps the app and keeps the session
//  - useAuth: hook that gives pages the current user, signIn and signOut
//  - RequireAuth: guard that redirects to /login when no one is signed in
//    (after 15 minutes without activity the screen LOCKS instead: /locked asks for the password only,
//    no emailed code, until the sign-in session itself runs out; owner's rule, 2026-10-03)
export const { AuthProvider, useAuth, RequireAuth } = createAuth({
  storageKey: 'tm.admin.session',
  loginPath: '/login',
  idlePath: '/',
  lockOnIdle: true,
  lockPath: '/locked'
});
