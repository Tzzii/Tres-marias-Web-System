import { createAuth } from '@tm/shared';

/**
 * Admin session. The key "tm.admin.session" is also read by the service layer to
 * attribute activity-log entries to the signed-in admin.
 */
// createAuth returns three pieces:
//  - AuthProvider: wraps the app and keeps the session
//  - useAuth: hook that gives pages the current user, signIn and signOut
//  - RequireAuth: guard that redirects to /login when no one is signed in
//    (after a 15-minute idle timeout it goes to the "/" logo screen instead)
export const { AuthProvider, useAuth, RequireAuth } = createAuth({
  storageKey: 'tm.admin.session',
  loginPath: '/login',
  idlePath: '/'
});
