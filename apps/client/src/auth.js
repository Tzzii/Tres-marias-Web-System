import { createAuth } from '@tm/shared';

export const { AuthProvider, useAuth, RequireAuth } = createAuth({
  storageKey: 'tm.client.session',
  loginPath: '/login'
});
