import { createAuth } from '@tm/shared';

export const { AuthProvider, useAuth, RequireAuth } = createAuth({
  storageKey: 'tm.admin.session',
  loginPath: '/login',
  idlePath: '/',
  lockOnIdle: true,
  lockPath: '/locked'
});
