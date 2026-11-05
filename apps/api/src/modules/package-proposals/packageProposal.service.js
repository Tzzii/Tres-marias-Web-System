import { randomUUID } from 'node:crypto';
import {
  buildPackageCandidates,
  cleanPackageProposalContext,
  estimatePackageProposal
} from '@tm/shared/src/domain/packageProposal.js';
import { rentalAvailability } from '@tm/shared/src/domain/reservation.js';
import { dateUnavailableReason, timeUnavailableReason, eventHours } from '@tm/shared/src/domain/availability.js';
import { config } from '../../config.js';
import { tx } from '../../db.js';
import { ApiError } from '../../lib/ApiError.js';
import { rankPackageOptions } from '../../integrations/ai/packageProposal.openai.js';
import { capTurnSpend } from '../../integrations/ai/turnSpend.js';
import { createAssistantRepository } from '../assistant/assistant.repo.js';
import { readPackageProposalCatalog, proposalDigest } from '../catalog/catalog.service.js';
import { availabilityMap } from '../calendar/calendar.service.js';
import { rentalStockInputs } from '../reservations/reservations.repo.js';
import * as repo from './packageProposal.repo.js';
import { readOwnedPackageProposal } from './packageProposal.read.js';

const ttl = 24 * 3600000;
const stale = (message = 'The package proposal changed or expired. Review fresh options.') =>
  new ApiError('PROPOSAL_STALE', message, { field: 'packageProposalRef' });
const changed = () =>
  new ApiError('CATALOG_CHANGED', 'The catalog or approved recipes changed. Refresh and review again.');
const unavailable =
  'The assistant could not rank these options. Your details are saved. Try again or choose a published package.';

export function requireProposal(row, { allowSubmitted = false } = {}) {
  if (!row) throw new ApiError('NOT_FOUND', 'Package proposal not found.');
  if (row.expiresAt <= Date.now() && !(allowSubmitted && row.submittedRef)) throw stale();
  return row;
}

function envelope(row) {
  requireProposal(row);
  const { id, revision, context, options, status, noFitReasons, catalogFingerprint, expiresAt, selectedOptionId } = row;
  if (status === 'pending') {
    // A worker interrupted between the claim and final write cannot trigger a second paid call on replay.
    if (Date.now() - row.createdAt <= 120000)
      throw new ApiError('ASSISTANT_BUSY', 'This proposal is being prepared. Retry the same request.');
    return {
      id,
      revision,
      context,
      options: [],
      status: 'unavailable',
      noFitReasons: [unavailable],
      catalogFingerprint,
      expiresAt,
      selectedOptionId
    };
  }
  return { id, revision, context, options, status, noFitReasons, catalogFingerprint, expiresAt, selectedOptionId };
}

async function current(conn, raw, fingerprint) {
  const catalog = await readPackageProposalCatalog(conn);
  if (catalog.packageProposalCatalogFingerprint !== fingerprint) throw changed();
  let context;
  try {
    context = cleanPackageProposalContext(raw, catalog);
  } catch (error) {
    throw new ApiError('INVALID', error.message, { field: 'context' });
  }
  const [stockData, schedule] = await Promise.all([rentalStockInputs(conn, context.date), availabilityMap(conn)]);
  const scheduleProblem =
    dateUnavailableReason(context.date, schedule) ||
    timeUnavailableReason(context.date, context.startTime, schedule, eventHours(context.startTime, context.endTime));
  const inputs = { catalog, rules: catalog.packageProposalRules, stock: rentalAvailability(stockData, context.date) };
  if (scheduleProblem) return { inputs, context, candidates: [], noFitReasons: [scheduleProblem] };
  return { inputs, ...buildPackageCandidates(context, inputs) };
}

function optionReason(candidate) {
  const status = candidate.estimate.budgetStatus;
  return [
    candidate.tradeoffs.at(-1),
    status === 'within'
      ? 'The priced estimate fits your budget.'
      : status === 'over'
        ? 'The estimate exceeds your target budget.'
        : 'Some charges still need a quotation.'
  ]
    .filter(Boolean)
    .join(' ');
}

export async function currentPackageOption(conn, row, reference) {
  if (row.revision !== reference.revision) throw stale();
  const saved = row.options.find((o) => o.id === reference.optionId);
  if (!saved) throw stale('Choose one of the options returned for this proposal.');
  const { inputs, candidates, noFitReasons } = await current(conn, row.context, row.catalogFingerprint);
  const candidate = candidates.find((c) => c.id === saved.id);
  if (!candidate) throw stale(noFitReasons[0] || 'This setup is no longer available for the requested date.');
  const { reason, ...reviewed } = saved;
  const estimate = estimatePackageProposal(candidate.recipe, row.context, inputs);
  if (proposalDigest(reviewed) !== proposalDigest({ ...candidate, estimate }))
    throw stale('Availability or the estimate changed. Review fresh options.');
  return { candidate: { ...candidate, reason }, inputs };
}

export async function getPackageProposal(customerId, id) {
  return readOwnedPackageProposal(customerId, id, {
    findOwned: repo.findOwned,
    findSubmittedReservation: repo.findSubmittedReservation
  });
}

