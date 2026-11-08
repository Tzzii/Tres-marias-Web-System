import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeAssistantBooking } from '../../../packages/shared/src/domain/assistantBooking.js';
import { THEME_OTHER } from '../../../packages/shared/src/domain/styling.js';
import {
  applyProposalHandoff,
  cleanProposalReference,
  canClearRecoveredDraft,
  loadProposalForRestore,
  packageContextFromDraft,
  packagePlanningValues,
  packagePlanningStages,
  savedPackagePlanningStage,
  reconcilePackagePlanningValues,
  proposalDraftConflicts,
  proposalConversationAnswers,
  proposalHandoffReviewKey,
  proposalExpired,
  proposalFormPatch,
  proposalPatchIsStale
} from '../src/lib/packageProposalDraft.js';

test('custom catering skips food questions on forward, back and restored progress; buffet keeps them', () => {
  const catering = packagePlanningStages('Catering only');
  const buffet = packagePlanningStages('Buffet and Catering');
  assert.deepEqual(catering, [0, 1, 2, 3, 4, 6, 7]);
  assert.equal(catering[catering.indexOf(4) + 1], 6);
  assert.equal(catering[catering.indexOf(6) - 1], 4);
  assert.deepEqual(buffet, [0, 1, 2, 3, 4, 5, 6, 7]);
  const draft = {
    serviceType: 'Catering only',
    guests: 100,
    budget: 50000,
    occasion: 'Birthday',
    date: '2090-12-12',
    startTime: '18:00',
    endTime: '20:00',
    discussed: ['styling']
  };
  assert.equal(savedPackagePlanningStage(draft), 6);
  assert.equal(savedPackagePlanningStage({ ...draft, discussed: ['styling', 'addons'] }), 7);
  assert.equal(savedPackagePlanningStage({ ...draft, serviceType: 'Buffet and Catering' }), 5);
});

test('lost manual response plus reload reads recovery before select and never reselects a submitted reference', async () => {
  const reference = { proposalId: 'owned', revision: 2, optionId: 'recipe/base' };
  const calls = [];
  const api = {
    get: async (id) => {
      calls.push(['get', id]);
      return {
        id,
        expiresAt: 1,
        submission: { reservationRef: 'TM-EXISTING', submittedAt: 100, packageProposalRef: reference }
      };
    },
    select: async () => {
      throw new Error('Submitted recovery must never select or book again');
    }
  };
  const result = await loadProposalForRestore(reference, api);
  assert.equal(result.reservationRef, 'TM-EXISTING');
  assert.equal(result.submittedAt, 100);
  assert.deepEqual(calls, [['get', 'owned']]);
  await assert.rejects(
    () => loadProposalForRestore({ ...reference, optionId: 'another/base' }, api),
    /different selection/i
  );
  await assert.rejects(() => loadProposalForRestore({ ...reference, revision: 3 }, api), /different selection/i);
});

test('unsubmitted restore still reads before current-data select and propagates stale failures', async () => {
  const reference = { proposalId: 'owned', revision: 2, optionId: 'recipe/base' },
    calls = [];
  const api = {
    get: async () => {
      calls.push('get');
      return { id: 'owned', submission: null };
    },
    select: async (...args) => {
      calls.push(['select', ...args]);
      return { ...reference, option: {} };
    }
  };
  const result = await loadProposalForRestore(reference, api);
  assert.deepEqual(calls, ['get', ['select', 'owned', 2, 'recipe/base']]);
  assert.equal(result.selection.optionId, reference.optionId);
  await assert.rejects(
    () =>
      loadProposalForRestore(reference, {
        ...api,
        select: async () => {
          throw new Error('Expired or current stock changed');
        }
      }),
    /expired|stock/i
  );
});

