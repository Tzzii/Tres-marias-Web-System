import { createHash } from 'node:crypto';
import { estimateBudget, normalizeBudgetSelection, buildBudgetCandidates } from '@tm/shared/src/domain/budget.js';
import { endTimeProblem } from '@tm/shared/src/domain/availability.js';
import { budgetBookableAddons } from '@tm/shared/src/domain/budgetPolicy.js';
import { ApiError } from '../../lib/ApiError.js';
import { newId } from '../../lib/ids.js';
import { budgetCatalogFingerprint } from '../../lib/budgetCatalogFingerprint.js';
import { getCatalog } from '../catalog/catalog.service.js';
import { getRentalAvailability } from '../reservations/reservations.service.js';
import { rankBudgetCandidates, BUDGET_REASONS } from '../../integrations/ai/openai.js';
import { insertBudgetProposal } from './budget.repo.js';
import { createAssistantRepository } from '../assistant/assistant.repo.js';
import { capTurnSpend } from '../../integrations/ai/turnSpend.js';

export async function rankBudgetForCustomer(
  customer,
  input,
  assistant = createAssistantRepository(),
  rank = rankBudgetCandidates
) {
  const work = await assistant.beginExternal({ customerId: customer.id });
  const spend = capTurnSpend({
    reserve: (kind, upper) => assistant.reserveSpend(kind, `c:${customer.id}`, upper),
    settle: (id, actual, usage) => assistant.settleSpend(id, actual, usage)
  });
  try {
    const result = await rank(input, { spend });
    if (!(await assistant.finishExternal(work, true)))
      throw new ApiError('ASSISTANT_BUSY', 'Refresh before requesting a new recommendation.');
    return result;
  } catch (error) {
    await assistant.finishExternal(work, false);
    throw error;
  }
}

const stable = (v) =>
  JSON.stringify(v, (_, value) =>
    value && !Array.isArray(value) && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value
  );
const hash = (v) => createHash('sha256').update(stable(v)).digest('hex');
const safeUnavailable =
  'Budget recommendations are temporarily unavailable. You can still edit services and submit your request.';
const CACHE_MS = 60000;

