// Run against local Vite servers. All API calls use isolated fixtures; no database writes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { TERMS_VERSION } from '../packages/shared/src/legal/terms.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const output = process.env.UI_OUTPUT_DIR || path.join(os.tmpdir(), 'tres-marias-search-review');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const results = [];

async function fixture(side, mobile = false) {
  const admin = side === 'admin';
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    isMobile: mobile,
    hasTouch: mobile
  });
  const user = {
    id: `search-${side}`,
    name: 'Maria Santos',
    email: 'search@example.test',
    mobile: '09171234567',
    role: admin ? 'Administrator' : undefined,
    termsVersion: TERMS_VERSION,
    company: ''
  };
  await context.addInitScript(
    ({ side, user }) => {
      sessionStorage.setItem(
        `tm.${side}.session`,
        JSON.stringify({ token: 'search-fixture', user, lastActivity: Date.now() })
      );
      localStorage.setItem('tm.colorMode', 'dark');
    },
    { side, user }
  );
  const calls = new Map();
  let stamp = 1;
  let fail = false;
  let title = 'Santos Celebration';
  const count = admin ? 10000 : 30;
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*'
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    assert.equal(request.method(), 'GET', 'search must not write');
    const endpoint = new URL(request.url()).pathname.replace(/^\/api/, '');
    calls.set(endpoint, (calls.get(endpoint) || 0) + 1);
    if (fail && endpoint === (admin ? '/admin/payments' : '/payments')) {
      fail = false;
      return route.fulfill({ status: 503, headers, json: { code: 'SERVER_ERROR', message: 'Search fixture retry' } });
    }
    let body = [];
    if (endpoint === '/me' || endpoint === '/admin/me') body = user;
    else if (endpoint === '/changes') body = { stamp };
    else if (endpoint === '/appearance') body = {};
    else if (endpoint === '/calendar') body = { capacity: 5, blocked: [], booked: {}, events: [] };
    else if (endpoint.endsWith('/reservations'))
      body = Array.from({ length: count }, (_, i) => ({
        ref: `RES-SEARCH-${i}`,
        eventName: `${title} ${i}`,
        customerName: user.name,
        customerId: user.id,
        date: '2026-12-20',
        status: 'confirmed',
        balance: 0,
        total: 3000,
        guests: 60,
        createdAt: Date.now(),
        activity: [],
        venue: { city: 'Malvar' }
      }));
    else if (endpoint.endsWith('/payments'))
      body = [
        {
          id: 'search-payment',
          ref: 'RES-SEARCH-0',
          customerName: user.name,
          eventName: 'Santos Celebration',
          receiptNo: 'RECEIPT-ONLY-42',
          amount: 3000,
          status: 'verified',
          method: 'bank',
          methodLabel: 'Bank transfer'
        }
      ];
    else if (endpoint === '/admin/customers') body = [user];
    else if (endpoint === '/admin/inventory')
      body = [{ id: 'chair', name: 'Santos Chair', category: 'Seating', available: 100 }];
    else if (endpoint === '/packages')
      body = [{ slug: 'santos', name: 'Santos Package', description: 'Celebration buffet' }];
    else if (endpoint === '/catalog/price-per-plate') body = { pricePerPlate: 500 };
    else if (endpoint === '/catalog/min-downpayment') body = { minDownpayment: 3000 };
    await route.fulfill({ json: body, headers });
  });
  await context.routeWebSocket('**', (socket) => socket.close());
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => errors.push(error.message));
  const url = admin
    ? process.env.UI_ADMIN_URL || 'http://localhost:5174'
    : process.env.UI_CLIENT_URL || 'http://localhost:5173';
  await page.goto(`${url}${admin ? '' : '/portal'}/settings?tab=account`, { waitUntil: 'networkidle' });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const dialog = page.getByRole('dialog', { name: 'Search your workspace' });
  const input = dialog.getByRole('textbox');
  const packageCalls = () => calls.get('/packages') || 0;
  async function open(query = 'santos') {
    if (mobile) await page.getByRole('button', { name: 'Search', exact: true }).click();
    const header = page
      .getByPlaceholder(admin ? 'Search events, customers or payments' : 'Search your events or payments')
      .filter({ visible: true });
    await header.fill(query);
    await header.press('Enter');
    await dialog.waitFor();
  }
  async function change() {
    stamp += 1;
    const before = calls.get('/changes') || 0;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    for (let i = 0; i < 100 && (calls.get('/changes') || 0) === before; i++)
      await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok((calls.get('/changes') || 0) > before, 'change poller saw the new stamp');
    await page.waitForTimeout(300);
  }
  return {
    page,
    context,
    dialog,
    input,
    calls,
    count,
    open,
    change,
    packageCalls,
    rename: () => {
      title = 'Updated Celebration';
    },
    failNext: () => {
      fail = true;
    }
  };
}

