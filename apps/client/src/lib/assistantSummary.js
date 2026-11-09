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

/** Parse plain-text reply structure without interpreting HTML, links or executable markup. */
export function assistantAnswerBlocks(answer = '') {
  const blocks = [];
  let current = null;
  for (const line of String(answer).replace(/\r\n?/g, '\n').split('\n')) {
    if (!line.trim()) {
      current = null;
      continue;
    }
    const item = line.match(/^\s*(?:([-*•])|([0-9]+)[.)])\s+(.*)$/);
    if (item) {
      const ordered = Boolean(item[2]);
      const start = ordered ? Number(item[2]) : undefined;
      if (
        current?.type !== 'list' ||
        current.ordered !== ordered ||
        (ordered && start !== current.start + current.items.length)
      ) {
        current = { type: 'list', ordered, ...(ordered ? { start } : {}), items: [] };
        blocks.push(current);
      }
      current.items.push(item[3]);
    } else if (current?.type === 'list' && /^\s+/.test(line)) {
      current.items[current.items.length - 1] += `\n${line.trim()}`;
    } else if (current?.type === 'paragraph') {
      current.text += `\n${line.trim()}`;
    } else {
      current = { type: 'paragraph', text: line.trim() };
      blocks.push(current);
    }
  }
  return blocks;
}
