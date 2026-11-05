import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assistantReservationStep,
  assistantReservationForm,
  assistantUnavailableSelections
} from '../../../packages/shared/src/domain/assistantReservation.js';
import { mergeAssistantBooking } from '../../../packages/shared/src/domain/assistantBooking.js';
import { createAssistantApi } from '../src/lib/assistantApi.js';

const catalog = {
  packages: [
    { id: 'p', slug: 'classic', name: 'Classic', kind: 'package', visible: true },
    { id: 'r', slug: 'rental', kind: 'rental', visible: true }
  ],
  addons: [{ id: 'tent', name: 'Tent', hasQuantity: true }],
  rentals: [{ id: 'chair', name: 'Chair' }]
};
const full = {
  planningStarted: true,
  eventName: 'Family celebration',
  occasion: 'Birthday',
  serviceType: 'Catering only',
  date: '2090-12-12',
  startTime: '12:00',
  endTime: '16:00',
  guests: 100,
  packageSlug: 'classic',
  styling: {
    theme: 'Rustic',
    colors: [
      { hex: '#FFFFFF', name: 'White' },
      { hex: '#9CAF88', name: 'Sage Green' }
    ],
    notes: 'Low flowers'
  },
  venueName: 'Hall',
  venueAddress: '123 Main St',
  city: 'Malvar',
  accessNotes: 'Ground floor',
  addonIds: [],
  discussed: ['photos', 'budget']
};
const schedule = (draft = full) => ({
  serviceType: draft.serviceType,
  date: draft.date,
  startTime: draft.startTime,
  endTime: draft.endTime,
  available: true
});
const step = (draft, extra = {}) =>
  assistantReservationStep(draft, { catalog, schedule: schedule(draft), ...extra }).key;

test('the interview starts with event identity and skips details already supplied in chat', () => {
  assert.equal(step({}), 'start');
  assert.equal(step({ planningStarted: true }), 'eventName');
  assert.equal(step({ planningStarted: true, eventName: 'My event' }), 'occasion');
  assert.equal(step({ ...full, eventName: '' }), 'eventName');
  assert.equal(step(full), 'review');
  assert.equal(mergeAssistantBooking({}, { planningStarted: true }).planningStarted, true);
});

test('a changed or unavailable schedule must be resolved before later questions and review', () => {
  assert.equal(step(full, { schedule: { ...schedule(), available: false, reason: 'Fully booked' } }), 'schedule');
  assert.equal(step(full, { schedule: { ...schedule(), date: '2090-12-13' } }), 'schedule');
  assert.equal(step(full, { schedule: null }), 'schedule');
  assert.equal(step({ ...full, endTime: '' }), 'schedule');
});

test('styling, photos, design notes, venue and optional skips follow the complete interview', () => {
  const d = {
    ...full,
    styling: undefined,
    venueName: '',
    venueAddress: '',
    city: '',
    accessNotes: '',
    addonIds: undefined,
    discussed: []
  };
  assert.equal(step(d), 'theme');
  d.styling = { theme: 'Royal' };
  assert.equal(step(d), 'colors');
  d.discussed = ['colors'];
  assert.equal(step(d), 'photos');
  assert.equal(
    step(d, { photos: [{ index: 0, name: 'Reference' }] }),
    'photos',
    'allow multiple uploads before continuing'
  );
  d.discussed.push('photos');
  assert.equal(step(d), 'design');
  d.discussed.push('design');
  assert.equal(step(d), 'venueName');
  d.venueName = 'Hall';
  d.venueAddress = 'Road';
  d.city = 'Malvar';
  assert.equal(step(d), 'access');
  d.discussed.push('access');
  assert.equal(step(d), 'addons');
  d.addonIds = [];
  assert.equal(step(d), 'budget');
  d.discussed.push('budget');
  assert.equal(step(d), 'review');
  d.styling.colors = [{ hex: '#FFFFFF', name: 'White' }];
  assert.equal(step(d), 'colors', 'a skipped topic cannot bypass an incomplete one-color motif');
});

test('buffet menu and dessert additions are collected while catering-only omits food questions', () => {
  assert.equal(step({ ...full, serviceType: 'Buffet and Catering' }), 'menu');
  const buffet = {
    ...full,
    serviceType: 'Buffet and Catering',
    menu: { pork: ['Adobo'], chicken: ['Chicken BBQ'], fish: ['Fish fillet'], vegetable: ['Chopsuey'] }
  };
  assert.equal(step(buffet), 'foodNotes');
  assert.equal(step({ ...buffet, discussed: [...buffet.discussed, 'notes'] }), 'review');
  assert.equal(step({ ...full, addonIds: ['tent'], addonQty: {} }), 'addons');
});

