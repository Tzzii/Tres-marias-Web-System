import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistantTools, ASSISTANT_TOOLS } from '../src/modules/assistant/assistant.tools.js';
import { bookingDraftFromForm, bookingPlan, validateBookingPatch } from '../src/modules/assistant/assistant.booking.js';
import { createAssistantProvider } from '../src/integrations/ai/assistant.openai.js';
import { withScopeVerdicts } from './helpers/assistant-scope-client.js';

import { createAssistantService } from '../src/modules/assistant/assistant.service.js';
import {
  cleanAssistantBooking,
  applyAssistantBooking,
  mergeAssistantBooking
} from '@tm/shared/src/domain/assistantBooking.js';

const providerWithScopeFixtures = (options) =>
  createAssistantProvider({
    ...options,
    client: withScopeVerdicts(options.client)
  });

const catalog = {
  packages: [
    {
      id: 'p1',
      slug: 'classic',
      name: 'Classic',
      guests: 100,
      price: 15000,
      kind: 'package',
      visible: true,
      items: []
    },
    { id: 'p2', slug: 'small', name: 'Small', guests: 60, price: 8000, kind: 'package', visible: true, items: [] },
    { id: 'rental', slug: 'equipment-rental', name: 'Equipment Rental', kind: 'rental', visible: true },
    { id: 'hidden', slug: 'hidden', name: 'Hidden', kind: 'package', visible: false, price: 1 }
  ],
  addons: [
    { id: 'tent', name: 'Tent', price: 1000, hasQuantity: true, sizes: [] },
    { id: 'custom', name: 'Custom styling', price: null, hasQuantity: false, sizes: [] }
  ],
  rentals: [
    { id: 'chair', name: 'Chair', price: 25 },
    { id: 'table', name: 'Table', price: 100 }
  ],
  dishes: [{ id: 'pork-1', name: 'Lechon Kawali', category: 'pork' }],
  pricePerPlate: 600,
  sixHourFee: 5000,
  minDownpayment: 3000
};
const getCatalog = async () => structuredClone(catalog);
const full = {
  eventName: 'Birthday celebration',
  occasion: 'Birthday',
  guests: 100,
  serviceType: 'Buffet and Catering',
  packageSlug: 'classic',
  date: '2090-12-12',
  startTime: '12:00',
  endTime: '16:00',
  venueName: 'Event hall',
  venueAddress: '123 Main St',
  city: 'Malvar',
  menu: { pork: ['Lechon Kawali'], chicken: ['Chicken BBQ'], fish: ['Sweet and sour fish'], vegetable: ['Chopsuey'] },
  styling: {
    theme: 'Rustic',
    colors: [
      { hex: '#FFFFFF', name: 'White' },
      { hex: '#9CAF88', name: 'Sage' }
    ],
    notes: 'Simple flowers'
  },
  addonIds: ['tent'],
  addonQty: { tent: 2 },
  foodNotes: 'No peanuts',
  accessNotes: 'Use the side entrance',
  budget: 100000,
  budgetNotes: 'Keep the menu',
  discussed: ['styling', 'addons', 'notes', 'budget']
};
const prepare = (tools, patch, clearFields = []) => tools.run('prepare_reservation', { patch, clearFields });

test('guided interview keeps earlier answers, supports partial review and replaces explicit nested edits only', async () => {
  const tools = createAssistantTools({ getCatalog });
  let plan = await prepare(tools, { guests: 100 });
  assert.equal(plan.canReview, true);
  assert.ok(plan.missing.length);
  assert.equal(
    plan.nextQuestions.some((q) => /many guests/.test(q)),
    false
  );
  plan = await prepare(tools, full);
  assert.equal(plan.complete, true);
  assert.equal(plan.draft.guests, 100);
  plan = await prepare(tools, { guests: 120, menu: { pork: ['Pork BBQ'] }, styling: { notes: 'Ivory linens' } });
  assert.equal(plan.draft.guests, 120);
  assert.deepEqual(plan.draft.menu.chicken, ['Chicken BBQ']);
  assert.equal(plan.draft.styling.theme, 'Rustic');
  assert.equal(plan.draft.venueName, 'Event hall');
  assert.equal(plan.summary.find((r) => r.label === 'Additional services').value, 'Tent × 2');
});