try {
  for (const [side, mobile] of [
    ['admin', false],
    ['client', false],
    ['admin', true]
  ]) {
    const f = await fixture(side, mobile);
    const { page, dialog, input, calls, open, packageCalls } = f;
    const prefix = `${side}${mobile ? '-mobile' : '-desktop'}`;
    await open();
    await dialog.getByRole('heading', { name: 'Reservations', exact: true }).waitFor();
    await page.waitForFunction(() => document.activeElement?.matches('.MuiDialog-root input'));
    assert.equal(await input.evaluate((element) => element === document.activeElement), true);
    assert.equal(
      await page
        .locator('.MuiDialog-root .MuiBackdrop-root')
        .evaluate((element) => getComputedStyle(element).backdropFilter),
      'none'
    );
    assert.equal(await dialog.locator('a').count(), side === 'admin' ? 16 : 14);
    assert.match(
      await dialog.getByRole('status').innerText(),
      new RegExp(`${f.count + (side === 'admin' ? 4 : 2)} matching records`)
    );
    assert.equal(
      await dialog.getByRole('heading', { name: 'Customers', exact: true }).count(),
      side === 'admin' ? 1 : 0
    );
    const afterLoad = packageCalls();
    await input.fill('');
    await dialog.getByText('What are you looking for?', { exact: true }).waitFor();
    await input.evaluate((element) => {
      window.searchInputFrames = [];
      element.addEventListener('input', () => {
        const start = performance.now();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => window.searchInputFrames.push(performance.now() - start))
        );
      });
    });
    await input.pressSequentially('receipt-only-42', { delay: 25 });
    await dialog.getByRole('heading', { name: 'Payments', exact: true }).waitFor();
    assert.equal(await dialog.locator('a').count(), 1);
    assert.equal(packageCalls(), afterLoad, 'typing reuses the index');
    const frames = await page.evaluate(() => window.searchInputFrames);
    frames.sort((a, b) => a - b);
    const p95 = frames[Math.floor((frames.length - 1) * 0.95)];
    await page.screenshot({ path: path.join(output, `${prefix}.png`) });
    await input.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await open('receipt-only-42');
    await dialog.getByRole('heading', { name: 'Payments', exact: true }).waitFor();
    assert.equal(packageCalls(), afterLoad, 'reopening reuses loaded data');
    await dialog.getByRole('button', { name: 'Close search' }).click();
    f.rename();
    await f.change();
    assert.equal(packageCalls(), afterLoad, 'changes do not fetch search data while closed');
    await open('updated celebration');
    await dialog.getByRole('heading', { name: 'Reservations', exact: true }).waitFor();
    assert.equal(packageCalls(), afterLoad + 1, 'reopening after a change refreshes');
    await input.fill('does-not-exist');
    await dialog.getByText('No matching records', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Close search' }).click();
    await f.change();
    f.failNext();
    await open('receipt-only-42');
    await dialog.getByText('Search fixture retry', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Try again', exact: true }).click();
    await dialog.getByRole('heading', { name: 'Payments', exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (side === 'client') assert.ok([...calls.keys()].every((endpoint) => !endpoint.startsWith('/admin/')));
    results.push({
      name: prefix,
      records: f.count,
      cpuSlowdown: 4,
      inputToSecondFrameP95Ms: Math.round(p95),
      passed: true
    });
    console.log('PASS', JSON.stringify(results.at(-1)));
    await f.context.close();
  }
  assert.deepEqual(errors, [], 'no runtime errors');
} finally {
  for (const context of browser.contexts())
    for (const page of context.pages()) {
      console.log('Last page:', (await page.locator('body').innerText()).slice(-1600));
      console.log('Active element:', await page.evaluate(() => document.activeElement?.tagName));
      await page.screenshot({ path: path.join(output, 'last-page.png') });
    }
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  await browser.close();
  console.log(`Search review artifacts: ${output}`);
}
