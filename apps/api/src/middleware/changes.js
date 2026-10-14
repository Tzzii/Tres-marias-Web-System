import { bumpStamp } from '../modules/changes/changes.repo.js';

const READS = ['GET', 'HEAD', 'OPTIONS'];

export function stampWrites(req, res, next) {
  if (READS.includes(req.method)) return next();
  const end = res.end;
  res.end = function endAndStamp(...args) {
    res.end = end;
    if (res.statusCode < 400)
      bumpStamp().catch((err) => console.error('[changes] Could not move the change stamp:', err.message));
    return end.apply(this, args);
  };
  return next();
}
