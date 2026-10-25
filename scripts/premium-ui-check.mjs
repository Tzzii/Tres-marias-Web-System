/** Local UI regression checks. All API traffic and sessions use isolated fixtures. No database writes. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildBusinessSeed } from '../apps/api/src/seedData/seed.js';
import { TERMS_VERSION } from '../packages/shared/src/legal/terms.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const output = process.env.UI_OUTPUT_DIR || path.join(os.tmpdir(), 'tres-marias-premium-review');
const clientUrl = process.env.UI_CLIENT_URL || 'http://localhost:5173';
const adminUrl = process.env.UI_ADMIN_URL || 'http://localhost:5174';
await fs.mkdir(output, { recursive: true });
const seed = buildBusinessSeed();
const packages = seed.packages.map((p) => ({ ...p, visible: true, archived: false }));
const pkg = packages.find((p) => p.id === 'pkg-1');
const user = {
  id: 'premium-fixture',
  name: 'Local Preview Customer',
  email: 'preview@example.test',
  mobile: '09171234567',
  company: '',
  termsVersion: TERMS_VERSION
};
const admin = { ...user, id: 'premium-admin-fixture', role: 'Administrator' };
const quote = {
  packageTotal: pkg.price,
  extraGuests: 0,
  extraGuestsCharge: 0,
  food: 0,
  plates: 0,
  pricePerPlate: seed.settings.pricePerPlate,
  addonPrices: {},
  addonTotals: {},
  addons: 0,
  otherCharges: 0,
  discount: 0,
  net: pkg.price,
  rentalItems: [],
  rental: 0,
  deliveryFee: 0,
  damage: 0,
  sentAt: Date.now()
};
const base = {
  ref: 'RES-PREMIUM-01',
  customerId: user.id,
  customerName: user.name,
  customerEmail: user.email,
  customerMobile: user.mobile,
  customer: { ...user, pastEvents: 1 },
  eventName: 'Santos Family Celebration',
  occasion: 'Birthday',
  date: '2026-12-20',
  startTime: '22:00',
  endTime: '02:00',
  guests: 60,
  serviceType: 'Catering only',
  status: 'confirmed',
  packageId: pkg.id,
  packageName: pkg.name,
  package: pkg,
  items: pkg.items,
  menu: {},
  foodNotes: '',
  styling: {},
  venue: { name: 'Local Events Hall', address: 'Sample street', city: 'Malvar', accessNotes: '' },
  addonIds: [],
  addonQty: {},
  addons: [],
  payments: [],
  refunds: [],
  rentalItems: [],
  activity: [{ at: Date.now(), actor: 'Administrator', text: 'Quotation accepted by the customer.' }],
  createdAt: Date.now(),
  total: pkg.price,
  paid: pkg.price,
  balance: 0,
  downpayment: 3000,
  downpaymentPaid: true,
  refunded: 0,
  quotation: quote,
  estimate: quote,
  minDownpayment: 3000,
  balanceState: 'full',
  notes: '',
  preparingAt: null
};
const reservations = [
  base,
  ...Array.from({ length: 14 }, (_, i) => ({
    ...base,
    ref: `RES-PREMIUM-${String(i + 2).padStart(2, '0')}`,
    eventName: `Preview Event ${i + 2}`,
    status: 'pending',
    quotation: null,
    paid: 0,
    balance: pkg.price,
    downpaymentPaid: false,
    balanceState: 'unpaid'
  }))
];
const payment = {
  id: 'preview-payment',
  ref: base.ref,
  customerName: user.name,
  eventName: base.eventName,
  amount: 3000,
  status: 'awaiting',
  referenceNo: 'PREMIUM-RECEIPT',
  methodLabel: 'Bank transfer',
  method: 'bank',
  submittedAt: Date.now()
};
const inventory = seed.inventory.items.map((i) => ({
  ...i,
  available: i.total,
  inUse: 0,
  out: [],
  stock: 'ok',
  photoVersion: null
}));
const results = [],
  errors = [],
  writes = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function fixture(side) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await context.addInitScript(
    ({ side, user, admin }) => {
      if (side !== 'guest')
        sessionStorage.setItem(
          `tm.${side}.session`,
          JSON.stringify({
            token: 'isolated-preview-fixture',
            user: side === 'admin' ? admin : user,
            lastActivity: Date.now()
          })
        );
      if (!localStorage.getItem('tm.colorMode')) localStorage.setItem('tm.colorMode', 'light');
    },
    { side, user, admin }
  );
  await context.route('**/api/**', async (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': '*'
        }
      });
    if (route.request().method() !== 'GET') {
      writes.push(route.request().method() + ' ' + route.request().url());
      return route.abort();
    }
    const endpoint = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    let body = [];
    if (endpoint === '/me') body = user;
    else if (endpoint === '/admin/me') body = admin;
    else if (endpoint === '/catalog')
      body = { packages, addons: seed.addons, dishes: seed.dishes, ...seed.settings, rentals: [] };
    else if (endpoint === '/packages') body = packages;
    else if (endpoint.startsWith('/packages/by-slug/'))
      body = packages.find((p) => p.slug === endpoint.split('/').pop()) || pkg;
    else if (endpoint === '/catalog/pricing') body = seed.settings;
    else if (endpoint === '/catalog/price-per-plate') body = { pricePerPlate: seed.settings.pricePerPlate };
    else if (endpoint === '/catalog/min-downpayment') body = { minDownpayment: seed.settings.minDownpayment };
    else if (endpoint === '/addons') body = seed.addons;
    else if (endpoint === '/dishes') body = seed.dishes;
    else if (endpoint === '/calendar') body = { capacity: 5, blocked: [], booked: {}, events: [] };
    else if (endpoint === '/admin/reports/dashboard')
      body = {
        eventsToday: [],
        pending: reservations.slice(1),
        pendingOldestDays: 0,
        awaitingAcceptance: 0,
        unverifiedPayments: 1,
        revenueThisMonth: 0,
        upcoming: [base]
      };
    else if (endpoint.endsWith('/reservations')) body = reservations;
    else if (endpoint.includes('/reservations/RES-PREMIUM-'))
      body = reservations.find((r) => r.ref === endpoint.split('/').pop()) || base;
    else if (endpoint.endsWith('/payments')) body = [payment];
    else if (endpoint === '/admin/customers') body = [{ ...user, completedCount: 1, upcomingCount: 1, balance: 0 }];
    else if (endpoint === '/admin/inventory') body = inventory;
    else if (endpoint === '/admin/feedback' || endpoint === '/feedback')
      body = [
        {
          id: 'review-preview',
          ref: base.ref,
          customerId: user.id,
          customerName: user.name,
          customerEmail: user.email,
          customerMobile: user.mobile,
          eventName: base.eventName,
          eventDate: base.date,
          packageName: pkg.name,
          rating: 5,
          categories: {},
          body: 'A warm and beautiful celebration with our family.',
          status: 'published',
          featured: false,
          flagged: false,
          archived: false,
          readByAdmin: true,
          createdAt: Date.now(),
          reply: null
        }
      ];
    else if (endpoint === '/changes') body = { version: 1 };
    else if (endpoint === '/appearance') body = {};
    await route.fulfill({ json: body, headers: { 'access-control-allow-origin': '*' } });
  });
  await context.routeWebSocket('**', (socket) => socket.close());
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(45000);
  page.on('pageerror', (error) => errors.push(error.message));
  return { page, context };
}

async function check(name, run) {
  try {
    await run();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
    console.log(`FAIL ${name}: ${error.message}`);
    for (const context of browser.contexts())
      for (const page of context.pages()) {
        console.log('PAGE', page.url(), (await page.locator('body').innerText()).slice(0, 700));
        await page.screenshot({
          path: path.join(
            output,
            `failure-${name.replace(/[^a-z0-9]/gi, '-').slice(0, 60)}-${page.url().includes('4174') ? 'admin' : 'client'}.png`
          )
        });
      }
    console.log('RUNTIME ERRORS', errors);
  }
}
async function noOverflow(page) {
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    'Page must not scroll horizontally'
  );
}

try {
  const { page: guest } = await fixture('guest');
  await guest.goto(clientUrl, { waitUntil: 'domcontentloaded' });
  const comparisonOptions = guest.getByRole('group', { name: 'Packages to compare' });
  await comparisonOptions.getByRole('button', { name: 'Petite', exact: true }).waitFor();
  await check('Package comparison: inclusions, maximum 3 and clear', async () => {
    for (const name of ['Petite', 'Classic', 'Classic Full Service'])
      await comparisonOptions.getByRole('button', { name, exact: true }).click();
    assert.equal(await comparisonOptions.getByRole('button', { name: 'Grand', exact: true }).isDisabled(), true);
    assert.match(await guest.getByRole('table', { name: 'Package comparison' }).innerText(), /Setup price/);
    await guest.getByRole('button', { name: 'Clear', exact: true }).click();
    assert.equal(await guest.getByRole('table', { name: 'Package comparison' }).count(), 0);
  });
  await guest.screenshot({ path: path.join(output, 'public-desktop.png'), fullPage: false });
  const { page: customer } = await fixture('client');
  await customer.goto(`${clientUrl}/portal`, { waitUntil: 'domcontentloaded' });
  await check('Customer event overview and next action', async () => {
    await customer.getByRole('heading', { name: 'Your event at a glance' }).waitFor();
    await customer.getByRole('button', { name: 'View your event', exact: true }).waitFor();
    await noOverflow(customer);
  });
  await customer.screenshot({ path: path.join(output, 'customer-desktop.png') });
  await customer.goto(`${clientUrl}/portal/reservations/${base.ref}`, { waitUntil: 'domcontentloaded' });
  await check('Reservation details keep milestones without calendar export', async () => {
    await customer.getByRole('heading', { name: 'Your event at a glance', exact: true }).waitFor();
    assert.equal(await customer.getByRole('button', { name: 'Add to calendar', exact: true }).count(), 0);
  });
  await check('Customer search is scoped and finds receipt references', async () => {
    await customer.getByPlaceholder('Search your events or payments').fill('PREMIUM-RECEIPT');
    await customer.getByPlaceholder('Search your events or payments').press('Enter');
    const dialog = customer.getByRole('dialog', { name: 'Search your workspace' });
    await dialog.waitFor();
    await dialog.getByRole('heading', { name: 'Payments', exact: true }).waitFor();
    assert.equal(await dialog.getByRole('heading', { name: 'Customers', exact: true }).count(), 0);
    await customer.getByRole('button', { name: 'Close search' }).click();
  });
  await customer.goto(`${clientUrl}/portal/reservations/RES-PREMIUM-02`, { waitUntil: 'domcontentloaded' });
  await check('Unsaved dialog changes can be kept or deliberately discarded', async () => {
    await customer.getByRole('button', { name: 'Request a change', exact: true }).click();
    await customer.getByLabel('Your request', { exact: true }).fill('Please update our venue details.');
    await customer
      .getByRole('dialog', { name: 'Request a Change', exact: true })
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await customer.getByRole('dialog', { name: 'Discard your changes?', exact: true }).waitFor();
    await customer.getByRole('button', { name: 'Keep editing', exact: true }).click();
    assert.equal(
      await customer.getByLabel('Your request', { exact: true }).inputValue(),
      'Please update our venue details.'
    );
    await customer
      .getByRole('dialog', { name: 'Request a Change', exact: true })
      .getByRole('button', { name: 'Close', exact: true })
      .click();
    await customer.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await customer.getByRole('dialog', { name: 'Request a Change', exact: true }).waitFor({ state: 'hidden' });
    await customer.getByRole('button', { name: 'Request a change', exact: true }).click();
    assert.equal(await customer.getByLabel('Your request', { exact: true }).inputValue(), '');
    await customer
      .getByRole('dialog', { name: 'Request a Change', exact: true })
      .getByRole('button', { name: 'Close', exact: true })
      .click();
  });
  const { page: staff } = await fixture('admin');
  await staff.goto(`${adminUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
  await check('Admin attention queue and financial definitions render', async () => {
    await staff.getByRole('heading', { name: /^Needs attention/ }).waitFor();
    await staff.getByText('Net collections · month to date', { exact: true }).waitFor();
    await noOverflow(staff);
  });
  await staff.screenshot({ path: path.join(output, 'admin-desktop.png') });
  await staff.goto(`${adminUrl}/reservations?tab=all`, { waitUntil: 'domcontentloaded' });
  await check('Reservation sorting applies before pagination', async () => {
    await staff.getByRole('button', { name: 'REF', exact: true }).click();
    await staff.getByRole('button', { name: 'REF', exact: true }).click();
    assert.match(staff.url(), /sort=ref/);
    assert.match(staff.url(), /direction=desc/);
    assert.match(await staff.getByRole('table').locator('tbody tr').first().innerText(), /RES-PREMIUM-15/);
  });
  await check('Reservation table uses fixed columns without layout controls or saved presets', async () => {
    for (const name of [
      'Columns',
      'Comfortable',
      'Compact',
      'Save this view',
      'All reservations',
      'Needs quotation',
      'Awaiting payment',
      'Next 7 days'
    ]) {
      assert.equal(await staff.getByRole('button', { name, exact: true }).count(), 0);
    }
    await staff.getByRole('columnheader', { name: 'Package', exact: true }).waitFor();
    await staff.goto(adminUrl + '/reservations?tab=all&view=quote', { waitUntil: 'domcontentloaded' });
    await staff.getByRole('table').locator('tbody tr').first().waitFor();
    assert.match(await staff.getByRole('table').locator('tbody').innerText(), /Confirmed/);
  });
  await staff.screenshot({ path: path.join(output, 'admin-reservations.png') });
  await staff.goto(`${adminUrl}/reservations/${base.ref}`, { waitUntil: 'domcontentloaded' });
  await check('Admin event readiness and searchable audit history', async () => {
    await staff.getByRole('heading', { name: 'Event readiness', exact: true }).waitFor();
    await staff.getByLabel('Search activity or person').fill('administrator');
    await staff.getByText('Quotation accepted by the customer.', { exact: true }).waitFor();
    await staff.getByLabel('Search activity or person').fill('does-not-exist');
    await staff.getByText('No matching activity. Try a different word or name.', { exact: true }).waitFor();
  });
  await check('Global admin search finds customers across record types', async () => {
    await staff.getByPlaceholder('Search events, customers or payments').fill('Local Preview');
    await staff.getByPlaceholder('Search events, customers or payments').press('Enter');
    await staff
      .getByRole('dialog', { name: 'Search your workspace' })
      .getByRole('heading', { name: 'Customers', exact: true })
      .waitFor();
    await staff.getByRole('button', { name: 'Close search' }).click();
  });
  for (const [name, page, url] of [
    ['public', guest, clientUrl],
    ['customer', customer, `${clientUrl}/portal`],
    ['admin', staff, `${adminUrl}/dashboard`]
  ]) {
    for (const width of [320, 390, 768, 1366])
      await check(`${name} layout ${width}px`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.locator('h1').waitFor();
        await noOverflow(page);
      });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, `${name}-mobile.png`) });
  }
  for (const [side, page, root, dashboard, settings, scenes] of [
    [
      'customer',
      customer,
      clientUrl,
      '/portal',
      '/portal/settings?tab=appearance',
      [
        ['booking', '/portal/book'],
        ['packages', '/portal/packages'],
        ['payments', '/portal/payments']
      ]
    ],
    [
      'admin',
      staff,
      adminUrl,
      '/dashboard',
      '/settings?tab=appearance',
      [
        ['reservations', '/reservations?tab=all'],
        ['inventory', '/inventory'],
        ['reviews', '/feedbacks']
      ]
    ]
  ]) {
    await page.goto(`${root}${settings}`, { waitUntil: 'domcontentloaded' });
    await check(`${side} theme previews select and remember the evening theme`, async () => {
      await page.getByRole('button', { name: 'Choose dark theme', exact: true }).click();
      assert.equal(
        await page.getByRole('button', { name: 'Choose dark theme', exact: true }).getAttribute('aria-pressed'),
        'true'
      );
      assert.equal(await page.evaluate(() => document.documentElement.dataset.tmMode), 'dark');
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: path.join(output, `${side}-theme-settings.png`) });
    for (const width of [320, 390, 768, 1440])
      await check(`${side} evening dashboard ${width}px`, async () => {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(`${root}${dashboard}`, { waitUntil: 'networkidle' });
        await page
          .getByRole('heading', {
            name: side === 'customer' ? 'Your event at a glance' : 'Business pulse',
            exact: true
          })
          .waitFor();
        await noOverflow(page);
        assert.equal(await page.evaluate(() => localStorage.getItem('tm.colorMode')), 'dark');
        const surfaces = await page
          .locator('.tm-dash-card')
          .evaluateAll((cards) => cards.map((card) => getComputedStyle(card).backgroundColor));
        assert.ok(
          surfaces.length > 0 && surfaces.every((color) => color !== 'rgb(255, 255, 255)'),
          'Dark work cards must not flash white'
        );
        if (width === 390 || width === 1440)
          await page.screenshot({
            path: path.join(output, `${side}-dark-${width === 390 ? 'mobile' : 'desktop'}.png`)
          });
      });
    for (const [scene, route] of scenes)
      for (const width of [390, 1440])
        await check(`${side} evening ${scene} ${width}px`, async () => {
          await page.setViewportSize({ width, height: 1000 });
          await page.goto(`${root}${route}`, { waitUntil: 'networkidle' });
          await page.locator('h1').waitFor();
          await noOverflow(page);
          if (width === 1440) await page.screenshot({ path: path.join(output, `${side}-dark-${scene}.png`) });
        });
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(`${root}${settings}`, { waitUntil: 'networkidle' });
    await check(`${side} appearance choices fit on small phones`, async () => {
      await noOverflow(page);
    });
  }
  await check('Switching back restores the light portal and keeps the preference', async () => {
    await customer.getByRole('button', { name: 'Choose light theme', exact: true }).click();
    await customer.goto(`${clientUrl}/portal`, { waitUntil: 'networkidle' });
    assert.equal(await customer.evaluate(() => document.documentElement.dataset.tmMode), 'light');
    assert.equal(
      await customer
        .locator('.tm-dash-card')
        .first()
        .evaluate((card) => getComputedStyle(card).backgroundColor),
      'rgb(255, 255, 255)'
    );
  });
} finally {
  await browser.close();
  await fs.writeFile(
    path.join(output, 'report.json'),
    JSON.stringify({ results, errors, interceptedWrites: writes }, null, 2)
  );
}
console.log(
  JSON.stringify(
    {
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed),
      errors,
      interceptedWrites: writes,
      output
    },
    null,
    2
  )
);
if (results.some((r) => !r.passed) || errors.length || writes.length) process.exitCode = 1;
