import { z } from 'zod';

/**
 * Request shapes for the calendar routes (zod), checked by middleware/validate.js before a service runs.
 *
 * Every field here is one calendar.service.js checks itself (a real date, an "HH:MM" time, a known
 * reason, a capacity from 1 to 10), so a missing or odd value gets the same message as the browser
 * version rather than zod's own. What these schemas add is the list of keys a route reads: any other
 * key in the request is dropped before it reaches the service.
 */

// Checked by the service. .optional() matters: in zod 4 a z.unknown() object key is still required,
// and a missing one would be a 400 with zod's own wording instead of the service's message.
const passThrough = z.unknown().optional();

// GET /api/calendar/check?date=YYYY-MM-DD&time=HH:MM (time optional)
export const checkQuery = z.object({ date: passThrough, time: passThrough });

// POST /api/admin/calendar/blocks { from, to, reason }
export const blockBody = z.object({ from: passThrough, to: passThrough, reason: passThrough });

// DELETE /api/admin/calendar/blocks/:date (Express always gives text)
export const dateParams = z.object({ date: z.string() });

// PUT /api/admin/calendar/capacity { value } (a number, or digits as text)
export const capacityBody = z.object({ value: passThrough });
