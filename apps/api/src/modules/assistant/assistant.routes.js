import express from 'express';
import multer from 'multer';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { optionalAuth } from '../../middleware/auth.js';
import { ApiError } from '../../lib/ApiError.js';
import { createAssistantService } from './assistant.service.js';
import { visitorHash } from './assistant.repo.js';
import * as schemas from './assistant.schemas.js';
import { REFERENCE_PHOTO_MAX_BYTES, REFERENCE_PHOTO_MAX_COUNT } from '@tm/shared/src/domain/referencePhoto.js';
import { sendReferencePhoto } from '../reservations/referencePhoto.js';

const parse = (schema, raw) => {
  const result = schema.safeParse(raw);
  if (!result.success)
    throw new ApiError('INVALID', 'Please review the assistant request.', {
      field: result.error.issues[0]?.path.join('.')
    });
  return result.data;
};
const wrap = (fn) => async (req, res, next) => {
  try {
    req.ensureAIAdmission?.();
    await fn(req, res);
  } catch (error) {
    next(
      error instanceof ApiError
        ? error
        : new ApiError(
            'ASSISTANT_UNAVAILABLE',
            'The assistant could not complete that request. Please try again later.'
          )
    );
  }
};
const limiter = (limit, keyGenerator = (req) => ipKeyGenerator(req.ip || '')) =>
  rateLimit({
    windowMs: 60000,
    limit,
    keyGenerator,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res, next) =>
      next(new ApiError('RATE_LIMITED', 'Please wait a moment before trying the assistant again.', { retryAfter: 60 }))
  });