/** Each service instance owns an account-scoped, bounded cache; dependencies make offline verification possible. */
export function createBudgetProposalService({
  readCatalog = getCatalog,
  readStock = getRentalAvailability,
  rank,
  save = insertBudgetProposal,
  clock = Date.now
} = {}) {
  const cache = new Map();
  const pending = new Map();
  return async function createBudgetProposal(customer, raw) {
    const catalog = await readCatalog();
    const catalogFingerprint = budgetCatalogFingerprint(catalog);
    if (catalogFingerprint !== raw.reviewedCatalogFingerprint)
      throw new ApiError(
        'CATALOG_CHANGED',
        'Prices or service options changed. Review the refreshed catalog before generating again.',
        { field: 'budget' }
      );
    const timeProblem = endTimeProblem(raw.startTime, raw.endTime);
    if (timeProblem) throw new ApiError('INVALID', timeProblem, { field: 'endTime' });
    let context;
    let estimate;
    let candidates;
    const stock = await readStock(raw.date);
    try {
      const selection = normalizeBudgetSelection(raw.selection, catalog);
      const offered = budgetBookableAddons(catalog);
      const selected = new Set(selection.addonIds);
      if (
        raw.protectedAddonIds.some(
          (id) => !selected.has(id) && !offered.some((a) => a.parentId === id && selected.has(a.id))
        )
      )
        throw new Error('Protect only services currently selected.');
      context = { ...raw, selection, protectedAddonIds: [...new Set(raw.protectedAddonIds)].sort() };
      estimate = estimateBudget(context, { catalog, stock });
      candidates = buildBudgetCandidates(context, { catalog, stock });
    } catch (error) {
      throw new ApiError('INVALID', error.message, { field: 'budget' });
    }
    const inputFingerprint = hash(context);
    const cacheKey = `${customer.id}:${inputFingerprint}:${catalogFingerprint}:${hash(stock)}`;
    const now = clock();
    for (const [key, item] of cache) if (now - item.at >= CACHE_MS) cache.delete(key);
    const cached = cache.get(cacheKey);
    if (cached && cached.value.candidates.every((old) => candidates.some((fresh) => fresh.id === old.id)))
      return structuredClone(cached.value);
    // Reuse only the same stock snapshot; a changed date's availability must never share an old in-flight result.
    const pendingKey = cacheKey;
    if (pending.has(pendingKey)) return structuredClone(await pending.get(pendingKey));
    if (pending.size >= 100)
      return {
        status: 'unavailable',
        proposalId: null,
        inputFingerprint,
        catalogFingerprint,
        estimate,
        candidates: [],
        generatedAt: now,
        message: safeUnavailable
      };
    const operation = (async () => {
      let rankings = [];
      let status = 'no-changes';
      if (candidates.length) {
        try {
          const ranked = await (rank || ((input) => rankBudgetForCustomer(customer, input)))({
            context,
            candidates,
            catalog
          });
          if (
            !Array.isArray(ranked.rankings) ||
            ranked.rankings.length > 3 ||
            new Set(ranked.rankings.map((r) => r.id)).size !== ranked.rankings.length ||
            ranked.rankings.some(
              (r) => !candidates.some((c) => c.id === r.id) || !Object.hasOwn(BUDGET_REASONS, r.reasonCode)
            )
          )
            throw new Error('Invalid ranking');
          rankings = ranked.rankings;
          status = rankings.length ? 'ready' : 'no-changes';
        } catch {
          status = 'unavailable';
        }
      }
      const selectedCandidates = rankings.map((ranking) => {
        const candidate = candidates.find((c) => c.id === ranking.id);
        // Only the rank order comes from the model. Keep factual rationale compatible with the action.
        const reasonCode =
          candidate.knownSavings === null
            ? 'price_review'
            : ranking.reasonCode === 'quantity' && candidate.action.type !== 'reduce'
              ? 'optional_cost'
              : ranking.reasonCode === 'alternative' && candidate.action.type !== 'replace'
                ? 'optional_cost'
                : ranking.reasonCode;
        return { ...candidate, reasonCode, reason: BUDGET_REASONS[reasonCode] };
      });
      const currentCatalog = await readCatalog();
      if (budgetCatalogFingerprint(currentCatalog) !== catalogFingerprint)
        throw new ApiError(
          'CATALOG_CHANGED',
          'Prices or service options changed. Refresh before using these recommendations.',
          { field: 'budget' }
        );
      const latestStock = await readStock(context.date);
      const latestCandidates = buildBudgetCandidates(context, { catalog: currentCatalog, stock: latestStock });
      if (selectedCandidates.some((c) => !latestCandidates.some((fresh) => fresh.id === c.id)))
        throw new ApiError('PROPOSAL_STALE', 'Service availability changed. Review your budget again.', {
          field: 'budget'
        });
      const generatedAt = clock();
      const proposalId = status === 'unavailable' ? null : newId('budget');
      if (proposalId)
        await save({
          id: proposalId,
          customerId: customer.id,
          context,
          originalSelection: context.selection,
          originalEstimate: estimate,
          candidates: selectedCandidates,
          inputFingerprint,
          catalogFingerprint,
          createdAt: generatedAt,
          expiresAt: generatedAt + 86400000
        });
      const result = {
        proposalId,
        inputFingerprint,
        catalogFingerprint,
        status,
        estimate,
        candidates: selectedCandidates,
        generatedAt,
        message:
          status === 'unavailable'
            ? safeUnavailable
            : status === 'no-changes'
              ? 'No approved adjustments are available for your current selections and priorities.'
              : ''
      };
      if (status !== 'unavailable') {
        if (cache.size >= 100) cache.delete(cache.keys().next().value);
        cache.set(cacheKey, { at: generatedAt, value: structuredClone(result) });
      }
      return result;
    })();
    pending.set(pendingKey, operation);
    try {
      return structuredClone(await operation);
    } finally {
      pending.delete(pendingKey);
    }
  };
}
export const createBudgetProposal = createBudgetProposalService();
