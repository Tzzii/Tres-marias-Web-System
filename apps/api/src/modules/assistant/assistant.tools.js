import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import * as catalogService from '../catalog/catalog.service.js';
import { checkAvailability, getCalendar } from '../calendar/calendar.service.js';
import { bookableAddons, packagePickProblem } from '@tm/shared/src/domain/catalog.js';
import { computeQuote, INCLUSIVE_PRICING_MODEL } from '@tm/shared/src/services/pricing.js';
import { BUSINESS, RULES } from '@tm/shared/src/services/config.js';
import {
  endTimeProblem,
  eventHours,
  dateUnavailableReason,
  timeUnavailableReason
} from '@tm/shared/src/domain/availability.js';
import { cleanAssistantIntent, validAssistantDate } from '@tm/shared/src/domain/assistant.js';
import { ApiError } from '../../lib/ApiError.js';
import {
  bookingPatchSchema,
  bookingPatchParameters,
  modelBookingPatch,
  validateBookingPatch,
  bookingPlan,
  planningGuide
} from './assistant.booking.js';
import { isRental, RENTAL } from '@tm/shared/src/services/config.js';
import { setupQuestions } from '@tm/shared/src/domain/packageSetup.js';

const id = z.string().min(1).max(128);
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[03]0$/);
const date = z.string().refine(validAssistantDate);
const schemas = {
  search_catalog: z
    .object({ query: z.string().max(120), kind: z.enum(['all', 'packages', 'dishes', 'addons', 'rentals']) })
    .strict(),
  get_package: z.object({ packageId: id }).strict(),
  estimate_event: z
    .object({
      packageId: id,
      serviceType: z.enum(['Buffet and Catering', 'Catering only']),
      guests: z.number().int().min(RULES.minGuests).max(RULES.maxGuests),
      date: date.nullable(),
      startTime: time.nullable(),
      endTime: time.nullable(),
      addons: z.array(z.object({ id, quantity: z.number().int().min(1).max(99) }).strict()).max(20)
    })
    .strict(),
  check_availability: z.object({ date, startTime: time, endTime: time }).strict(),
  get_booking_guidance: z.object({}).strict(),
  get_reservation_draft: z.object({}).strict(),
  check_reservation_availability: z.object({}).strict(),
  prepare_reservation: z
    .object({ patch: z.unknown(), clearFields: z.array(z.enum(Object.keys(bookingPatchSchema.shape))).max(25) })
    .strict(),
  estimate_reservation: z.object({}).strict(),
  recommend_budget: z.object({}).strict(),
  generate_package_proposals: z.object({}).strict(),
  reservation_schedule_options: z.object({ days: z.number().int().min(1).max(14), weekendsOnly: z.boolean() }).strict(),
  alternative_dates: z
    .object({
      date,
      startTime: time,
      endTime: time.nullable(),
      days: z.number().int().min(1).max(14),
      weekendsOnly: z.boolean()
    })
    .strict()
};
const string = { type: 'string' };
const parameters = {
  search_catalog: { query: string, kind: { type: 'string', enum: ['all', 'packages', 'dishes', 'addons', 'rentals'] } },
  get_package: { packageId: string },
  estimate_event: {
    packageId: string,
    serviceType: { type: 'string', enum: ['Buffet and Catering', 'Catering only'] },
    guests: { type: 'integer', minimum: RULES.minGuests, maximum: RULES.maxGuests },
    date: { type: ['string', 'null'] },
    startTime: { type: ['string', 'null'] },
    endTime: { type: ['string', 'null'] },
    addons: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { id: string, quantity: { type: 'integer', minimum: 1, maximum: 99 } },
        required: ['id', 'quantity']
      }
    }
  },
  check_availability: { date: string, startTime: string, endTime: string },
  get_booking_guidance: {},
  get_reservation_draft: {},
  check_reservation_availability: {},
  prepare_reservation: {
    patch: bookingPatchParameters,
    clearFields: { type: 'array', items: { type: 'string', enum: Object.keys(bookingPatchSchema.shape) }, maxItems: 25 }
  },
  estimate_reservation: {},
  recommend_budget: {},
  generate_package_proposals: {},
  reservation_schedule_options: {
    days: { type: 'integer', minimum: 1, maximum: 14 },
    weekendsOnly: { type: 'boolean' }
  },
  alternative_dates: {
    date: string,
    startTime: string,
    endTime: { type: ['string', 'null'] },
    days: { type: 'integer', minimum: 1, maximum: 14 },
    weekendsOnly: { type: 'boolean' }
  }
};
const descriptions = {
  search_catalog:
    'Search current published packages, dishes, additional services and rental price lists. Use an empty query for an overview. No result establishes availability or a final price.',
  get_package:
    'Read current package inclusions. Buffet estimates must use estimate_event; never add a package equipment price on top of an inclusive buffet.',
  estimate_event:
    'Calculate an event estimate using current shared pricing. Ask for missing service type, guests and package. Null dates/times are permitted; unresolved amounts remain pending. Returns an estimate ID and booking selections.',
  check_availability:
    'Check an explicit catering calendar date and half-hour start and end times. For rentals use check_reservation_availability. No reservation is created. Equipment, staffing and transport feasibility are not established by this calendar check.',
  get_booking_guidance:
    'Read public business details, reservation fields, supported themes, menu and rental rules. Refer exceptions and unlisted services to the administrator.',
  get_reservation_draft:
    'Read the saved reservation plan, missing fields and next questions. Resume here instead of repeating details the customer already supplied.',
  check_reservation_availability:
    'Check the saved preferred date immediately, then check exact times when supplied. Uses catering or rental rules. Date-only checks do not establish time availability. A check never holds stock or a slot.',
  reservation_schedule_options:
    'When the customer requests alternatives, check up to three nearest available same-day times retaining duration, and up to three later dates within fourteen days. May restrict later dates to weekends. Never select a choice or hold stock or a slot.',
  prepare_reservation:
    'Save only details explicitly supplied or changed by the customer. Use null for unchanged fields; clearFields explicitly removes a prior choice. Collections replace previous collections. Ask one or two focused follow-ups from nextQuestions. Partial plans can be reviewed anytime. Does not submit, reserve or hold a slot. Use search_catalog for offered package, addon and rental IDs. A custom menu is a request subject to admin review, not a promise it is offered.',
  estimate_reservation:
    'Calculate the saved plan from current system prices, including selected additional services or rental quantities. Ask for missing service/package/guests or rental quantities. Returns a reviewable estimate with the complete current draft; never submits.',
  recommend_budget:
    'Compare up to three published packages against the saved target budget, guest count, service and selections, using the system calculator. Returns known subtotals; pending prices mean final affordability is not established. Never automatically select a recommendation.',
  generate_package_proposals: 'Unavailable in chat. Refer custom package construction to AI Budgeting & Package.',
  alternative_dates:
    'Check up to fourteen later dates near an explicit preferred date and time range. Returns at most three calendar alternatives; never selects one, reserves a slot or establishes equipment/staff availability.'
};
export const ASSISTANT_TOOLS = Object.keys(parameters)
  .filter((name) => name !== 'generate_package_proposals')
  .map((name) => ({
    type: 'function',
    name,
    description: descriptions[name],
    strict: true,
    parameters: {
      type: 'object',
      properties: parameters[name],
      required: Object.keys(parameters[name]),
      additionalProperties: false
    }
  }));

