import { z } from 'zod';

/**
 * Request shapes for the outsourcing routes (zod), checked by middleware/validate.js before a service runs.
 *
 * Like the other modules' schemas, these check only what the service cannot: that a text field is text
 * and fits its column, and that a list is a list, so a bad value is a clear 400 instead of a database
 * error. Everything the dialogs check (the partner's name, service, email and mobile number; a
 * contract's partner, items, date, booking and amount; the contract text; a status and its reason)
 * passes through to outsource.service.js and @tm/shared/src/domain/outsource.js, which answer with the
 * browser version's own messages. Keys not listed are dropped, so a status, a delivery or a history line
 * added to a request never reaches a service.
 */

// Text of at most `max` characters; missing -> '' so the service answers with the dialog's own message
const text = (max) =>
  z.string({ error: 'This field is required.' }).max(max, { error: `Use ${max} characters or fewer.` }).default('');

// Checked by the service. .optional() matters: in zod 4 a z.unknown() object key is still required,
// and a missing one would be a 400 with zod's own wording instead of the service's message.
const passThrough = z.unknown().optional();

// A query-string switch such as ?includeArchived=true: only "true" or "1" turn it on (catalog.schemas.js)
const querySwitch = z.unknown().optional().transform((value) => value === 'true' || value === '1');

// A partner or contract id from the URL (Express always gives text); an unknown one is a 404 from the service
export const idParams = z.object({ id: z.string() });

// GET /api/admin/outsource/partners?includeArchived=true
export const listQuery = z.object({ includeArchived: querySwitch });

/**
 * POST /api/admin/outsource/partners and PUT …/partners/:id: the partner dialog. Each text fits its
 * column; the mobile number is saved without spaces or dashes (13 characters at most once valid), so the
 * request may carry some spacing beyond the column's 20. What they supply is checked by the service.
 */
export const partnerBody = z.object({
  name: text(120),
  service: passThrough,
  contactPerson: text(120),
  email: text(254),
  mobile: text(40),
  address: text(255),
  notes: text(2000)
});

// POST /api/admin/outsource/partners/archive { ids, archived }
export const archiveBody = z.object({
  ids: z.array(z.string({ error: 'Each partner id must be text.' }), { error: 'Send the partners as a list of ids.' }).max(500, { error: 'Archive up to 500 partners at a time.' }),
  archived: passThrough
});

/**
 * POST /api/admin/outsource/contracts and PUT …/contracts/:id: the contract dialog. The item lines are a
 * list of { name, qty } (the service drops blank rows and checks each one, naming its row); the partner,
 * the booking, the date needed and the amount are checked by the service.
 */
export const contractBody = z.object({
  partnerId: passThrough,
  reservationRef: passThrough,
  items: z
    .array(z.object({ name: z.string({ error: 'Each item needs a name.' }).default(''), qty: passThrough }), { error: 'List the items.' })
    .max(200, { error: 'List up to 200 items.' })
    .default([]),
  needBy: passThrough,
  amount: passThrough,
  notes: text(2000)
});

// POST …/contracts/:id/send { body }: the contract text, the same for every channel (TEXT columns; the dialog allows 2,000)
export const sendBody = z.object({ body: text(10000) });

// POST …/contracts/:id/status { status, note }: the move is checked by the service; the note is the reason on file
export const statusBody = z.object({ status: passThrough, note: text(1000) });
