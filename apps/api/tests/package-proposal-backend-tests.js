import test from 'node:test';
import assert from 'node:assert/strict';
import { createBody, packageProposalRefSchema } from '../src/modules/package-proposals/packageProposal.schemas.js';
import { packageProposalCatalogFingerprint } from '../src/modules/catalog/catalog.service.js';
import { rankingInput, rankPackageOptions } from '../src/integrations/ai/packageProposal.openai.js';
import { cleanAssistantBooking, mergeAssistantBooking } from '@tm/shared/src/domain/assistantBooking.js';
import { assistantReservationForm } from '@tm/shared/src/domain/assistantReservation.js';
import { modelBookingPatch } from '../src/modules/assistant/assistant.booking.js';
import { createPackageProposal } from '../src/modules/package-proposals/packageProposal.service.js';

const reference = { proposalId: 'proposal-1', optionId: 'mixed/replace/premium/basic', revision: 1 };
const context = {
  serviceType: 'Catering only',
  eventName: 'Customer celebration',
  occasion: 'Birthday',
  setupPreferences: { reviewed: true, chairName: '', items: [] },
  guests: 100,
  budget: 15000,
  date: '2030-12-20',
  startTime: '12:00',
  endTime: '16:00'
};
const option = {
  id: reference.optionId,
  packageSnapshot: { name: 'Simple setup', items: [{ name: 'Chairs', qty: 100 }] },
  addons: [],
  recipe: { change: null },
  estimate: { knownTotal: 12000, budgetStatus: 'within', unknownCharges: [] }
};

test('proposal requests reject client prices/snapshots and references retain opaque slashes', () => {
  const input = {
    requestId: 'd851af61-635d-49df-b489-cb1b98c3aa2c',
    context,
    reviewedCatalogFingerprint: 'a'.repeat(64)
  };
  assert.equal(createBody.safeParse(input).success, true);
  const { setupPreferences, ...unreviewed } = context;
  assert.equal(createBody.safeParse({ ...input, context: unreviewed }).success, false);
  assert.equal(createBody.safeParse({ ...input, context: { ...context, eventName: '' } }).success, false);
  assert.equal(createBody.safeParse({ ...input, packageSnapshot: option.packageSnapshot }).success, false);
  assert.equal(createBody.safeParse({ ...input, context: { ...context, price: 1 } }).success, false);
  assert.deepEqual(packageProposalRefSchema.parse(reference), reference);
  assert.equal(packageProposalRefSchema.safeParse({ ...reference, option }).success, false);
});

test('new generation rejects missing setup review before any database or provider work', async () => {
  await assert.rejects(
    createPackageProposal('customer', { context: { serviceType: 'Catering only' } }),
    (error) => error.code === 'INVALID' && /setup/i.test(error.message)
  );
});

test('proposal fingerprint retains component positions and approved recipe priority', () => {
  const a = {
    packages: [{ id: 'p', items: [{ name: 'Chairs' }, { name: 'Tables' }] }],
    addons: [],
    dishes: [],
    pricePerPlate: 600,
    sixHourFee: 0,
    packageProposalRules: { enabled: true, recipes: [{ id: 'simple' }, { id: 'full' }] }
  };
  const reorderedItems = structuredClone(a);
  reorderedItems.packages[0].items.reverse();
  const reorderedRules = structuredClone(a);
  reorderedRules.packageProposalRules.recipes.reverse();
  assert.notEqual(packageProposalCatalogFingerprint(a), packageProposalCatalogFingerprint(reorderedItems));
  assert.notEqual(packageProposalCatalogFingerprint(a), packageProposalCatalogFingerprint(reorderedRules));
  assert.equal(packageProposalCatalogFingerprint(a), packageProposalCatalogFingerprint(structuredClone(a)));
});

test('ranking preserves structured preference priorities while excluding free text and personal details', () => {
  const input = rankingInput(
    { ...context, preferences: 'PRIVATE PERSON: simple, prioritize food over decor', venueAddress: 'PRIVATE ADDRESS' },
    [option]
  );
  assert.ok(input.priorities.includes('simplicity'));
  assert.ok(input.priorities.includes('food'));
  assert.equal(input.foodOverDecor, true);
  assert.ok(!JSON.stringify(input).includes('PRIVATE'));
});

