import express from 'express';
import { validate } from '../../middleware/validate.js';
import * as schemas from './calendar.schemas.js';
import * as calendar from './calendar.service.js';



export const calendarRoutes = express.Router();

calendarRoutes.get('/calendar', async (req, res) => {
  res.json(await calendar.getCalendar());
});
calendarRoutes.get('/calendar/check', validate({ query: schemas.checkQuery }), async (req, res) => {
  const { date, time, end } = req.valid.query;
  res.json(await calendar.checkAvailability(date, time, end));
});


export const calendarAdminRoutes = express.Router();

calendarAdminRoutes.post('/blocks', validate({ body: schemas.blockBody }), async (req, res) => {
  res.json(await calendar.blockDates(req.valid.body));
});
calendarAdminRoutes.delete('/blocks/:date', validate({ params: schemas.dateParams }), async (req, res) => {
  res.json(await calendar.unblockDate(req.valid.params.date));
});
calendarAdminRoutes.put('/capacity', validate({ body: schemas.capacityBody }), async (req, res) => {
  res.json(await calendar.setDailyCapacity(req.valid.body.value));
});
