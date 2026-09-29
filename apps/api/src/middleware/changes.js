import { bumpStamp } from '../modules/changes/changes.repo.js';

// Requests that only read
const READS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * Moves the change stamp (modules/changes, Phase 7) after every write request that succeeded: any
 * method but GET, HEAD and OPTIONS, answered below 400, once the answer has gone out (its transaction
 * has committed by then). Every write reaches the database through the API, so this one place covers
 * them all, including the ones later phases add. A write that happened to change nothing (e.g. marking
 * a read conversation as read) moves it too; the portals then reload once for nothing, which is
 * harmless. A failure is only logged: the next write moves the stamp again.
 */
export function stampWrites(req, res, next) {
  if (!READS.includes(req.method)) {
    res.on('finish', () => {
      if (res.statusCode < 400) bumpStamp().catch((err) => console.error('[changes] Could not move the change stamp:', err.message));
    });
  }
  next();
}
