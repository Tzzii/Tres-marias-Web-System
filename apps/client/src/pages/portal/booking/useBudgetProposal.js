import { useEffect, useRef, useState } from 'react';
import { budgetApi } from '@tm/shared';
import {
  buildBudgetContext,
  budgetInputKey,
  cleanBudgetDraft,
  generationProblem,
  baselineFor,
  createBudgetRequestGuard,
  applyDraftRecommendation,
  undoDraftRecommendation,
  restoreDraftSelections,
  selectionToBookingPatch
} from '../../../lib/budgetDraft.js';

export function useBudgetProposal({ form, catalog, stock, onPatch, onCatalogChanged }) {
  const latest = useRef();
  latest.current = { form, catalog, stock, onPatch, onCatalogChanged };
  const guard = useRef(createBudgetRequestGuard());
  const acceptedKey = useRef(null);
  const key = budgetInputKey(form, catalog, stock);
  const currentKey = useRef(key);
  currentKey.current = key;
  const [state, setState] = useState({ status: 'idle', proposal: null, error: '' });
  useEffect(() => {
    if (acceptedKey.current === key) {
      acceptedKey.current = null;
      return;
    }
    guard.current.cancel();
    setState((previous) => ({ ...previous, status: previous.proposal ? 'stale' : 'idle', error: '' }));
  }, [key]);
  useEffect(() => () => guard.current.cancel(), []);
  const patch = (next) => {
    const current = latest.current;
    acceptedKey.current = budgetInputKey({ ...current.form, ...next }, current.catalog, current.stock);
    current.onPatch(next);
  };
  const generate = async () => {
    const current = latest.current;
    const error = generationProblem(current.form, current.catalog);
    if (error) {
      setState((s) => ({ ...s, error }));
      return;
    }
    const requestKey = currentKey.current;
    const ticket = guard.current.begin(requestKey);
    if (ticket === null) return;
    const context = buildBudgetContext(current.form, current.catalog);
    setState((s) => ({ ...s, status: 'generating', error: '' }));
    try {
      const proposal = await budgetApi.reviewBudget(context);
      if (!guard.current.current(ticket, currentKey.current)) return;
      if (proposal.catalogFingerprint !== current.catalog.budgetCatalogFingerprint)
        throw Object.assign(new Error('The catalog changed. Refresh your selections and review again.'), {
          code: 'CATALOG_CHANGED'
        });
      const draft = cleanBudgetDraft(current.form.budgetDraft);
      patch({
        budgetDraft: {
          ...draft,
          baseline: draft.baseline || baselineFor(context, proposal.estimate, current.catalog),
          proposalRef: proposal.proposalId ? { id: proposal.proposalId, generatedAt: proposal.generatedAt } : null
        }
      });
      setState({ status: proposal.status, proposal, error: '' });
    } catch (error) {
      if (!guard.current.current(ticket, currentKey.current)) return;
      setState((s) => ({
        ...s,
        status: ['CATALOG_CHANGED', 'PROPOSAL_STALE'].includes(error.code) ? 'stale' : 'unavailable',
        error: error.message
      }));
      if (error.code === 'CATALOG_CHANGED') current.onCatalogChanged?.();
    } finally {
      guard.current.finish(ticket);
    }
  };
  const apply = (candidate) => {
    if (state.status !== 'ready') return;
    const current = latest.current;
    try {
      const result = applyDraftRecommendation(current.form, candidate, current.catalog, current.stock);
      if (result.problem) setState((s) => ({ ...s, error: result.problem }));
      else {
        patch(result.patch);
        setState((s) => ({ ...s, error: '' }));
      }
    } catch (error) {
      setState((s) => ({ ...s, error: error.message }));
    }
  };
  const revert = (restore) => {
    const current = latest.current;
    const result = (restore ? restoreDraftSelections : undoDraftRecommendation)(
      current.form,
      current.catalog,
      current.stock
    );
    if (result.problem) setState((s) => ({ ...s, error: result.problem }));
    else {
      patch(result.patch);
      setState((s) => ({ ...s, error: '' }));
    }
  };
  const manual = (id, quantity) => {
    const current = latest.current;
    try {
      const context = buildBudgetContext(current.form, current.catalog);
      const selection = context.selection;
      if (quantity === null) {
        selection.addonIds = selection.addonIds.filter((value) => value !== id);
        delete selection.addonQty[id];
      } else selection.addonQty[id] = quantity;
      // Manual changes invalidate ranking; unlike Apply they are not treated as an AI action.
      current.onPatch(selectionToBookingPatch(selection, current.catalog));
    } catch (error) {
      setState((s) => ({ ...s, error: error.message }));
    }
  };
  return { ...state, generate, apply, undo: () => revert(false), restore: () => revert(true), manual };
}
