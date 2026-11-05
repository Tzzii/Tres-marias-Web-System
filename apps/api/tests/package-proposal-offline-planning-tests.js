import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistantService } from '../src/modules/assistant/assistant.service.js';

test('signed-in customers can open, edit and reload structured plans with paid AI disabled', async () => {
  const actor = { customerId: 'customer-1' };
  let draft = {},
    revision = 0,
    opened = 0,
    paidTurns = 0,
    providerCalls = 0;
  const providerCall = async () => {
    providerCalls++;
    throw new Error('Provider must remain untouched.');
  };
  const repo = {
    cleanup: async () => {},
    open: async (owner) => {
      opened++;
      return { actor: owner, conversationId: 'conversation-1' };
    },
    read: async () => ({
      conversationId: 'conversation-1',
      bookingDraft: draft,
      draftRevision: revision,
      messages: [],
      referencePhotos: [],
      submittedRef: null,
      allowance: { remaining: 10 }
    }),
    updateDraft: async (owner, id, value, expectedRevision) => {
      assert.equal(expectedRevision, revision);
      draft = value;
      revision++;
    },
    begin: async () => {
      paidTurns++;
      throw new Error('Paid turn must remain untouched.');
    }
  };
  const service = createAssistantService({
    settings: { enabled: false, voiceEnabled: false, apiKey: '', dailyBudgetMicro: 0, monthlyBudgetMicro: 0 },
    repo,
    provider: { answer: providerCall, transcribe: providerCall, speak: providerCall },
    getCatalog: async () => ({ packages: [], addons: [], rentals: [], dishes: [] }),
    clock: () => 1000
  });
  const openedPlan = await service.open(actor);
  assert.equal(openedPlan.conversationId, 'conversation-1');
  assert.equal(service.publicConfig().available, false);
  const updated = await service.updateDraft(actor, 'conversation-1', {
    revision: 0,
    draft: { planningStarted: true, planningMode: 'custom', budget: 20000 }
  });
  assert.equal(updated.bookingDraft.budget, 20000);
  assert.equal(updated.bookingDraft.planningMode, 'custom');
  const reloaded = await service.read(actor, 'conversation-1');
  assert.equal(reloaded.bookingDraft.budget, 20000);
  assert.equal(reloaded.draftRevision, 1);
  await assert.rejects(service.open({ visitorHash: 'guest' }), { code: 'ASSISTANT_UNAVAILABLE' });
  await assert.rejects(service.answer(actor, 'conversation-1', { text: 'Generate options.' }), {
    code: 'ASSISTANT_UNAVAILABLE'
  });
  await assert.rejects(service.canTranscribe(actor, 'conversation-1'), { code: 'ASSISTANT_UNAVAILABLE' });
  await assert.rejects(service.transcribe(actor, 'conversation-1', Buffer.alloc(0)), { code: 'ASSISTANT_UNAVAILABLE' });
  await assert.rejects(service.speech(actor, 'conversation-1', 'message-1'), { code: 'ASSISTANT_UNAVAILABLE' });
  assert.equal(opened, 1);
  assert.equal(paidTurns, 0);
  assert.equal(providerCalls, 0);
});
