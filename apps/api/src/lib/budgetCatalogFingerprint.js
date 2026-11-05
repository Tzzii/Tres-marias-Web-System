import { createHash } from 'node:crypto';

function canonical(value) {
  if (Array.isArray(value))
    return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])])
    );
  return value;
}
/** Stable server-only token; it detects changes but never authorizes client-supplied prices. */
export function budgetCatalogFingerprint(catalog) {
  const addon = (a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    price: a.price ?? null,
    parentId: a.parentId ?? null,
    archived: Boolean(a.archived),
    hasQuantity: Boolean(a.hasQuantity),
    hasPackages: Boolean(a.hasPackages),
    inventoryItemId: a.inventoryItemId ?? null,
    budgetPolicy: a.budgetPolicy ?? null,
    sizes: (a.sizes || []).map(addon)
  });
  const relevant = {
    pricePerPlate: catalog.pricePerPlate,
    sixHourFee: catalog.sixHourFee,
    packages: (catalog.packages || []).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      kind: p.kind,
      price: p.price,
      guests: p.guests,
      visible: p.visible,
      archived: Boolean(p.archived),
      items: p.items
    })),
    addons: (catalog.addons || []).map(addon)
  };
  return createHash('sha256')
    .update(JSON.stringify(canonical(relevant)))
    .digest('hex');
}