test('service switches clear incompatible choices and rental plans estimate published quantities plus delivery', async () => {
  const tools = createAssistantTools({ getCatalog, draft: full });
  const plan = await prepare(tools, {
    serviceType: 'Equipment rental',
    rentals: [
      { itemId: 'chair', quantity: 100 },
      { itemId: 'table', quantity: 10 }
    ],
    fulfilment: 'delivery'
  });
  assert.equal(plan.draft.packageSlug, 'equipment-rental');
  assert.equal(plan.draft.guests, undefined);
  assert.equal(plan.draft.menu, undefined);
  assert.equal(plan.draft.addonIds, undefined);
  const estimate = await tools.run('estimate_reservation', {});
  assert.equal(estimate.knownSubtotal, 3600);
  assert.equal(estimate.finalQuotation, false);
  assert.equal(estimate.intent.rentalQty.chair, 100);
  assert.match(estimate.note, /stock/);
  await assert.rejects(
    () => prepare(tools, { rentals: [{ itemId: 'not-offered', quantity: 1 }] }),
    (e) => e.code === 'INVALID'
  );
});

test('budget suggestions do not change selections or guarantee unpriced services', async () => {
  const tools = createAssistantTools({
    getCatalog,
    draft: { ...full, serviceType: 'Catering only', budget: 12000, addonIds: ['custom'], addonQty: { custom: 1 } }
  });
  const result = await tools.run('recommend_budget', {});
  assert.equal(result.selectionChanged, false);
  assert.equal(result.finalAffordabilityConfirmed, false);
  assert.deepEqual(
    result.options.map((v) => v.packageName),
    ['Small']
  );
  assert.ok(result.options[0].pendingQuotation.includes('Custom styling'));
  assert.equal(tools.bookingDraft.packageSlug, 'classic');
  assert.equal(result.options[0].intent.addonIds[0], 'custom');
});

test('rentals ask for pickup/delivery time only and use rental calendar rules for checks and alternatives', async () => {
  let checks = 0;
  const tools = createAssistantTools({
    getCatalog,
    availability: async () => {
      throw Error('Catering calendar must not run');
    },
    rentalAvailability: async (date, startTime) => {
      checks++;
      return { date, startTime, available: true, reason: '', note: 'Private note' };
    }
  });
  const plan = await prepare(tools, {
    eventName: 'Rentals',
    occasion: 'Birthday',
    serviceType: 'Equipment rental',
    date: '2090-12-12',
    startTime: '12:00',
    rentals: [{ itemId: 'chair', quantity: 100 }],
    fulfilment: 'pickup'
  });
  assert.equal(plan.complete, true);
  assert.equal(plan.draft.endTime, undefined);
  const availability = await tools.run('check_reservation_availability', {});
  assert.equal(availability.available, true);
  assert.equal(availability.holdsSlot, false);
  assert.equal(JSON.stringify(availability).includes('Private'), false);
  const alternatives = await tools.run('alternative_dates', {
    date: '2090-12-12',
    startTime: '12:00',
    endTime: null,
    days: 3,
    weekendsOnly: false
  });
  assert.equal(alternatives.alternatives.length, 3);
  assert.equal(checks, 4);
  await assert.rejects(
    () => prepare(tools, { rentals: [{ itemId: 'chair', quantity: 2001 }] }),
    (e) => e.code === 'INVALID'
  );
});

test('alternative dates are bounded, require a valid schedule and remove private calendar data', async () => {
  const checked = [];
  const tools = createAssistantTools({
    getCatalog,
    availability: async (date, startTime, endTime) => {
      checked.push(date);
      return { date, startTime, endTime, available: true, note: 'Private booking', customer: 'Private name' };
    }
  });
  const result = await tools.run('alternative_dates', {
    date: '2090-01-01',
    startTime: '12:00',
    endTime: '14:00',
    days: 14,
    weekendsOnly: false
  });
  assert.equal(checked.length, 3);
  assert.equal(result.alternatives.length, 3);
  assert.equal(result.holdsSlot, false);
  assert.equal(JSON.stringify(result).includes('Private'), false);
  assert.equal(tools.bookingDraft.date, undefined);
  assert.ok(
    (
      await tools.run('alternative_dates', {
        date: '2090-01-01',
        startTime: '12:00',
        endTime: '12:30',
        days: 14,
        weekendsOnly: false
      })
    ).error
  );
});