test('ranking validates grounded unique IDs and settles the existing assistant spend reservation', async () => {
  const settings = {
    enabled: true,
    apiKey: 'fixture-only',
    model: 'gpt-6-luna',
    timeoutMs: 100,
    dailyBudgetMicro: 1000000,
    monthlyBudgetMicro: 10000000,
    maxInputBytes: 64000
  };
  const calls = [],
    settled = [];
  const spend = {
    reserve: async (...args) => {
      calls.push(args);
      return 'spend-1';
    },
    settle: async (...args) => settled.push(args)
  };
  const client = {
    responses: {
      create: async (body) => {
        assert.equal(body.model, settings.model);
        assert.equal(body.store, false);
        assert.equal(body.text.format.strict, true);
        return {
          status: 'completed',
          output_text: JSON.stringify({ optionIds: [option.id] }),
          usage: { input_tokens: 100, output_tokens: 20 }
        };
      }
    }
  };
  assert.deepEqual(await rankPackageOptions({ context, candidates: [option], settings, spend, client }), [option.id]);
  assert.equal(calls.length, 1);
  assert.equal(settled.length, 1);
  assert.equal(settled[0][1], 20);
  client.responses.create = async () => ({
    status: 'completed',
    output_text: JSON.stringify({ optionIds: ['invented'] })
  });
  await assert.rejects(rankPackageOptions({ context, candidates: [option], settings, spend, client }), {
    code: 'ASSISTANT_UNAVAILABLE'
  });
  await assert.rejects(
    rankPackageOptions({
      context,
      candidates: [option],
      settings: { ...settings, dailyBudgetMicro: 0 },
      spend,
      client
    }),
    { code: 'ASSISTANT_UNAVAILABLE' }
  );
  assert.equal(calls.length, 2);
});

test('package ranking retains its reservation when provider token usage is incomplete', async () => {
  const settled = [],
    requests = [];
  const settings = {
    enabled: true,
    apiKey: 'fixture-only',
    model: 'gpt-6-luna',
    timeoutMs: 100,
    dailyBudgetMicro: 1000000,
    monthlyBudgetMicro: 10000000,
    maxInputBytes: 64000
  };
  await rankPackageOptions({
    context,
    candidates: [option],
    settings,
    spend: { reserve: async () => 'paid', settle: async (...args) => settled.push(args) },
    client: {
      responses: {
        create: async (body) => {
          requests.push(body);
          return { status: 'completed', output_text: JSON.stringify({ optionIds: [option.id] }), usage: {} };
        }
      }
    }
  });
  assert.equal(settled.length, 1);
  assert.equal(settled[0][1], undefined);
  assert.ok(requests[0].prompt_cache_key);
  assert.equal(requests[0].prompt_cache_retention, undefined);
});

test('assistant reference remains sanitized, reaches form, and is invalidated by financial edits', () => {
  const draft = cleanAssistantBooking({
    ...context,
    planningMode: 'custom',
    packageProposalRef: { ...reference, price: 1 },
    packageSnapshot: { price: 1 }
  });
  assert.deepEqual(draft.packageProposalRef, reference);
  assert.equal(draft.packageSnapshot, undefined);
  const form = assistantReservationForm(draft);
  assert.equal(form.packageId, '');
  assert.deepEqual(form.packageProposalRef, reference);
  assert.equal(mergeAssistantBooking(draft, { guests: 120 }).packageProposalRef, undefined);
  assert.deepEqual(mergeAssistantBooking(draft, { venueName: 'Venue completed later' }).packageProposalRef, reference);
  assert.equal(
    modelBookingPatch({ packageProposalRef: reference, planningMode: 'custom' }).packageProposalRef,
    undefined
  );
});

test('reviewed-field clears invalidate custom references through either supported clear channel', () => {
  const draft = { ...context, planningMode: 'custom', packageProposalRef: reference };
  assert.equal(mergeAssistantBooking(draft, { clearedFields: ['budget'] }).packageProposalRef, undefined);
  assert.equal(mergeAssistantBooking(draft, {}, ['budget']).packageProposalRef, undefined);
  assert.equal(
    mergeAssistantBooking({ ...draft, clearedFields: ['budget'] }, { venueName: 'Venue' }).packageProposalRef,
    undefined
  );
});

test('nonfinancial clears and already-applied historical clear markers preserve the custom reference', () => {
  const draft = { ...context, venueName: 'Venue', planningMode: 'custom', packageProposalRef: reference };
  const edited = mergeAssistantBooking(draft, { clearedFields: ['venueName'] });
  assert.deepEqual(edited.packageProposalRef, reference);
  assert.equal(edited.venueName, undefined);
  assert.deepEqual(
    mergeAssistantBooking({ ...draft, clearedFields: ['foodNotes'] }, { city: 'Batangas' }).packageProposalRef,
    reference
  );
  const restored = mergeAssistantBooking(draft, { clearedFields: ['budget'], budget: context.budget });
  assert.deepEqual(restored.packageProposalRef, reference);
  assert.equal(restored.budget, context.budget);
  assert.ok(!restored.clearedFields?.includes('budget'));
});
