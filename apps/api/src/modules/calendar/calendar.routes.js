import express from 'express';
import { validate } from '../../middleware/validate.js';
import * as schemas from './calendar.schemas.js';
import * as calendar from './calendar.service.js';

/**
 * The calendar endpoints (docs/backend-development-phases.md §9.3): URL, guard and request shape
 * only; the rules are in calendar.service.js. Two routers, mounted by app.js:
 *   calendarRoutes       /api/calendar...        public reads: no token needed (the booking bar on the
 *                                                home page asks before anyone signs in)
 *   calendarAdminRoutes  /api/admin/calendar...  blocked dates and the daily capacity, behind the
 *                                                admin router's guard
 */

/* ============================ /api (public reads) ============================ */

export const calendarRoutes = express.Router();

// The availability map every date picker reads: { capacity, blocked, booked, events } (events carry no refs)
calendarRoutes.get('/calendar', async (req, res) => {
  res.json(await calendar.getCalendar());
});
// ?date=YYYY-MM-DD&time=HH:MM -> { date, startTime, available, reason, timeConflict }
calendarRoutes.get('/calendar/check', validate({ query: schemas.checkQuery }), async (req, res) => {
  const { date, time } = req.valid.query;
  res.json(await calendar.checkAvailability(date, time));
});

/* ============================ /api/admin/calendar ============================ */

export const calendarAdminRoutes = express.Router();

// Block a range of dates: { from, to, reason } -> { added, total }
calendarAdminRoutes.post('/blocks', validate({ body: schemas.blockBody }), async (req, res) => {
  res.json(await calendar.blockDates(req.valid.body));
});
// Open one blocked date again -> { ok: true }
calendarAdminRoutes.delete('/blocks/:date', validate({ params: schemas.dateParams }), async (req, res) => {
  res.json(await calendar.unblockDate(req.valid.params.date));
});
// Events allowed per day: { value } -> { capacity }
calendarAdminRoutes.put('/capacity', validate({ body: schemas.capacityBody }), async (req, res) => {
  res.json(await calendar.setDailyCapacity(req.valid.body.value));
});