test('draft boundaries reject forged prices, stale IDs, unsupported quantities and invalid schedules', () => {
  for (const patch of [
    { price: 0 },
    { packageSlug: 'hidden' },
    { addonIds: ['deleted'] },
    { addonIds: ['custom'], addonQty: { custom: 2 } },
    { startTime: '12:00', endTime: '13:00' },
    { rentalQty: { deleted: 10 } }
  ])
    assert.throws(() => validateBookingPatch({}, patch, catalog));
  const clean = cleanAssistantBooking({
    ...full,
    agreeTerms: true,
    customerId: 'another',
    quotation: { total: 1 },
    referencePhotos: [{ url: 'https://attacker.invalid' }],
    styling: { ...full.styling, referencePhoto: { url: 'https://attacker.invalid' } }
  });
  assert.equal(clean.agreeTerms, undefined);
  assert.equal(clean.customerId, undefined);
  assert.equal(clean.quotation, undefined);
  assert.equal(clean.referencePhotos, undefined);
  assert.equal(clean.styling.referencePhoto, undefined);
});

test('handoff applies every reviewed detail, preserves unrelated saved work and honors removals', () => {
  const base = {
    eventName: 'Old event',
    venueName: 'Old venue',
    referencePhotos: [{ id: 'keep-photo' }],
    otherCustomerField: 'keep',
    addonIds: ['old'],
    budgetDraft: { amount: '50000' }
  };
  const form = applyAssistantBooking(base, full, catalog);
  assert.equal(form.packageId, 'p1');
  assert.equal(form.guests, '100');
  assert.deepEqual(form.menu.pork, ['Lechon Kawali']);
  assert.equal(form.addonQty.tent, 2);
  assert.equal(form.venueAddress, '123 Main St');
  assert.equal(form.budgetDraft.amount, '100000');
  assert.deepEqual(form.referencePhotos, base.referencePhotos);
  assert.equal(form.otherCustomerField, 'keep');
  assert.equal(form.agreeTerms, undefined);
  const removed = mergeAssistantBooking(full, {}, ['venueName', 'addonIds', 'addonQty']);
  const cleared = applyAssistantBooking(base, removed, catalog);
  assert.equal(cleared.venueName, '');
  assert.deepEqual(cleared.addonIds, []);
  assert.deepEqual(cleared.addonQty, {});
});

test('explicit removals survive server review validation instead of restoring saved form values', () => {
  const removed = mergeAssistantBooking(full, {}, ['venueName', 'addonIds', 'addonQty', 'budget']);
  const reviewed = validateBookingPatch({}, removed, catalog);
  const applied = applyAssistantBooking(
    { venueName: 'Do not restore', addonIds: ['tent'], addonQty: { tent: 3 }, budgetDraft: { amount: '99999' } },
    reviewed,
    catalog
  );
  assert.equal(applied.venueName, '');
  assert.deepEqual(applied.addonIds, []);
  assert.equal(applied.budgetDraft.amount, '');
});

test('provided optional details do not produce repeated follow-up questions', () => {
  const plan = bookingPlan({ ...full, discussed: [] }, catalog);
  assert.deepEqual(plan.optional, []);
  const skipped = bookingPlan(
    {
      ...full,
      styling: undefined,
      addonIds: [],
      accessNotes: '',
      foodNotes: '',
      budget: undefined,
      discussed: ['styling', 'addons', 'notes', 'budget']
    },
    catalog
  );
  assert.deepEqual(skipped.optional, []);
});

test('an unfinished theme or motif is saved and resumed as incomplete rather than losing the other answers', async () => {
  const tools = createAssistantTools({ getCatalog });
  const plan = await prepare(tools, {
    guests: 100,
    styling: { theme: 'Other', colors: [{ hex: '#FFFFFF', name: 'White', metallic: false }] }
  });
  assert.equal(plan.draft.guests, 100);
  assert.equal(plan.draft.styling.colors.length, 1);
  assert.equal(plan.complete, false);
  assert.ok(plan.missing.some((v) => v.field === 'styling'));
  const resumed = bookingDraftFromForm(
    { guests: '100', styling: { theme: 'Other', colors: [{ hex: '#FFFFFF', name: 'White' }] } },
    catalog
  );
  assert.equal(resumed.guests, 100);
  assert.equal(resumed.styling.theme, 'Other');
});

