const SCHEMA_VERSION = 1;
const FIELDS = ['sixHourFee', 'extraGuestsCharge', 'deliveryFee', 'discount', 'note'];
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);

export const quotationDraftKey = (adminId, ref) =>
  `tm.admin.${encodeURIComponent(adminId)}.quotation.${encodeURIComponent(ref)}.draft`;

export function removeQuotationDraft(storage, key) {
  try {
    storage.removeItem(key);
  } catch {
    /* Storage can be unavailable in private browsing. */
  }
}

export function readQuotationDraft(storage, key, revision, initial) {
  try {
    const saved = JSON.parse(storage.getItem(key));
    if (!saved) return null;
    const values = saved.values;
    const strings = (value) => record(value) && Object.values(value).every((item) => typeof item === 'string');
    if (
      saved.schemaVersion !== SCHEMA_VERSION ||
      saved.revision !== revision ||
      !record(values) ||
      FIELDS.some((field) => typeof values[field] !== 'string') ||
      !strings(values.addonPrices) ||
      !strings(values.itemCounts) ||
      !Array.isArray(values.otherChargeItems) ||
      !values.otherChargeItems.length ||
      values.otherChargeItems.some(
        (line) => !record(line) || typeof line.amount !== 'string' || typeof line.label !== 'string'
      )
    ) {
      removeQuotationDraft(storage, key);
      return null;
    }
    const restoreFields = (fields) =>
      Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, values.addonPrices[name] ?? value]));
    return {
      ...Object.fromEntries(FIELDS.map((field) => [field, values[field]])),
      addonPrices: restoreFields(initial.addonPrices),
      itemCounts: Object.fromEntries(
        Object.entries(initial.itemCounts).map(([name, value]) => [name, values.itemCounts[name] ?? value])
      ),
      // These IDs are only React keys. Restored rows must not collide with newly added rows.
      otherChargeItems: values.otherChargeItems.map((line, index) => ({
        id: `draft-${index}`,
        amount: line.amount,
        label: line.label
      }))
    };
  } catch {
    removeQuotationDraft(storage, key);
    return null;
  }
}

export function writeQuotationDraft(storage, key, revision, values) {
  try {
    storage.setItem(key, JSON.stringify({ schemaVersion: SCHEMA_VERSION, revision, values }));
    return true;
  } catch {
    return false;
  }
}