test('recovery clears only an unchanged identical saved reference older than the bound request', () => {
  const reference = { proposalId: 'owned', revision: 2, optionId: 'recipe/base' };
  const saved = {
    savedAt: 90,
    form: { packageProposalRef: reference, eventName: 'Original event', referencePhotos: [{ name: 'original.png' }] }
  };
  assert.equal(canClearRecoveredDraft(saved, structuredClone(saved), reference, 100), true);
  assert.equal(canClearRecoveredDraft(saved, { ...saved, savedAt: 101 }, reference, 100), false);
  assert.equal(
    canClearRecoveredDraft(saved, { ...saved, form: { ...saved.form, eventName: 'New work' } }, reference, 100),
    false
  );
  assert.equal(canClearRecoveredDraft(saved, saved, { ...reference, optionId: 'other/base' }, 100), false);
  assert.equal(canClearRecoveredDraft(saved, saved, reference, undefined), false);
  assert.equal(saved.form.referencePhotos[0].name, 'original.png');
});

test('uploading and removing reference photos preserves edited theme, colors and design notes through continue', () => {
  const saved = {
    conversationId: 'owned-plan',
    draftRevision: 4,
    bookingDraft: {
      planningMode: 'custom',
      serviceType: 'Catering only',
      styling: { theme: '', colors: [], notes: '' }
    },
    referencePhotos: []
  };
  const local = {
    ...packagePlanningValues(saved.bookingDraft),
    styling: {
      theme: THEME_OTHER,
      themeOther: 'Garden tea party',
      colors: [
        { hex: '#FFFFFF', name: 'White' },
        { hex: '#000000', name: 'Black' }
      ],
      notes: 'Keep the floral arch away from the entrance.'
    }
  };
  const uploaded = {
    ...saved,
    draftRevision: 5,
    bookingDraft: structuredClone(saved.bookingDraft),
    referencePhotos: [{ index: 0, name: 'inspiration.png' }]
  };
  const afterUpload = reconcilePackagePlanningValues(local, saved, uploaded);
  const removed = { ...uploaded, draftRevision: 6, referencePhotos: [] };
  const afterRemove = reconcilePackagePlanningValues(afterUpload, uploaded, removed);
  assert.equal(afterUpload, local);
  assert.equal(afterRemove, local);
  const continued = mergeAssistantBooking(
    removed.bookingDraft,
    { planningStarted: true, styling: afterRemove.styling, discussed: ['styling', 'colors', 'design', 'photos'] },
    ['packageSlug']
  );
  assert.equal(continued.styling.theme, THEME_OTHER);
  assert.equal(continued.styling.themeOther, 'Garden tea party');
  assert.deepEqual(
    continued.styling.colors.map((color) => color.hex),
    ['#FFFFFF', '#000000']
  );
  assert.equal(continued.styling.notes, local.styling.notes);
});

test('a changed saved draft or different conversation replaces local answers rather than leaking old edits', () => {
  const previous = { conversationId: 'first-plan', bookingDraft: { serviceType: 'Catering only', budget: 20000 } };
  const local = { ...packagePlanningValues(previous.bookingDraft), budgetNotes: 'Unsaved first-plan notes' };
  const externalEdit = {
    ...previous,
    draftRevision: 8,
    bookingDraft: { ...previous.bookingDraft, budget: 30000, budgetNotes: 'Edited in another control' }
  };
  const reconciled = reconcilePackagePlanningValues(local, previous, externalEdit);
  assert.equal(reconciled.budget, 30000);
  assert.equal(reconciled.budgetNotes, 'Edited in another control');
  const switched = reconcilePackagePlanningValues(local, previous, {
    conversationId: 'second-plan',
    bookingDraft: previous.bookingDraft
  });
  assert.equal(switched.budgetNotes, '');
  assert.notEqual(switched, local);
});

const reference = { proposalId: 'proposal-owner-scoped', revision: 3, optionId: 'garden/replace/premium/basic' };
const context = {
  serviceType: 'Catering only',
  guests: 80,
  budget: 24000,
  date: '2027-04-10',
  startTime: '18:00',
  endTime: '22:00',
  occasion: 'Baby shower',
  preferences: 'Keep all guest seating',
  foodNotes: '',
  menu: {},
  styling: { theme: '', colors: [], notes: '' },
  addonIds: [],
  addonQty: {},
  protectedAddonIds: []
};
const option = {
  id: reference.optionId,
  packageSnapshot: { name: 'Garden setup', price: 20000, guests: 80, items: [{ name: 'Guest chairs', qty: 80 }] },
  menu: {},
  styling: context.styling,
  addonIds: [],
  addonQty: {},
  estimate: { budgetStatus: 'within', knownTotal: 20000 }
};
const proposal = () => ({
  id: reference.proposalId,
  revision: 3,
  context,
  options: [option],
  status: 'ready',
  expiresAt: Date.now() + 3600000
});
const selection = () => ({ ...reference, option });

