import express from 'express';
import { requireAuth, requireRole, sessionTokenHash } from '../../middleware/auth.js';
import { revokeAllCustomerSessions, revokeCustomerToken } from './auth.repo.js';

export const customerSessionRoutes = express.Router();
customerSessionRoutes.post('/logout', requireAuth, requireRole('customer'), async (req, res) => {
  const token = req.get('Authorization').split(' ')[1];
  await revokeCustomerToken(sessionTokenHash(token), req.user.exp * 1000);
  res.json({ ok: true });
});
customerSessionRoutes.post('/logout-all', requireAuth, requireRole('customer'), async (req, res) => {
  await revokeAllCustomerSessions(req.user.id);
  res.json({ ok: true });
});
