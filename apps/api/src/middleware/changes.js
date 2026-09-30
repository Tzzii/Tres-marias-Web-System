import { bumpStamp } from '../modules/changes/changes.repo.js';

// Requests that only read
const READS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * Moves the change stamp (modules/changes, Phase 7) after every write request that succeeded: any
 * method but GET, HEAD and OPTIONS, answered below 400. Every write reaches the database through the
 * API, so this one place covers them all, including the ones later phases add.
 *
 * It moves when the route ends its answer (res.end), not on the response's 'finish' event: 'finish'
 * never fires when the client has already gone (a phone losing signal, a closed tab), yet the write
 * was saved, and the other portal would never be told. Every route answers with
 * res.json(await service(…)), so its transaction has committed by then. A route that answers before
 * its work is saved (the PayMongo webhook of Phase 8B) calls bumpStamp() itself once it is saved.
 *
 * A write that happened to change nothing (e.g. marking a read conversation as read) moves it too;
 * the portals then reload once for nothing, which is harmless. A failure is only logged: the next
 * write moves the stamp again.
 */
export function stampWrites(req, res, next) {
  if (READS.includes(req.method)) return next();
  const end = res.end;
  res.end = function endAndStamp(...args) {
    res.end = end; // once per request
    if (res.statusCode < 400) bumpStamp().catch((err) => console.error('[changes] Could not move the change stamp:', err.message));
    return end.apply(this, args);
  };
  return next();
}