test('changing from a saved rental form to partial catering clears its incompatible package', () => {
  const base = {
    packageId: 'rental',
    serviceType: 'Equipment rental',
    rentalQty: { chair: 10 },
    menu: {},
    styling: {}
  };
  const form = applyAssistantBooking(base, { serviceType: 'Buffet and Catering', guests: 100 }, catalog);
  assert.equal(form.packageId, '');
  assert.equal(form.serviceType, 'Buffet and Catering');
  assert.deepEqual(form.rentalQty, {});
});

test('partial catering selections identify missing addon quantities instead of assuming one', async () => {
  const tools = createAssistantTools({ getCatalog, draft: { ...full, addonIds: ['tent'], addonQty: {} } });
  const plan = await tools.run('get_reservation_draft', {});
  assert.equal(plan.complete, false);
  assert.ok(plan.missing.some((v) => v.field === 'addonQty.tent'));
  const estimate = await tools.run('estimate_reservation', {});
  assert.ok(estimate.error);
});

test('dessert add-ons ask for dessert details instead of repeating an already complete four-dish menu', () => {
  const dessertCatalog = {
    ...catalog,
    addons: [...catalog.addons, { id: 'add-dessert', name: 'Dessert', hasQuantity: false, price: null, sizes: [] }]
  };
  const plan = bookingPlan({ ...full, addonIds: ['add-dessert'], addonQty: {} }, dessertCatalog);
  const missing = plan.missing.find((v) => v.field.startsWith('menu.'));
  assert.ok(missing);
  assert.match(missing.question, /dessert/i);
  assert.doesNotMatch(missing.question, /four dishes/i);
});

test('resume maps an existing form to public selections and drops provider/action/upload metadata', () => {
  const resumed = bookingDraftFromForm(
    {
      ...full,
      packageSlug: undefined,
      packageId: 'p1',
      guests: '100',
      budgetDraft: { amount: '80000', preferences: 'Simple setup', proposalRef: 'private-proposal' },
      agreeTerms: true,
      status: 'approved',
      referencePhotos: ['private-photo']
    },
    catalog
  );
  assert.equal(resumed.packageSlug, 'classic');
  assert.equal(resumed.guests, 100);
  assert.equal(resumed.budget, 80000);
  assert.equal(resumed.agreeTerms, undefined);
  assert.equal(resumed.proposalRef, undefined);
  assert.equal(resumed.status, undefined);
  assert.equal(resumed.referencePhotos, undefined);
});

test('provider retains the saved plan beyond truncated text history and takes draft values only from validated tools', async () => {
  const calls = [];
  const provider = providerWithScopeFixtures({
    settings: { model: 'gpt-6-luna', maxCalls: 3, maxInputBytes: 64000, maxOutputTokens: 2048, timeoutMs: 1000 },
    client: {
      responses: {
        create: async (body) => {
          calls.push(body);
          return calls.length === 1
            ? {
                status: 'completed',
                output: [
                  {
                    type: 'function_call',
                    name: 'prepare_reservation',
                    call_id: 'edit',
                    arguments: JSON.stringify({ patch: { guests: 120 }, clearFields: [] })
                  }
                ],
                usage: {}
              }
            : {
                status: 'completed',
                output: [],
                output_text: JSON.stringify({
                  answer: 'Updated to 120 guests. Would you like to review your reservation?',
                  packageIds: [],
                  estimateIds: [],
                  needsAdmin: false
                }),
                usage: {}
              };
        }
      }
    }
  });
  const result = await provider.answer({
    text: 'Make it 120 guests',
    history: [],
    tools: createAssistantTools({ getCatalog, draft: full }),
    spend: { reserve: async () => 1, settle: async () => {} },
    signal: new AbortController().signal
  });
  assert.equal(result.bookingDraft.guests, 120);
  assert.equal(result.bookingDraft.venueName, full.venueName);
  assert.ok(calls[0].input[0].content.includes('100'));
  assert.ok(calls[0].instructions.includes('partial plans'));
  const schema = ASSISTANT_TOOLS.find((v) => v.name === 'prepare_reservation');
  assert.equal(schema.strict, true);
  assert.equal(schema.parameters.additionalProperties, false);
});

