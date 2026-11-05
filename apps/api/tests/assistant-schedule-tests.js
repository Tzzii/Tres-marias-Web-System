import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistantTools } from '../src/modules/assistant/assistant.tools.js';

test('the preferred date is checked before the customer has supplied event times', async () => {
  const tools = createAssistantTools({
    draft: { serviceType: 'Catering only', date: '2090-12-12' },
    availability: async (date, startTime) => ({
      date,
      available: false,
      reason: 'Fully booked',
      startTime,
      note: 'Private note'
    })
  });
  const result = await tools.run('check_reservation_availability', {});
  assert.equal(result.available, false);
  assert.equal(result.dateOnly, true);
  assert.equal(result.reason, 'Fully booked');
  assert.equal(JSON.stringify(result).includes('Private'), false);
});

test('schedule choices check nearest same-day times and later dates without changing the saved plan', async () => {
  const draft = { serviceType: 'Catering only', date: '2090-12-12', startTime: '12:00', endTime: '16:00' };
  const checked = [];
  const tools = createAssistantTools({
    draft,
    availability: async (date, startTime, endTime) => {
      checked.push([date, startTime, endTime]);
      return { date, available: date !== draft.date || startTime >= '17:00', reason: '', note: 'Private booking' };
    }
  });
  const result = await tools.run('reservation_schedule_options', { days: 14, weekendsOnly: false });
  assert.equal(result.dates.length, 3);
  assert.equal(result.times.length, 3);
  assert.equal(result.times[0].startTime, '17:00');
  assert.equal(result.times[0].endTime, '21:00');
  assert.equal(result.holdsSlot, false);
  assert.equal(tools.bookingDraft.date, draft.date);
  assert.equal(tools.bookingDraft.startTime, draft.startTime);
  assert.equal(JSON.stringify(result).includes('Private'), false);
  assert.ok(checked.length <= 62);
});

test('rental alternatives use pickup time only and weekend date filters are respected', async () => {
  const tools = createAssistantTools({
    draft: { serviceType: 'Equipment rental', date: '2090-12-12', startTime: '12:00' },
    availability: async () => {
      throw Error('Wrong calendar');
    },
    rentalAvailability: async (date, startTime) => ({ date, startTime, available: true })
  });
  const result = await tools.run('reservation_schedule_options', { days: 14, weekendsOnly: true });
  assert.equal(result.dates.length, 3);
  assert.ok(result.dates.every((d) => [0, 6].includes(new Date(`${d.date}T00:00:00Z`).getUTCDay())));
  assert.ok(result.times.every((d) => d.endTime === null));
  assert.equal(
    (await tools.run('reservation_schedule_options', { days: 15, weekendsOnly: false })).error !== undefined,
    true
  );
});
