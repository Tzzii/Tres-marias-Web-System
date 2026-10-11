/** Keep older catalogue records readable under the general Helper label. IDs and quantities stay intact. */
export function helperLabel(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/\b(waiters?|water)\s*\/\s*dishwashers?\b/gi, (match, role) => {
    const label = /s$/i.test(role) ? 'helpers' : 'helper';
    return /^[A-Z]/.test(match) ? label[0].toUpperCase() + label.slice(1) : label;
  }).replace(/\bwaiters?\s+or\s+dishwashers?\b/gi, (match) => /^[A-Z]/.test(match) ? 'Helpers' : 'helpers');
}

/** Quotation counts were keyed by the displayed item name. Preserve them after the label changes. */
export function helperItemCounts(counts) {
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return {};
  const renamed = {};
  for (const [name, qty] of Object.entries(counts)) {
    const label = helperLabel(name);
    // An explicitly saved current label wins over an older alias, regardless of object order.
    if (!(label in renamed) || label === name) renamed[label] = qty;
  }
  return renamed;
}
