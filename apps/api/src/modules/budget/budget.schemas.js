import { z } from 'zod';
import { RULES } from '@tm/shared/src/services/config.js';
import { isISODate, isClockTime } from '../../lib/time.js';

const id = z.string().min(1).max(40);
export const budgetProposalBody = z
  .object({
    serviceType: z.literal('Buffet and Catering'),
    packageId: id,
    guests: z.number().int().min(RULES.minGuests).max(RULES.maxGuests),
    date: z.string().refine(isISODate, 'Choose a valid event date.'),
    startTime: z.string().refine(isClockTime, 'Choose a valid start time.'),
    endTime: z.string().refine(isClockTime, 'Choose a valid end time.'),
    occasion: z.string().trim().max(40).default(''),
    budget: z.number().int().min(1).max(10000000),
    selection: z
      .object({ addonIds: z.array(id).max(100), addonQty: z.record(id, z.number().int().min(1).max(99)).default({}) })
      .strict(),
    protectedAddonIds: z.array(id).max(100).default([]),
    preferences: z.string().trim().max(500).default(''),
    reviewedCatalogFingerprint: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .strict();
