// Presentation helpers: no booking or payment rules are changed here.
export function compareValues(a, b, direction = 'asc') {
  const result =
    typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a ?? '').localeCompare(String(b ?? ''), 'en', { numeric: true, sensitivity: 'base' });
  return direction === 'desc' ? -result : result;
}

export function matchesSearch(values, query) {
  const words = String(query || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const haystack = values
    .filter((v) => v !== null && v !== undefined)
    .join(' ')
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function reservationChecklist(r) {
  const accepted = ['approved', 'downpayment_paid', 'confirmed', 'completed'].includes(r.status);
  return [
    {
      label: 'Quotation accepted',
      done: accepted,
      note: accepted ? 'Your booking has an accepted quotation.' : 'Review and accept your quotation when it is ready.'
    },
    {
      label: 'Downpayment received',
      done: Boolean(r.downpaymentPaid) || ['downpayment_paid', 'confirmed', 'completed'].includes(r.status),
      note: r.awaitingCount ? 'Your submitted payment is being verified.' : 'A verified downpayment secures your date.'
    },
    {
      label: 'Booking confirmed',
      done: ['confirmed', 'completed'].includes(r.status),
      note: 'Our team confirms the event after the required checks.'
    },
    {
      label: 'Balance settled',
      done: accepted && Number(r.balance) === 0,
      note: 'Settle the remaining balance on or before your event day.'
    }
  ];
}
