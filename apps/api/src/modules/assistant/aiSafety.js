import { createHmac } from 'node:crypto';
import { ipKeyGenerator } from 'express-rate-limit';
import { config } from '../../config.js';
import { ApiError } from '../../lib/ApiError.js';
import { createAISafetyRepository } from './aiSafety.repo.js';

export function admissionKind(req) {
  if (req.method !== 'POST') return null;
  if (/^\/session\/?$/i.test(req.path)) return 'session';
  if (/^\/conversations\/[^/]+\/reference-photos\/?$/i.test(req.path)) return 'upload';
  if (
    /^\/conversations\/[^/]+\/(messages|transcriptions)\/?$/i.test(req.path) ||
    /^\/conversations\/[^/]+\/messages\/[^/]+\/speech\/?$/i.test(req.path)
  )
    return 'paid';
  return null;
}

export function createAIAdmission(repository = createAISafetyRepository(), classify = admissionKind) {
  return async (req, res, next) => {
    const kind = classify(req);
    if (!kind) return next();
    const hash = (value) => createHmac('sha256', config.jwtSecret).update(value).digest('hex').slice(0, 32);
    try {
      const ipKey = hash(ipKeyGenerator(req.ip || 'unknown'));
      const actorKey = hash(req.user?.id ? `c:${req.user.id}` : `ip:${ipKey}`);
      const result = await repository.admit({ kind, ipKey, actorKey, signedIn: Boolean(req.user?.id) });
      if (!result.allowed) {
        res.set?.('Retry-After', result.reason === 'provider-circuit' ? '300' : '60');
        void repository.report?.().catch(() => console.error('[ai-safety] Alert reporting unavailable.'));
        return next(
          new ApiError('RATE_LIMITED', 'AI request limit reached or service paused. Please wait before trying again.', {
            retryAfter: result.reason === 'provider-circuit' ? 300 : 60
          })
        );
      }
      const deadline = Date.now() + 30000;
      req.ensureAIAdmission = () => {
        if (Date.now() > deadline)
          throw new ApiError('RATE_LIMITED', 'This upload or request took too long. Please try again.', {
            retryAfter: 60
          });
      };
      // Absolute body deadline, not a resettable socket-inactivity timeout. The
      // lease lasts 120s, covering at most 30s body + 60s bounded provider work.
      const bodyTimer = setTimeout(() => {
        if (!req.complete) req.destroy?.();
      }, 30000);
      bodyTimer.unref?.();
      req.once?.('end', () => clearTimeout(bodyTimer));
      res.once('close', () => clearTimeout(bodyTimer));
      // Do not release on socket close: the upstream request may still be finishing.
      res.once('finish', () => {
        clearTimeout(bodyTimer);
        Promise.resolve(result.lease ? repository.release(result.lease) : undefined)
          .then(() => repository.report?.())
          .catch(() => console.error('[ai-safety] Usage monitoring unavailable.'));
      });
      next();
    } catch {
      next(new ApiError('ASSISTANT_UNAVAILABLE', 'AI usage controls are unavailable. Please try again later.'));
    }
  };
}