export function createAssistantRoutes({
  service = createAssistantService(),
  authenticate = optionalAuth,
  admission = (req, res, next) => next()
} = {}) {
  const routes = express.Router();
  routes.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  routes.get('/config', (req, res) => res.json(service.publicConfig()));
  routes.use(authenticate, (req, res, next) => {
    if (req.get('Authorization') && !req.user) return next(new ApiError('UNAUTHENTICATED', 'Please sign in again.'));
    if (req.user && req.user.role !== 'customer')
      return next(new ApiError('FORBIDDEN', 'Use a customer account for the booking assistant.'));
    req.assistantActor = { customerId: req.user?.id, visitorHash: visitorHash(req.get('X-Assistant-Visitor')) };
    next();
  });
  routes.use(admission);
  routes.use(limiter(120));
  routes.post(
    '/session',
    limiter(8),
    wrap(async (req, res) => {
      const body = parse(schemas.sessionBody, req.body);
      res.json(await service.open(req.assistantActor, body.conversationId, { fresh: body.fresh === true }));
    })
  );
  const paid = limiter(20, (req) => (req.user ? `customer:${req.user.id}` : ipKeyGenerator(req.ip || '')));
  routes.get(
    '/conversations/:id',
    wrap(async (req, res) => {
      res.json(await service.read(req.assistantActor, parse(schemas.conversationParams, req.params).id));
    })
  );
  routes.post(
    '/conversations/:id/submit',
    wrap(async (req, res) => {
      const { id } = parse(schemas.conversationParams, req.params);
      const body = parse(schemas.submitBody, req.body);
      if (!req.user) throw new ApiError('UNAUTHENTICATED', 'Sign in to submit your reservation request.');
      res.json(await service.submit(req.assistantActor, id, body));
    })
  );
  routes.post(
    '/conversations/:id/schedule-options',
    wrap(async (req, res) => {
      const { id } = parse(schemas.conversationParams, req.params);
      res.json(await service.scheduleOptions(req.assistantActor, id, parse(schemas.scheduleOptionsBody, req.body)));
    })
  );
  const photoUpload = (remaining) =>
    multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: REFERENCE_PHOTO_MAX_BYTES,
        files: remaining,
        fields: 1,
        fieldSize: 32,
        parts: remaining + 1
      }
    }).array('photos', remaining);
  routes.post(
    '/conversations/:id/reference-photos',
    (req, res, next) =>
      req.user
        ? next()
        : next(new ApiError('UNAUTHENTICATED', 'Sign in to attach reference photos to your reservation.')),
    limiter(10),
    limiter(5, (req) => `customer:${req.user.id}`),
    (req, res, next) =>
      Promise.resolve()
        .then(async () => {
          req.assistantPhotoInput = parse(schemas.photoUploadBody, req.query);
          const capacity = await service.canUploadReferencePhotos(
            req.assistantActor,
            parse(schemas.conversationParams, req.params).id,
            req.assistantPhotoInput
          );
          if (
            !Number.isInteger(capacity?.remaining) ||
            capacity.remaining < 1 ||
            capacity.remaining > REFERENCE_PHOTO_MAX_COUNT
          )
            throw new ApiError('INVALID', 'Remove an existing reference photo before uploading another.');
          req.assistantPhotoRemaining = capacity.remaining;
        })
        .then(() => next(), next),
    (req, res, next) =>
      photoUpload(req.assistantPhotoRemaining)(req, res, (error) =>
        error
          ? next(new ApiError('INVALID', 'Upload up to five JPG, PNG or WebP reference photos, at most 20 MB each.'))
          : next()
      ),
    wrap(async (req, res) => {
      const { id } = parse(schemas.conversationParams, req.params);
      const input = parse(schemas.photoUploadBody, req.body);
      if (input.revision !== req.assistantPhotoInput.revision)
        throw new ApiError('INVALID', 'The reference photo revision does not match your current plan.');
      res.json(await service.addReferencePhotos(req.assistantActor, id, input, req.files));
    })
  );
  routes.post(
    '/conversations/:id/reference-photos/remove',
    wrap(async (req, res) => {
      const { id } = parse(schemas.conversationParams, req.params);
      res.json(await service.removeReferencePhoto(req.assistantActor, id, parse(schemas.photoRemoveBody, req.body)));
    })
  );
  routes.get(
    '/conversations/:id/reference-photos/:photoIndex',
    wrap(async (req, res) => {
      const { id, photoIndex } = parse(schemas.photoParams, req.params);
      await sendReferencePhoto(res, await service.referencePhoto(req.assistantActor, id, photoIndex));
    })
  );
  routes.post(
    '/conversations/:id/package-proposal-selection',
    wrap(async (req, res) => {
      const { id } = parse(schemas.conversationParams, req.params);
      res.json(
        await service.selectPackageProposal(
          req.assistantActor,
          id,
          parse(schemas.packageProposalSelectionBody, req.body)
        )
      );
    })
  );
  routes.post(
    '/conversations/:id/booking-draft',
    wrap(async (req, res) => {
      const { id } = parse(schemas.conversationParams, req.params);
      res.json(await service.updateDraft(req.assistantActor, id, parse(schemas.draftBody, req.body)));
    })
  );
  routes.post(
    '/conversations/:id/resume-booking',
    wrap(async (req, res) => {
      const { id } = parse(schemas.conversationParams, req.params);
      res.json(
        await service.updateDraft(req.assistantActor, id, parse(schemas.resumeBody, req.body), { resume: true })
      );
    })
  );
  routes.post(
    '/conversations/:id/messages',
    paid,
    wrap(async (req, res) => {
      const { id } = parse(schemas.conversationParams, req.params);
      res.json(await service.answer(req.assistantActor, id, parse(schemas.messageBody, req.body)));
    })
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 960044, files: 1, fields: 0, parts: 1 }
  }).single('audio');
  routes.post(
    '/conversations/:id/transcriptions',
    paid,
    (req, res, next) => {
      Promise.resolve()
        .then(() => service.canTranscribe(req.assistantActor, parse(schemas.conversationParams, req.params).id))
        .then(() => next(), next);
    },
    (req, res, next) =>
      upload(req, res, (error) =>
        error ? next(new ApiError('INVALID', 'Record one voice question of up to 30 seconds.')) : next()
      ),
    wrap(async (req, res) => {
      const { id } = parse(schemas.conversationParams, req.params);
      res.json(await service.transcribe(req.assistantActor, id, req.file?.buffer));
    })
  );
  routes.post(
    '/conversations/:id/messages/:messageId/speech',
    paid,
    wrap(async (req, res) => {
      const { id, messageId } = parse(schemas.speechParams, req.params);
      parse(schemas.emptyBody, req.body);
      const audio = await service.speech(req.assistantActor, id, messageId);
      res.set({ 'Content-Type': 'audio/wav', 'X-Content-Type-Options': 'nosniff' }).send(audio);
    })
  );
  return routes;
}
