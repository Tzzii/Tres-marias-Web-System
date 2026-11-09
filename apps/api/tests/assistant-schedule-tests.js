import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot } from '../../../packages/shared/src/domain/availability.js';
import { ASSISTANT_TOOLS, createAssistantTools } from '../src/modules/assistant/assistant.tools.js';

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

test('monthly overview reads once, distinguishes scheduled events from full and blocked days, and strips private fields', async () => {
  let reads = 0;
  const draft = { eventName: 'Keep my plan', guests: 100 };
  const tools = createAssistantTools({
    draft,
    calendar: async () => {
      reads++;
      return {
        capacity: 2,
        booked: { '2090-11-14': 1, '2090-11-21': 2 },
        blocked: [{ date: '2090-11-28', reason: 'Private admin reason', note: 'Private note' }],
        events: [
          {
            date: '2090-11-14',
            startTime: '12:00',
            hours: 4,
            ref: 'PRIVATE-REF',
            customer: 'Private customer',
            payment: 4000
          },
          { date: '2090-11-21', startTime: '06:00', hours: 2 },
          { date: '2090-11-21', startTime: '18:00', hours: 2 },
          { date: '2090-10-10', startTime: '12:00', hours: 4, customer: 'Outside month' }
        ]
      };
    }
  });
  const result = await tools.run('monthly_calendar_overview', { year: 2090, month: 11 });
  assert.equal(result.error, undefined);
  assert.equal(reads, 1);
  assert.equal(result.days.length, 30);
  assert.equal(result.timezone, 'Asia/Manila');
  assert.equal(result.holdsSlot, false);
  assert.equal(result.exactTimeCheckRequired, true);
  const day = (date) => result.days.find((entry) => entry.date === date);
  assert.equal(day('2090-11-14').status, 'has_events');
  assert.equal(day('2090-11-14').scheduledEventCount, 1);
  assert.equal(day('2090-11-14').canRequestBooking, true);
  assert.equal(day('2090-11-21').status, 'fully_booked');
  assert.equal(day('2090-11-21').canRequestBooking, false);
  assert.equal(day('2090-11-28').status, 'blocked');
  assert.equal(day('2090-11-01').status, 'open');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|Private|Outside month|customer|payment|note|2090-10-10/);
  assert.equal(tools.bookingDraft.eventName, draft.eventName);
  assert.equal(tools.bookingDraft.guests, draft.guests);
  const definition = ASSISTANT_TOOLS.find((tool) => tool.name === 'monthly_calendar_overview');
  assert.deepEqual(definition.parameters.required.sort(), ['month', 'year']);
});

test('monthly overview handles leap years, empty months and historical dates without inventing availability', async () => {
  const tools = createAssistantTools({ calendar: async () => ({ capacity: 2, booked: {}, blocked: [], events: [] }) });
  const leap = await tools.run('monthly_calendar_overview', { year: 2088, month: 2 });
  assert.equal(leap.days.length, 29);
  assert.equal(leap.days.at(-1).date, '2088-02-29');
  const regular = await tools.run('monthly_calendar_overview', { year: 2090, month: 2 });
  assert.equal(regular.days.length, 28);
  const historical = await tools.run('monthly_calendar_overview', { year: 2000, month: 1 });
  assert.equal(historical.days.length, 31);
  assert.ok(
    historical.days.every((day) => day.status === 'open' && !day.canRequestBooking && day.bookingRestriction === 'past')
  );
});

test('monthly overview requires an explicit valid month and year before reading calendar data', async () => {
  let reads = 0;
  const tools = createAssistantTools({
    calendar: async () => {
      reads++;
      return {};
    }
  });
  for (const args of [
    { month: 11 },
    { year: 2090 },
    { year: 2090, month: 0 },
    { year: 2090, month: 13 },
    { year: '2090', month: 11 },
    { year: 2090, month: 1.5 },
    { year: 2090, month: 11, customerId: 'other' }
  ]) {
    assert.ok((await tools.run('monthly_calendar_overview', args)).error);
  }
  assert.equal(reads, 0);
});

test('monthly overview never returns an empty successful month after calendar failure', async () => {
  const tools = createAssistantTools({
    calendar: async () => {
      throw Error('Calendar offline');
    }
  });
  await assert.rejects(tools.run('monthly_calendar_overview', { year: 2090, month: 11 }), /Calendar offline/);
});

test('monthly overview uses slot-holding status and shared buffer/overlap rules instead of just counting events', async () => {
  const map = buildSnapshot({
    capacity: 10,
    blocked: [],
    reservations: [
      {
        ref: 'confirmed',
        date: '2090-11-14',
        startTime: '00:00',
        endTime: '06:00',
        status: 'confirmed',
        serviceType: 'Catering only'
      },
      {
        ref: 'approved',
        date: '2090-11-14',
        startTime: '08:00',
        endTime: '14:00',
        status: 'approved',
        serviceType: 'Catering only'
      },
      {
        ref: 'paid',
        date: '2090-11-14',
        startTime: '16:00',
        endTime: '22:00',
        status: 'downpayment_paid',
        serviceType: 'Catering only'
      },
      {
        ref: 'pending',
        date: '2090-11-15',
        startTime: '12:00',
        endTime: '16:00',
        status: 'pending',
        serviceType: 'Catering only'
      },
      {
        ref: 'cancelled',
        date: '2090-11-15',
        startTime: '12:00',
        endTime: '16:00',
        status: 'cancelled',
        serviceType: 'Catering only'
      },
      { ref: 'rental', date: '2090-11-15', startTime: '12:00', status: 'confirmed', serviceType: 'Equipment rental' }
    ]
  });
  const tools = createAssistantTools({ calendar: async () => map });
  const result = await tools.run('monthly_calendar_overview', { year: 2090, month: 11 });
  const day = (date) => result.days.find((entry) => entry.date === date);
  assert.equal(day('2090-11-14').scheduledEventCount, 3);
  assert.equal(day('2090-11-14').status, 'fully_booked', 'No minimum-duration slot fits even below daily capacity');
  assert.equal(
    day('2090-11-15').scheduledEventCount,
    0,
    'Pending, cancelled and rental requests take no catering slots'
  );
});

test('malformed calendar snapshots fail closed instead of reporting every day open', async () => {
  for (const map of [
    null,
    {},
    { capacity: 2, blocked: [], booked: {}, events: [{ date: 'bad', startTime: '12:00', hours: 4 }] }
  ]) {
    const tools = createAssistantTools({ calendar: async () => map });
    await assert.rejects(tools.run('monthly_calendar_overview', { year: 2090, month: 11 }), {
      code: 'ASSISTANT_UNAVAILABLE'
    });
  }
});
