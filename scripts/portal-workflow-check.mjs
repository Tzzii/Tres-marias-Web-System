/** Portal workflow checks: floating chat, quotation drafts, and theme reveals. All API traffic uses isolated fixtures. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildBusinessSeed } from '../apps/api/src/seedData/seed.js';
import { TERMS_VERSION } from '../packages/shared/src/legal/terms.js';
import { computeQuote } from '../packages/shared/src/services/pricing.js';
import { quotationDraftKey } from '../apps/admin/src/lib/quotationDraft.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const adminUrl = process.env.UI_ADMIN_URL || 'http://localhost:5174';
const clientUrl = process.env.UI_CLIENT_URL || 'http://localhost:5173';
const output = process.env.UI_OUTPUT_DIR || path.join(os.tmpdir(), 'tres-marias-admin-chat');
await fs.mkdir(output, { recursive: true });
const seed = buildBusinessSeed();
const customer = {
  id: 'chat-customer',
  name: 'Chat Preview Customer',
  email: 'chat@example.test',
  mobile: '09171234567',
  termsVersion: TERMS_VERSION
};
const admin = { ...customer, id: 'chat-admin', name: 'Preview Admin', role: 'Administrator' };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const results = [];

async function fixture({
  side = 'admin',
  width = 1440,
  height = 1000,
  mode = 'light',
  failList = false,
  empty = false,
  reducedMotion = 'reduce',
  noViewTransitions = false
} = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion });
  const message = (id, body) => ({
    id,
    body,
    from: 'customer',
    senderName: customer.name,
    typed: true,
    at: Date.now(),
    readByAdmin: false,
    readByCustomer: true,
    history: []
  });
  const state = {
    reads: [],
    details: [],
    sends: [],
    failSend: false,
    failList,
    threads: empty
      ? []
      : [
          {
            id: 'thread-a',
            customerId: customer.id,
            customerName: customer.name,
            customerEmail: customer.email,
            unread: 2,
            messages: [message('message-a', 'Please change the table arrangement.')]
          },
          {
            id: 'thread-b',
            customerId: 'chat-other',
            customerName: 'Another Customer',
            customerEmail: 'other@example.test',
            unread: 103,
            messages: [message('message-b', 'Can we change the menu?')]
          }
        ]
  };
  const pkg = seed.packages.find((item) => item.kind !== 'rental');
  const addon = seed.addons[0];
  const estimate = computeQuote({
    pkg,
    serviceType: 'Catering only',
    guests: pkg.guests,
    startTime: '12:00',
    endTime: '18:00',
    sixHourFee: 5000,
    addonIds: [addon.id],
    addonPrices: { [addon.id]: 1000 }
  });
  const reservation = {
    ref: 'RES-CHAT-QUOTE',
    eventName: 'Quotation draft preview',
    occasion: 'Birthday',
    date: '2026-12-20',
    startTime: '12:00',
    endTime: '18:00',
    guests: pkg.guests,
    serviceType: 'Catering only',
    packageId: pkg.id,
    customerId: customer.id,
    customerName: customer.name,
    customerEmail: customer.email,
    customerMobile: customer.mobile,
    customer: { ...customer, pastEvents: 0 },
    package: pkg,
    packageName: pkg.name,
    items: pkg.items,
    addons: [addon],
    addonIds: [addon.id],
    addonQty: {},
    styling: {},
    menu: {},
    status: 'pending',
    quotation: null,
    estimate,
    pricePerPlate: seed.settings.pricePerPlate,
    minDownpayment: 3000,
    venue: { name: 'Preview Hall', address: 'Preview street', city: 'Malvar', accessNotes: '' },
    rentalItems: [],
    activity: [],
    payments: [],
    refunds: [],
    paid: 0,
    total: estimate.net,
    balance: estimate.net,
    downpayment: 3000,
    downpaymentPaid: false,
    preparingAt: null,
    notes: '',
    createdAt: Date.now(),
    pendingStep: 'quote'
  };
  state.reservations = [
    reservation,
    { ...structuredClone(reservation), ref: 'RES-OTHER-QUOTE', eventName: 'Another reservation' }
  ];
  state.failQuote = false;
  state.quotations = [];
  await context.addInitScript(
    ({ side, customer, admin, mode }) => {
      sessionStorage.setItem(
        `tm.${side}.session`,
        JSON.stringify({
          token: 'isolated-admin-chat-fixture',
          user: side === 'admin' ? admin : customer,
          lastActivity: Date.now()
        })
      );
      localStorage.setItem('tm.colorMode', mode);
    },
    { side, customer, admin, mode }
  );
  await context.addInitScript(
    ({ noViewTransitions }) => {
      if (noViewTransitions) document.startViewTransition = undefined;
      window.themeReveals = [];
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (frames, options) {
        const animation = animate.call(this, frames, options);
        if (options?.pseudoElement === '::view-transition-new(root)') {
          window.themeReveals.push({ frames, duration: options.duration, width: innerWidth, height: innerHeight });
          window.lastThemeReveal = animation;
          if (window.pauseThemeReveal) {
            animation.pause();
            animation.currentTime = options.duration / 2;
          }
        }
        return animation;
      };
    },
    { noViewTransitions }
  );
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname.replace(/^\/api/, '');
    const method = request.method();
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*'
    };
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const reply = (json, status = 200) => route.fulfill({ json, status, headers });
    const quoteMatch = endpoint.match(/^\/admin\/reservations\/([^/]+)\/quotation$/);
    if (quoteMatch && method === 'POST') {
      if (state.failQuote) return reply({ code: 'SERVER_ERROR', message: 'Quotation could not be sent.' }, 503);
      const r = state.reservations.find((item) => item.ref === quoteMatch[1]);
      const values = request.postDataJSON();
      state.quotations.push(values);
      r.quotation = {
        ...computeQuote({ pkg: r.package, ...r, ...values }),
        ...values,
        sentAt: Date.now(),
        sentBy: admin.name
      };
      r.total = r.quotation.net;
      r.balance = r.total;
      return reply(r);
    }
    const threadMatch = endpoint.match(/^\/(?:admin\/)?threads\/([^/]+)(?:\/(read|messages))?$/);
    if (threadMatch) {
      assert.equal(request.headers().authorization, 'Bearer isolated-admin-chat-fixture');
      const thread = state.threads.find((item) => item.id === threadMatch[1]);
      if (!thread) return reply({ code: 'NOT_FOUND', message: 'Conversation not found.' }, 404);
      if (method === 'POST' && threadMatch[2] === 'read') {
        state.reads.push(thread.id);
        thread.unread = 0;
        return reply({ ok: true });
      }
      if (method === 'POST' && threadMatch[2] === 'messages') {
        if (state.failSend)
          return reply({ code: 'SERVER_ERROR', message: 'Could not send this message. Try again.' }, 503);
        const sent = {
          ...message(`sent-${state.sends.length}`, request.postDataJSON().body),
          from: side === 'admin' ? 'admin' : 'customer',
          senderName: admin.name
        };
        state.sends.push({ threadId: thread.id, body: sent.body });
        thread.messages.push(sent);
        return reply(sent, 201);
      }
      if (method === 'GET') {
        state.details.push(thread.id);
        return reply({ ...thread, unread: side === 'client' ? 0 : thread.unread });
      }
    }
    if (method !== 'GET') throw new Error(`Unexpected fixture write: ${method} ${endpoint}`);
    let body = [];
    if (endpoint === '/admin/me') body = admin;
    else if (endpoint === '/me') body = customer;
    else if (endpoint === '/admin/threads' || endpoint === '/threads') {
      if (state.failList)
        return reply({ code: 'SERVER_ERROR', message: 'Conversations are temporarily unavailable.' }, 503);
      body = state.threads.map(({ messages, ...thread }) => ({
        ...thread,
        unread: side === 'client' ? 0 : thread.unread,
        lastMessage: messages.at(-1)
      }));
    } else if (endpoint === '/catalog')
      body = { ...seed.settings, packages: seed.packages, dishes: seed.dishes, addons: seed.addons, rentals: [] };
    else if (endpoint === '/catalog/pricing') body = seed.settings;
    else if (endpoint === '/packages') body = seed.packages;
    else if (endpoint === '/addons') body = seed.addons;
    else if (endpoint === '/dishes') body = seed.dishes;
    else if (endpoint === '/admin/inventory') body = seed.inventory.items;
    else if (endpoint === '/admin/reservations' || endpoint === '/reservations') body = state.reservations;
    else if (endpoint.startsWith('/admin/reservations/'))
      body = state.reservations.find((item) => item.ref === endpoint.split('/').at(-1));
    else if (endpoint === '/calendar') body = { capacity: 5, blocked: [], booked: {}, events: [] };
    else if (endpoint === '/admin/reports/dashboard')
      body = {
        eventsToday: [],
        pending: [],
        upcoming: [],
        pendingOldestDays: 0,
        awaitingAcceptance: 0,
        unverifiedPayments: 0,
        revenueThisMonth: 0
      };
    else if (endpoint === '/changes') body = { version: 1 };
    else if (endpoint === '/appearance') body = {};
    return reply(body);
  });
  await context.routeWebSocket('**', (socket) => socket.close());
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.setDefaultTimeout(15000);
  await page.goto(`${side === 'admin' ? adminUrl : clientUrl}${side === 'admin' ? '/packages' : '/portal'}`);
  const panel = page.locator(`#${side === 'admin' ? 'admin' : 'customer'}-floating-chat`);
  const launcher = () =>
    page.locator(`button[aria-controls="${side === 'admin' ? 'admin' : 'customer'}-floating-chat"]`);
  return { page, context, state, panel, launcher };
}

async function check(name, run) {
  await run();
  results.push(name);
  console.log(`PASS ${name}`);
}

try {
  const { page, context, state, panel, launcher } = await fixture();
  await check('Admin launcher shows the exact unread count without reading conversations', async () => {
    await page.getByRole('button', { name: 'Open chat, 105 unread messages', exact: true }).waitFor();
    assert.equal(await launcher().locator('.MuiBadge-badge').innerText(), '105');
    assert.deepEqual(state.reads, []);
    assert.deepEqual(state.details, []);
  });
  await check('Open a customer conversation and reply without leaving Packages', async () => {
    await launcher().click();
    await panel.getByRole('button').filter({ hasText: customer.name }).click();
    await panel.getByRole('log').getByText('Please change the table arrangement.').waitFor();
    const composer = panel.getByRole('textbox', { name: 'Write a message' });
    await composer.fill('We can update the table arrangement.');
    await panel.getByRole('button', { name: 'Send', exact: true }).click();
    await panel.getByRole('log').getByText('We can update the table arrangement.').waitFor();
    assert.deepEqual(state.sends.at(-1), { threadId: 'thread-a', body: 'We can update the table arrangement.' });
    assert.equal(new URL(page.url()).pathname, '/packages');
    assert.ok(state.reads.every((id) => id === 'thread-a'));
  });
  await check('A failed send keeps the draft and can be retried', async () => {
    state.failSend = true;
    await panel.getByRole('textbox', { name: 'Write a message' }).fill('Please confirm your preferred colors.');
    await panel.getByRole('button', { name: 'Send', exact: true }).click();
    await panel.getByText('Could not send this message. Try again.').waitFor();
    assert.equal(
      await panel.getByRole('textbox', { name: 'Write a message' }).inputValue(),
      'Please confirm your preferred colors.'
    );
    state.failSend = false;
    await panel.getByRole('button', { name: 'Send', exact: true }).click();
    await panel.getByRole('log').getByText('Please confirm your preferred colors.').waitFor();
  });
  await check('Navigation and minimizing preserve the selected conversation and draft', async () => {
    await panel.getByRole('textbox', { name: 'Write a message' }).fill('Unsent draft stays here');
    await page
      .locator('nav[aria-label="Main"] .tm-sidebar-link')
      .filter({ hasText: /Inventory$/ })
      .click();
    await page.waitForURL('**/inventory');
    assert.equal(await panel.getByRole('textbox', { name: 'Write a message' }).inputValue(), 'Unsent draft stays here');
    await panel.getByRole('button', { name: 'Minimize chat' }).click();
    await panel.waitFor({ state: 'hidden' });
    const readCount = state.reads.length;
    const detailCount = state.details.length;
    state.threads[0].unread = 1;
    state.threads[0].messages.push({
      id: 'incoming-hidden',
      body: 'Please add two tables.',
      from: 'customer',
      senderName: customer.name,
      typed: true,
      at: Date.now(),
      history: []
    });
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.getByRole('button', { name: 'Open chat, 104 unread messages', exact: true }).waitFor();
    assert.equal(state.reads.length, readCount, 'minimized chats never mark new messages read');
    assert.equal(state.details.length, detailCount, 'minimized chats stop loading message histories');
    await launcher().click();
    await panel.getByRole('log').getByText('Please add two tables.').waitFor();
    assert.equal(await panel.getByRole('textbox', { name: 'Write a message' }).inputValue(), 'Unsent draft stays here');
  });
  await check('Switch customers and expand the same conversation into Messages', async () => {
    await panel.getByRole('button', { name: 'Back to threads' }).click();
    await panel.getByRole('button').filter({ hasText: 'Another Customer' }).click();
    await panel.getByRole('log').getByText('Can we change the menu?').waitFor();
    assert.equal(await panel.getByRole('textbox', { name: 'Write a message' }).inputValue(), '');
    await panel.getByRole('link', { name: 'Open full chat' }).click();
    await page.waitForURL('**/messages?thread=thread-b');
    await panel.waitFor({ state: 'hidden' });
    assert.equal(await launcher().isVisible(), false);
    await page.getByRole('textbox', { name: 'Write a message' }).fill('The menu change is noted.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('log').getByText('The menu change is noted.').waitFor();
    assert.equal(state.sends.at(-1).threadId, 'thread-b');
  });
  await context.close();

  for (const scenario of [
    { width: 390, height: 844, mode: 'light' },
    { width: 320, height: 568, mode: 'dark' }
  ]) {
    const current = await fixture(scenario);
    await check(`Chat fits ${scenario.width}px ${scenario.mode} screens and closes with Escape`, async () => {
      await current.launcher().click();
      await current.panel.getByRole('button').filter({ hasText: customer.name }).click();
      const composer = current.panel.getByRole('textbox', { name: 'Write a message' });
      await composer.fill('Mobile reply');
      const box = await current.panel.boundingBox();
      const input = await composer.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= scenario.width);
      assert.ok(box.y >= 0 && box.y + box.height <= scenario.height - 50);
      assert.ok(input.y + input.height <= box.y + box.height);
      assert.equal(await current.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await current.panel.screenshot({ path: path.join(output, `admin-chat-${scenario.width}-${scenario.mode}.png`) });
      await current.panel.press('Escape');
      await current.panel.waitFor({ state: 'hidden' });
      await current.page.waitForFunction(
        () => document.activeElement?.getAttribute('aria-controls') === 'admin-floating-chat'
      );
    });
    await current.context.close();
  }
  const retry = await fixture({ failList: true });
  await check('Conversation list failures offer a working retry', async () => {
    await retry.launcher().click();
    await retry.panel.getByText('Conversations are temporarily unavailable.').waitFor();
    retry.state.failList = false;
    await retry.panel.getByRole('button', { name: 'Try again' }).click();
    await retry.panel.getByRole('button').filter({ hasText: customer.name }).waitFor();
  });
  await retry.context.close();
  const empty = await fixture({ empty: true });
  await check('An empty inbox has a clear empty state', async () => {
    await empty.launcher().click();
    await empty.panel.getByText('No conversations yet.').waitFor();
  });
  await empty.context.close();
  const client = await fixture({ side: 'client' });
  await check('The existing customer floating chat still sends replies', async () => {
    await client.launcher().click();
    await client.panel.getByRole('textbox', { name: 'Write a message' }).fill('Customer chat still works.');
    await client.panel.getByRole('button', { name: 'Send', exact: true }).click();
    await client.panel.getByRole('log').getByText('Customer chat still works.').waitFor();
    assert.equal(client.state.sends.at(-1).threadId, 'thread-a');
  });
  await client.context.close();
  const quote = await fixture();
  await quote.page.goto(`${adminUrl}/reservations/RES-CHAT-QUOTE`);
  const card = quote.page.locator('#quotation-card');
  const addonField = card.locator('input[id^="q-addon-"]');
  const amounts = () => card.locator('input[id^="q-other-"]:not([id^="q-other-label-"])');
  const labels = () => card.locator('input[id^="q-other-label-"]');
  const draftKey = quotationDraftKey(admin.id, 'RES-CHAT-QUOTE');
  await check('Quotation edits survive Messages navigation and a page refresh', async () => {
    await card.locator('#q-six-hour-fee').fill('15000');
    await addonField.fill('3000');
    await amounts().first().fill('1900');
    await labels().first().fill('Extra setup');
    await card.getByRole('button', { name: 'Add other charge', exact: true }).click();
    await amounts().nth(1).fill('2500');
    await labels().nth(1).fill('Extra linens');
    await card.locator('#q-discount').fill('500');
    await card.locator('#q-note').fill('Keep these edits while I answer the customer.');
    await card.getByRole('status').waitFor();
    await quote.page
      .getByRole('navigation', { name: 'Main', exact: true })
      .getByRole('button', { name: /Messages/ })
      .click();
    await quote.page.waitForURL('**/messages**');
    await quote.page.goBack();
    await card.locator('#q-note').waitFor();
    assert.equal(await card.locator('#q-six-hour-fee').inputValue(), '15000');
    assert.equal(await addonField.inputValue(), '3000');
    assert.equal(await amounts().nth(1).inputValue(), '2500');
    assert.equal(await labels().nth(1).inputValue(), 'Extra linens');
    await quote.page.reload();
    await card.locator('#q-note').waitFor();
    assert.equal(await card.locator('#q-discount').inputValue(), '500');
    assert.equal(await card.locator('#q-note').inputValue(), 'Keep these edits while I answer the customer.');
    await card.getByRole('button', { name: 'Add other charge', exact: true }).click();
    const ids = await amounts().evaluateAll((nodes) => nodes.map((node) => node.id));
    assert.equal(new Set(ids).size, ids.length, 'restored rows do not collide with newly added charge rows');
    await card.getByRole('button', { name: 'Remove other charge 3', exact: true }).click();
    await quote.launcher().click();
    await quote.panel.getByRole('button').filter({ hasText: customer.name }).click();
    await quote.panel.getByRole('textbox', { name: 'Write a message' }).fill('Your requested changes are noted.');
    await quote.panel.getByRole('button', { name: 'Send', exact: true }).click();
    await quote.panel.getByRole('log').getByText('Your requested changes are noted.').waitFor();
    assert.equal(await card.locator('#q-note').inputValue(), 'Keep these edits while I answer the customer.');
    await quote.panel.getByRole('button', { name: 'Minimize chat' }).click();
  });
  await check('Drafts stay with their reservation, survive a failed send, and clear after success', async () => {
    await quote.page.goto(`${adminUrl}/reservations/RES-OTHER-QUOTE`);
    await card.locator('#q-note').waitFor();
    assert.equal(await card.locator('#q-note').inputValue(), '');
    assert.equal(await card.locator('#q-six-hour-fee').inputValue(), '5000');
    await quote.page.goto(`${adminUrl}/reservations/RES-CHAT-QUOTE`);
    await card.locator('#q-note').waitFor();
    quote.state.failQuote = true;
    await card.getByRole('button', { name: 'Save and send quotation', exact: true }).click();
    await quote.page.getByText('Quotation could not be sent.', { exact: true }).waitFor();
    assert.ok(await quote.page.evaluate((key) => sessionStorage.getItem(key), draftKey));
    assert.equal(await card.locator('#q-six-hour-fee').inputValue(), '15000');
    quote.state.failQuote = false;
    await card.getByRole('button', { name: 'Save and send quotation', exact: true }).click();
    await card.getByRole('button', { name: 'Save and re-send quotation', exact: true }).waitFor();
    await quote.page.waitForFunction((key) => sessionStorage.getItem(key) === null, draftKey);
    assert.equal(quote.state.quotations.at(-1).sixHourFee, 15000);
    assert.equal(quote.state.quotations.at(-1).note, 'Keep these edits while I answer the customer.');
  });
  await quote.context.close();

  for (const side of ['admin', 'client']) {
    const wave = await fixture({
      side,
      width: side === 'admin' ? 1440 : 390,
      height: 900,
      reducedMotion: 'no-preference'
    });
    await check(`${side} Appearance reveals dark and light themes with a screen-covering circular wave`, async () => {
      await wave.page.goto(
        `${side === 'admin' ? adminUrl : clientUrl}${side === 'admin' ? '' : '/portal'}/settings?tab=appearance`
      );
      await wave.page.evaluate(() => {
        window.pauseThemeReveal = true;
      });
      const choice = wave.page.getByRole('button', { name: 'Choose dark theme', exact: true });
      await choice.scrollIntoViewIfNeeded();
      const origin = await choice.boundingBox();
      await choice.click();
      await wave.page.waitForFunction(
        () => document.documentElement.dataset.tmMode === 'dark' && window.themeReveals.length === 1
      );
      const reveal = await wave.page.evaluate(() => window.themeReveals[0]);
      const x = origin.x + origin.width / 2,
        y = origin.y + origin.height / 2;
      assert.equal(reveal.frames.clipPath[0], `circle(0px at ${x}px ${y}px)`);
      const radius = Number(reveal.frames.clipPath[1].match(/circle\(([\d.]+)px/)[1]);
      assert.ok(radius >= Math.hypot(Math.max(x, reveal.width - x), Math.max(y, reveal.height - y)));
      await wave.page.screenshot({ path: path.join(output, `${side}-theme-wave.png`) });
      await wave.page.evaluate(async () => {
        window.pauseThemeReveal = false;
        window.lastThemeReveal.play();
        await window.lastThemeReveal.finished;
      });
      await wave.page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
      await wave.page.waitForFunction(
        () => document.documentElement.dataset.tmMode === 'light' && window.themeReveals.length === 2
      );
      await wave.page.evaluate(async () => window.lastThemeReveal.finished);
      assert.equal(await wave.page.evaluate(() => localStorage.getItem('tm.colorMode')), 'light');
    });
    await wave.context.close();
    for (const fallback of [{ reducedMotion: 'reduce' }, { reducedMotion: 'no-preference', noViewTransitions: true }]) {
      const simple = await fixture({ side, ...fallback });
      await check(
        `${side} theme switching works with ${fallback.noViewTransitions ? 'no View Transitions API' : 'reduced motion'}`,
        async () => {
          await simple.page.goto(
            `${side === 'admin' ? adminUrl : clientUrl}${side === 'admin' ? '' : '/portal'}/settings?tab=appearance`
          );
          await simple.page.getByRole('button', { name: 'Choose dark theme', exact: true }).click();
          await simple.page.waitForFunction(() => document.documentElement.dataset.tmMode === 'dark');
          assert.equal(await simple.page.evaluate(() => window.themeReveals.length), 0);
        }
      );
      await simple.context.close();
    }
  }
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log(JSON.stringify({ passed: results.length, errors, output }, null, 2));
} finally {
  await browser.close();
}