test('rental asks for items and fulfilment and excludes event-only fields and consent from submission', () => {
  const rental = {
    ...full,
    serviceType: 'Equipment rental',
    packageSlug: 'rental',
    rentalQty: { chair: 20 },
    fulfilment: 'pickup'
  };
  assert.equal(step(rental), 'review');
  assert.equal(step({ ...rental, rentalQty: {} }), 'rentalItems');
  assert.equal(step({ ...rental, fulfilment: '' }), 'fulfilment');
  const form = assistantReservationForm({ ...rental, agreeTerms: true, customerId: 'forged', price: 1 }, catalog);
  assert.equal(form.packageId, 'r');
  assert.deepEqual(form.rentalItems, [{ itemId: 'chair', qty: 20 }]);
  assert.equal(form.endTime, undefined);
  assert.equal(form.styling, undefined);
  assert.equal(form.agreeTerms, undefined);
  assert.equal(form.customerId, undefined);
  assert.equal(form.price, undefined);
  assert.equal(assistantReservationForm({ ...rental, packageSlug: undefined }, catalog).packageId, 'r');
});

test('submission mapping resolves current package and preserves explicit event, styling and logistics choices', () => {
  const form = assistantReservationForm(full, catalog);
  assert.equal(form.packageId, 'p');
  assert.equal(form.eventName, full.eventName);
  assert.equal(form.styling.notes, full.styling.notes);
  assert.equal(form.venueAddress, full.venueAddress);
  assert.deepEqual(form.addonIds, []);
  assert.equal(assistantReservationForm(full, { ...catalog, packages: [] }).packageId, '');
});

test('retired selections return the interview to the affected choices instead of a misleading ready review', () => {
  assert.equal(step({ ...full, addonIds: ['retired-addon'] }), 'addons');
  assert.equal(
    step({
      ...full,
      serviceType: 'Equipment rental',
      packageSlug: 'rental',
      rentalQty: { retired: 2 },
      fulfilment: 'pickup'
    }),
    'rentalItems'
  );
});

test('one explicit repair removes all retired references together so two stale choices cannot block each other', () => {
  const d = {
    ...full,
    packageSlug: 'retired',
    addonIds: ['retired-addon', 'tent'],
    addonQty: { 'retired-addon': 2, tent: 3 }
  };
  const repair = assistantUnavailableSelections(d, catalog);
  const updated = mergeAssistantBooking(d, repair.patch, repair.clearFields);
  assert.equal(repair.removed.length, 2);
  assert.equal(updated.packageSlug, undefined);
  assert.deepEqual(updated.addonIds, ['tent']);
  assert.deepEqual(updated.addonQty, { tent: 3 });
});

test('chat controls send owned photo, schedule and explicit submission requests without model-generated form fields', async () => {
  const requests = [];
  const api = createAssistantApi({
    base: '/assistant',
    getToken: () => 'customer-token',
    getVisitor: () => 'visitor-secret',
    fetcher: async (url, options) => {
      requests.push({ url, ...options });
      return { ok: true, json: async () => ({ submittedRef: 'TM-1' }), blob: async () => new Blob(['photo']) };
    }
  });
  await api.uploadPhotos('conv', [new File(['image'], 'ref.png', { type: 'image/png' })], 3);
  assert.equal(requests[0].url, '/assistant/conversations/conv/reference-photos?revision=3');
  assert.equal(requests[0].body.get('revision'), '3');
  assert.equal(requests[0].body.getAll('photos').length, 1);
  assert.equal(requests[0].headers['Content-Type'], undefined);
  assert.equal(requests[0].headers.Authorization, 'Bearer customer-token');
  await api.removePhoto('conv', 0, 4);
  assert.deepEqual(JSON.parse(requests[1].body), { index: 0, revision: 4 });
  await api.scheduleOptions('conv', { weekendsOnly: true });
  assert.deepEqual(JSON.parse(requests[2].body), { days: 14, weekendsOnly: true });
  const result = await api.submitBooking('conv', {
    revision: 5,
    agreeTerms: true,
    confirmSubmission: true,
    customerId: 'forged'
  });
  assert.deepEqual(JSON.parse(requests[3].body), { revision: 5, agreeTerms: true, confirmSubmission: true });
  assert.equal(result.submittedRef, 'TM-1');
  assert.ok((await api.photo('conv', 0)) instanceof Blob);
});
