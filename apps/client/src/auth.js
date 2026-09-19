import { createAuth } from '@tm/shared';

/** Customer session. Kept under its own key, separate from the admin session. */
// createAuth returns three pieces:
//  - AuthProvider: wraps the app and keeps the session
//  - useAuth: hook that gives pages the current user, signIn and signOut
//  - RequireAuth: guard that redirects to /login when no one is signed in
export const { AuthProvider, useAuth, RequireAuth } = createAuth({
  storageKey: 'tm.client.session',
  loginPath: '/login'
});
