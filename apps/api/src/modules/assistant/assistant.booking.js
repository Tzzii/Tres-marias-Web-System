import { z } from 'zod';
import {
  ASSISTANT_BOOKING_TEXT,
  ASSISTANT_BOOKING_TOPICS,
  ASSISTANT_BOOKING_FIELDS,
  cleanAssistantBooking,
  mergeAssistantBooking,
  assistantBookingProgress,
  assistantBookingSummary
} from '@tm/shared/src/domain/assistantBooking.js';
import { OCCASIONS, RULES, DISH_CATEGORIES, RENTAL, includesFood, isRental } from '@tm/shared/src/services/config.js';
import { bookableAddons, packagePickProblem } from '@tm/shared/src/domain/catalog.js';
import {
  STYLING_THEMES,
  STYLING_COLOR_CHOICES,
  METALLICS,
  THEME_OTHER,
  THEME_UNDECIDED
} from '@tm/shared/src/domain/styling.js';
import { endTimeProblem } from '@tm/shared/src/domain/availability.js';
import { validAssistantDate } from '@tm/shared/src/domain/assistant.js';
import { ApiError } from '../../lib/ApiError.js';
import { menuCount } from '@tm/shared/src/domain/menu.js';
import { packageProposalRefSchema } from '../package-proposals/packageProposal.schemas.js';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[03]0$/);
export const bookingPatchSchema = z
  .object({
    clearedFields: z.array(z.enum(ASSISTANT_BOOKING_FIELDS)).max(30).optional(),
    planningStarted: z.boolean().nullable().optional(),
    planningMode: z.enum(['catalog', 'custom']).nullable().optional(),
    packageProposalRef: packageProposalRefSchema.nullable().optional(),
    ...Object.fromEntries(
      Object.entries(ASSISTANT_BOOKING_TEXT).map(([key, max]) => [key, z.string().max(max).nullable().optional()])
    ),
    packageSlug: z
      .string()
      .regex(/^[a-z0-9-]{1,160}$/)
      .nullable()
      .optional(),
    serviceType: z.enum(['Buffet and Catering', 'Catering only', 'Equipment rental']).nullable().optional(),
    occasion: z.enum(OCCASIONS).nullable().optional(),
    guests: z.number().int().min(RULES.minGuests).max(RULES.maxGuests).nullable().optional(),
    date: z.string().refine(validAssistantDate).nullable().optional(),
    startTime: clock.nullable().optional(),
    endTime: clock.nullable().optional(),
    fulfilment: z.enum(['pickup', 'delivery']).nullable().optional(),
    budget: z.number().int().min(1).max(10000000).nullable().optional(),
    menu: z
      .object({
        ...Object.fromEntries(
          DISH_CATEGORIES.map(({ key }) => [key, z.array(z.string().min(2).max(200)).max(2).nullable().optional()])
        ),
        juice: z.string().max(120).nullable().optional(),
        dessert: z
          .object({ name: z.string().max(120), description: z.string().max(500) })
          .strict()
          .nullable()
          .optional()
      })
      .strict()
      .nullable()
      .optional(),
    styling: z
      .object({
        theme: z.string().max(60).nullable().optional(),
        themeOther: z.string().max(60).nullable().optional(),
        notes: z.string().max(1000).nullable().optional(),
        colors: z
          .array(
            z
              .object({
                hex: z.string().regex(/^#[\da-fA-F]{6}$/),
                name: z.string().max(60),
                metallic: z.boolean().optional()
              })
              .strict()
          )
          .max(5)
          .nullable()
          .optional()
      })
      .strict()
      .nullable()
      .optional(),
    addonIds: z.array(id).max(20).nullable().optional(),
    addonQty: z.record(id, z.number().int().min(1).max(99)).nullable().optional(),
    rentalQty: z.record(id, z.number().int().min(1).max(RENTAL.maxQty)).nullable().optional(),
    discussed: z.array(z.enum(ASSISTANT_BOOKING_TOPICS)).max(ASSISTANT_BOOKING_TOPICS.length).nullable().optional()
  })
  .strict();
const scalar = (type, extra = {}) => ({ type: [type, 'null'], ...extra });
const array = (items, maxItems) => ({ type: ['array', 'null'], items, maxItems });
const string = { type: 'string' };
const strictObject = (properties) => ({
  type: ['object', 'null'],
  properties,
  required: Object.keys(properties),
  additionalProperties: false
});
// Quantities are arrays in the model interface; the app's dictionary keys are never an open JSON schema.
export const bookingPatchParameters = strictObject({
  planningStarted: scalar('boolean'),
  planningMode: scalar('string', { enum: ['catalog', 'custom', null] }),
  ...Object.fromEntries(
    Object.entries(ASSISTANT_BOOKING_TEXT).map(([key, maxLength]) => [key, scalar('string', { maxLength })])
  ),
  packageSlug: scalar('string'),
  serviceType: scalar('string', { enum: ['Buffet and Catering', 'Catering only', 'Equipment rental', null] }),
  occasion: scalar('string', { enum: [...OCCASIONS, null] }),
  guests: scalar('integer', { minimum: RULES.minGuests, maximum: RULES.maxGuests }),
  date: scalar('string'),
  startTime: scalar('string'),
  endTime: scalar('string'),
  fulfilment: scalar('string', { enum: ['pickup', 'delivery', null] }),
  budget: scalar('integer', { minimum: 1, maximum: 10000000 }),
  menu: strictObject({
    ...Object.fromEntries(DISH_CATEGORIES.map(({ key }) => [key, array(string, 2)])),
    juice: scalar('string'),
    dessert: strictObject({ name: string, description: string })
  }),
  styling: strictObject({
    theme: scalar('string'),
    themeOther: scalar('string'),
    notes: scalar('string'),
    colors: array(
      {
        type: 'object',
        properties: { hex: string, name: string, metallic: { type: 'boolean' } },
        required: ['hex', 'name', 'metallic'],
        additionalProperties: false
      },
      5
    )
  }),
  addons: array(
    {
      type: 'object',
      properties: { id: string, quantity: { type: 'integer', minimum: 1, maximum: 99 } },
      required: ['id', 'quantity'],
      additionalProperties: false
    },
    20
  ),
  rentals: array(
    {
      type: 'object',
      properties: { itemId: string, quantity: { type: 'integer', minimum: 1, maximum: RENTAL.maxQty } },
      required: ['itemId', 'quantity'],
      additionalProperties: false
    },
    40
  ),
  discussed: array({ type: 'string', enum: ASSISTANT_BOOKING_TOPICS }, ASSISTANT_BOOKING_TOPICS.length)
});
const withoutNulls = (value) =>
  Array.isArray(value)
    ? value.map(withoutNulls)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([, v]) => v !== null)
            .map(([k, v]) => [k, withoutNulls(v)])
        )
      : value;
