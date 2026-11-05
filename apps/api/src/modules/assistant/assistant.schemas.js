import { z } from 'zod';
import { ASSISTANT_TEXT_MAX } from '@tm/shared/src/domain/assistant.js';
import { bookingPatchSchema } from './assistant.booking.js';
import { packageProposalRefSchema } from '../package-proposals/packageProposal.schemas.js';

export const packageProposalSelectionBody = z
  .object({
    revision: z.number().int().min(0),
    packageProposalRef: packageProposalRefSchema
  })
  .strict();

export const conversationParams = z.object({ id: z.string().uuid() }).strict();
export const speechParams = conversationParams.extend({ messageId: z.string().uuid() });
export const sessionBody = z
  .object({ conversationId: z.string().uuid().optional(), fresh: z.boolean().optional() })
  .strict();
export const photoParams = conversationParams.extend({ photoIndex: z.coerce.number().int().min(0).max(4) });
export const photoUploadBody = z
  .object({ revision: z.string().regex(/^\d+$/).transform(Number).refine(Number.isSafeInteger) })
  .strict();
export const photoRemoveBody = z
  .object({ revision: z.number().int().min(0), index: z.number().int().min(0).max(4) })
  .strict();
export const submitBody = z
  .object({ revision: z.number().int().min(0), agreeTerms: z.literal(true), confirmSubmission: z.literal(true) })
  .strict();
export const scheduleOptionsBody = z
  .object({ weekendsOnly: z.boolean().default(false), days: z.number().int().min(1).max(14).default(14) })
  .strict();
export const messageBody = z
  .object({
    requestId: z.string().uuid(),
    text: z.string().trim().min(1).max(ASSISTANT_TEXT_MAX),
    source: z.enum(['text', 'voice']).default('text')
  })
  .strict();

export const emptyBody = z.object({}).strict();
export const draftBody = z.object({ draft: bookingPatchSchema, revision: z.number().int().min(0) }).strict();
export const resumeBody = z
  .object({
    form: z.record(z.string(), z.unknown()).refine((v) => JSON.stringify(v).length <= 16000),
    revision: z.number().int().min(0)
  })
  .strict();
