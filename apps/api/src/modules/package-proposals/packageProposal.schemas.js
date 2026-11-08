import { z } from 'zod';
import { DISH_CATEGORIES, MENU_LINE_MAX, RULES } from '@tm/shared/src/services/config.js';

const id = z.string().min(1).max(40);
const optionId = z.string().min(1).max(255);
const ids = z.array(id).max(100);
const quantities = z.record(id, z.number().int().min(1).max(99));
export const setupPreferencesSchema = z
  .object({
    reviewed: z.literal(true),
    chairName: z.string().max(200),
    items: z.array(z.object({ itemName: z.string().min(1).max(200), included: z.boolean() }).strict()).max(40)
  })
  .strict();
const menu = z
  .object({
    ...Object.fromEntries(
      DISH_CATEGORIES.map(({ key }) => [key, z.array(z.string().max(MENU_LINE_MAX)).max(2).optional()])
    ),
    juice: z.string().max(120).optional(),
    dessert: z
      .object({ name: z.string().max(120), description: z.string().max(500).optional() })
      .strict()
      .nullish()
  })
  .strict();
const styling = z
  .object({
    theme: z.string().max(60).optional(),
    themeOther: z.string().max(60).optional(),
    notes: z.string().max(1000).optional(),
    colors: z
      .array(
        z
          .object({ hex: z.string().max(7), name: z.string().max(60).optional(), metallic: z.boolean().optional() })
          .strict()
      )
      .max(5)
      .optional()
  })
  .strict();

export const contextBody = z
  .object({
    serviceType: z.enum(['Buffet and Catering', 'Catering only']),
    guests: z.number().int().min(RULES.minGuests).max(RULES.maxGuests),
    budget: z.number().int().min(1).max(10000000),
    date: z.string().length(10),
    startTime: z.string().length(5),
    endTime: z.string().length(5),
    occasion: z.string().max(80).optional(),
    eventName: z.string().max(120).optional(),
    setupPreferences: setupPreferencesSchema.optional(),
    preferences: z.string().max(1000).optional(),
    foodNotes: z.string().max(1000).optional(),
    menu: menu.nullish(),
    styling: styling.nullish(),
    addonIds: ids.optional(),
    addonQty: quantities.optional(),
    protectedAddonIds: ids.optional()
  })
  .strict();
export const createBody = z
  .object({
    requestId: z.string().uuid(),
    conversationId: z.string().uuid().optional(),
    context: contextBody.extend({
      eventName: z.string().trim().min(1).max(120),
      occasion: z.string().trim().min(1).max(80),
      setupPreferences: setupPreferencesSchema
    }),
    reviewedCatalogFingerprint: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .strict();
export const proposalParams = z.object({ id }).strict();
export const selectionBody = z.object({ revision: z.number().int().positive(), optionId }).strict();
export const packageProposalRefSchema = selectionBody.extend({ proposalId: id }).strict();