test('resume and manual review do not charge a question and still require ownership before reading catalog data', async () => {
  let writes = 0,
    readable = true,
    reads = 0;
  let snapshot = { bookingDraft: {}, draftRevision: 0, allowance: { remaining: 2 }, messages: [] };
  const service = createAssistantService({
    settings: { enabled: true, apiKey: 'fixture', dailyBudgetMicro: 1, monthlyBudgetMicro: 1 },
    toolsFactory: (options) => createAssistantTools({ ...options, availability: async () => ({ available: true }) }),
    getCatalog: async () => {
      reads++;
      return catalog;
    },
    repo: {
      read: async () => {
        if (!readable) throw Object.assign(Error('Not found'), { code: 'NOT_FOUND' });
        return snapshot;
      },
      updateDraft: async (actor, id, draft) => {
        writes++;
        snapshot = { ...snapshot, bookingDraft: draft, draftRevision: snapshot.draftRevision + 1 };
      }
    }
  });
  const result = await service.updateDraft(
    { customerId: 'owner' },
    'owned',
    { form: { ...full, packageId: 'p1' }, revision: 0 },
    { resume: true }
  );
  assert.equal(result.bookingPlan.complete, true);
  assert.equal(result.allowance.remaining, 2);
  assert.equal(writes, 1);
  readable = false;
  const before = reads;
  await assert.rejects(
    () => service.updateDraft({ customerId: 'other' }, 'owned', { form: {}, revision: 0 }, { resume: true }),
    (e) => e.code === 'NOT_FOUND'
  );
  assert.equal(reads, before);
});

test('applyAssistantBooking resets stale custom proposal state on fresh custom handoff, explicit clear and catalog/rental switch', () => {
  const staleBase = {
    packageId: '',
    planningMode: 'custom',
    packageProposalRef: { proposalId: 'old-prop', optionId: 'lean', revision: 1 },
    packageProposalDisplay: { id: 'old' },
    packageProposalContext: { guests: 50 },
    packageProposalStale: true
  };
  const freshRef = { proposalId: 'new-prop', optionId: 'balanced', revision: 2 };
  const customHandoff = applyAssistantBooking(
    staleBase,
    { planningMode: 'custom', packageProposalRef: freshRef, guests: 100 },
    catalog
  );
  assert.equal(customHandoff.packageId, '');
  assert.equal(customHandoff.planningMode, 'custom');
  assert.deepEqual(customHandoff.packageProposalRef, freshRef);
  assert.equal(customHandoff.packageProposalDisplay, null);
  assert.equal(customHandoff.packageProposalContext, null);
  assert.equal(customHandoff.packageProposalStale, false);

  const clearedHandoff = applyAssistantBooking(staleBase, { clearedFields: ['packageProposalRef'] }, catalog);
  assert.equal(clearedHandoff.packageProposalRef, null);
  assert.equal(clearedHandoff.packageProposalDisplay, null);
  assert.equal(clearedHandoff.packageProposalContext, null);
  assert.equal(clearedHandoff.packageProposalStale, false);

  const catalogHandoff = applyAssistantBooking(staleBase, { packageSlug: 'classic' }, catalog);
  assert.equal(catalogHandoff.packageId, 'p1');
  assert.equal(catalogHandoff.planningMode, 'catalog');
  assert.equal(catalogHandoff.packageProposalRef, null);
  assert.equal(catalogHandoff.packageProposalDisplay, null);
  assert.equal(catalogHandoff.packageProposalContext, null);
  assert.equal(catalogHandoff.packageProposalStale, false);

  const rentalHandoff = applyAssistantBooking(staleBase, { serviceType: 'Equipment rental' }, catalog);
  assert.equal(rentalHandoff.packageId, 'rental');
  assert.equal(rentalHandoff.planningMode, 'catalog');
  assert.equal(rentalHandoff.packageProposalRef, null);
  assert.equal(rentalHandoff.packageProposalDisplay, null);
  assert.equal(rentalHandoff.packageProposalContext, null);
  assert.equal(rentalHandoff.packageProposalStale, false);
});