export function modelBookingPatch(raw) {
  const patch = withoutNulls(raw || {});
  // Selection is an explicit authenticated control action, never a model assertion.
  delete patch.packageProposalRef;
  if (patch.addons) {
    if (!Array.isArray(patch.addons) || !patch.addons.every((v) => v && typeof v === 'object'))
      throw new ApiError('INVALID', 'Choose additional services from the catalog.');
    if (new Set(patch.addons.map((v) => v.id)).size !== patch.addons.length)
      throw new ApiError('INVALID', 'Select each additional service once and specify its quantity.');
    patch.addonIds = patch.addons.map((v) => v.id);
    patch.addonQty = Object.fromEntries(patch.addons.map((v) => [v.id, v.quantity]));
    delete patch.addons;
  }
  if (patch.rentals) {
    if (!Array.isArray(patch.rentals) || !patch.rentals.every((v) => v && typeof v === 'object'))
      throw new ApiError('INVALID', 'Choose rental items from the catalog.');
    if (new Set(patch.rentals.map((v) => v.itemId)).size !== patch.rentals.length)
      throw new ApiError('INVALID', 'Select each rental item once and specify its quantity.');
    patch.rentalQty = Object.fromEntries(patch.rentals.map((v) => [v.itemId, v.quantity]));
    delete patch.rentals;
  }
  return patch;
}