export async function selectPackageProposal(customerId, reference, conn) {
  const select = async (db) => {
    const row = requireProposal(await repo.findOwned(customerId, reference.proposalId, db, true));
    if (row.submittedRef) throw stale('This proposal has already been submitted.');
    const { candidate: option } = await currentPackageOption(db, row, reference);
    await repo.selectOption(db, row.id, option.id);
    return { ...reference, option };
  };
  return conn ? select(conn) : tx(select);
}

export async function readSelectedPackageOption(customerId, reference, { submittedRef } = {}) {
  return tx(async (conn) => {
    const row = requireProposal(await repo.findOwned(customerId, reference.proposalId, conn), {
      allowSubmitted: Boolean(submittedRef)
    });
    if (row.selectedOptionId !== reference.optionId) throw stale('Choose a current option for this plan.');
    if (submittedRef && row.submittedRef === submittedRef && row.revision === reference.revision)
      return row.options.find((option) => option.id === reference.optionId) || null;
    const { candidate } = await currentPackageOption(conn, row, reference);
    return candidate;
  });
}

async function rankForOwner(customerId, input, prepared, { activeTurn, assistant, rank }) {
  const actor = { customerId };
  if (activeTurn) return rank({ ...prepared, spend: activeTurn.spend, signal: activeTurn.signal });
  const id = input.conversationId || (await assistant.open(actor, undefined, { fresh: true })).conversationId;
  const turn = await assistant.begin(actor, id, {
    requestId: input.requestId,
    source: 'text',
    text: 'Review my custom package options.'
  });
  if (turn.replay) throw new ApiError('INVALID', 'Use a new identifier for a new package review.');
  const spend = capTurnSpend({
    reserve: (kind, upper) => assistant.reserveSpend(kind, 'c:' + customerId, upper),
    settle: (key, actual, usage) => assistant.settleSpend(key, actual, usage)
  });
  try {
    const ids = await rank({ ...prepared, spend, signal: AbortSignal.timeout(config.assistant.turnTimeoutMs) });
    if (
      !(await assistant.finish(turn.id, {
        answer: 'Your custom package review is ready.',
        packages: [],
        estimates: [],
        needsAdmin: false
      }))
    )
      throw new ApiError('ASSISTANT_BUSY', 'The generation lease expired. Try again.');
    return ids;
  } catch (error) {
    await assistant.finish(turn.id, null);
    throw error;
  }
}

export async function createPackageProposal(
  customerId,
  input,
  { assistant = createAssistantRepository(), rank = rankPackageOptions, activeTurn } = {}
) {
  if (!customerId) throw new ApiError('UNAUTHENTICATED', 'Sign in to build a custom package.');
  const fingerprint = input.reviewedCatalogFingerprint;
  const inputFingerprint = proposalDigest(input);
  const replay = (row) => {
    if (row?.inputFingerprint !== inputFingerprint)
      throw new ApiError('INVALID', 'Use a new request ID for different event details.');
    return envelope(row);
  };
  const prior = await repo.findRequest(customerId, input.requestId);
  if (prior) return replay(prior);
  if (input.conversationId && !activeTurn) await assistant.read({ customerId }, input.conversationId);
  const prepared = await tx((conn) => current(conn, input.context, fingerprint));
  const createdAt = Date.now(),
    id = randomUUID();
  if (
    !(await repo.claim({
      id,
      customerId,
      requestId: input.requestId,
      inputFingerprint,
      catalogFingerprint: fingerprint,
      context: prepared.context,
      createdAt,
      expiresAt: createdAt + ttl
    }))
  )
    return replay(await repo.findRequest(customerId, input.requestId));
  let result = { status: 'no-options', options: [], noFitReasons: prepared.noFitReasons };
  try {
    if (prepared.candidates.length) {
      if (
        !config.assistant.enabled ||
        !config.assistant.apiKey ||
        config.assistant.dailyBudgetMicro <= 0 ||
        config.assistant.monthlyBudgetMicro <= 0
      )
        throw new ApiError('ASSISTANT_UNAVAILABLE', unavailable);
      const ranked = await rankForOwner(customerId, input, prepared, { assistant, rank, activeTurn });
      await tx(async (conn) => {
        const fresh = await current(conn, prepared.context, fingerprint);
        const options = ranked.map((key) => {
          const c = fresh.candidates.find((item) => item.id === key);
          if (!c || proposalDigest(c) !== proposalDigest(prepared.candidates.find((item) => item.id === key)))
            throw stale();
          return { ...c, reason: optionReason(c) };
        });
        await repo.finish(id, { status: 'ready', options, noFitReasons: fresh.noFitReasons }, conn);
      });
    } else await repo.finish(id, result);
  } catch (error) {
    const recoverable =
      error instanceof ApiError && ['RATE_LIMITED', 'ASSISTANT_BUSY', 'ASSISTANT_UNAVAILABLE'].includes(error.code);
    await repo.finish(id, {
      status: 'unavailable',
      options: [],
      noFitReasons: [recoverable ? unavailable : 'Your review could not be completed. Refresh and review again.']
    });
    if (!recoverable) throw error;
  }
  return getPackageProposal(customerId, id);
}
