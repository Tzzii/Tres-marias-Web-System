import { config } from '../../config.js';
import { ApiError } from '../../lib/ApiError.js';
import {
  ASSISTANT_GUEST_LIMIT,
  ASSISTANT_QUESTIONS,
  ASSISTANT_RECORD_SECONDS
} from '@tm/shared/src/domain/assistant.js';
import { createAssistantRepository, limitError } from './assistant.repo.js';
import { createAssistantTools } from './assistant.tools.js';
import { readQuestionAudio } from './assistant.audio.js';
import { createAssistantProvider } from '../../integrations/ai/assistant.openai.js';
import { capTurnSpend } from '../../integrations/ai/turnSpend.js';
import * as catalogService from '../catalog/catalog.service.js';
import { bookingPlan, bookingDraftFromForm, validateBookingPatch } from './assistant.booking.js';
import { assistantReservationForm } from '@tm/shared/src/domain/assistantReservation.js';
import { REFERENCE_PHOTO_MAX_COUNT } from '@tm/shared/src/domain/referencePhoto.js';
import { isRental } from '@tm/shared/src/services/config.js';
import { inspectReferencePhoto, storeReferencePhoto } from '../reservations/referencePhoto.js';
import { createAssistedReservation } from '../reservations/reservations.service.js';
import { storage } from '../../integrations/storage/index.js';
import { readBudgetCatalog } from '../budget/budget.submission.js';
import { selectPackageProposal, readSelectedPackageOption } from '../package-proposals/packageProposal.service.js';
import { assistantPackageProposalDraft, mergeAssistantBooking } from '@tm/shared/src/domain/assistantBooking.js';
import { findOwned as findOwnedProposal } from '../package-proposals/packageProposal.repo.js';

async function readSubmissionCatalog(conn) {
  const catalog = await readBudgetCatalog(conn);
  const [rentals] = await conn.query(
    'SELECT id FROM inventory_items WHERE rentable = 1 AND archived = 0 AND rent_price > 0'
  );
  return { ...catalog, rentals };
}