test('proposal-card handoff carries validated chat-only answers and asks before replacing manual answers', () => {
  const conversation = {
    bookingDraft: {
      packageProposalRef: reference,
      planningMode: 'custom',
      eventName: 'Chat celebration',
      venueName: 'Chat hall',
      venueAddress: '20 Main Street',
      city: 'Malvar',
      accessNotes: 'Use the loading entrance',
      occasion: 'Other',
      occasionOther: 'Baby shower',
      packageSnapshot: { price: 1 },
      guests: 999,
      menu: { injected: true }
    }
  };
  const answers = proposalConversationAnswers(conversation, reference);
  assert.deepEqual(answers, {
    eventName: 'Chat celebration',
    venueName: 'Chat hall',
    venueAddress: '20 Main Street',
    city: 'Malvar',
    accessNotes: 'Use the loading entrance',
    occasion: 'Other',
    occasionOther: 'Baby shower'
  });
  const patch = proposalFormPatch(proposal(), selection());
  const empty = applyProposalHandoff('owner', 'owner', {}, patch, { answers });
  assert.equal(empty.eventName, 'Chat celebration');
  assert.equal(empty.venueName, 'Chat hall');
  assert.equal(empty.guests, '80');
  assert.equal(empty.packageProposalDisplay, option);
  const manual = {
    eventName: 'Manual celebration',
    venueName: 'Manual hall',
    city: 'Tanauan',
    referencePhotos: [{ name: 'manual-photo.png' }]
  };
  assert.deepEqual(proposalDraftConflicts(manual, patch, answers), ['eventName', 'venueName', 'city']);
  assert.throws(() => applyProposalHandoff('owner', 'owner', manual, patch, { answers }), /review/i);
  const reviewed = applyProposalHandoff('owner', 'owner', manual, patch, { answers, confirmed: true });
  assert.equal(reviewed.venueName, 'Chat hall');
  assert.equal(reviewed.accessNotes, 'Use the loading entrance');
  assert.deepEqual(reviewed.referencePhotos, manual.referencePhotos);
  const key = proposalHandoffReviewKey(manual, patch, answers);
  assert.notEqual(key, proposalHandoffReviewKey({ ...manual, venueName: 'New manual hall' }, patch, answers));
  assert.notEqual(key, proposalHandoffReviewKey(manual, patch, { ...answers, venueName: 'New chat hall' }));
  assert.equal(
    key,
    proposalHandoffReviewKey(
      { ...manual, referencePhotos: [...manual.referencePhotos, { name: 'copied-chat-photo.png' }] },
      patch,
      answers
    )
  );
  assert.throws(() => proposalConversationAnswers({ ...conversation, submittedRef: 'TM-OLD' }, reference), /changed/i);
  assert.throws(() => proposalConversationAnswers(conversation, { ...reference, optionId: 'other' }), /changed/i);
});

test('proposal draft submits a canonical context and excludes browser price, snapshot and identity authority', () => {
  const canonical = packageContextFromDraft(
    {
      ...context,
      guests: '80',
      budget: '24000',
      occasion: 'Other',
      occasionOther: 'Baby shower',
      budgetNotes: 'Keep all guest seating',
      customerId: 'injected-owner',
      packageId: 'injected-package',
      packageSnapshot: { price: 1 },
      price: 1
    },
    { packages: [], addons: [], dishes: [] }
  );
  assert.equal(canonical.guests, 80);
  assert.equal(canonical.budget, 24000);
  assert.equal(canonical.occasion, 'Baby shower');
  assert.equal(canonical.preferences, 'Keep all guest seating');
  assert.equal(Object.hasOwn(canonical, 'customerId'), false);
  assert.equal(Object.hasOwn(canonical, 'packageId'), false);
  assert.equal(Object.hasOwn(canonical, 'packageSnapshot'), false);
  assert.throws(() => packageContextFromDraft({ ...context, guests: 'not a count' }, { addons: [] }), /guest/i);
});

