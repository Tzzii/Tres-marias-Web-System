/** Isolated guided-reservation browser checks. Every API request is fulfilled locally. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildBusinessSeed } from '../apps/api/src/seedData/seed.js';
import { TERMS_VERSION } from '../packages/shared/src/legal/terms.js';
import { ASSISTANT_QUESTIONS } from '../packages/shared/src/domain/assistant.js';
import { bookingPlan, validateBookingPatch } from '../apps/api/src/modules/assistant/assistant.booking.js';
import { assistantReservationStep } from '../packages/shared/src/domain/assistantReservation.js';
import { mergeAssistantBooking } from '../packages/shared/src/domain/assistantBooking.js';
import { bookableAddons } from '../packages/shared/src/domain/catalog.js';
import { themeColorSchemes } from '../packages/shared/src/domain/themeColors.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const output = path.resolve(process.env.UI_OUTPUT_DIR || 'tmp/assistant-reservation-ui');
const base = process.env.UI_CLIENT_URL || 'http://localhost:5173';
const scenarioFilter = process.env.UI_SCENARIO || '';
await fs.mkdir(output, { recursive: true });
const seed = buildBusinessSeed();
const packages = seed.packages.map((p) => ({ ...p, visible: true, archived: false }));
const pkg = packages.find((p) => p.kind !== 'rental');
const addon = bookableAddons(seed.addons).find((a) => a.hasQuantity && !a.archived);
assert.ok(addon, 'Seed must include a quantity-based additional service');
const rental = { id: 'fixture-chair', name: 'Chair', category: 'Furniture', price: 25, damageFee: 100 };
const catalog = {
  packages,
  addons: seed.addons,
  dishes: seed.dishes,
  rentals: [rental],
  pricePerPlate: 600,
  minDownpayment: 3000,
  sixHourFee: 5000
};
const user = {
  id: 'assistant-reservation-fixture',
  name: 'Reservation Preview',
  firstName: 'Reservation',
  lastName: 'Preview',
  email: 'reservation@example.invalid',
  mobile: '09171234567',
  company: '',
  termsVersion: TERMS_VERSION
};
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64'
);
const validSchedule = (d) => ({
  serviceType: d.serviceType,
  date: d.date,
  startTime: d.startTime || '',
  endTime: d.endTime || '',
  available: true,
  reason: '',
  dateOnly: !d.startTime
});
const completedDraft = (patch = {}) =>
  validateBookingPatch(
    {},
    {
      planningStarted: true,
      eventName: 'Fixture celebration',
      occasion: 'Birthday',
      serviceType: 'Catering only',
      date: '2090-12-12',
      startTime: '12:00',
      endTime: '16:00',
      guests: 100,
      packageSlug: pkg.slug,
      styling: { theme: 'Rustic', colors: themeColorSchemes('Rustic')[0].colors, notes: 'Ivory linens' },
      venueName: 'Fixture event hall',
      venueAddress: '123 Test Street',
      city: 'Malvar',
      addonIds: [],
      addonQty: {},
      discussed: ['colors', 'photos', 'design', 'access', 'addons', 'notes', 'budget'],
      ...patch
    },
    catalog
  );

async function fixture(
  context,
  { signedIn = true, draft = {}, schedule, conflict = false, photos = [], loseSubmitResponse = false, savedForm } = {}
) {
  await context.routeWebSocket('**', (socket) => socket.close());
  const state = {
    id: randomUUID(),
    bookingDraft: draft,
    draftRevision: 0,
    schedule: schedule || null,
    photos: [...photos],
    messages: [],
    paidTurns: 0,
    writes: 0,
    submits: 0,
    created: 0,
    submittedRef: null,
    uploads: 0,
    removals: 0,
    reads: 0,
    photoReads: 0,
    optionRequests: 0,
    fresh: 0,
    unexpected: [],
    conflict
  };
  if (signedIn)
    await context.addInitScript(
      ({ user, savedForm }) => {
        localStorage.setItem(
          'tm.client.session',
          JSON.stringify({ token: 'isolated-fixture', user, lastActivity: Date.now() })
        );
        if (savedForm && !localStorage.getItem(`tm.client.draft.${user.id}`))
          localStorage.setItem(`tm.client.draft.${user.id}`, JSON.stringify({ form: savedForm, savedAt: Date.now() }));
      },
      { user, savedForm }
    );
  const step = () =>
    assistantReservationStep(state.bookingDraft, { schedule: state.schedule, photos: state.photos, catalog });
  const snapshot = () => ({
    conversationId: state.id,
    bookingDraft: state.bookingDraft,
    draftRevision: state.draftRevision,
    bookingPlan: Object.keys(state.bookingDraft).length ? bookingPlan(state.bookingDraft, catalog) : null,
    bookingCatalog: catalog,
    bookingSchedule: state.schedule,
    bookingEstimate: {
      knownSubtotal: 15000,
      lines: [{ name: 'Package setup', amount: 15000 }],
      pendingQuotation: ['Custom styling']
    },
    referencePhotos: state.photos,
    submittedRef: state.submittedRef,
    expiresAt: Date.now() + 86400000,
    messages: state.messages,
    allowance: {
      guest: !signedIn,
      used: state.paidTurns,
      limit: signedIn ? 20 : 5,
      remaining: (signedIn ? 20 : 5) - state.paidTurns,
      pending: false
    }
  });
  const updateSchedule = () => {
    const d = state.bookingDraft;
    state.schedule = d.date ? validSchedule(d) : null;
    if (state.conflict && d.date === '2090-12-12')
      state.schedule = { ...state.schedule, available: false, reason: 'This date is fully booked.' };
    else if (state.conflict && d.startTime === '12:00')
      state.schedule = { ...state.schedule, available: false, reason: 'This time overlaps another event.' };
  };
  await context.route('**/api/**', async (route) => {
    const req = route.request(),
      endpoint = new URL(req.url()).pathname.replace(/^\/api/, '');
    const headers = {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Assistant-Visitor',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const reply = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers });
    if (endpoint === '/assistant/config')
      return reply({
        available: true,
        enabled: true,
        voiceAvailable: false,
        questions: ASSISTANT_QUESTIONS,
        dailyLimit: 20,
        guestLimit: 5
      });
    if (endpoint === '/assistant/session') {
      if (req.postDataJSON()?.fresh) {
        state.fresh++;
        state.id = randomUUID();
        state.bookingDraft = {};
        state.draftRevision = 0;
        state.schedule = null;
        state.photos = [];
        state.submittedRef = null;
      }
      return reply({ ...snapshot(), ...(!signedIn ? { visitorToken: 'v'.repeat(43) } : {}) });
    }
    if (endpoint.startsWith('/assistant/conversations/')) {
      if (endpoint.endsWith('/booking-draft')) {
        const body = req.postDataJSON();
        assert.equal(body.revision, state.draftRevision, 'UI sends current draft revision');
        assert.equal(state.submittedRef, null, 'Submitted conversation cannot be edited');
        state.bookingDraft = validateBookingPatch({}, body.draft, catalog);
        state.draftRevision++;
        state.writes++;
        updateSchedule();
      } else if (endpoint.endsWith('/reference-photos/remove')) {
        const body = req.postDataJSON();
        assert.equal(body.revision, state.draftRevision);
        state.photos.splice(body.index, 1);
        state.photos = state.photos.map((p, index) => ({ ...p, index }));
        state.draftRevision++;
        state.removals++;
      } else if (/\/reference-photos\/\d+$/.test(endpoint)) {
        state.photoReads++;
        return route.fulfill({ contentType: 'image/png', body: PNG, headers });
      } else if (endpoint.endsWith('/reference-photos')) {
        const body = req.postDataBuffer().toString('latin1');
        assert.match(req.headers()['content-type'], /multipart\/form-data/);
        assert.ok(body.includes('name="revision"\r\n\r\n' + state.draftRevision), 'Photo upload uses current revision');
        const names = [...body.matchAll(/name="photos"; filename="([^"]+)"/g)].map((m) => m[1]);
        assert.ok(names.length, 'Photo upload includes photos multipart field');
        state.photos.push(
          ...names.map((name, i) => ({ index: state.photos.length + i, name, mime: 'image/png', size: PNG.length }))
        );
        state.draftRevision++;
        state.uploads++;
      } else if (endpoint.endsWith('/schedule-options')) {
        state.optionRequests++;
        return reply({
          dates: [
            {
              date: '2090-12-13',
              startTime: state.bookingDraft.startTime || null,
              endTime: state.bookingDraft.endTime || null
            }
          ],
          times: state.bookingDraft.startTime
            ? [{ date: state.bookingDraft.date, startTime: '18:00', endTime: '22:00' }]
            : [],
          holdsSlot: false,
          checkedAt: Date.now()
        });
      } else if (endpoint.endsWith('/submit')) {
        state.submits++;
        const body = req.postDataJSON();
        assert.ok(signedIn, 'Guests cannot send reservation requests');
        assert.equal(body.revision, state.draftRevision);
        assert.equal(body.agreeTerms, true);
        assert.equal(body.confirmSubmission, true);
        assert.equal(step().key, 'review', 'Submission needs a complete reviewed plan');
        if (!state.submittedRef) {
          state.created++;
          state.submittedRef = 'TM-UI-RESERVATION';
        }
        if (loseSubmitResponse) return route.abort('connectionfailed');
      } else if (endpoint.endsWith('/messages')) {
        const body = req.postDataJSON();
        state.paidTurns++;
        state.bookingDraft = validateBookingPatch(
          state.bookingDraft,
          {
            planningStarted: true,
            eventName: 'Natural language celebration',
            occasion: 'Birthday',
            serviceType: 'Catering only',
            guests: 120
          },
          catalog
        );
        state.draftRevision++;
        state.messages.push({
          id: randomUUID(),
          requestId: body.requestId,
          text: body.text,
          source: body.source,
          status: 'completed',
          createdAt: Date.now(),
          response: {
            answer: 'I saved your event name, occasion, service and guest count. Let us choose a date.',
            packages: [],
            estimates: [],
            needsAdmin: false
          }
        });
      }
      if (req.method() === 'GET' && /^\/assistant\/conversations\/[^/]+$/.test(endpoint)) state.reads++;
      return reply(snapshot());
    }
    if (endpoint === '/packages') return reply(packages);
    if (endpoint.startsWith('/packages/by-slug/')) return reply(pkg);
    if (endpoint === '/addons') return reply(seed.addons);
    if (endpoint === '/dishes') return reply(seed.dishes);
    if (endpoint === '/rental-items') return reply([rental]);
    if (endpoint === '/catalog') return reply(catalog);
    if (endpoint.startsWith('/catalog/')) return reply(catalog);
    if (endpoint.startsWith('/rentals/availability'))
      return reply({ [rental.id]: { left: 1000, status: 'available' } });
    if (endpoint === '/calendar') return reply({ capacity: 2, blocked: [], booked: {}, events: [] });
    if (endpoint === '/changes') return reply({ stamp: 1 });
    if (endpoint === '/me') return reply(user);
    if (endpoint === '/auth/payment-details') return reply({});
    if (endpoint.startsWith('/appearance/')) return reply({ version: null });
    if (req.method() !== 'GET') {
      state.unexpected.push(`${req.method()} ${endpoint}`);
      return reply({ message: 'Unexpected fixture write' }, 500);
    }
    return reply([]);
  });
  return { state, step };
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
async function scenario(name, options, run) {
  if (scenarioFilter && !name.includes(scenarioFilter)) return;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
    ...options?.context
  });
  const f = await fixture(context, options);
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(options?.signedIn === false ? base : `${base}/portal/assistant`, { waitUntil: 'networkidle' });
    if (options?.signedIn === false) await page.getByRole('button', { name: 'Open AI assistant', exact: true }).click();
    await run(page, f);
    assert.deepEqual(f.state.unexpected, [], 'No unrecognized API writes');
    assert.deepEqual(errors, [], 'No browser runtime errors');
    results.push(name);
    console.log(`PASS ${name}`);
  } catch (error) {
    await page.screenshot({ path: path.join(output, `${name.replaceAll(/[^a-z0-9-]/gi, '-')}-failure.png`) });
    await fs.writeFile(path.join(output, 'failure.txt'), `${error.stack}\n\n${await page.locator('body').innerText()}`);
    throw error;
  } finally {
    await context.close();
  }
}
const button = (page, name) => page.getByRole('button', { name, exact: true });
const field = (page, name) => page.getByLabel(name, { exact: true });
const next = (page) => button(page, 'Continue').click();
async function fillStep(page, name, value) {
  await field(page, name).fill(value);
  await next(page);
}
async function select(page, name, value) {
  const el = field(page, name);
  if (await el.evaluate((node) => node.tagName === 'SELECT')) await el.selectOption({ label: value });
  else {
    await el.click();
    await page.getByRole('option', { name: value, exact: true }).click();
  }
}
async function noOverflow(page) {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    'No page horizontal overflow'
  );
  const panel = page.locator('.tm-assistant-panel').first();
  if (await panel.count())
    assert.equal(
      await panel.evaluate((el) => el.scrollWidth > el.clientWidth + 1),
      false,
      'No assistant horizontal overflow'
    );
}

try {
  await scenario(
    'manual handoff preserves owned photos and unrelated saved form',
    {
      draft: Object.fromEntries(Object.entries(completedDraft()).filter(([key]) => key !== 'venueName')),
      schedule: validSchedule(completedDraft()),
      photos: [{ index: 0, name: 'chat-reference.png', mime: 'image/png', size: PNG.length }],
      savedForm: {
        venueName: 'Keep unrelated saved venue',
        serviceType: 'Catering only',
        guests: '100',
        referencePhotos: [
          { name: 'older-form-reference.png', dataUrl: `data:image/png;base64,${PNG.toString('base64')}` }
        ]
      }
    },
    async (page, { state }) => {
      await button(page, 'Continue in booking form').click();
      await page.getByRole('dialog', { name: 'Review booking selections', exact: true }).waitFor();
      assert.ok(page.url().endsWith('/portal/assistant'), 'Photo transfer finishes before navigation');
      const before = await page.evaluate((id) => JSON.parse(localStorage.getItem(`tm.client.draft.${id}`)), user.id);
      assert.equal(before.form.venueName, 'Keep unrelated saved venue');
      assert.deepEqual(
        before.form.referencePhotos.map((photo) => photo.name),
        ['older-form-reference.png', 'chat-reference.png']
      );
      assert.equal(before.form.referencePhotos[1].dataUrl, `data:image/png;base64,${PNG.toString('base64')}`);
      assert.ok(state.reads >= 2, 'Owned conversation revision checked before and after downloading photos');
      assert.ok(state.photoReads >= 1, 'Owned image downloaded before handoff');
      await button(page, 'Use selections').click();
      await page.waitForURL('**/portal/book');
      await page.waitForFunction(() => document.getElementById('f-venueName')?.value === 'Keep unrelated saved venue');
      const after = await page.evaluate((id) => JSON.parse(localStorage.getItem(`tm.client.draft.${id}`)), user.id);
      assert.deepEqual(
        after.form.referencePhotos.map((photo) => photo.name),
        ['older-form-reference.png', 'chat-reference.png']
      );
      assert.equal(state.paidTurns, 0);
      assert.equal(state.submits, 0);
      await page.screenshot({ path: path.join(output, 'manual-handoff-photos.png') });
    }
  );

  await scenario(
    'retired rental selections can be removed',
    {
      draft: {
        planningStarted: true,
        eventName: 'Saved rental fixture',
        occasion: 'Birthday',
        serviceType: 'Equipment rental',
        date: '2090-12-12',
        startTime: '12:00',
        rentalQty: { [rental.id]: 50, retiredRental: 5 },
        fulfilment: 'pickup',
        discussed: ['budget']
      },
      schedule: validSchedule({ serviceType: 'Equipment rental', date: '2090-12-12', startTime: '12:00' })
    },
    async (page, { state, step }) => {
      await button(page, 'Remove unavailable items').waitFor();
      assert.equal(step().key, 'rentalItems');
      await button(page, 'Remove unavailable items').click();
      await page.getByRole('checkbox', { name: /Terms of Service/ }).waitFor();
      assert.deepEqual(state.bookingDraft.rentalQty, { [rental.id]: 50 });
      assert.equal(step().key, 'review');
      assert.equal(state.paidTurns, 0);
    }
  );

  await scenario(
    'retired addon selections can be removed',
    {
      draft: {
        ...completedDraft(),
        addonIds: [addon.id, 'retiredAddon'],
        addonQty: { [addon.id]: 2, retiredAddon: 1 }
      },
      schedule: validSchedule(completedDraft())
    },
    async (page, { state, step }) => {
      await button(page, 'Remove unavailable services').waitFor();
      assert.equal(step().key, 'addons');
      await button(page, 'Remove unavailable services').click();
      await page.getByRole('checkbox', { name: /Terms of Service/ }).waitFor();
      assert.deepEqual(state.bookingDraft.addonIds, [addon.id]);
      assert.deepEqual(state.bookingDraft.addonQty, { [addon.id]: 2 });
      assert.equal(step().key, 'review');
      assert.equal(state.paidTurns, 0);
    }
  );

  await scenario(
    'retired package and service are repaired together',
    {
      draft: {
        ...completedDraft(),
        packageSlug: 'retired-package',
        addonIds: ['retired-addon'],
        addonQty: { 'retired-addon': 1 }
      },
      schedule: validSchedule(completedDraft())
    },
    async (page, { state, step }) => {
      await button(page, 'Remove unavailable services').click();
      await button(page, `Choose ${pkg.name}`).waitFor();
      assert.equal(state.bookingDraft.packageSlug, undefined);
      assert.deepEqual(state.bookingDraft.addonIds, []);
      assert.equal(step().key, 'package');
      await button(page, `Choose ${pkg.name}`).click();
      await next(page);
      await page.getByRole('checkbox', { name: /Terms of Service/ }).waitFor();
      assert.equal(state.paidTurns, 0);
      assert.equal(state.submits, 0);
    }
  );

  await scenario('complete catering guided reservation', {}, async (page, { state, step }) => {
    await button(page, 'Start reservation').click();
    assert.equal(state.paidTurns, 0);
    await fillStep(page, 'Event name', 'Browser fixture birthday');
    await select(page, 'Occasion', 'Birthday');
    await next(page);
    await button(page, 'Catering only').click();
    await next(page);
    await field(page, 'Event date').fill('2090-12-12');
    await button(page, 'Check date').click();
    await select(page, 'Start time', '12:00');
    await field(page, 'End time').selectOption('16:00');
    await button(page, 'Check schedule').click();
    await fillStep(page, 'Guest count', '100');
    await button(page, `Choose ${pkg.name}`).waitFor();
    assert.ok(await page.locator('.tm-assistant-package-choice img').count(), 'Package choices show photographs');
    await page.screenshot({ path: path.join(output, 'package-choices.png') });
    await button(page, `Choose ${pkg.name}`).click();
    await next(page);
    await button(page, 'Rustic').click();
    await next(page);
    await button(page, themeColorSchemes('Rustic')[0].label).click();
    await next(page);
    await field(page, 'Upload reference photos').setInputFiles({
      name: 'design-reference.png',
      mimeType: 'image/png',
      buffer: PNG
    });
    await page.getByRole('img', { name: 'Reference photo: design-reference.png', exact: true }).waitFor();
    assert.equal(state.uploads, 1);
    await page.screenshot({ path: path.join(output, 'private-photo-preview.png') });
    // Uploading may advance directly to design because an attached photo satisfies this step.
    if ((await button(page, 'Continue').isVisible()) && !(await field(page, 'Design details').count()))
      await next(page);
    await fillStep(page, 'Design details', 'Ivory linens with sage ribbons');
    await fillStep(page, 'Venue name', 'Fixture hall');
    await fillStep(page, 'Venue address', '123 Fixture Street');
    await fillStep(page, 'City or municipality', 'Malvar');
    await fillStep(page, 'Access notes', 'Use the side entrance');
    await page.getByRole('checkbox', { name: new RegExp(addon.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).check();
    await field(page, `Quantity for ${addon.name}`).fill('2');
    await next(page);
    await button(page, 'Skip for now').click();
    const terms = page.getByRole('checkbox', { name: /I agree to the Terms of Service/ });
    await terms.waitFor();
    assert.equal(await terms.isChecked(), false);
    assert.equal(await button(page, 'Submit reservation request').isEnabled(), false);
    assert.equal(step().key, 'review');
    assert.equal(state.bookingDraft.addonQty[addon.id], 2);
    assert.equal(state.bookingDraft.styling.theme, 'Rustic');
    assert.equal(state.paidTurns, 0);
    assert.deepEqual(state.bookingDraft.styling.colors, themeColorSchemes('Rustic')[0].colors);
    await terms.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'catering-review-unchecked.png') });
    await terms.check();
    await button(page, 'Submit reservation request').click({ clickCount: 2 });
    await page.getByText('Reservation request sent', { exact: true }).waitFor();
    await page.getByRole('link', { name: 'View reservation', exact: true }).waitFor();
    assert.equal(state.created, 1);
    assert.equal(state.submits, 1);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('Reservation request sent', { exact: true }).waitFor();
    assert.equal(await button(page, 'Submit reservation request').count(), 0);
    assert.equal(state.created, 1);
    assert.equal(state.submits, 1);
    await page.screenshot({ path: path.join(output, 'submitted-reload.png') });
    await button(page, 'Plan another reservation').click();
    await button(page, 'Start reservation').waitFor();
    assert.equal(state.fresh, 1);
    assert.equal(state.created, 1);
  });

  await scenario(
    'submission response loss recovers existing request',
    { draft: completedDraft(), schedule: validSchedule(completedDraft()), loseSubmitResponse: true },
    async (page, { state }) => {
      await page.getByRole('checkbox', { name: /Terms of Service/ }).check();
      await button(page, 'Submit reservation request').click();
      await page.getByText('Reservation request sent', { exact: true }).waitFor();
      assert.equal(state.created, 1);
      assert.equal(state.submits, 1);
      assert.equal(await button(page, 'Submit reservation request').count(), 0);
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByText('Reservation request sent', { exact: true }).waitFor();
      assert.equal(state.created, 1);
      assert.equal(state.submits, 1);
      assert.equal(state.paidTurns, 0);
    }
  );

  await scenario(
    'date and time conflicts need explicit choices',
    {
      draft: mergeAssistantBooking(completedDraft(), {}, ['startTime', 'endTime']),
      schedule: {
        ...validSchedule({ ...completedDraft(), startTime: '', endTime: '' }),
        available: false,
        reason: 'This date is fully booked.'
      },
      conflict: true,
      context: { viewport: { width: 390, height: 844 } }
    },
    async (page, { state, step }) => {
      await page.getByText('This date is fully booked.', { exact: true }).waitFor();
      assert.equal(step().key, 'schedule');
      await button(page, 'Find other schedules').click();
      await button(page, '2090-12-13').waitFor();
      assert.equal(state.bookingDraft.date, '2090-12-12', 'Showing alternatives does not change the selected date');
      await button(page, '2090-12-13').click();
      await select(page, 'Start time', '12:00');
      await field(page, 'End time').selectOption('16:00');
      await button(page, 'Check schedule').click();
      await page.getByText('This time overlaps another event.', { exact: true }).waitFor();
      assert.equal(step().key, 'schedule');
      assert.equal(await button(page, 'Submit reservation request').count(), 0);
      await button(page, 'Find other schedules').click();
      await button(page, '18:00–22:00 · 2090-12-13').waitFor();
      assert.equal(state.bookingDraft.startTime, '12:00', 'Showing alternatives does not change selected times');
      await page.screenshot({ path: path.join(output, 'mobile-conflict-options.png') });
      await button(page, '18:00–22:00 · 2090-12-13').click();
      await page.getByRole('checkbox', { name: /Terms of Service/ }).waitFor();
      assert.equal(state.bookingDraft.date, '2090-12-13');
      assert.equal(state.bookingDraft.startTime, '18:00');
      assert.equal(state.bookingDraft.endTime, '22:00');
      assert.equal(state.optionRequests, 2);
      assert.equal(state.paidTurns, 0);
      await noOverflow(page);
    }
  );

  await scenario(
    'edit saved photos and reset terms',
    {
      draft: completedDraft(),
      schedule: validSchedule(completedDraft()),
      photos: [{ index: 0, name: 'saved-reference.png', mime: 'image/png', size: PNG.length }]
    },
    async (page, { state }) => {
      await page.getByRole('checkbox', { name: /Terms of Service/ }).check();
      await field(page, 'Change a detail').selectOption('photos');
      await page.getByRole('img', { name: 'Reference photo: saved-reference.png', exact: true }).waitFor();
      await button(page, 'Remove reference photo 1').click();
      await field(page, 'Upload reference photos').setInputFiles({
        name: 'replacement-reference.png',
        mimeType: 'image/png',
        buffer: PNG
      });
      await page.getByRole('img', { name: 'Reference photo: replacement-reference.png', exact: true }).waitFor();
      await next(page);
      await page.getByRole('checkbox', { name: /Terms of Service/ }).waitFor();
      assert.equal(state.removals, 1);
      assert.equal(state.uploads, 1);
      assert.equal(await page.getByRole('checkbox', { name: /Terms of Service/ }).isChecked(), false);
      await field(page, 'Change a detail').selectOption('guests');
      await fillStep(page, 'Guest count', '120');
      await page.getByRole('checkbox', { name: /Terms of Service/ }).waitFor();
      assert.equal(state.bookingDraft.guests, 120);
      assert.equal(state.bookingDraft.venueName, 'Fixture event hall');
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByText('replacement-reference.png', { exact: true }).waitFor();
      assert.equal(await page.getByRole('checkbox', { name: /Terms of Service/ }).isChecked(), false);
      assert.equal(state.paidTurns, 0);
    }
  );

  await scenario(
    'mobile saved review and guest guard',
    {
      signedIn: false,
      draft: completedDraft(),
      schedule: validSchedule(completedDraft()),
      context: { viewport: { width: 390, height: 844 } }
    },
    async (page, { state }) => {
      await page.getByText(/Please review your reservation/).waitFor();
      assert.equal(await button(page, 'Submit reservation request').count(), 0);
      await page.getByRole('link', { name: 'Create an account', exact: true }).waitFor();
      await noOverflow(page);
      await page.screenshot({ path: path.join(output, 'mobile-guest-review.png') });
      await page.getByRole('link', { name: 'Create an account', exact: true }).click();
      await page.waitForURL('**/signup?continue=assistant');
      assert.equal(state.submits, 0);
      assert.equal(state.paidTurns, 0);
    }
  );

  await scenario(
    'natural language skips saved answers',
    { context: { viewport: { width: 390, height: 844 } } },
    async (page, { state }) => {
      await field(page, 'Your question').fill(
        'Reserve a birthday called Natural language celebration with catering only for 120 guests'
      );
      await button(page, 'Send question').click();
      await field(page, 'Event date').waitFor();
      assert.equal(state.bookingDraft.guests, 120);
      assert.equal(state.paidTurns, 1);
      assert.equal(await field(page, 'Event name').count(), 0);
      await page.reload({ waitUntil: 'networkidle' });
      await field(page, 'Event date').waitFor();
      await noOverflow(page);
    }
  );

  await scenario(
    'buffet menu resumes into review',
    {
      draft: mergeAssistantBooking(completedDraft(), {
        serviceType: 'Buffet and Catering',
        menu: {},
        foodNotes: 'No peanuts',
        discussed: completedDraft().discussed
      }),
      schedule: validSchedule({ ...completedDraft(), serviceType: 'Buffet and Catering' })
    },
    async (page, { state }) => {
      const picks = { Pork: 'Pork BBQ', Chicken: 'Chicken BBQ', Fish: 'Sweet and sour fish', Vegetable: 'Chopsuey' };
      for (const [category, name] of Object.entries(picks)) {
        const input = page.getByRole('combobox', { name: new RegExp(category, 'i') });
        await input.fill(name);
        await input.press('Enter');
      }
      await next(page);
      if (await field(page, 'Food and dietary requests').count()) await button(page, 'Skip for now').click();
      await page.getByRole('checkbox', { name: /Terms of Service/ }).waitFor();
      assert.deepEqual(state.bookingDraft.menu.pork, ['Pork BBQ']);
      assert.equal(state.paidTurns, 0);
    }
  );

  await scenario(
    'rental pickup quantities and no venue',
    {
      draft: {
        planningStarted: true,
        eventName: 'Rental fixture',
        occasion: 'Birthday',
        serviceType: 'Equipment rental',
        date: '2090-12-12',
        startTime: '12:00',
        discussed: ['budget']
      },
      schedule: validSchedule({ serviceType: 'Equipment rental', date: '2090-12-12', startTime: '12:00' }),
      context: { viewport: { width: 390, height: 844 } }
    },
    async (page, { state, step }) => {
      await page.getByRole('checkbox', { name: /Chair/ }).check();
      await field(page, 'Quantity for Chair').fill('50');
      await next(page);
      await button(page, 'Pick up').click();
      await next(page);
      await page.getByRole('checkbox', { name: /Terms of Service/ }).waitFor();
      assert.equal(step().key, 'review');
      assert.equal(state.bookingDraft.rentalQty[rental.id], 50);
      assert.equal(await field(page, 'Venue name').count(), 0);
      assert.equal(state.paidTurns, 0);
      await noOverflow(page);
      await page.screenshot({ path: path.join(output, 'mobile-rental-review.png') });
    }
  );

  console.log(JSON.stringify({ passed: results, screenshots: output }, null, 2));
} finally {
  await browser.close();
}
