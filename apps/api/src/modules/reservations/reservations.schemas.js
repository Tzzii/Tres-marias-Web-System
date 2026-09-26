import { z } from 'zod';

/**
 * Request shapes for the reservation routes (zod), checked by middleware/validate.js before a service runs.
 *
 * Like catalog.schemas.js, these check only what the service cannot: that a text field is text and
 * fits its database column, so an over-long value is a clear 400 under its input instead of a database
 * error. Everything the booking form checks itself (the package, date, start time, guests, menu,
 * add-ons, rented items …) passes through to reservations.service.js, which answers with the browser
 * version's own messages. Keys not listed are dropped, so a customerId, status, ref or price added to a
 * request never reaches a service.
 */

// Text of at most `max` characters; missing -> '' so the service answers with the form's own message
const text = (max) =>
  z.string({ error: 'This field is required.' }).max(max, { error: `Use ${max} characters or fewer.` }).default('');

// Checked by the service. .optional() matters: in zod 4 a z.unknown() object key is still required,
// and a missing one would be a 400 with zod's own wording instead of the service's message.
const passThrough = z.unknown().optional();

// A reservation ref from the URL (Express always gives text); an unknown one is a 404 from the service
export const refParams = z.object({ ref: z.string() });

/**
 * POST /api/reservations: the booking form. Lengths follow the columns (event_name 120, occasion 40,
 * venue_name 160, venue_address 255, city 120). The notes are TEXT, kept to 2,000 characters (the
 * form allows 500); each menu line is cut to MENU_LINE_MAX by the service, as in the browser version.
 */
export const createBody = z.object({
  packageId: passThrough,
  serviceType: passThrough,
  eventName: text(120),
  occasion: text(40),
  date: passThrough,
  startTime: passThrough,
  guests: passThrough,
  menu: passThrough,
  foodNotes: text(2000),
  addonIds: passThrough,
  addonQty: passThrough,
  venueName: text(160),
  venueAddress: text(255),
  city: text(120),
  accessNotes: text(2000),
  fulfilment: passThrough,
  rentalItems: passThrough
});

// POST /api/reservations/:ref/cancel { reason }, kept to 2,000 characters like a chat message
export const cancelBody = z.object({ reason: text(2000) });

// POST /api/reservations/:ref/change-request { message }, 2,000 characters like a chat message
export const changeBody = z.object({ message: text(2000) });

// GET /api/rentals/availability?date=YYYY-MM-DD&excludeRef=RES-… (excludeRef: the admin's edit dialog only)
export const availabilityQuery = z.object({ date: passThrough, excludeRef: passThrough });
