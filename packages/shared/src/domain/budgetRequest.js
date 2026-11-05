/** Canonical comparison also works with saved quotes that omitted explicit unit quantities. */
export function selectionChanges(before, after) {
  const quantity = (s, id) => ((s?.addonIds || []).includes(id) ? Number(s.addonQty?.[id] ?? 1) : 0);
  return [...new Set([...(before?.addonIds || []), ...(after?.addonIds || [])])]
    .sort()
    .map((id) => ({ id, before: quantity(before, id), after: quantity(after, id) }))
    .filter((c) => c.before !== c.after);
}
export function quoteSelection(quote) {
  if (quote?.addonSelection) return quote.addonSelection;
  // computeQuote historically saved quantities for every selected ID. Absent keys mean unknown history.
  const savedIds = Object.keys(quote?.addonTotals || quote?.addonPrices || {});
  if (
    quote?.addonQty &&
    typeof quote.addonQty === 'object' &&
    savedIds.every((id) => Object.hasOwn(quote.addonQty, id))
  )
    return { addonIds: Object.keys(quote.addonQty), addonQty: quote.addonQty };
  if (quote?.addonTotals && typeof quote.addonTotals === 'object') {
    const addonQty = {};
    for (const [id, total] of Object.entries(quote.addonTotals)) {
      const price = quote.addonPrices?.[id];
      const quantity = price > 0 ? total / price : NaN;
      if (!Number.isInteger(quantity) || quantity < 1) return null;
      addonQty[id] = quantity;
    }
    return { addonIds: Object.keys(addonQty), addonQty };
  }
  return null;
}
export function quotedAddonLines(reservation) {
  const quote = reservation.quotation || reservation.estimate;
  if (Array.isArray(quote?.addonLines)) return quote.addonLines;
  const selected = quoteSelection(quote) || reservation;
  return (selected.addonIds || []).map((id) => {
    const addon =
      reservation.addons?.find((a) => a.id === id) || reservation.budgetRequest?.lines?.find((a) => a.id === id);
    const quantity = selected.addonQty?.[id] || 1;
    const unitPrice = quote?.addonPrices?.[id] ?? null;
    return {
      id,
      name: addon?.name || 'Previously quoted additional service',
      quantity,
      unitPrice,
      total: quote?.addonTotals?.[id] ?? (unitPrice === null ? null : unitPrice * quantity)
    };
  });
}
export function budgetDifference(reservation, total) {
  const budget = reservation.budgetRequest?.budget;
  return Number.isFinite(budget) && Number.isFinite(total) ? { budget, difference: total - budget } : null;
}
