import { z } from 'zod';

/**
 * Request shapes for the review routes (zod), checked by middleware/validate.js before a service runs.
 *
 * Like reservations.schemas.js, these check only what the service cannot: that a text field is text and
 * fits its column, so an over-long value is a clear 400 under its input instead of a database error.
 * Everything the forms check (the booking, the stars, the four category ratings, the review's and the
 * reply's length, a flag's reason, the status) passes through to feedback.service.js, which answers
 * with the pages' own messages. Keys not listed are dropped, so a customerId, status, reply
 * or read flag added to a request never reaches a service.
 */

// Text of at most `max` characters; missing -> '' so the service answers with the form's own message
const text = (max) =>
  z.string({ error: 'This field is required.' }).max(max, { error: `Use ${max} characters or fewer.` }).default('');

// Checked by the service. .optional() matters: in zod 4 a z.unknown() object key is still required,
// and a missing one would be a 400 with zod's own wording instead of the service's message.
const passThrough = z.unknown().optional();

// A review id from the URL (Express always gives text); an unknown one is a 404 from the service
export const idParams = z.object({ id: z.string() });

// GET /api/feedback/published?limit=3: how many reviews the homepage shows (3); 1 to 20
export const publishedQuery = z.object({
  limit: z.coerce
    .number({ error: 'Ask for 1 to 20 reviews.' })
    .int({ error: 'Ask for 1 to 20 reviews.' })
    .min(1, { error: 'Ask for 1 to 20 reviews.' })
    .max(20, { error: 'Ask for 1 to 20 reviews.' })
    .default(3)
});

/**
 * POST /api/feedback { ref, rating, categories, body }: the customer's review. The booking, the stars
 * and the category ratings are checked by the service; the review is TEXT, kept to 2,000 characters
 * (the form allows 600).
 */
export const createBody = z.object({ ref: passThrough, rating: passThrough, categories: passThrough, body: text(2000) });

// PATCH …/:id/status { status }: 'published' or 'hidden', said in the page's words by the service
export const statusBody = z.object({ status: passThrough });

// PATCH …/:id/featured { featured } and PATCH …/:id/archived { archived }: on or off
export const featuredBody = z.object({ featured: passThrough });
export const archivedBody = z.object({ archived: passThrough });

// PATCH …/:id/flag { flagged, reason }: the reason (at least 5 characters when flagging, checked by the
// service) is TEXT, kept to 1,000 characters like a refund's reason
export const flagBody = z.object({ flagged: passThrough, reason: text(1000) });

// POST …/:id/reply { body }: 5 to 1,000 characters after trimming, checked by the service (so a longer
// text is its "Replies can be up to 1,000 characters." rather than a database error)
export const replyBody = z.object({ body: passThrough });