test('opaque option IDs survive handoff and expired, changed or foreign revisions cannot apply', () => {
  assert.deepEqual(cleanProposalReference({ ...reference, token: 'never copied' }), reference);
  const patch = proposalFormPatch(proposal(), selection());
  assert.equal(patch.packageProposalRef.optionId, 'garden/replace/premium/basic');
  assert.equal(patch.packageId, '');
  assert.equal(patch.packageProposalDisplay, option);
  assert.equal(proposalExpired({ expiresAt: 100 }, 100), true);
  assert.throws(() => proposalFormPatch({ ...proposal(), expiresAt: 1 }, selection()), /expired|changed/i);
  assert.throws(() => proposalFormPatch(proposal(), { ...selection(), revision: 2 }), /expired|changed/i);
  assert.throws(
    () => proposalFormPatch(proposal(), { ...selection(), proposalId: 'another-proposal' }),
    /expired|changed/i
  );
  assert.throws(
    () => proposalFormPatch(proposal(), { ...selection(), option: { ...option, id: 'different' } }),
    /verified/i
  );
});

test('owner conflict review preserves unrelated form and attachment work', () => {
  const form = {
    packageId: 'existing-package',
    eventName: 'Saved celebration',
    venueName: 'Existing hall',
    accessNotes: 'Use side entrance',
    referencePhotos: [{ name: 'reference.png', dataUrl: 'data:image/png;base64,cGhvdG8=' }]
  };
  const patch = proposalFormPatch(proposal(), selection());
  assert.deepEqual(proposalDraftConflicts(form, patch), ['package']);
  assert.throws(() => applyProposalHandoff('customer', 'customer', form, patch), /review/i);
  assert.throws(
    () => applyProposalHandoff('another-customer', 'customer', form, patch, { confirmed: true }),
    /account/i
  );
  const applied = applyProposalHandoff('customer', 'customer', form, patch, { confirmed: true });
  assert.equal(applied.eventName, form.eventName);
  assert.equal(applied.venueName, form.venueName);
  assert.equal(applied.accessNotes, form.accessNotes);
  assert.deepEqual(applied.referencePhotos, form.referencePhotos);
  assert.deepEqual(applied.packageProposalRef, reference);
  assert.equal(applied.occasion, 'Other');
  assert.equal(applied.occasionOther, 'Baby shower');
  const existingOccasion = applyProposalHandoff('customer', 'customer', { ...form, occasion: 'Birthday' }, patch, {
    confirmed: true
  });
  assert.equal(existingOccasion.occasion, 'Birthday');
});

test('financial edits become stale while unrelated completion stays independent', () => {
  const form = proposalFormPatch(proposal(), selection());
  for (const patch of [
    { guests: '81' },
    { serviceType: 'Buffet and Catering' },
    { date: '2027-04-11' },
    { startTime: '19:00' },
    { menu: { pork: ['Lechon'] } },
    { styling: { theme: 'Enchanted Garden' } },
    { addonIds: ['extra'] },
    { addonQty: { extra: 2 } },
    { foodNotes: 'No nuts' }
  ])
    assert.equal(proposalPatchIsStale(form, patch), true, `Changed selection: ${JSON.stringify(patch)}`);
  assert.equal(proposalPatchIsStale(form, { guests: 80 }), false);
  assert.equal(
    proposalPatchIsStale(form, {
      eventName: 'Birthday',
      venueName: 'Hall',
      accessNotes: 'Stairs',
      referencePhotos: []
    }),
    false
  );
  const applied = applyProposalHandoff('customer', 'customer', { foodNotes: 'Please keep my dietary request' }, form, {
    confirmed: true
  });
  assert.equal(applied.foodNotes, 'Please keep my dietary request');
  assert.equal(applied.packageProposalStale, true);
  assert.deepEqual(applied.packageProposalRef, reference);
});
