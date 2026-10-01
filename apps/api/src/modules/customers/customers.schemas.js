import { z } from 'zod';

/**
 * Request shapes for the customer directory routes (zod), checked by middleware/validate.js before a
 * service runs. Like auth.schemas.js, these check only that a field is text and not absurdly long, so
 * an over-long value is a clear 400 under its input instead of a database error; the email and mobile
 * number formats are checked by customers.service.js with the browser version's messages. Keys not
 * listed are dropped, so a name, company or password added to a request never reaches a service.
 */

// Text of at most `max` characters; missing -> '' so the service answers with the form's own message
const text = (max) =>
  z.string({ error: 'This field is required.' }).max(max, { error: `Use ${max} characters or fewer.` }).default('');

// A customer id from the URL (Express always gives text); an unknown one is a 404 from the service
export const idParams = z.object({ id: z.string() });

/**
 * PATCH /api/admin/customers/:id/contact { email, mobile }. The email fits its column (254); the mobile
 * number is saved without spaces or dashes (at most 13 characters once valid), so the request may
 * carry some spacing beyond the column's 20.
 */
export const contactBody = z.object({ email: text(254), mobile: text(40) });
