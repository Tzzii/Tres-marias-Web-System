import { peso } from '../../../../packages/shared/src/utils/format.js';

export function buildCelebrationSummary(conversation) {
  const draft = conversation?.bookingDraft || {};
  const selected = conversation?.selectedPackageProposal;
  const catalogPackages = conversation?.bookingCatalog?.packages || [];
  const catalogMatch = draft.packageSlug ? catalogPackages.find((pkg) => pkg.slug === draft.packageSlug) : null;
  const packageName =
    selected?.packageSnapshot?.name ||
    catalogMatch?.name ||
    (draft.packageProposalRef ? 'Custom package option' : draft.packageSlug || '');
  const schedule = [draft.date, draft.startTime && `${draft.startTime}–${draft.endTime || '…'}`]
    .filter(Boolean)
    .join(' · ');
  const occasion = draft.occasion === 'Other' ? draft.occasionOther : draft.occasion;
  const theme = draft.styling?.themeOther || draft.styling?.theme;
  const photoCount = conversation?.referencePhotos?.length || 0;

  const rawRows = [
    ['Service', draft.serviceType, 'To be decided'],
    ['Guests', draft.guests ? `${draft.guests} guests` : '', 'To be decided'],
    ['Budget', draft.budget ? peso(draft.budget) : '', 'To be decided'],
    ['Occasion', occasion, 'To be decided'],
    ['Schedule', schedule, 'To be decided'],
    ['Package', packageName, 'To be decided'],
    ['Theme', theme, 'To be decided'],
    ['Reference photos', photoCount ? `${photoCount} uploaded` : '', 'None yet']
  ];

  const rows = rawRows.map(([label, rawValue, fallback]) => {
    const filled = Boolean(rawValue);
    return {
      label,
      value: filled ? String(rawValue) : fallback,
      filled
    };
  });

  const completedCount = rows.filter((row) => row.filled).length;
  const totalCount = rows.length;
  const statusLabel = conversation?.submittedRef
    ? 'Submitted'
    : selected
      ? 'Package selected'
      : completedCount > 0
        ? 'In progress'
        : 'Ready to plan';

  const venueLabel = [draft.venueName, draft.city].filter(Boolean).join(', ');
  const colorsLabel = (draft.styling?.colors || [])
    .map((color) => color.name)
    .filter(Boolean)
    .join(', ');

  const knownEstimateTotal = selected?.estimate
    ? selected.estimate.knownTotal
    : conversation?.bookingEstimate
      ? conversation.bookingEstimate.knownSubtotal
      : null;

  const hasPendingCharges = Boolean(
    selected?.estimate?.unknownCharges?.length || conversation?.bookingEstimate?.pendingQuotation?.length
  );

  return {
    rows,
    completedCount,
    totalCount,
    statusLabel,
    eventName: draft.eventName || '',
    venueLabel,
    colorsLabel,
    budgetNotes: draft.budgetNotes || '',
    selected,
    knownEstimateTotal,
    hasPendingCharges
  };
}
