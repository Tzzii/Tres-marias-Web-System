import express from 'express';
import { readStamp } from './changes.repo.js';

/**
 * GET /api/changes -> { stamp } (docs/backend-development-phases.md Phase 7, §9.5): the number the
 * portals' poller compares every 15 seconds; when it moved, the portal reloads what it shows. One
 * address for both portals, mounted by app.js behind requireAuth only (any role). There is no service
 * file: no rule applies, the answer is the stored number.
 */
export const changesRoutes = express.Router();

changesRoutes.get('/', async (req, res) => {
  res.json({ stamp: await readStamp() });
});