export function createAssistantService({
  settings = config.assistant,
  repo = createAssistantRepository({ settings }),
  provider = createAssistantProvider({ settings }),
  toolsFactory = createAssistantTools,
  getCatalog = catalogService.getCatalog,
  getSubmissionCatalog = readSubmissionCatalog,
  clock = Date.now,
  createReservation = createAssistedReservation,
  storePhoto = storeReferencePhoto,
  inspectPhoto = inspectReferencePhoto,
  selectProposal = selectPackageProposal,
  readProposal = readSelectedPackageOption,
  removePhoto = (key) => storage.remove(key)
} = {}) {
  let lastCleanup = 0;
  const audioCache = new Map();
  const available = () =>
    Boolean(settings.enabled && settings.apiKey && settings.dailyBudgetMicro > 0 && settings.monthlyBudgetMicro > 0);
  const ready = (voice = false) => {
    if (!available() || (voice && !settings.voiceEnabled))
      throw new ApiError(
        'ASSISTANT_UNAVAILABLE',
        'The AI assistant is temporarily unavailable. Please browse our packages or message the admin.'
      );
  };
  const spendFor = (actor, limits) =>
    capTurnSpend(
      {
        reserve: (kind, amount) =>
          repo.reserveSpend(
            kind,
            actor.customerId ? `c:${actor.customerId}` : `g:${actor.visitorHash}`,
            Math.ceil(amount)
          ),
        settle: (id, actual, usage) => repo.settleSpend(id, actual, usage)
      },
      limits
    );
  async function bounded(run) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), settings.turnTimeoutMs);
    try {
      return await run(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }
  const service = {
    publicConfig: () => ({
      enabled: settings.enabled,
      available: available(),
      voiceAvailable: available() && settings.voiceEnabled,
      guestLimit: ASSISTANT_GUEST_LIMIT,
      dailyLimit: settings.dailyLimit,
      questions: ASSISTANT_QUESTIONS,
      recordingSeconds: ASSISTANT_RECORD_SECONDS,
      conversationHours: 24
    }),
    async open(actor, id, options = {}) {
      // Customer-owned structured planning needs no provider call or paid configuration.
      if (!actor.customerId) ready();
      if (clock() - lastCleanup > 15 * 60000) {
        await repo.cleanup();
        lastCleanup = clock();
      }
      const session = await repo.open(actor, id, options);
      const conversation = await service.read(session.actor, session.conversationId);
      return { ...conversation, ...(session.visitorToken ? { visitorToken: session.visitorToken } : {}) };
    },
    async read(actor, id) {
      const conversation = await repo.read(actor, id);
      const catalog = await getCatalog();
      const draft = conversation.bookingDraft || {};
      let selectedPackageProposal = null,
        packageProposalIssue = null;
      if (draft.packageProposalRef) {
        try {
          if (!actor.customerId) throw new ApiError('UNAUTHENTICATED', 'Sign in to review your custom selection.');
          selectedPackageProposal = await readProposal(actor.customerId, draft.packageProposalRef, {
            submittedRef: conversation.submittedRef
          });
        } catch (error) {
          if (!(error instanceof ApiError)) throw error;
          packageProposalIssue = error.message;
        }
      }
      const projectionCatalog = { ...catalog, selectedPackageProposal, packageProposalIssue };
      const tools = toolsFactory({
        draft,
        getCatalog: async () => projectionCatalog,
        readPackageProposal: async () => selectedPackageProposal
      });
      const projection = async (name) => {
        try {
          return await tools.run(name, {});
        } catch (error) {
          // A retired selection must remain readable so the customer can choose its replacement.
          if (error instanceof ApiError && error.code === 'INVALID') return null;
          throw error;
        }
      };
      const [schedule, estimate] = await Promise.all([
        draft.date ? projection('check_reservation_availability') : null,
        Object.keys(draft).length ? projection('estimate_reservation') : null
      ]);
      return {
        ...conversation,
        bookingCatalog: catalog,
        selectedPackageProposal,
        packageProposalIssue,
        referencePhotos: conversation.referencePhotos || [],
        submittedRef: conversation.submittedRef || null,
        bookingSchedule: schedule && !schedule.error ? { ...schedule, serviceType: draft.serviceType } : null,
        bookingEstimate: estimate && !estimate.error ? estimate : null,
        bookingPlan: Object.keys(draft).length ? bookingPlan(draft, projectionCatalog) : null
      };
    },
    async scheduleOptions(actor, id, options) {
      const conversation = await repo.read(actor, id);
      return toolsFactory({ draft: conversation.bookingDraft || {}, getCatalog }).run(
        'reservation_schedule_options',
        options
      );
    },
    async canUploadReferencePhotos(actor, id, { revision } = {}) {
      if (!actor.customerId)
        throw new ApiError('UNAUTHENTICATED', 'Sign in to attach reference photos to your reservation.');
      const conversation = await repo.read(actor, id);
      if (conversation.submittedRef)
        throw new ApiError(
          'INVALID_STATE',
          'This request was already submitted. Start a new reservation to attach photos.'
        );
      if (conversation.draftRevision !== revision)
        throw new ApiError('ASSISTANT_BUSY', 'Your plan changed. Refresh the conversation before attaching photos.');
      if (conversation.allowance?.pending)
        throw new ApiError('ASSISTANT_BUSY', 'Wait for your current answer before attaching photos.');
      if (isRental(conversation.bookingDraft?.serviceType))
        throw new ApiError('INVALID', 'Reference photos are for event styling. Choose a catering service first.');
      const remaining = REFERENCE_PHOTO_MAX_COUNT - (conversation.referencePhotos || []).length;
      if (remaining <= 0)
        throw new ApiError('INVALID', `Upload up to ${REFERENCE_PHOTO_MAX_COUNT} reference photos in total.`);
      return { remaining };
    },
    async addReferencePhotos(actor, id, input, files) {
      if (!actor.customerId)
        throw new ApiError('UNAUTHENTICATED', 'Sign in to attach reference photos to your reservation.');
      if (!Array.isArray(files) || !files.length || files.length > REFERENCE_PHOTO_MAX_COUNT)
        throw new ApiError('INVALID', `Upload one to ${REFERENCE_PHOTO_MAX_COUNT} reference photos.`);
      files.forEach(inspectPhoto);
      const stored = [];
      try {
        await repo.updatePhotos(actor, id, input.revision, async (photos) => {
          if (photos.length + files.length > REFERENCE_PHOTO_MAX_COUNT)
            throw new ApiError('INVALID', `Upload up to ${REFERENCE_PHOTO_MAX_COUNT} reference photos in total.`);
          for (const file of files) stored.push(await storePhoto(file));
          return [...photos, ...stored];
        });
      } catch (error) {
        await Promise.all(
          stored.map((photo) =>
            removePhoto(photo.key).catch((cleanupError) =>
              console.error('[assistant-photo] Cleanup failed:', cleanupError.message)
            )
          )
        );
        throw error;
      }
      return service.read(actor, id);
    },
    async removeReferencePhoto(actor, id, input) {
      let removed;
      await repo.updatePhotos(actor, id, input.revision, (photos) => {
        removed = photos[input.index];
        if (!removed) throw new ApiError('NOT_FOUND', 'This reference photo is no longer available.');
        return photos.filter((_, index) => index !== input.index);
      });
      await removePhoto(removed.key).catch((error) =>
        console.error('[assistant-photo] Cleanup failed:', error.message)
      );
      return service.read(actor, id);
    },
    referencePhoto: (actor, id, index) => repo.referencePhoto(actor, id, index),
    async submit(actor, id, input) {
      if (!actor.customerId) throw new ApiError('UNAUTHENTICATED', 'Sign in to submit your reservation request.');
      if (input.agreeTerms !== true || input.confirmSubmission !== true)
        throw new ApiError('INVALID', 'Review the request, accept the Terms of Service and confirm submission.');
      await repo.submit(actor, id, input.revision, async (conn, draft, photos, customer) => {
        const catalog = await getSubmissionCatalog(conn);
        validateBookingPatch({}, draft, catalog);
        const form = { ...assistantReservationForm(draft, catalog), agreeTerms: true };
        return createReservation(conn, customer, form, photos, {
          budget: draft.budget,
          budgetNotes: draft.budgetNotes
        });
      });
      return service.read(actor, id);
    },
    async updateDraft(actor, id, input, { resume = false } = {}) {
      const previous = await repo.read(actor, id);
      if (resume && !actor.customerId)
        throw new ApiError('FORBIDDEN', 'Sign in to resume your saved reservation form.');
      const catalog = await getCatalog();
      const draft = resume ? bookingDraftFromForm(input.form, catalog) : validateBookingPatch({}, input.draft, catalog);
      if (
        draft.packageProposalRef &&
        previous.bookingDraft?.packageProposalRef &&
        JSON.stringify(draft.packageProposalRef) === JSON.stringify(previous.bookingDraft.packageProposalRef)
      ) {
        const merged = mergeAssistantBooking(previous.bookingDraft, { ...draft, packageProposalRef: undefined });
        if (!merged.packageProposalRef) delete draft.packageProposalRef;
      }
      if (draft.packageProposalRef) {
        if (!actor.customerId) throw new ApiError('UNAUTHENTICATED', 'Sign in to use a custom package.');
        await readProposal(actor.customerId, draft.packageProposalRef);
      }
      await repo.updateDraft(actor, id, draft, input.revision);
      return service.read(actor, id);
    },
    async selectPackageProposal(actor, id, input) {
      if (!actor.customerId) throw new ApiError('UNAUTHENTICATED', 'Sign in to choose a custom package.');
      await repo.updateDraft(
        actor,
        id,
        async (conn, previous) => {
          const selected = await selectProposal(actor.customerId, input.packageProposalRef, conn);
          const option = selected.option;
          const owned = await findOwnedProposal(actor.customerId, input.packageProposalRef.proposalId, conn);
          return assistantPackageProposalDraft(previous, owned.context, option, input.packageProposalRef);
        },
        input.revision
      );
      return service.read(actor, id);
    },
    async answer(actor, id, input) {
      ready();
      const turn = await repo.begin(actor, id, input);
      if (turn.replay) return service.read(actor, id);
      try {
        const response = await bounded((signal) => {
          // Six answer rounds and two scope checks share the same money cap. Custom generation is a separate workflow.
          const spend = spendFor(actor, { maxCalls: 8 });
          return provider.answer({
            text: input.text,
            history: turn.history,
            tools: toolsFactory({
              draft: turn.bookingDraft || {},
              getCatalog,
              readPackageProposal: (reference) => (actor.customerId ? readProposal(actor.customerId, reference) : null)
            }),
            spend,
            signal
          });
        });
        if (!(await repo.finish(turn.id, response)))
          throw new ApiError('ASSISTANT_BUSY', 'Please refresh the conversation before retrying.');
        return await service.read(actor, id);
      } catch (error) {
        await repo.finish(turn.id, null);
        throw error;
      }
    },
    async canTranscribe(actor, id) {
      ready(true);
      const conversation = await repo.read(actor, id);
      if (conversation.submittedRef)
        throw new ApiError(
          'INVALID_STATE',
          'This request was already submitted. Start a new reservation to ask another question.'
        );
      if (!conversation.allowance.remaining) throw limitError(!actor.customerId);
      if (conversation.allowance.pending)
        throw new ApiError('ASSISTANT_BUSY', 'Wait for your current answer before recording another question.');
    },
    async transcribe(actor, id, buffer) {
      ready(true);
      const audio = readQuestionAudio(buffer);
      await repo.voiceAttempt(actor, id);
      return bounded((signal) => provider.transcribe({ ...audio, spend: spendFor(actor), signal }));
    },
    async speech(actor, id, messageId) {
      ready(true);
      // Ownership and expiry are checked even for cached speech and in-flight duplicate requests.
      const conversation = await repo.read(actor, id);
      if (!conversation.messages.some((m) => m.id === messageId && m.status === 'completed'))
        throw new ApiError('NOT_FOUND', 'This answer is no longer available.');
      for (const [key, entry] of audioCache) if (entry.expires <= clock()) audioCache.delete(key);
      const key = `${id}:${messageId}`;
      if (audioCache.has(key)) return audioCache.get(key).promise;
      const promise = (async () => {
        const text = await repo.voiceAttempt(actor, id, messageId);
        return bounded((signal) => provider.speak({ text, spend: spendFor(actor), signal }));
      })();
      if (audioCache.size >= 12) audioCache.delete(audioCache.keys().next().value);
      audioCache.set(key, { promise, expires: clock() + 5 * 60000 });
      try {
        return await promise;
      } catch (error) {
        audioCache.delete(key);
        throw error;
      }
    }
  };
  return service;
}