export function validateBookingPatch(previous, raw, catalog, clearFields = []) {
  const parsed = bookingPatchSchema.safeParse(raw);
  if (!parsed.success)
    throw new ApiError('INVALID', 'Please clarify the reservation details.', {
      field: parsed.error.issues[0]?.path.join('.')
    });
  const patch = withoutNulls(parsed.data);
  const next = mergeAssistantBooking(previous, patch, clearFields);
  const problem = (message, field) => {
    throw new ApiError('INVALID', message, { field });
  };
  if (next.packageSlug) {
    const pkg = catalog.packages.find((p) => p.slug === next.packageSlug && p.visible !== false && !p.archived);
    if (!pkg) problem('That package is no longer published. Please choose another.', 'packageSlug');
    if (isRental(next.serviceType) !== (pkg.kind === 'rental') && next.serviceType)
      problem('Choose a package for the selected service.', 'packageSlug');
  }
  if (next.startTime && next.endTime && endTimeProblem(next.startTime, next.endTime))
    problem('Choose start and end times for an event lasting two to six hours.', 'endTime');
  if (next.styling) {
    if (
      patch.styling?.theme &&
      ![...STYLING_THEMES.map((v) => v.name), THEME_OTHER, THEME_UNDECIDED].includes(patch.styling.theme)
    )
      problem('Use a listed theme, Other, or Not decided yet.', 'styling.theme');
    // A draft can hold one motif color or an unfinished custom theme; progress asks for the missing part.
  }
  const addons = bookableAddons(catalog.addons || []);
  const picks = (next.addonIds || []).map((key) => addons.find((v) => v.id === key && !v.archived));
  if (picks.some((v) => !v)) problem('An additional service is no longer available. Please review it.', 'addonIds');
  for (const addon of picks)
    if (next.addonQty?.[addon.id] && !addon.hasQuantity && next.addonQty[addon.id] !== 1)
      problem('This additional service is selected once.', 'addonQty');
  const issue = packagePickProblem(picks);
  if (issue) problem(issue.message, issue.field);
  for (const key of Object.keys(next.rentalQty || {}))
    if (!(catalog.rentals || []).some((v) => v.id === key && !v.archived))
      problem('An item is no longer offered for rent. Please review it.', 'rentalQty');
  // Menus permit customer requests just as the form does; only published dishes may be described as offered.
  if (includesFood(next.serviceType) && menuCount(next.menu) > 4)
    problem('Choose exactly four dishes in total, with up to two per category.', 'menu');
  for (const { key } of DISH_CATEGORIES) {
    const choices = next.menu?.[key] || [];
    if (new Set(choices.map((name) => name.toLowerCase())).size !== choices.length)
      problem('Choose different dishes within each category.', `menu.${key}`);
  }
  return next;
}

export function bookingPlan(draft, catalog) {
  const clean = cleanAssistantBooking(draft);
  const progress = assistantBookingProgress(clean);
  for (const addon of bookableAddons(catalog.addons || [])) {
    if (addon.hasQuantity && clean.addonIds?.includes(addon.id) && !clean.addonQty?.[addon.id])
      progress.missing.push({
        field: `addonQty.${addon.id}`,
        label: `${addon.name} quantity`,
        question: `How many ${addon.name} would you like?`
      });
  }
  progress.complete = progress.missing.length === 0;
  progress.nextQuestions = (progress.missing.length ? progress.missing : progress.optional)
    .slice(0, 2)
    .map((v) => v.question);
  const warnings = [];
  if (catalog.packageProposalIssue) {
    warnings.push(catalog.packageProposalIssue);
    progress.missing.push({
      field: 'packageProposalRef',
      label: 'Custom package needs review',
      question: 'Please review fresh custom package options.'
    });
    progress.complete = false;
    progress.nextQuestions = progress.missing.slice(0, 2).map((v) => v.question);
  }
  try {
    validateBookingPatch({}, clean, catalog);
  } catch (error) {
    warnings.push(error.message);
  }
  return {
    draft: clean,
    ...progress,
    summary: assistantBookingSummary(clean, { ...catalog, addons: bookableAddons(catalog.addons || []) }),
    warnings,
    photosInBookingForm: true,
    customerSubmits: true
  };
}

export function bookingDraftFromForm(form, catalog) {
  const raw = form && typeof form === 'object' && !Array.isArray(form) ? form : {};
  const pkg = catalog.packages.find((p) => p.id === raw.packageId && p.visible !== false && !p.archived);
  return validateBookingPatch(
    {},
    cleanAssistantBooking({
      ...raw,
      packageSlug: pkg?.slug,
      guests: Number(raw.guests),
      budget: Number(raw.packageBuilderDraft?.amount || raw.budgetDraft?.amount),
      budgetNotes: raw.packageBuilderDraft?.preferences || raw.budgetDraft?.preferences
    }),
    catalog
  );
}

export const planningGuide = () => ({
  motifColors: STYLING_COLOR_CHOICES,
  metallicColors: METALLICS.map(({ name, hex }) => ({ name, hex, metallic: true })),
  occasions: OCCASIONS,
  themes: [...STYLING_THEMES.map((v) => v.name), THEME_OTHER, THEME_UNDECIDED],
  dishCategories: DISH_CATEGORIES,
  requiredMenuDishes: 4,
  maxDishesPerCategory: 2,
  rental: RENTAL,
  reviewIncompleteAllowed: true,
  photosAndTerms:
    'Upload private reference photos in chat or the booking form. The signed-in customer reviews the summary, agrees to terms and explicitly submits using the chat controls or booking form. The model cannot upload photos, agree to terms or submit.'
});