const publicPackage = (p) => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  kind: p.kind,
  guests: p.guests,
  photoVersion: p.photoVersion,
  equipmentPrice: p.price,
  description: String(p.description || '').slice(0, 700),
  items: p.items?.slice(0, 24) || []
});

export function createAssistantTools({
  getCatalog = catalogService.getCatalog,
  availability = checkAvailability,
  rentalAvailability = async (date, startTime) => {
    const map = await getCalendar();
    const reason =
      dateUnavailableReason(date, map, { rental: true }) ||
      (startTime ? timeUnavailableReason(date, startTime, { ...map, events: [] }) : '');
    return { date, startTime, endTime: null, available: !reason, reason };
  },
  draft = {},
  readPackageProposal
} = {}) {
  const packages = new Map();
  const estimates = new Map();
  const packageProposals = new Map();
  let bookingDraft = cleanAssistantIntent(draft);
  return {
    packages,
    estimates,
    packageProposals,
    get bookingDraft() {
      return bookingDraft;
    },
    async run(name, raw) {
      if (!Object.hasOwn(schemas, name)) throw new ApiError('INVALID', 'Unsupported assistant function.');
      const parsed = schemas[name].safeParse(raw);
      if (!parsed.success)
        return {
          error: 'Some details are missing or invalid. Ask the customer to clarify.',
          fields: parsed.error.issues.map((e) => e.path.join('.'))
        };
      const args = parsed.data;
      if (
        name === 'generate_package_proposals' ||
        (name === 'prepare_reservation' &&
          (args.patch?.planningMode === 'custom' ||
            (bookingDraft.planningMode === 'custom' && !bookingDraft.packageProposalRef)))
      )
        return {
          error: 'Build or customize packages on the AI Budgeting & Package page.',
          path: '/portal/ai-budgeting'
        };
      if (name === 'check_reservation_availability') {
        const d = bookingDraft,
          rental = isRental(d.serviceType);
        if (!d.serviceType || !d.date)
          return {
            error: 'Ask for the service and preferred date first.'
          };
        const complete = Boolean(d.startTime && (rental || d.endTime));
        const result = await (rental
          ? rentalAvailability(d.date, complete ? d.startTime : undefined)
          : availability(d.date, complete ? d.startTime : undefined, complete ? d.endTime : undefined));
        return {
          date: d.date,
          serviceType: d.serviceType,
          startTime: complete ? d.startTime : null,
          endTime: complete && !rental ? d.endTime : null,
          dateOnly: !complete,
          available: result.available,
          reason: result.reason,
          checkedAt: Date.now(),
          holdsSlot: false,
          scope: 'Calendar only. Stock, staffing and final arrangements need separate confirmation.'
        };
      }
      if (name === 'get_reservation_draft') return bookingPlan(bookingDraft, await getCatalog());
      if (name === 'reservation_schedule_options') {
        const d = bookingDraft,
          rental = isRental(d.serviceType);
        if (!d.date || !d.serviceType) return { error: 'Choose the service and preferred date first.' };
        const complete = Boolean(d.startTime && (rental || (d.endTime && !endTimeProblem(d.startTime, d.endTime))));
        const check = (date, startTime, endTime) =>
          rental ? rentalAvailability(date, startTime) : availability(date, startTime, endTime);
        const dates = [],
          times = [];
        for (let offset = 1; offset <= args.days && dates.length < 3; offset++) {
          const next = new Date(`${d.date}T00:00:00Z`);
          next.setUTCDate(next.getUTCDate() + offset);
          if (args.weekendsOnly && ![0, 6].includes(next.getUTCDay())) continue;
          const date = next.toISOString().slice(0, 10);
          if (
            (await check(date, complete ? d.startTime : undefined, complete && !rental ? d.endTime : undefined))
              .available
          )
            dates.push({
              date,
              startTime: complete ? d.startTime : null,
              endTime: complete && !rental ? d.endTime : null
            });
        }
        if (complete) {
          const preferred = Number(d.startTime.slice(0, 2)) * 60 + Number(d.startTime.slice(3));
          const duration = rental ? 0 : eventHours(d.startTime, d.endTime) * 60;
          const clock = (value) =>
            `${String(Math.floor((value % 1440) / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
          const candidates = Array.from({ length: 48 }, (_, i) => i * 30)
            .filter((n) => clock(n) >= RULES.earliestStart && clock(n) <= RULES.latestStart && n !== preferred)
            .sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred) || a - b);
          for (const minutes of candidates) {
            const startTime = clock(minutes),
              endTime = rental ? null : clock(minutes + duration);
            if ((await check(d.date, startTime, endTime)).available) times.push({ date: d.date, startTime, endTime });
            if (times.length === 3) break;
          }
        }
        return {
          dates,
          times,
          holdsSlot: false,
          checkedAt: Date.now(),
          scope: 'Calendar rules only. Choose an option explicitly; stock and staffing need confirmation.'
        };
      }
      if (name === 'prepare_reservation') {
        const catalog = await getCatalog();
        const next = validateBookingPatch(bookingDraft, modelBookingPatch(args.patch), catalog, args.clearFields);
        if (isRental(next.serviceType) && !next.packageSlug)
          next.packageSlug = catalog.packages.find(
            (p) => p.kind === 'rental' && p.visible !== false && !p.archived
          )?.slug;
        bookingDraft = cleanAssistantIntent(next);
        return bookingPlan(bookingDraft, catalog);
      }
      if (name === 'alternative_dates') {
        const rental = isRental(bookingDraft.serviceType);
        if (!rental && (!args.endTime || endTimeProblem(args.startTime, args.endTime)))
          return { error: 'Ask for valid start and end times for a two-to-six-hour event.' };
        const alternatives = [];
        for (let day = 1; day <= args.days && alternatives.length < 3; day++) {
          const next = new Date(`${args.date}T00:00:00Z`);
          next.setUTCDate(next.getUTCDate() + day);
          if (args.weekendsOnly && ![0, 6].includes(next.getUTCDay())) continue;
          const result = await (rental
            ? rentalAvailability(next.toISOString().slice(0, 10), args.startTime)
            : availability(next.toISOString().slice(0, 10), args.startTime, args.endTime));
          if (result.available)
            alternatives.push({
              date: result.date || next.toISOString().slice(0, 10),
              startTime: args.startTime,
              endTime: rental ? null : args.endTime
            });
        }
        return {
          alternatives,
          checkedAt: Date.now(),
          holdsSlot: false,
          scope: 'Calendar rules only. No date was selected; ask the customer which alternative they prefer.'
        };
      }
      if (name === 'estimate_reservation' || name === 'recommend_budget') {
        const catalog = await getCatalog();
        validateBookingPatch({}, bookingDraft, catalog);
        if (bookingDraft.planningMode === 'custom' && !isRental(bookingDraft.serviceType)) {
          if (name === 'recommend_budget' || !bookingDraft.packageProposalRef)
            return {
              error: 'Continue on AI Budgeting & Package to build and choose custom options.'
            };
          const option = await readPackageProposal?.(bookingDraft.packageProposalRef);
          if (!option) return { error: 'Review and choose a current custom package option.' };
          const entry = {
            id: randomUUID(),
            packageName: option.packageSnapshot.name,
            serviceType: bookingDraft.serviceType,
            guests: bookingDraft.guests,
            knownSubtotal: option.estimate.knownTotal,
            lines: [{ name: 'Known custom package estimate', amount: option.estimate.knownTotal }],
            pendingQuotation: [...option.pending, ...option.estimate.unknownCharges.map((v) => v.label)],
            estimate: option.estimate,
            finalQuotation: false,
            intent: bookingDraft,
            summary: bookingPlan(bookingDraft, { ...catalog, selectedPackageProposal: option }).summary,
            note: 'The team confirms the final quotation. This estimate does not hold a date or stock.'
          };
          estimates.set(entry.id, entry);
          return entry;
        }
        const missingQuantity = bookingPlan(bookingDraft, catalog).missing.find((v) => v.field.startsWith('addonQty.'));
        if (missingQuantity) return { error: missingQuantity.question };
        if (name === 'recommend_budget' && !bookingDraft.budget)
          return { error: 'Ask the customer for a target budget first.' };
        if (isRental(bookingDraft.serviceType)) {
          const items = Object.entries(bookingDraft.rentalQty || {}).map(([id, qty]) => ({
            item: (catalog.rentals || []).find((v) => v.id === id && !v.archived),
            qty
          }));
          if (!items.length || items.some((v) => !v.item))
            return { error: 'Ask for currently offered rental items and their quantities.' };
          const pendingQuotation = items.filter((v) => v.item.price == null).map((v) => v.item.name);
          if (!bookingDraft.fulfilment) pendingQuotation.push('Pickup or delivery must be chosen');
          const lines = items
            .filter((v) => v.item.price != null)
            .map((v) => ({ name: `${v.item.name} × ${v.qty}`, amount: v.item.price * v.qty }));
          if (bookingDraft.fulfilment === 'delivery')
            lines.push({ name: 'Listed delivery fee', amount: RENTAL.deliveryFee });
          const entry = {
            id: randomUUID(),
            packageName: 'Equipment rental',
            serviceType: bookingDraft.serviceType,
            guests: 0,
            knownSubtotal: lines.reduce((n, v) => n + v.amount, 0),
            lines,
            pendingQuotation,
            finalQuotation: false,
            intent: bookingDraft,
            summary: bookingPlan(bookingDraft, catalog).summary,
            note: 'Rental stock and final delivery arrangements must be checked in the booking form and confirmed by the team.'
          };
          estimates.set(entry.id, entry);
          return entry;
        }
        if (!bookingDraft.guests || !bookingDraft.serviceType)
          return { error: 'Ask for guest count and buffet or catering-only service first.' };
        const offered = catalog.packages.filter((p) => p.visible !== false && !p.archived && p.kind !== 'rental');
        const candidates =
          name === 'recommend_budget'
            ? offered.slice(0, 20)
            : offered.filter((p) => p.slug === bookingDraft.packageSlug);
        if (!candidates.length) return { error: 'Ask the customer to choose a currently published package.' };
        const results = [];
        for (const pkg of candidates) {
          const result = await this.run('estimate_event', {
            packageId: pkg.id,
            serviceType: bookingDraft.serviceType,
            guests: bookingDraft.guests,
            date: bookingDraft.date || null,
            startTime: bookingDraft.startTime || null,
            endTime: bookingDraft.endTime || null,
            addons: (bookingDraft.addonIds || []).map((id) => ({ id, quantity: bookingDraft.addonQty?.[id] || 1 }))
          });
          if (!result.error && (name !== 'recommend_budget' || result.knownSubtotal <= bookingDraft.budget))
            results.push(result);
        }
        return name === 'recommend_budget'
          ? {
              budget: bookingDraft.budget,
              options: results.sort((a, b) => a.knownSubtotal - b.knownSubtotal).slice(0, 3),
              finalAffordabilityConfirmed: false,
              selectionChanged: false
            }
          : results[0] || { error: 'Review the current selections before estimating.' };
      }
      if (name === 'get_booking_guidance')
        return {
          customSetup: setupQuestions(await getCatalog(), bookingDraft),
          planning: planningGuide(),
          business: BUSINESS,
          timezone: 'Asia/Manila',
          minimumNoticeDays: RULES.leadDays,
          guests: { min: RULES.minGuests, max: RULES.maxGuests },
          durationHours: { min: RULES.minEventHours, max: RULES.maxEventHours },
          workflow: [
            'Create an account',
            'Review and submit the booking form',
            'Administrator prepares a quotation',
            'Customer reviews and accepts the quotation',
            'Pay through the available portal methods',
            'Payment is verified',
            'Administrator confirms the booking'
          ],
          notes: [
            'An estimate is not a final quotation.',
            'A calendar check or pending request does not hold a slot.',
            'Exactly six hours adds the current six-hour event charge; shorter events have no duration charge.',
            'Bank-transfer proofs need administrator verification. A screenshot alone does not confirm receipt of money.',
            'Cancellation and refunds depend on the booking. Review the eligible actions in the portal or ask the admin.',
            'Special requests and reproducing an inspiration photo require admin confirmation.',
            'No access to personal reservations, payment records or administrator operations is available in this assistant.'
          ]
        };
      if (name === 'check_availability') {
        const result = await availability(args.date, args.startTime, args.endTime);
        return {
          date: result.date,
          startTime: result.startTime,
          endTime: result.endTime,
          available: result.available,
          reason: result.reason,
          checkedAt: Date.now(),
          timezone: 'Asia/Manila',
          holdsSlot: false,
          scope: 'Calendar rules only; equipment and operational feasibility require their own checks.'
        };
      }
      const catalog = await getCatalog();
      const offered = catalog.packages.filter((p) => p.visible !== false && !p.archived);
      if (name === 'search_catalog') {
        const words = args.query
          .toLocaleLowerCase()
          .split(/[^\p{L}\p{N}]+/u)
          .filter((s) => s.length > 2);
        const matches = (entry) =>
          !words.length ||
          words.some((word) => `${entry.name} ${entry.description || ''}`.toLocaleLowerCase().includes(word));
        const result = {};
        if (args.kind === 'all' || args.kind === 'packages') {
          result.packages = offered.filter(matches).slice(0, 8).map(publicPackage);
          result.packages.forEach((p) => packages.set(p.id, p));
        }
        for (const kind of ['dishes', 'addons', 'rentals'])
          if (args.kind === 'all' || args.kind === kind) {
            const entries = kind === 'addons' ? bookableAddons(catalog.addons) : catalog[kind] || [];
            result[kind] = entries
              .filter((p) => !p.archived && matches(p))
              .slice(0, 16)
              .map((p) => ({
                id: p.id,
                name: p.name,
                description: p.description?.slice(0, 400),
                category: p.category,
                ...(kind !== 'dishes'
                  ? {
                      price: p.price ?? null,
                      priceStatus: p.price == null ? 'To be quoted' : 'Listed price',
                      hasQuantity: p.hasQuantity
                    }
                  : {})
              }));
          }
        return {
          ...result,
          pricePerPlate: catalog.pricePerPlate,
          minDownpayment: catalog.minDownpayment,
          sixHourFee: catalog.sixHourFee,
          buffetPricing: 'Current buffet rate per guest includes package setup. Use estimate_event for amounts.'
        };
      }
      const pkg = offered.find((p) => p.id === args.packageId);
      if (!pkg) return { error: 'That package is no longer published. Search the catalog again.' };
      packages.set(pkg.id, publicPackage(pkg));
      if (name === 'get_package')
        return {
          package: publicPackage(pkg),
          pricePerPlate: catalog.pricePerPlate,
          buffetPricing:
            'Inclusive per-person buffet pricing. The equipment price applies to catering-only; calculate an estimate before claiming a total.'
        };
      if (pkg.kind === 'rental')
        return {
          error: 'Use the rental price list and equipment booking form to choose quantities and delivery arrangements.'
        };
      if (
        Boolean(args.startTime) !== Boolean(args.endTime) ||
        (args.startTime && endTimeProblem(args.startTime, args.endTime))
      )
        return { error: 'Ask for valid start and end times for an event lasting two to six hours.' };
      const addonCatalog = bookableAddons(catalog.addons);
      const selected = args.addons.map((a) => ({
        selection: a,
        item: addonCatalog.find((p) => p.id === a.id && !p.archived)
      }));
      if (
        new Set(args.addons.map((a) => a.id)).size !== args.addons.length ||
        selected.some(({ item, selection }) => !item || (!item.hasQuantity && selection.quantity !== 1))
      )
        return { error: 'Ask the customer to review additional service choices and supported quantities.' };
      const problem = packagePickProblem(selected.map(({ item }) => item));
      if (problem) return { error: problem.message };
      const pendingQuotation = selected.filter(({ item }) => item.price == null).map(({ item }) => item.name);
      if (args.serviceType === 'Catering only' && args.guests > pkg.guests)
        pendingQuotation.push('Equipment for additional guests');
      if (!args.startTime)
        pendingQuotation.push('Event duration must be reviewed; exactly six hours adds the duration charge');
      const quote = computeQuote({
        pkg,
        pricingModel: INCLUSIVE_PRICING_MODEL,
        serviceType: args.serviceType,
        guests: args.guests,
        pricePerPlate: catalog.pricePerPlate,
        sixHourFee: catalog.sixHourFee,
        startTime: args.startTime,
        endTime: args.endTime,
        addonIds: args.addons.map((a) => a.id),
        addonQty: Object.fromEntries(args.addons.map((a) => [a.id, a.quantity])),
        addonPrices: Object.fromEntries(selected.map(({ item }) => [item.id, item.price ?? 0]))
      });
      const estimate = {
        id: randomUUID(),
        packageId: pkg.id,
        packageName: pkg.name,
        serviceType: args.serviceType,
        guests: args.guests,
        knownSubtotal: quote.net,
        lines: [
          { name: 'Package setup', amount: quote.packageTotal },
          { name: 'Buffet', amount: quote.food },
          { name: 'Duration charge', amount: quote.durationCharge },
          { name: 'Priced additional services', amount: quote.addons }
        ],
        pendingQuotation,
        finalQuotation: false,
        calculatedAt: Date.now(),
        intent: cleanAssistantIntent({
          ...bookingDraft,
          packageSlug: pkg.slug,
          addonIds: args.addons.map((v) => v.id),
          addonQty: Object.fromEntries(args.addons.map((v) => [v.id, v.quantity])),
          serviceType: args.serviceType,
          guests: args.guests,
          date: args.date,
          startTime: args.startTime,
          endTime: args.endTime
        }),
        note: 'Review the booking form, including menu and additional services. Availability is checked separately. The administrator prepares the final quotation.'
      };
      estimates.set(estimate.id, estimate);
      estimate.summary = bookingPlan(estimate.intent, catalog).summary;
      return estimate;
    }
  };
}
