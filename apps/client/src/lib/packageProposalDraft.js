import { cleanPackageProposalContext } from '../../../../packages/shared/src/domain/packageProposal.js';
import { cleanStyling, THEME_UNDECIDED } from '../../../../packages/shared/src/domain/styling.js';
import { cleanMenu } from '../../../../packages/shared/src/domain/menu.js';
import { SERVICE_TYPES, includesFood } from '../../../../packages/shared/src/services/config.js';
import {
  cleanAssistantBooking,
  proposalOccasionFields
} from '../../../../packages/shared/src/domain/assistantBooking.js';

export const packagePlanningValues = (draft = {}) => ({
  ...draft,
  guests: draft.guests || '',
  budget: draft.budget || '',
  budgetNotes: draft.budgetNotes || '',
  styling: { theme: THEME_UNDECIDED, colors: [], notes: '', ...draft.styling },
  menu: draft.menu || {},
  addonIds: draft.addonIds || [],
  addonQty: draft.addonQty || {}
});

export const packagePlanningStages = (serviceType) =>
  includesFood(serviceType) ? [0, 2, 1, 3, 4, 5, 8, 6, 7] : [0, 2, 1, 3, 4, 8, 6, 7];

export const savedPackagePlanningStage = (draft) => {
  if (!SERVICE_TYPES.includes(draft.serviceType)) return 0;
  if (!draft.eventName || !draft.occasion) return 2;
  if (!draft.guests || !draft.budget) return 1;
  if (!draft.date || !draft.startTime || !draft.endTime) return 3;
  if (!draft.discussed?.includes('styling')) return 4;
  if (includesFood(draft.serviceType) && !draft.discussed?.includes('menu')) return 5;
  if (!draft.setupPreferences?.reviewed) return 8;
  if (!draft.discussed?.includes('addons')) return 6;
  return 7;
};

/** Attachment revisions must not replace unsaved answers; a different saved plan does. */
export function reconcilePackagePlanningValues(current, previous, next) {
  if (
    previous?.conversationId === next.conversationId &&
    stable(previous?.bookingDraft || {}) === stable(next.bookingDraft || {})
  )
    return current;
  return packagePlanningValues(next.bookingDraft);
}

// Proposal references are owner-checked by the API. Cached display data is never booking authority.
export function packageContextFromDraft(draft, catalog) {
  return cleanPackageProposalContext(
    {
      serviceType: draft.serviceType,
      eventName: draft.eventName,
      setupPreferences: draft.setupPreferences,
      guests: Number(draft.guests),
      budget: Number(draft.budget),
      date: draft.date,
      startTime: draft.startTime,
      endTime: draft.endTime,
      occasion: draft.occasion === 'Other' ? draft.occasionOther || '' : draft.occasion || '',
      preferences: draft.budgetNotes || '',
      foodNotes: draft.foodNotes || '',
      menu: draft.menu || {},
      styling: draft.styling,
      addonIds: draft.addonIds || [],
      addonQty: draft.addonQty || {},
      protectedAddonIds: draft.addonIds || []
    },
    catalog
  );
}
export function cleanProposalReference(raw) {
  return raw &&
    typeof raw.proposalId === 'string' &&
    raw.proposalId &&
    typeof raw.optionId === 'string' &&
    raw.optionId &&
    Number.isInteger(raw.revision) &&
    raw.revision > 0
    ? { proposalId: raw.proposalId, optionId: raw.optionId, revision: raw.revision }
    : null;
}

export const sameProposalReference = (left, right) => {
  const a = cleanProposalReference(left),
    b = cleanProposalReference(right);
  return Boolean(a && b && a.proposalId === b.proposalId && a.optionId === b.optionId && a.revision === b.revision);
};

/** Read server recovery authority before attempting an operation that deliberately rejects submitted options. */
export async function loadProposalForRestore(reference, api) {
  const proposal = await api.get(reference.proposalId);
  if (proposal.submission) {
    const { reservationRef, packageProposalRef } = proposal.submission;
    if (!sameProposalReference(reference, packageProposalRef) || typeof reservationRef !== 'string' || !reservationRef)
      throw new Error(
        'This proposal was submitted with a different selection. Open the saved request before choosing another package.'
      );
    return { proposal, reservationRef, submittedAt: proposal.submission.submittedAt };
  }
  return { proposal, selection: await api.select(reference.proposalId, reference.revision, reference.optionId) };
}

export function canClearRecoveredDraft(initial, current, reference, submittedAt) {
  return Boolean(
    initial &&
    current &&
    Number.isFinite(submittedAt) &&
    Number.isFinite(current.savedAt) &&
    current.savedAt <= submittedAt &&
    sameProposalReference(current.form?.packageProposalRef, reference) &&
    sameProposalReference(initial.form?.packageProposalRef, reference) &&
    stable(initial) === stable(current)
  );
}

