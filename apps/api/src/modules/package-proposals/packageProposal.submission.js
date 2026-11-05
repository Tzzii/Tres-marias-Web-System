import { cleanMenu } from '@tm/shared/src/domain/menu.js';
import { cleanStyling } from '@tm/shared/src/domain/styling.js';
import { normalizeBudgetSelection } from '@tm/shared/src/domain/budget.js';
import { includesFood } from '@tm/shared/src/services/config.js';
import { ApiError } from '../../lib/ApiError.js';
import { budgetLines } from '../budget/budget.submission.js';
import { proposalDigest } from '../catalog/catalog.service.js';
import { findOwned } from './packageProposal.repo.js';
import { requireProposal, currentPackageOption } from './packageProposal.service.js';
import { packageProposalRefSchema } from './packageProposal.schemas.js';

const stale = () =>
  new ApiError('PROPOSAL_STALE', 'The event details or selected option changed. Review your custom package again.', {
    field: 'packageProposalRef'
  });

export function matchPackageProposalForm(form, context, candidate, catalog) {
  if (
    form.packageId ||
    form.serviceType !== context.serviceType ||
    Number(form.guests) !== context.guests ||
    form.date !== context.date ||
    form.startTime !== context.startTime ||
    form.endTime !== context.endTime ||
    (form.foodNotes || '').trim() !== context.foodNotes
  )
    throw stale();
  const menu = cleanMenu(form.menu, {
    buffet: includesFood(context.serviceType),
    dessert: Boolean(candidate.menu.dessert)
  });
  const styling = cleanStyling(
    form.styling && {
      theme: form.styling.theme,
      themeOther: form.styling.themeOther,
      colors: form.styling.colors,
      notes: form.styling.notes
    }
  );
  let selection;
  try {
    selection = normalizeBudgetSelection({ addonIds: form.addonIds || [], addonQty: form.addonQty || {} }, catalog);
  } catch {
    throw stale();
  }
  if (
    proposalDigest([menu, styling, selection.addonIds, selection.addonQty]) !==
    proposalDigest([candidate.menu, candidate.styling, candidate.addonIds, candidate.addonQty])
  )
    throw stale();
}

// Caller owns the availability lock and reservation transaction. Never trust a client snapshot or price.
export async function resolvePackageProposalForBooking(conn, customerId, reference, form) {
  const parsed = packageProposalRefSchema.safeParse(reference);
  if (!parsed.success) throw stale();
  const row = requireProposal(await findOwned(customerId, reference.proposalId, conn, true), { allowSubmitted: true });
  if (row.revision !== reference.revision || row.selectedOptionId !== reference.optionId) throw stale();
  if (row.submittedRef) return { existingRef: row.submittedRef };
  const { candidate, inputs } = await currentPackageOption(conn, row, reference);
  matchPackageProposalForm(form, row.context, candidate, inputs.catalog);
  const recipe = inputs.rules.recipes.find((rule) => rule.id === candidate.recipe.recipeId);
  const proposalReference = parsed.data;
  const packageSnapshot = {
    ...candidate.packageSnapshot,
    version: 2,
    source: 'custom',
    proposalReference,
    recipe,
    candidateRecipe: candidate.recipe,
    serviceType: row.context.serviceType,
    context: row.context,
    estimate: candidate.estimate,
    catalogFingerprint: row.catalogFingerprint
  };
  const selection = { addonIds: candidate.addonIds, addonQty: candidate.addonQty };
  const budgetRequestSnapshot = {
    version: 2,
    source: 'custom',
    submittedAt: Date.now(),
    budget: row.context.budget,
    context: row.context,
    preferences: row.context.preferences,
    protectedAddonIds: row.context.protectedAddonIds,
    candidate,
    selection,
    estimate: candidate.estimate,
    lines: budgetLines(selection, inputs.catalog),
    inclusions: {
      packageName: packageSnapshot.name,
      items: packageSnapshot.items,
      menu: candidate.menu,
      ulamCount: includesFood(row.context.serviceType) ? 4 : 0,
      pricePerPlate: inputs.catalog.pricePerPlate,
      sixHourFee: inputs.catalog.sixHourFee
    },
    catalogFingerprint: row.catalogFingerprint,
    proposalReference
  };
  return { packageSnapshot, context: row.context, candidate, budgetRequestSnapshot, proposalReference };
}

export async function markPackageProposalSubmitted(conn, reference, reservationRef) {
  const [result] = await conn.query(
    'UPDATE package_proposals SET submitted_ref = ? WHERE id = ? AND revision = ? AND selected_option_id = ? AND submitted_ref IS NULL',
    [reservationRef, reference.proposalId, reference.revision, reference.optionId]
  );
  if (result.affectedRows !== 1) throw stale();
}
