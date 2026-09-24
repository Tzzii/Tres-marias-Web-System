import { z } from 'zod';

/**
 * Request shapes for the catalogue routes (zod), checked by middleware/validate.js before a service runs.
 *
 * Like auth.schemas.js, these check only what the service cannot: that a field is text (or a
 * true/false) and that it fits its database column, so an over-long value is a clear 400 instead of
 * a database error. The business checks (names at least 3 characters, a price of at least ₱100, a
 * known dish category …) stay in catalog.service.js with the admin form's messages. Fields whose
 * missing value has its own message there (a name, a price, a category) pass through here as they
 * are. Keys not listed are dropped, so an id, slug or kind added to a request body never reaches a service.
 */

// Text of at most `max` characters; missing -> '' so the service answers with the form's own message
const text = (max) =>
  z.string({ error: 'This field is required.' }).max(max, { error: `Use ${max} characters or fewer.` }).default('');

// A number field of the package form (price, guests), an items list, a category …: checked by the service.
// .optional() matters: in zod 4 a z.unknown() object key is still required, and a missing one would be a
// 400 with zod's own wording instead of the service's message.
const passThrough = z.unknown().optional();

// true / false, required
const flag = (label) => z.boolean({ error: `${label} must be true or false.` });

// A query-string switch such as ?includeHidden=true: only "true" or "1" turn it on; missing, anything
// else, or the switch given twice (an array) is off
const querySwitch = z.unknown().optional().transform((value) => value === 'true' || value === '1');

// A record id or slug from the URL (Express always gives text); an unknown one is a 404 from the service
const pathText = z.string();

/* ---- Public reads ---- */

export const packagesQuery = z.object({ includeHidden: querySwitch, includeArchived: querySwitch });
export const archivedQuery = z.object({ includeArchived: querySwitch });
export const slugParams = z.object({ slug: pathText });

/* ---- Admin writes ---- */

export const idParams = z.object({ id: pathText });

// Column lengths: name VARCHAR(120); description is TEXT, kept to 2000 characters (the site shows a paragraph)
export const packageBody = z.object({
  name: text(120),
  description: text(2000),
  price: passThrough,
  guests: passThrough,
  items: passThrough,
  visible: flag('Visible').optional() // a new package without it starts hidden; an edit without it keeps the current setting
});
export const visibilityBody = z.object({ visible: flag('Visible') });
export const archivedBody = z.object({ archived: flag('Archived') });

export const addonBody = z.object({
  name: text(120),
  description: text(2000),
  hasQuantity: flag('Ask how many').default(false)
});

export const dishBody = z.object({ name: text(120), category: passThrough });

export const pricePerPlateBody = z.object({ pricePerPlate: passThrough });
