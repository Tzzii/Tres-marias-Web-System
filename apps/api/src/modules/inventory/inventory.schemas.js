import { z } from 'zod';

/**
 * Request shapes for the inventory routes (zod), checked by middleware/validate.js before a service runs.
 *
 * Like the other modules' schemas, these check only what the service cannot: that a text field is text
 * and fits its column, and that a list is a list, so a bad value is a clear 400 instead of a database
 * error. Everything the dialogs check (the name, category, quantities, alert level, rental price, damage
 * fee, the stock action and its numbers) passes through to inventory.service.js and
 * @tm/shared/src/domain/inventory.js, which answer with the admin dialogs' own messages. The rows of
 * Add item(s) are checked there too, so an error names its row (meta.row). Keys not listed are dropped,
 * so a code, an allocation or a history line added to a request never reaches a service.
 */

// Text of at most `max` characters; missing -> '' so the service answers with the dialog's own message
const text = (max) =>
  z.string({ error: 'This field is required.' }).max(max, { error: `Use ${max} characters or fewer.` }).default('');

// Checked by the service. .optional() matters: in zod 4 a z.unknown() object key is still required,
// and a missing one would be a 400 with zod's own wording instead of the service's message.
const passThrough = z.unknown().optional();

// A query-string switch such as ?includeArchived=true: only "true" or "1" turn it on (catalog.schemas.js)
const querySwitch = z.unknown().optional().transform((value) => value === 'true' || value === '1');

// An item id or a reservation ref from the URL (Express always gives text); an unknown one is a 404 from the service
export const idParams = z.object({ id: z.string() });
export const refParams = z.object({ ref: z.string() });

// GET /api/admin/inventory?includeArchived=true
export const listQuery = z.object({ includeArchived: querySwitch });

// The fields of one item, as the Add item(s) and Edit dialogs send them. The name is text (its length is
// checked by the service, per row); the numbers, the category and "for rent" are checked by the service.
const itemFields = {
  name: z.string({ error: 'Enter the item name.' }).default(''),
  category: passThrough,
  total: passThrough,
  lowStockAt: passThrough,
  rentable: passThrough,
  rentPrice: passThrough,
  damageFee: passThrough,
  notes: z.string({ error: 'Notes must be text.' }).max(2000, { error: 'Use 2000 characters or fewer.' }).default('')
};

/**
 * POST /api/admin/inventory { items: [{ name, category, total, lowStockAt, rentable, rentPrice, damageFee,
 * notes }] }: the rows of Add item(s). An empty list is the service's "Add at least one item."
 */
export const addBody = z.object({
  items: z.array(z.object(itemFields), { error: 'Send the new items as a list.' }).default([])
});

// PATCH /api/admin/inventory/:id: the Edit dialog's fields. The name fits its column (VARCHAR(120)).
export const updateBody = z.object({ ...itemFields, name: text(120) });

/**
 * POST /api/admin/inventory/:id/movements { action, qty, damagedQty, ref, note }: one stock movement.
 * The note (the reason for damage or a disposal, a note for the others) goes into the history line.
 */
export const moveBody = z.object({ action: passThrough, qty: passThrough, damagedQty: passThrough, ref: passThrough, note: text(1000) });

// POST /api/admin/inventory/archive { ids, archived }: the ticked items (a page holds 10), archived or restored
export const archiveBody = z.object({
  ids: z.array(z.string({ error: 'Each item id must be text.' }), { error: 'Send the items as a list of ids.' }).max(500, { error: 'Archive up to 500 items at a time.' }),
  archived: passThrough
});

// POST /api/admin/inventory/rentals/:ref/return { returns: [{ itemId, good, damaged }] }: checked by the service
export const returnBody = z.object({
  returns: z
    .array(z.object({ itemId: passThrough, good: passThrough, damaged: passThrough }), { error: 'Send the returned items as a list.' })
    .max(500, { error: 'Send up to 500 rows at a time.' })
    .default([])
});
