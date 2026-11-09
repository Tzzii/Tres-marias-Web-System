/** Isolated package-planning checks: all API requests are intercepted, with no live AI or database writes. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildBusinessSeed } from '../apps/api/src/seedData/seed.js';
import { TERMS_VERSION } from '../packages/shared/src/legal/terms.js';
import { RULES } from '../packages/shared/src/services/config.js';
import { ASSISTANT_QUESTIONS } from '../packages/shared/src/domain/assistant.js';
import { assistantPackageProposalDraft } from '../packages/shared/src/domain/assistantBooking.js';
import { bookingPlan, validateBookingPatch } from '../apps/api/src/modules/assistant/assistant.booking.js';
import { buildPackageCandidates } from '../packages/shared/src/domain/packageProposal.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base = process.env.UI_CLIENT_URL || 'http://localhost:5173';
const output = path.resolve(process.env.UI_OUTPUT_DIR || 'tmp/package-proposal-ui');
await fs.mkdir(output, { recursive: true });
const seed = buildBusinessSeed();
const packages = seed.packages.map((p) => ({ ...p, visible: true, archived: false }));
const source = packages.find((p) => p.kind !== 'rental' && p.items?.length);
packages.push({
  id: 'fixture-equipment',
  slug: 'fixture-equipment',
  kind: 'package',
  guests: 100,
  price: 1000,
  name: 'Equipment reference',
  visible: true,
  items: [
    { name: 'Standard chairs', qty: 100 },
    { name: 'Tiffany chairs', qty: 100 },
    { name: 'Water table', qty: 1 }
  ]
});
const catalog = {
  packages,
  addons: seed.addons,
  dishes: seed.dishes,
  rentals: [{ id: 'fixture-chair', name: 'Chair', category: 'Furniture', price: 25, damageFee: 100 }],
  pricePerPlate: 600,
  minDownpayment: 3000,
  sixHourFee: 5000,
  packageProposalCatalogFingerprint: 'a'.repeat(64),
  packageProposalRules: {
    enabled: true,
    recipes: [
      {
        id: 'fixture-setup',
        name: 'Reviewed custom setup',
        serviceTypes: ['Buffet and Catering', 'Catering only'],
        minGuests: RULES.minGuests,
        maxGuests: RULES.maxGuests,
        cateringSetupPrice: 20000,
        components: [
          { packageId: source.id, itemIndex: 0, itemName: source.items[0].name, mode: 'fixed', qty: 1 },
          {
            packageId: 'fixture-equipment',
            itemIndex: 0,
            itemName: 'Standard chairs',
            mode: 'perGuests',
            perGuests: 1,
            qty: 1,
            unitPrice: 10
          },
          {
            packageId: 'fixture-equipment',
            itemIndex: 2,
            itemName: 'Water table',
            mode: 'fixed',
            qty: 1,
            optional: true,
            unitPrice: 200
          }
        ],
        optionalAddonIds: []
      }
    ]
  }
};
catalog.packageProposalRules.recipes.push({
  ...structuredClone(catalog.packageProposalRules.recipes[0]),
  id: 'fixture-tiffany',
  name: 'Chair upgrade reference',
  components: catalog.packageProposalRules.recipes[0].components.map((c) =>
    c.itemName === 'Standard chairs' ? { ...c, itemIndex: 1, itemName: 'Tiffany chairs', unitPrice: 30 } : c
  )
});
const context = {
  serviceType: 'Catering only',
  guests: 100,
  budget: 100000,
  occasion: 'Baby shower',
  eventName: 'Custom celebration',
  date: '2090-12-12',
  startTime: '12:00',
  endTime: '16:00',
  preferences: '',
  foodNotes: '',
  menu: {},
  styling: null,
  addonIds: [],
  addonQty: {},
  protectedAddonIds: []
};
const built = buildPackageCandidates(context, { catalog, rules: catalog.packageProposalRules, stock: {} });
assert.ok(built.candidates.length, built.noFitReasons.join(', '));
const option = built.candidates[0];
const reference = { proposalId: 'fixture-proposal', revision: 1, optionId: option.id };
const proposal = {
  id: reference.proposalId,
  revision: 1,
  context: built.context,
  options: [option],
  status: 'ready',
  noFitReasons: [],
  catalogFingerprint: catalog.packageProposalCatalogFingerprint,
  expiresAt: Date.now() + 86400000,
  selectedOptionId: option.id,
  submission: null
};
const user = {
  id: 'package-ui-fixture',
  name: 'Package Preview',
  firstName: 'Package',
  lastName: 'Preview',
  email: 'package@example.invalid',
  mobile: '09171234567',
  company: '',
  termsVersion: TERMS_VERSION
};

async function fixture(
  browser,
  {
    mode = 'light',
    viewport = { width: 1440, height: 1000 },
    draft,
    form,
    savedAt = 1,
    available = true,
    submitted = false,
    admin = false,
    packageIssue = null
  } = {}
) {
  const browserContext = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  await browserContext.routeWebSocket('**', (socket) => socket.close());
  const state = {
    id: randomUUID(),
    draft: draft || { planningStarted: true, planningMode: 'custom' },
    revision: 0,
    selected: draft?.packageProposalRef ? option : null,
    generates: 0,
    selects: 0,
    submits: 0,
    paid: 0,
    unexpected: []
  };
  const envelope = () => ({
    ...proposal,
    expiresAt: submitted ? 1 : proposal.expiresAt,
    submission: submitted ? { reservationRef: 'TM-EXISTING', submittedAt: 1000, packageProposalRef: reference } : null
  });
  const snapshot = () => ({
    conversationId: state.id,
    bookingDraft: state.draft,
    draftRevision: state.revision,
    bookingCatalog: catalog,
    selectedPackageProposal: state.selected,
    packageProposalIssue: packageIssue,
    bookingPlan: bookingPlan(state.draft, {
      ...catalog,
      selectedPackageProposal: state.selected,
      packageProposalIssue: packageIssue
    }),
    referencePhotos: [],
    submittedRef: null,
    bookingSchedule: state.draft.date
      ? {
          serviceType: state.draft.serviceType,
          date: state.draft.date,
          startTime: state.draft.startTime,
          endTime: state.draft.endTime,
          available: true
        }
      : null,
    bookingEstimate: null,
    messages: [],
    allowance: { guest: false, used: 0, limit: 20, remaining: 20, pending: false }
  });
  await browserContext.addInitScript(
    ({ user, form, savedAt, mode, admin }) => {
      localStorage.setItem(
        admin ? 'tm.admin.session' : 'tm.client.session',
        JSON.stringify({ token: 'isolated-fixture', user, lastActivity: Date.now() })
      );
      localStorage.setItem('tm.colorMode', mode);
      if (form && !localStorage.getItem(`tm.client.draft.${user.id}`))
        localStorage.setItem(`tm.client.draft.${user.id}`, JSON.stringify({ savedAt, form }));
    },
    { user: admin ? { ...user, id: 'package-admin-fixture', role: 'Administrator' } : user, form, savedAt, mode, admin }
  );
  await browserContext.route('**/api/**', async (route) => {
    const request = route.request(),
      endpoint = new URL(request.url()).pathname.replace(/^\/api/, '');
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Cache-Control': 'no-store'
    };
    const reply = (value, status = 200) =>
      route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(value) });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (endpoint === '/assistant/config')
      return reply({
        available,
        enabled: available,
        voiceAvailable: false,
        dailyLimit: 20,
        guestLimit: 5,
        questions: ASSISTANT_QUESTIONS
      });
    if (endpoint === '/assistant/session') {
      if (request.postDataJSON()?.fresh) {
        state.id = randomUUID();
        state.draft = {};
        state.revision = 0;
        state.selected = null;
      }
      return reply(snapshot());
    }
    if (endpoint.startsWith('/assistant/conversations/')) {
      if (endpoint.endsWith('/booking-draft')) {
        const body = request.postDataJSON();
        assert.equal(body.revision, state.revision);
        state.draft = validateBookingPatch({}, body.draft, catalog);
        state.revision++;
        return reply(snapshot());
      }
      if (endpoint.endsWith('/package-proposal-selection')) {
        const body = request.postDataJSON();
        assert.equal(body.revision, state.revision);
        state.draft = assistantPackageProposalDraft(state.draft, proposal.context, option, reference);
        state.selected = option;
        state.revision++;
        return reply(snapshot());
      }
      if (request.method() === 'GET') return reply(snapshot());
      state.paid++;
      return reply({ code: 'UNEXPECTED', message: 'Unexpected paid operation' }, 500);
    }
    if (endpoint === '/package-proposals' && request.method() === 'POST') {
      state.generates++;
      state.generatedContext = request.postDataJSON().context;
      return reply(envelope());
    }
    if (endpoint.endsWith('/select') && endpoint.startsWith('/package-proposals/')) {
      state.selects++;
      assert.equal(submitted, false, 'Submitted history must never reselect');
      return reply({ ...reference, option });
    }
    if (endpoint.startsWith('/package-proposals/')) return reply(envelope());
    if (endpoint === '/catalog') return reply(catalog);
    if (endpoint === '/admin/package-proposal-rules') return reply({ rules: catalog.packageProposalRules });
    if (endpoint === '/packages') return reply(packages);
    if (endpoint === '/addons') return reply(catalog.addons);
    if (endpoint === '/dishes') return reply(catalog.dishes);
    if (endpoint === '/rental-items') return reply(catalog.rentals);
    if (endpoint.startsWith('/catalog/')) return reply(catalog);
    if (endpoint.startsWith('/rentals/availability'))
      return reply({ 'fixture-chair': { left: 1000, status: 'available' } });
    if (endpoint === '/calendar') return reply({ capacity: 2, blocked: [], booked: {}, events: [] });
    if (endpoint === '/changes') return reply({ stamp: 1 });
    if (endpoint === '/me' || endpoint === '/admin/me')
      return reply(admin ? { ...user, id: 'package-admin-fixture', role: 'Administrator' } : user);
    if (endpoint.startsWith('/appearance/')) return reply({ version: null });
    if (endpoint === '/auth/payment-details') return reply({});
    if (request.method() !== 'GET') {
      state.unexpected.push(endpoint);
      state.submits++;
      return reply({ code: 'UNEXPECTED' }, 500);
    }
    return reply([]);
  });
  const page = await browserContext.newPage();
  const errors = [];
  page.setDefaultTimeout(12000);
  page.on('pageerror', (error) => errors.push(error.message));
  return { browserContext, page, state, errors };
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const passed = [];
try {
  const check = await fixture(browser, {
    form: {
      eventName: 'Saved event',
      venueName: 'Saved hall',
      serviceType: 'Catering only',
      packageId: '',
      packageProposalRef: reference,
      packageProposalDisplay: option,
      packageProposalContext: context,
      guests: '100',
      referencePhotos: [{ name: 'saved.png', dataUrl: 'data:image/png;base64,cGhvdG8=' }]
    }
  });
  await check.page.goto(`${base}/portal/ai-budgeting`, { waitUntil: 'networkidle' });
  await check.page.getByRole('heading', { name: 'Budget recommendation & Package generator', exact: true }).waitFor();
  const sidebarLabels = await check.page
    .locator('.tm-sidebar-link')
    .evaluateAll((links) => links.map((link) => link.getAttribute('aria-label')));
  assert.equal(sidebarLabels.indexOf('Budget recommendation & Package generator'), sidebarLabels.indexOf('My Reservations') + 1);
  assert.equal(
    await check.page.getByRole('button', { name: 'Budget recommendation & Package generator', exact: true }).getAttribute('aria-current'),
    'page'
  );
  assert.equal(
    await check.page.getByRole('button', { name: 'My Reservations', exact: true }).getAttribute('aria-current'),
    null
  );
  await check.page.screenshot({ path: path.join(output, 'ai-budgeting-desktop.png'), fullPage: true });
  assert.equal(await check.page.getByRole('log', { name: 'Assistant conversation' }).count(), 0);
  passed.push('dedicated budgeting page opens directly below Reservations without the general assistant conversation');
  await check.page.getByRole('link', { name: 'I need equipment rental', exact: true }).click();
  await check.page.waitForURL('**/portal/book*');
  await check.page.waitForFunction(() =>
    document.querySelector('button[aria-pressed="true"]')?.textContent.includes('Rent items only')
  );
  assert.equal(await check.page.locator('#f-eventName').inputValue(), 'Saved event');
  await check.page.getByRole('button', { name: /^Delivery/ }).click();
  assert.equal(await check.page.getByLabel('Place name', { exact: false }).inputValue(), 'Saved hall');
  await check.page.waitForFunction(
    (id) => JSON.parse(localStorage.getItem(`tm.client.draft.${id}`)).form.serviceType === 'Equipment rental',
    user.id
  );
  const saved = await check.page.evaluate(
    (id) => JSON.parse(localStorage.getItem(`tm.client.draft.${id}`)).form,
    user.id
  );
  assert.equal(saved.packageProposalRef, null);
  assert.equal(saved.referencePhotos.length, 1);
  assert.equal(check.errors.length, 0, check.errors.join('\n'));
  assert.equal(check.state.submits, 0);
  assert.equal(check.state.paid, 0);
  passed.push('rental shortcut selects rental and preserves unrelated saved event details');
  await check.browserContext.close();

  const entry = await fixture(browser);
  await entry.page.goto(`${base}/portal/plan-event`, { waitUntil: 'networkidle' });
  await entry.page.getByRole('link', { name: 'Continue to booking', exact: true }).click();
  await entry.page.waitForURL('**/portal/book');
  assert.equal(entry.state.selects, 0);
  assert.deepEqual(entry.errors, []);
  passed.push('existing-package entry reaches the ordinary form without custom selection');
  await entry.browserContext.close();

  for (const mode of ['light', 'dark']) {
    const offline = await fixture(browser, { mode, available: false, viewport: { width: 390, height: 844 } });
    await offline.page.goto(`${base}/portal/ai-budgeting`, { waitUntil: 'networkidle' });
    const panel = offline.page.locator('.tm-assistant-plan').filter({ hasText: 'Your custom package' }).last();
    await panel.getByRole('button', { name: 'Catering only', exact: true }).click();
    await panel.getByRole('button', { name: 'Save and continue', exact: true }).click();
    await panel.getByLabel(/^Event name/).fill('Baby shower celebration');
    await panel.getByLabel('Occasion', { exact: true }).selectOption('Other');
    await panel.getByLabel('Your occasion', { exact: true }).fill('Baby shower');
    await panel.getByRole('button', { name: 'Save and continue', exact: true }).click();
    await panel.getByLabel('How many guests?', { exact: true }).fill('100');
    const budgetField = panel.getByLabel('Total event budget (₱)', { exact: true });
    await budgetField.fill('200000');
    assert.equal(await budgetField.inputValue(), '200,000');
    assert.ok((await budgetField.locator('..').innerText()).includes('₱'));
    await budgetField.fill('₱100,000');
    assert.equal(await budgetField.inputValue(), '100,000');
    await budgetField.evaluate((input) => {
      input.focus();
      input.setSelectionRange(4, 4);
    });
    await budgetField.press('Backspace');
    assert.equal(await budgetField.inputValue(), '10,000');
    await budgetField.fill('');
    assert.equal(await budgetField.inputValue(), '');
    await budgetField.fill('100000');
    await panel.getByRole('button', { name: 'Save and continue', exact: true }).click();
    assert.equal(offline.state.draft.occasionOther, 'Baby shower');
    assert.equal(offline.state.draft.budget, 100000);
    await panel.getByRole('grid').waitFor({ state: 'visible' });
    assert.equal(await panel.getByRole('grid').count(), 1, 'Use the inline Book an Event calendar');
    assert.equal(await panel.getByRole('combobox', { name: /^(Start|End) time —/ }).count(), 6);
    await panel.getByRole('button', { name: 'Next month', exact: true }).click();
    await panel.locator('[role="gridcell"]:not([disabled])').first().click();
    const pickTimePart = async (label, option) => {
      await panel.getByRole('combobox', { name: label, exact: true }).click();
      await offline.page.getByRole('option', { name: option, exact: true }).click();
    };
    await pickTimePart('Start time — Hour', '10');
    await pickTimePart('Start time — Minutes', '30');
    await pickTimePart('End time — Hour', '12');
    await pickTimePart('End time — Minutes', '30');
    await panel.getByRole('button', { name: 'Save and continue', exact: true }).click();
    assert.equal(offline.state.draft.startTime, '10:30');
    assert.equal(offline.state.draft.endTime, '12:30');
    await panel.getByRole('button', { name: 'Back', exact: true }).click();
    if (mode === 'dark') {
      const color = await panel.evaluate((element) => getComputedStyle(element).backgroundColor);
      assert.ok(
        color
          .match(/\d+/g)
          .slice(0, 3)
          .every((n) => Number(n) < 128),
        `Dark planner has dark surface: ${color}`
      );
    }
    assert.ok(await offline.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await offline.page.screenshot({ path: path.join(output, `planning-${mode}-mobile.png`), fullPage: true });
    await offline.page.reload({ waitUntil: 'networkidle' });
    await offline.page.getByText('Theme and colors', { exact: true }).waitFor();
    assert.equal(offline.state.generates, 0);
    assert.equal(offline.state.paid, 0);
    assert.deepEqual(offline.errors, []);
    passed.push(`${mode} mobile: offline structured answers save/reload with no paid request or horizontal overflow`);
    await offline.page.getByRole('button', { name: 'Cancel package plan', exact: true }).click();
    const cancelDialog = offline.page.getByRole('dialog', { name: 'Cancel package plan?' });
    await cancelDialog.getByRole('button', { name: 'Keep planning', exact: true }).click();
    assert.equal(offline.state.draft.budget, 100000);
    await offline.page.getByRole('button', { name: 'Cancel package plan', exact: true }).click();
    await cancelDialog.getByRole('button', { name: 'Yes, cancel plan', exact: true }).click();
    await offline.page.getByRole('button', { name: 'Start my package', exact: true }).waitFor();
    assert.deepEqual(offline.state.draft, {});
    assert.equal(offline.state.generates, 0);
    assert.equal(offline.state.paid, 0);
    await offline.page.reload({ waitUntil: 'networkidle' });
    await offline.page.getByRole('button', { name: 'Start my package', exact: true }).waitFor();
    passed.push(
      `${mode} mobile: cancel can be dismissed or confirmed; a fresh package plan survives reload without generation`
    );
    await offline.browserContext.close();
  }

  const styling = await fixture(browser, {
    draft: { ...context, planningStarted: true, planningMode: 'custom', occasion: 'Debut', discussed: [] }
  });
  await styling.page.goto(`${base}/portal/ai-budgeting`, { waitUntil: 'networkidle' });
  const themes = styling.page.getByRole('group', { name: 'Recommended themes for Debut', exact: true });
  assert.equal(await themes.getByRole('button', { name: 'Masquerade', exact: true }).count(), 1);
  assert.equal(await themes.getByRole('button', { name: 'Graduation', exact: true }).count(), 0);
  await styling.page.getByText('Recommended color schemes for Debut', { exact: true }).waitFor();
  await themes.getByRole('button', { name: 'Enchanted Garden', exact: true }).click();
  await styling.page.getByText('Recommended color schemes for Enchanted Garden', { exact: true }).waitFor();
  await styling.page.getByRole('button', { name: 'Back', exact: true }).click();
  await styling.page.getByRole('button', { name: 'Back', exact: true }).click();
  await styling.page.getByRole('button', { name: 'Back', exact: true }).click();
  await styling.page.getByLabel('Occasion', { exact: true }).selectOption('Christening');
  await styling.page.getByRole('button', { name: 'Save and continue', exact: true }).click();
  await styling.page.getByRole('button', { name: 'Save and continue', exact: true }).click();
  await styling.page.getByRole('button', { name: 'Save and continue', exact: true }).click();
  const christening = styling.page.getByRole('group', { name: 'Recommended themes for Christening', exact: true });
  await christening.getByRole('button', { name: 'Baby Angels and Clouds', exact: true }).click();
  await styling.page.getByText('Recommended color schemes for Baby Angels and Clouds', { exact: true }).waitFor();
  assert.equal(await christening.getByRole('button', { name: 'Masquerade', exact: true }).count(), 0);
  assert.equal(styling.state.generates, 0);
  assert.equal(styling.state.paid, 0);
  assert.deepEqual(styling.errors, []);
  passed.push('occasion-specific theme groups and palettes update when the customer changes occasion or theme');
  await styling.browserContext.close();

  const equipment = await fixture(browser, {
    draft: { ...context, occasion: 'Birthday', planningStarted: true, planningMode: 'custom', discussed: ['styling'] }
  });
  await equipment.page.goto(`${base}/portal/ai-budgeting`, { waitUntil: 'networkidle' });
  await equipment.page.getByText('Your setup and equipment', { exact: true }).waitFor();
  await equipment.page.getByRole('button', { name: 'Save and continue', exact: true }).click();
  await equipment.page.getByText('Choose an offered guest chair for this setup.', { exact: true }).waitFor();
  await equipment.page
    .getByLabel('What chairs would you like for your guests?', { exact: true })
    .selectOption('Tiffany chairs');
  await equipment.page.getByLabel('Include Water table?', { exact: true }).selectOption('false');
  await equipment.page.getByRole('button', { name: 'Save and continue', exact: true }).click();
  assert.equal(equipment.state.draft.setupPreferences.reviewed, true);
  assert.equal(equipment.state.draft.setupPreferences.chairName, 'Tiffany chairs');
  assert.deepEqual(equipment.state.draft.setupPreferences.items, [{ itemName: 'Water table', included: false }]);
  await equipment.page.reload({ waitUntil: 'networkidle' });
  await equipment.page.getByText('Additional services', { exact: true }).waitFor();
  await equipment.page.getByRole('button', { name: 'Save and continue', exact: true }).click();
  await equipment.page.getByRole('button', { name: 'Build my three custom options', exact: true }).waitFor();
  await equipment.page.getByText('Water table: Leave out', { exact: true }).waitFor();
  assert.equal(equipment.state.generates, 0);
  await equipment.page.screenshot({ path: path.join(output, 'custom-setup-review.png'), fullPage: true });
  await equipment.page.getByRole('button', { name: 'Build my three custom options', exact: true }).click();
  await equipment.page.waitForURL('**/portal/package-proposals/**');
  assert.equal(equipment.state.generates, 1);
  assert.deepEqual(equipment.state.generatedContext.setupPreferences, equipment.state.draft.setupPreferences);
  assert.deepEqual(equipment.errors, []);
  passed.push(
    'chair and optional water-table answers are required, survive reload and reach the custom generation request'
  );
  await equipment.browserContext.close();

  const handoff = await fixture(browser, {
    draft: {
      ...context,
      planningStarted: true,
      planningMode: 'custom',
      occasion: 'Other',
      occasionOther: 'Baby shower',
      eventName: 'Chat celebration',
      venueName: 'Chat hall',
      venueAddress: 'Chat address',
      city: 'Malvar',
      accessNotes: 'Use side entrance'
    },
    form: { eventName: 'Manual celebration', venueName: 'Manual hall' }
  });
  await handoff.page.goto(`${base}/portal/package-proposals/${reference.proposalId}?conversation=${handoff.state.id}`, {
    waitUntil: 'networkidle'
  });
  await handoff.page.getByRole('button', { name: 'Use this package', exact: true }).click();
  const dialog = handoff.page.getByRole('dialog');
  await dialog.waitFor();
  assert.ok((await dialog.innerText()).includes('Manual celebration'));
  assert.ok((await dialog.innerText()).includes('Chat celebration'));
  await dialog.getByRole('button', { name: 'Keep my saved form', exact: true }).click();
  assert.equal(
    await handoff.page.evaluate(
      (id) => JSON.parse(localStorage.getItem(`tm.client.draft.${id}`)).form.eventName,
      user.id
    ),
    'Manual celebration'
  );
  await handoff.page.getByRole('button', { name: 'Use this package', exact: true }).click();
  await dialog.getByRole('button', { name: 'Use reviewed package', exact: true }).click();
  await handoff.page.waitForURL('**/portal/book');
  await handoff.page.waitForFunction(() => document.getElementById('f-eventName')?.value === 'Chat celebration');
  assert.equal(await handoff.page.locator('#f-venueName').inputValue(), 'Chat hall');
  assert.equal(handoff.state.draft.occasion, 'Other');
  assert.equal(handoff.state.draft.occasionOther, 'Baby shower');
  assert.equal(await handoff.page.getByRole('checkbox', { name: /Terms of Service/ }).isChecked(), false);
  await handoff.page.locator('#f-guests').fill('101');
  await handoff.page.waitForFunction(
    (id) => JSON.parse(localStorage.getItem(`tm.client.draft.${id}`)).form.packageProposalStale,
    user.id
  );
  assert.equal(handoff.state.submits, 0);
  assert.equal(handoff.state.paid, 0);
  assert.deepEqual(handoff.errors, []);
  await handoff.page.screenshot({ path: path.join(output, 'custom-booking-stale-review.png'), fullPage: true });
  passed.push(
    'proposal choice reconciles chat/manual answers, keeps Other occasion and terms unchecked, then flags a changed guest count'
  );
  await handoff.browserContext.close();

  const recovery = await fixture(browser, {
    submitted: true,
    savedAt: Date.now(),
    form: {
      eventName: 'Newer work',
      packageProposalRef: reference,
      serviceType: context.serviceType,
      packageProposalDisplay: option,
      packageProposalContext: context,
      guests: '100'
    }
  });
  await recovery.page.goto(`${base}/portal/book`, { waitUntil: 'networkidle' });
  await recovery.page.getByRole('button', { name: 'View saved request', exact: true }).waitFor();
  assert.equal(recovery.state.selects, 0);
  assert.equal(await recovery.page.locator('#f-eventName').inputValue(), 'Newer work');
  assert.equal(recovery.state.submits, 0);
  assert.deepEqual(recovery.errors, []);
  passed.push('expired submitted package recovers before selection and preserves newer form work');
  await recovery.browserContext.close();

  const staleChat = await fixture(browser, {
    packageIssue: 'The reviewed catalog changed. Choose fresh options.',
    draft: assistantPackageProposalDraft(
      {
        planningStarted: true,
        eventName: 'Stale custom plan',
        venueName: 'Chat hall',
        venueAddress: 'Chat address',
        city: 'Malvar',
        discussed: ['styling', 'colors', 'photos', 'design', 'access', 'addons', 'notes', 'menu', 'budget']
      },
      context,
      option,
      reference
    )
  });
  await staleChat.page.goto(`${base}/portal/assistant?mode=package`, { waitUntil: 'networkidle' });
  await staleChat.page.waitForURL('**/portal/ai-budgeting');
  await staleChat.page.getByText('The reviewed catalog changed. Choose fresh options.', { exact: true }).waitFor();
  await staleChat.page.getByRole('button', { name: 'Adjust answers and regenerate', exact: true }).waitFor();
  assert.equal(
    await staleChat.page.getByRole('checkbox', { name: /Terms of Service/ }).count(),
    0,
    'A stale server-selected custom package cannot be presented as ready to submit'
  );
  assert.equal(
    await staleChat.page
      .locator('[data-assistant-reservation]')
      .getByRole('button', { name: 'Continue', exact: true })
      .count(),
    0,
    'Custom-package steps must direct the customer to package planning instead of an empty Continue form'
  );
  assert.equal(staleChat.state.submits, 0);
  assert.deepEqual(staleChat.errors, []);
  passed.push('stale custom chat selection returns to package planning before terms or submission');
  await staleChat.browserContext.close();

  const admin = await fixture(browser, { admin: true, mode: 'dark' });
  await admin.page.goto(`${process.env.UI_ADMIN_URL || 'http://localhost:5174'}/packages`, {
    waitUntil: 'networkidle'
  });
  await admin.page.getByRole('button', { name: 'Custom package recipes', exact: true }).click();
  await admin.page.getByRole('dialog').getByRole('heading', { name: 'Custom package recipes', exact: true }).waitFor();
  await admin.page.getByRole('button', { name: 'Save recipes', exact: true }).waitFor();
  assert.deepEqual(admin.errors, []);
  assert.equal(admin.state.unexpected.length, 0);
  await admin.page.screenshot({ path: path.join(output, 'admin-recipes-dark.png'), fullPage: true });
  passed.push('admin approved-recipe editor renders its saved rules in dark mode without changing live settings');
  await admin.browserContext.close();
  console.log(JSON.stringify({ passed, screenshots: output }, null, 2));
} catch (error) {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
      await fs
        .writeFile(
          path.join(output, 'failure.txt'),
          `${error.stack}\n${page.url()}\n${await page.locator('body').innerText()}`
        )
        .catch(() => {});
    }
  }
  throw error;
} finally {
  await browser.close();
}