const conversationFields = [
  'eventName',
  'venueName',
  'venueAddress',
  'city',
  'accessNotes',
  'occasion',
  'occasionOther'
];
export function proposalConversationAnswers(conversation, reference) {
  if (conversation.submittedRef || !sameProposalReference(conversation.bookingDraft?.packageProposalRef, reference))
    throw new Error('Your conversation selection changed. Refresh and review before continuing.');
  const draft = cleanAssistantBooking(conversation.bookingDraft);
  const answers = Object.fromEntries(
    conversationFields
      .filter((key) => typeof draft[key] === 'string' && draft[key].trim())
      .map((key) => [key, draft[key]])
  );
  if (draft.occasion && draft.occasion !== 'Other') answers.occasionOther = '';
  return answers;
}

export function proposalHandoffReviewKey(form, patch, answers = {}) {
  const keys = ['packageId', 'packageProposalRef', ...financial, ...conversationFields];
  return stable({ manual: Object.fromEntries(keys.map((key) => [key, form?.[key]])), patch, answers });
}

export function proposalExpired(proposal, now = Date.now()) {
  return !Number.isFinite(proposal?.expiresAt) || proposal.expiresAt <= now;
}

const financial = [
  'serviceType',
  'guests',
  'date',
  'startTime',
  'endTime',
  'menu',
  'styling',
  'addonIds',
  'addonQty',
  'foodNotes'
];
const stable = (value) =>
  JSON.stringify(value, (_, item) =>
    item && !Array.isArray(item) && typeof item === 'object'
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item
  );
const financialValue = (key, value) => {
  if (key === 'guests') return Number(value);
  if (key === 'styling') return cleanStyling(value);
  if (key === 'menu') return cleanMenu(value, { buffet: true, dessert: Boolean(value?.dessert) });
  if (key === 'addonIds') return [...(value || [])].sort();
  if (key === 'addonQty') return Object.fromEntries(Object.entries(value || {}).map(([id, qty]) => [id, Number(qty)]));
  if (key === 'foodNotes') return (value || '').trim();
  return value;
};
const financialDiffers = (key, left, right) => stable(financialValue(key, left)) !== stable(financialValue(key, right));
export function proposalPatchIsStale(form, patch) {
  return Boolean(
    form.packageProposalRef &&
    financial.some((key) => Object.hasOwn(patch, key) && financialDiffers(key, form[key], patch[key]))
  );
}

export function proposalFormPatch(proposal, selection) {
  const reference = cleanProposalReference(selection);
  if (
    !reference ||
    reference.proposalId !== proposal.id ||
    reference.revision !== proposal.revision ||
    !proposal.options?.some((option) => option.id === reference.optionId) ||
    proposalExpired(proposal)
  )
    throw new Error('This package review has expired or changed. Review fresh options before continuing.');
  const option = selection.option;
  if (!option || option.id !== reference.optionId) throw new Error('The selected package could not be verified.');
  const context = proposal.context;
  return {
    packageId: '',
    packageProposalRef: reference,
    packageProposalDisplay: option,
    packageProposalContext: context,
    packageProposalStale: false,
    serviceType: context.serviceType,
    guests: String(context.guests),
    date: context.date,
    startTime: context.startTime,
    endTime: context.endTime,
    foodNotes: context.foodNotes || '',
    menu: option.menu,
    styling: option.styling || {},
    addonIds: option.addonIds,
    addonQty: option.addonQty,
    budgetDraft: {
      amount: String(context.budget),
      preferences: context.preferences || '',
      protectedAddonIds: context.protectedAddonIds || [],
      proposalRef: null
    }
  };
}

export function proposalDraftConflicts(form, patch, answers = {}) {
  if (!form) return [];
  const conflicts = [];
  if (form.packageId || form.packageProposalRef) {
    if (form.packageId || stable(form.packageProposalRef) !== stable(patch.packageProposalRef))
      conflicts.push('package');
  }
  for (const key of financial) {
    const value = form[key];
    const filled = Array.isArray(value)
      ? value.length > 0
      : value && typeof value === 'object'
        ? Object.values(value).some((v) => (Array.isArray(v) ? v.length : Boolean(v)))
        : Boolean(value);
    if (filled && financialDiffers(key, value, patch[key])) conflicts.push(key);
  }
  for (const key of conversationFields) {
    if (Object.hasOwn(answers, key) && form[key] && stable(form[key]) !== stable(answers[key])) conflicts.push(key);
  }
  return conflicts;
}

export function applyProposalHandoff(
  customerId,
  expectedCustomerId,
  form,
  patch,
  { confirmed = false, answers = {} } = {}
) {
  if (!customerId || customerId !== expectedCustomerId)
    throw new Error('Sign in to the account that reviewed this package.');
  if (!confirmed && proposalDraftConflicts(form, patch, answers).length)
    throw new Error('Review the changes to your saved reservation first.');
  const foodNotes = form?.foodNotes || patch.packageProposalContext?.foodNotes || '';
  return {
    ...form,
    ...answers,
    ...patch,
    ...(!form?.occasion && !answers.occasion && patch.packageProposalContext?.occasion
      ? proposalOccasionFields(patch.packageProposalContext.occasion)
      : {}),
    foodNotes,
    packageProposalStale: foodNotes !== (patch.packageProposalContext?.foodNotes || '')
  };
}
