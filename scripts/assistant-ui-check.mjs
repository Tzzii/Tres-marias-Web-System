/** Isolated browser fixtures: no real accounts, API model calls or reservation/database writes. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildBusinessSeed } from '../apps/api/src/seedData/seed.js';
import { TERMS_VERSION } from '../packages/shared/src/legal/terms.js';
import { ASSISTANT_QUESTIONS } from '../packages/shared/src/domain/assistant.js';
import { pcmWave } from '../apps/api/src/modules/assistant/assistant.audio.js';
import {
  bookingPlan,
  bookingDraftFromForm,
  validateBookingPatch
} from '../apps/api/src/modules/assistant/assistant.booking.js';
import { createAssistantTools } from '../apps/api/src/modules/assistant/assistant.tools.js';
import { bookableAddons } from '../packages/shared/src/domain/catalog.js';
import { mergeAssistantBooking } from '../packages/shared/src/domain/assistantBooking.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const output = path.resolve(process.env.UI_OUTPUT_DIR || 'tmp/assistant-ui');
const base = process.env.UI_CLIENT_URL || 'http://localhost:5173';
await fs.mkdir(output, { recursive: true });
const seed = buildBusinessSeed();
const packages = seed.packages.map((p) => ({ ...p, visible: true, archived: false }));
const pkg = packages.find((p) => p.kind !== 'rental');
const rentalItem = { id: 'fixture-chair', name: 'Chair', category: 'Furniture', price: 25, damageFee: 100 };
const planningCatalog = {
  packages,
  addons: seed.addons,
  dishes: seed.dishes,
  rentals: [rentalItem],
  pricePerPlate: 600,
  minDownpayment: 3000,
  sixHourFee: 5000
};
const user = {
  id: 'assistant-ui-fixture',
  name: 'Assistant Preview',
  firstName: 'Assistant',
  lastName: 'Preview',
  email: 'assistant@example.invalid',
  mobile: '09171234567',
  company: '',
  termsVersion: TERMS_VERSION
};
const estimate = {
  id: randomUUID(),
  packageId: pkg.id,
  packageName: pkg.name,
  serviceType: 'Catering only',
  guests: 100,
  knownSubtotal: pkg.price,
  lines: [{ name: 'Package setup', amount: pkg.price }],
  pendingQuotation: ['Custom styling'],
  intent: { packageSlug: pkg.slug, serviceType: 'Catering only', guests: 100 },
  note: 'Review all details in the booking form. The admin prepares your final quotation.'
};

async function fixture(context, signedIn = false, voice = true, available = true) {
  await context.routeWebSocket('**', (socket) => socket.close());
  const state = {
    id: randomUUID(),
    turns: [],
    sends: 0,
    speech: 0,
    transcriptions: 0,
    visitorHeaders: [],
    bookingDraft: {},
    draftRevision: 0
  };
  const snapshot = () => ({
    conversationId: state.id,
    bookingDraft: state.bookingDraft,
    draftRevision: state.draftRevision,
    bookingPlan: Object.keys(state.bookingDraft).length ? bookingPlan(state.bookingDraft, planningCatalog) : null,
    expiresAt: Date.now() + 86400000,
    allowance: {
      guest: !signedIn,
      used: state.turns.length,
      limit: signedIn ? 20 : 2,
      remaining: Math.max(0, (signedIn ? 20 : 2) - state.turns.length),
      pending: false
    },
    messages: state.turns
  });
  if (signedIn)
    await context.addInitScript(
      ({ user }) => {
        localStorage.setItem(
          'tm.client.session',
          JSON.stringify({ token: 'assistant-fixture-session', user, lastActivity: Date.now() })
        );
        if (!localStorage.getItem(`tm.client.draft.${user.id}`))
          localStorage.setItem(
            `tm.client.draft.${user.id}`,
            JSON.stringify({
              form: { venueName: 'Keep this venue', serviceType: 'Buffet and Catering', guests: '150' },
              savedAt: 1
            })
          );
      },
      { user }
    );
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname.replace(/^\/api/, '');
    const headers = {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Assistant-Visitor',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const reply = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers });
    if (endpoint === '/assistant/config')
      return reply({
        available,
        enabled: true,
        voiceAvailable: voice,
        questions: ASSISTANT_QUESTIONS,
        dailyLimit: 20,
        guestLimit: 2
      });
    if (endpoint === '/assistant/session') {
      state.visitorHeaders.push(request.headers()['x-assistant-visitor']);
      return reply({ ...snapshot(), ...(!signedIn ? { visitorToken: 'v'.repeat(43) } : {}) });
    }
    if (endpoint.endsWith('/transcriptions')) {
      state.transcriptions++;
      return reply({ text: 'Birthday for 100 guests' });
    }
    if (endpoint.endsWith('/speech')) {
      state.speech++;
      return route.fulfill({ contentType: 'audio/wav', body: pcmWave(Buffer.alloc(24000 * 2), 24000), headers });
    }
    if (endpoint.startsWith('/assistant/conversations/')) {
      if (
        request.method() === 'POST' &&
        (endpoint.endsWith('/booking-draft') || endpoint.endsWith('/resume-booking'))
      ) {
        const body = request.postDataJSON();
        assert.equal(body.revision, state.draftRevision);
        state.bookingDraft = endpoint.endsWith('/resume-booking')
          ? bookingDraftFromForm(body.form, planningCatalog)
          : validateBookingPatch({}, body.draft, planningCatalog);
        state.draftRevision++;
        return reply(snapshot());
      }
      if (request.method() === 'POST' && endpoint.endsWith('/messages')) {
        if (!signedIn && state.turns.length >= 2)
          return reply({ code: 'ASSISTANT_SIGN_IN_REQUIRED', message: 'Create an account to continue.' }, 403);
        const input = request.postDataJSON();
        state.sends++;
        const guided = state.onSend ? await state.onSend(input, state) : null;
        if (guided?.bookingDraft) {
          state.bookingDraft = guided.bookingDraft;
          state.draftRevision++;
        }
        state.turns.push({
          id: randomUUID(),
          requestId: input.requestId,
          text: input.text,
          source: input.source,
          status: 'completed',
          createdAt: Date.now(),
          response: guided || {
            answer: 'Here is a published option for your event. Custom styling needs an administrator quotation.',
            packages: [{ ...pkg }],
            estimates: [estimate],
            needsAdmin: false
          }
        });
      }
      return reply(snapshot());
    }
    if (endpoint === '/packages') return reply(packages);
    if (endpoint.startsWith('/packages/by-slug/')) return reply(pkg);
    if (endpoint === '/addons') return reply(seed.addons);
    if (endpoint === '/dishes') return reply(seed.dishes);
    if (endpoint === '/rental-items') return reply([rentalItem]);
    if (endpoint.startsWith('/rentals/availability'))
      return reply({ [rentalItem.id]: { left: 1000, status: 'available' } });
    if (endpoint === '/catalog')
      return reply({
        packages,
        addons: seed.addons,
        dishes: seed.dishes,
        rentals: [rentalItem],
        pricePerPlate: 600,
        minDownpayment: 3000,
        sixHourFee: 5000
      });
    if (endpoint === '/catalog/pricing') return reply({ pricePerPlate: 600, minDownpayment: 3000, sixHourFee: 5000 });
    if (endpoint.startsWith('/catalog/')) return reply({ pricePerPlate: 600, minDownpayment: 3000, sixHourFee: 5000 });
    if (endpoint === '/calendar') return reply({ capacity: 2, blocked: [], booked: {}, events: [] });
    if (endpoint === '/changes') return reply({ stamp: 1 });
    if (endpoint === '/me') return reply(user);
    if (endpoint === '/auth/payment-details') return reply({});
    if (endpoint.startsWith('/appearance/')) return reply({ version: null });
    return reply([]);
  });
  return state;
}

async function openAssistant(page) {
  return page.getByRole('button', { name: 'Open AI assistant', exact: true }).click();
}

// Dev-only render telemetry catches expensive page renders during header visibility changes.
function trackLandingRenders() {
  window.__landingRenders = { enabled: false, start: 0, count: 0, lastStart: -1, lastCommit: 0 };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject(renderer) {
      this.renderers.set(1, renderer);
      return 1;
    },
    onCommitFiberRoot(id, root) {
      const sample = window.__landingRenders;
      const visit = (fiber) => {
        if (!fiber) return;
        if (fiber.type?.name === 'HomePage' && fiber.flags & 1 && fiber.actualStartTime > sample.lastStart) {
          sample.lastStart = fiber.actualStartTime;
          sample.lastCommit = performance.now();
          if (sample.enabled && fiber.actualStartTime >= sample.start) sample.count++;
        }
        visit(fiber.child);
        visit(fiber.sibling);
      };
      visit(root.current);
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {}
  };
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
});
const results = [];
try {
  for (const [label, viewport] of [
    ['desktop', { width: 1440, height: 1000 }],
    ['mobile', { width: 390, height: 844 }]
  ]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const state = await fixture(context);
    if (label === 'desktop') await context.addInitScript(trackLandingRenders);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base, { waitUntil: 'networkidle' });
    if (label === 'desktop') {
      const development = await page.evaluate(() =>
        [...window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers.values()].some((renderer) => renderer.bundleType === 1)
      );
      if (development) {
        await page.locator('#packages [aria-busy="false"]').waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(() => performance.now() - window.__landingRenders.lastCommit >= 250);
        await page.evaluate(() => {
          window.__landingRenders.start = performance.now();
          window.__landingRenders.enabled = true;
        });
        for (let cycle = 0; cycle < 2; cycle++) {
          await page.evaluate(() => window.scrollTo({ top: 150, behavior: 'instant' }));
          await page.locator('[data-site-navigation][data-hidden="true"]').waitFor();
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
          await page.locator('[data-site-navigation][data-hidden="false"]').waitFor();
        }
        const renders = await page.evaluate(() => {
          window.__landingRenders.enabled = false;
          return window.__landingRenders.count;
        });
        assert.equal(renders, 0, 'header visibility changes must not render the full landing page');
        results.push('header performance: hide/show updates do not render the landing-page content');
      }
    }
    if (!(await page.getByRole('button', { name: 'Open AI assistant', exact: true }).count())) {
      await page.screenshot({ path: path.join(output, `load-failure-${label}.png`) });
      throw new Error(JSON.stringify({ errors, body: (await page.locator('body').innerText()).slice(0, 1500) }));
    }
    assert.equal(state.sends, 0);
    assert.equal(
      await page.locator('[data-assistant-hero], #ai-assistant').count(),
      0,
      'only the floating assistant remains'
    );
    assert.equal(await page.getByRole('button', { name: 'Open AI assistant', exact: true }).count(), 1);
    const invite = page.locator('[data-assistant-character]');
    const inviteBox = await invite.boundingBox();
    assert.ok(
      inviteBox.y >= 0 && inviteBox.y + inviteBox.height <= viewport.height,
      `${label}: floating assistant is visible on arrival`
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      `${label}: no horizontal overflow`
    );
    assert.equal(
      await invite.locator('.tm-assistant-mascot__eyes').evaluate((el) => getComputedStyle(el).animationName),
      'none'
    );
    await page.screenshot({ path: path.join(output, `assistant-hero-${label}.png`) });
    for (const id of ['packages', 'gallery', 'services', 'booking-journey', 'availability', 'faq', 'contact']) {
      await page.locator('#' + id).evaluate((el) => el.scrollIntoView({ behavior: 'instant', block: 'start' }));
      await page.locator('[data-assistant-guide="' + id + '"]').waitFor();
      const bubble = await page.locator('[data-assistant-guide]').boundingBox();
      assert.ok(
        bubble.x >= 0 && bubble.x + bubble.width <= viewport.width,
        label + ': guide stays inside the viewport'
      );
      await page.locator('[data-site-navigation][data-hidden="true"]').waitFor();
      assert.equal(await page.locator('[data-site-navigation]').getAttribute('inert'), '');
      if (id === 'gallery' || id === 'packages')
        await page.screenshot({ path: path.join(output, `guide-${id}-${label}.png`) });
    }
    assert.equal(state.sends, 0, 'scroll guidance does not send a question or consume allowance');
    assert.equal(state.speech, 0, 'scroll guidance does not play unsolicited audio');
    await page.evaluate(() => window.scrollBy({ top: -100, behavior: 'instant' }));
    await page.locator('[data-site-navigation][data-hidden="false"]').waitFor();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.locator('[data-assistant-guide="welcome"]').waitFor({ state: 'attached' });
    if (label === 'desktop') {
      const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true });
      await nav.getByRole('button', { name: 'Packages', exact: true }).focus();
      await page.keyboard.press('Tab');
      await page.evaluate(async () => {
        window.scrollBy({ top: 300, behavior: 'instant' });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      assert.equal(
        await page.locator('[data-site-navigation]').getAttribute('data-hidden'),
        'false',
        'keyboard focus keeps navigation available'
      );
      await page.evaluate(() => document.activeElement.blur());
      await page.locator('[data-site-navigation][data-hidden="true"]').waitFor();
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.locator('[data-site-navigation][data-hidden="false"]').waitFor();
    }
    await openAssistant(page);
    await page
      .getByText('2 free questions remaining', { exact: true })
      .waitFor({ timeout: 7000 })
      .catch(async () => {
        await page.screenshot({ path: path.join(output, `panel-failure-${label}.png`) });
        throw new Error(JSON.stringify({ errors, body: (await page.locator('body').innerText()).slice(-1800) }));
      });
    assert.equal(await page.locator('.tm-assistant-question').count(), 4);
    const draft = `Keep this ${label} draft when I leave immediately`;
    await page.getByLabel('Your question', { exact: true }).fill(draft);
    if (label === 'desktop') await page.getByRole('button', { name: 'Close AI assistant', exact: true }).click();
    else await page.reload({ waitUntil: 'networkidle' });
    await openAssistant(page);
    await page.waitForFunction((text) => document.querySelector('[aria-label="Your question"]')?.value === text, draft);
    assert.equal(state.sends, 0, 'closing/reloading preserves a draft without sending it');
    await page.getByRole('button', { name: ASSISTANT_QUESTIONS[0], exact: true }).click();
    assert.equal(await page.getByLabel('Your question', { exact: true }).inputValue(), ASSISTANT_QUESTIONS[0]);
    assert.equal(state.sends, 0, 'suggestions prepare a question without sending it');
    await page.getByRole('button', { name: 'More questions to explore', exact: true }).click();
    assert.equal(await page.locator('.tm-assistant-question').count(), 6);
    await page.getByRole('button', { name: 'Fewer suggestions', exact: true }).click();
    await page.getByRole('button', { name: 'About', exact: true }).click();
    await page.locator('#assistant-about').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'About', exact: true }).click();
    await page.screenshot({ path: path.join(output, `assistant-chat-welcome-${label}.png`) });
    await page.getByLabel('Your question', { exact: true }).fill('Show me a package for 100 guests');
    await page.getByLabel('Your question', { exact: true }).press('Shift+Enter');
    assert.equal(
      await page.getByLabel('Your question', { exact: true }).inputValue(),
      'Show me a package for 100 guests\n'
    );
    assert.equal(state.sends, 0, 'Shift+Enter inserts a newline without sending');
    await page
      .getByLabel('Your question', { exact: true })
      .dispatchEvent('keydown', { key: 'Enter', isComposing: true });
    assert.equal(state.sends, 0, 'IME composition does not send');
    await page.getByLabel('Your question', { exact: true }).press('Enter');
    await page.getByText('1 free question remaining', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, `assistant-chat-reply-${label}.png`) });
    await page.getByRole('button', { name: 'Listen', exact: true }).first().click();
    await page.waitForFunction(() =>
      Boolean(document.querySelector('[aria-label="Your question"]') || document.querySelector('textarea'))
    );
    await page.getByLabel('Your question', { exact: true }).fill('How do I book?');
    await page.getByRole('button', { name: 'Send question', exact: true }).click();
    await page.getByText('0 free questions remaining', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Send question', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Record a voice question', exact: true }).isDisabled(), true);
    assert.equal(state.sends, 2);
    assert.equal(state.speech, 1);
    await page.screenshot({ path: path.join(output, `guest-${label}.png`), fullPage: false });
    await page.getByRole('button', { name: 'Close AI assistant', exact: true }).click();
    if (label === 'mobile') {
      await page.locator('#packages').scrollIntoViewIfNeeded();
      await page.getByRole('button', { name: 'Open AI assistant', exact: true }).waitFor({ state: 'visible' });
      const launcher = await page.getByRole('button', { name: 'Open AI assistant', exact: true }).boundingBox();
      assert.ok(launcher.y + launcher.height < viewport.height - 64, 'mobile: character clears the bottom signup bar');
      await page.screenshot({ path: path.join(output, 'assistant-mobile-scrolled.png') });
      await page.getByRole('button', { name: 'Open AI assistant', exact: true }).click();
      await page.getByText('0 free questions remaining', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Close AI assistant', exact: true }).click();
    }
    await page.reload({ waitUntil: 'networkidle' });
    await openAssistant(page);
    await page.getByText('0 free questions remaining', { exact: true }).waitFor();
    assert.equal(state.visitorHeaders.at(-1), 'v'.repeat(43));
    await page.getByRole('link', { name: 'Create account', exact: true }).click();
    await page.waitForURL('**/signup?continue=assistant');
    const loginLink = page.locator('a[href="/login?next=%2Fportal%2Fassistant"]');
    await loginLink.waitFor();
    assert.equal(errors.length, 0, errors.join('\n'));
    results.push(
      `${label}: single floating guide, section introductions, header scroll behavior, reduced-motion support, two guest questions, text/voice shared gate, reload persistence and signup return links`
    );
    await context.close();
  }
  for (const [label, viewport] of [
    ['desktop', { width: 1440, height: 1000 }],
    ['mobile', { width: 390, height: 844 }],
    ['small-phone', { width: 320, height: 568 }]
  ]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    await fixture(context, false, false, false);
    const page = await context.newPage();
    await page.goto(base, { waitUntil: 'networkidle' });
    await openAssistant(page);
    await page.getByText('Assistant is temporarily unavailable', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Send question', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Record a voice question', exact: true }).isDisabled(), true);
    const compose = await page.getByRole('button', { name: 'Send question', exact: true }).boundingBox();
    assert.ok(compose.y >= 0 && compose.y + compose.height <= viewport.height, `${label}: composer stays in view`);
    assert.equal(
      await page.getByRole('dialog').evaluate((el) => el.scrollHeight > el.clientHeight),
      false,
      `${label}: only the conversation scrolls`
    );
    await page.screenshot({ path: path.join(output, `assistant-chat-unavailable-${label}.png`) });
    await page.getByRole('link', { name: 'Browse packages', exact: true }).click();
    await page.waitForURL('**/#packages');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await context.close();
  }
  results.push(
    'redesigned chat: suggestion cards, more questions, disclosure, unavailable state and visible composer down to 320px'
  );
  const voiceContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ['microphone']
  });
  const voiceState = await fixture(voiceContext);
  const voicePage = await voiceContext.newPage();
  await voicePage.goto(base, { waitUntil: 'networkidle' });
  const wave = voicePage.locator('[data-assistant-character] .tm-assistant-mascot__wave');
  assert.equal(await wave.evaluate((el) => getComputedStyle(el).animationName), 'tm-assistant-wave');
  assert.equal(await wave.evaluate((el) => getComputedStyle(el).animationPlayState), 'running');
  await voicePage.waitForFunction(() =>
    document
      .querySelector('.tm-assistant-mascot__wave')
      .getAnimations()
      .some((animation) => animation.currentTime > 100)
  );
  assert.equal(await voicePage.getByRole('button', { name: /(?:Pause|Resume) assistant animation/ }).count(), 0);
  const companion = voicePage.locator('[data-assistant-character]');
  const originalPosition = await companion.boundingBox();
  for (const id of ['packages', 'gallery', 'services']) {
    await voicePage.locator('#' + id).evaluate((el) => el.scrollIntoView({ behavior: 'instant', block: 'start' }));
    await voicePage.locator('[data-assistant-guide="' + id + '"]').waitFor();
    const position = await companion.boundingBox();
    assert.ok(
      Math.abs(position.x - originalPosition.x) < 1 && Math.abs(position.y - originalPosition.y) < 1,
      'assistant stays at the bottom right across sections'
    );
    assert.equal(await wave.evaluate((el) => getComputedStyle(el).animationPlayState), 'running');
  }
  assert.equal(voiceState.sends, 0);
  await voicePage.goto(base, { waitUntil: 'networkidle' });
  await voicePage.screenshot({ path: path.join(output, 'assistant-hero-animated.png') });
  await voicePage.getByRole('button', { name: 'Open AI assistant', exact: true }).click();
  const chatHead = voicePage.locator('.tm-assistant-header__avatar .tm-assistant-mascot__head');
  await chatHead.waitFor();
  assert.notEqual(await chatHead.evaluate((el) => getComputedStyle(el).animationName), 'none');
  assert.equal(await chatHead.evaluate((el) => getComputedStyle(el).animationPlayState), 'running');
  await voicePage.getByRole('button', { name: 'Record a voice question', exact: true }).click();
  await voicePage.getByText('Cancel recording', { exact: true }).waitFor();
  await new Promise((r) => setTimeout(r, 500));
  await voicePage.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await voicePage
    .getByText('Review the transcript, especially dates, names and amounts, then send.', { exact: true })
    .waitFor();
  assert.equal(voiceState.sends, 0);
  assert.equal(voiceState.transcriptions, 1);
  assert.equal(await voicePage.getByLabel('Your question', { exact: true }).inputValue(), 'Birthday for 100 guests');
  await voicePage.getByRole('button', { name: 'Send question', exact: true }).click();
  await voicePage.getByText('1 free question remaining', { exact: true }).waitFor();
  assert.equal(voiceState.turns[0].source, 'voice');
  results.push(
    'animation: fixed bottom-right position across sections, automatic playback including open chat; voice: capture, transcript review and one question charge'
  );
  await voiceContext.close();
  for (const [label, viewport] of [
    ['small-phone', { width: 320, height: 568 }],
    ['phone-360', { width: 360, height: 740 }],
    ['phone-375', { width: 375, height: 812 }],
    ['tablet', { width: 768, height: 1024 }],
    ['short-laptop', { width: 1366, height: 768 }],
    ['wide-desktop', { width: 1920, height: 900 }]
  ]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'no-preference' });
    await fixture(context);
    const page = await context.newPage();
    await page.goto(base, { waitUntil: 'networkidle' });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      `${label}: no horizontal overflow`
    );
    const launcher = page.getByRole('button', { name: 'Open AI assistant', exact: true });
    const launcherBox = await launcher.boundingBox();
    assert.ok(await launcher.isVisible(), label + ': floating assistant is visible');
    assert.ok(
      launcherBox.y >= 0 && launcherBox.y + launcherBox.height <= viewport.height,
      label + ': assistant stays on screen'
    );
    const primaryButton = await page.getByRole('button', { name: 'See our packages', exact: true }).boundingBox();
    assert.ok(
      primaryButton.x + primaryButton.width <= launcherBox.x ||
        launcherBox.x + launcherBox.width <= primaryButton.x ||
        primaryButton.y + primaryButton.height <= launcherBox.y ||
        launcherBox.y + launcherBox.height <= primaryButton.y,
      label + ': floating assistant leaves the primary hero button clear'
    );
    await page.screenshot({ path: path.join(output, `assistant-${label}.png`) });
    await context.close();
  }
  results.push('responsive: 320px phone, tablet, short laptop and wide desktop without horizontal overflow');
  const customerContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce'
  });
  await fixture(customerContext, true);
  const customerPage = await customerContext.newPage();
  const customerErrors = [];
  customerPage.on('pageerror', (e) => customerErrors.push(e.message));
  await customerPage.goto(base, { waitUntil: 'networkidle' });
  await openAssistant(customerPage);
  await customerPage.waitForURL('**/portal/assistant');
  await customerPage
    .getByText('20 questions remaining today', { exact: true })
    .waitFor({ timeout: 7000 })
    .catch(async () => {
      await customerPage.screenshot({ path: path.join(output, 'customer-load-failure.png') });
      throw new Error(
        JSON.stringify({
          url: customerPage.url(),
          errors: customerErrors,
          body: (await customerPage.locator('body').innerText()).slice(-2000)
        })
      );
    });
  assert.equal(
    await customerPage.locator('.tm-assistant-panel--page').count(),
    1,
    'portal uses full-page assistant layout'
  );
  await customerPage.getByRole('button', { name: /Event details/ }).click();
  assert.equal(
    await customerPage.locator('[data-assistant-summary]').isVisible(),
    true,
    'saved celebration details remain available in the event-details drawer'
  );
  await customerPage.getByRole('button', { name: 'Close event details', exact: true }).click();
  await customerPage.getByRole('dialog', { name: 'Your event details' }).waitFor({ state: 'hidden' });
  for (const [sizeLabel, height, minThreadHeight] of [
    ['short-laptop', 768, 250],
    ['desktop', 1000, 420]
  ]) {
    await customerPage.setViewportSize({ width: 1440, height });
    const panelBox = await customerPage.locator('.tm-assistant-panel--page').boundingBox();
    const threadBox = await customerPage.locator('[data-assistant-thread]').boundingBox();
    const sendBox = await customerPage.getByRole('button', { name: 'Send question', exact: true }).boundingBox();
    assert.ok(panelBox.width >= 680, `${sizeLabel}: full-page assistant panel is spacious (${panelBox.width}px)`);
    assert.ok(
      threadBox.height >= minThreadHeight,
      `${sizeLabel}: assistant thread has generous vertical room (${threadBox.height}px)`
    );
    assert.ok(
      sendBox.y + sendBox.height <= height,
      `${sizeLabel}: composer stays fully visible inside the viewport (${sendBox.y + sendBox.height} <= ${height})`
    );
  }
  await customerPage.getByLabel('Your question', { exact: true }).fill('Estimate catering only for 100 guests');
  await customerPage.getByRole('button', { name: 'Send question', exact: true }).click();
  await customerPage.getByText('19 questions remaining today', { exact: true }).waitFor();
  await customerPage.getByRole('button', { name: 'Continue to booking', exact: true }).last().click();
  await customerPage.getByText(/You have a saved booking draft/).waitFor();
  await customerPage.screenshot({ path: path.join(output, 'customer-handoff.png'), fullPage: false });
  await customerPage.getByRole('button', { name: 'Use selections', exact: true }).click();
  await customerPage.waitForURL('**/portal/book');
  const preserved = await customerPage.evaluate(() => ({
    intent: JSON.parse(sessionStorage.getItem('tm.client.bookingIntent')),
    draft: JSON.parse(localStorage.getItem('tm.client.draft.assistant-ui-fixture'))
  }));
  assert.equal(preserved.intent.serviceType, 'Catering only');
  assert.equal(preserved.draft.form.venueName, 'Keep this venue');
  results.push('customer: daily allowance, estimate handoff and saved venue preservation');
  await customerContext.close();
  const guidedContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const guidedState = await fixture(guidedContext, true);
  const addon = bookableAddons(seed.addons).find((v) => !v.archived);
  const fullPlan = {
    eventName: 'Fixture celebration',
    occasion: 'Birthday',
    guests: 100,
    serviceType: 'Buffet and Catering',
    packageSlug: pkg.slug,
    date: '2090-12-12',
    startTime: '12:00',
    endTime: '16:00',
    venueName: 'Fixture event hall',
    venueAddress: '123 Test Street',
    city: 'Malvar',
    menu: { pork: ['Pork BBQ'], chicken: ['Chicken BBQ'], fish: ['Sweet and sour fish'], vegetable: ['Chopsuey'] },
    styling: {
      theme: 'Rustic',
      colors: [
        { hex: '#FFFFFF', name: 'White' },
        { hex: '#9CAF88', name: 'Sage Green' }
      ],
      notes: 'Ivory linens'
    },
    addonIds: addon ? [addon.id] : [],
    addonQty: addon ? { [addon.id]: addon.hasQuantity ? 2 : 1 } : {},
    budget: 100000,
    budgetNotes: 'Simple styling',
    foodNotes: 'No peanuts',
    accessNotes: 'Use the side entrance',
    discussed: ['menu', 'styling', 'addons', 'notes', 'budget']
  };
  guidedState.onSend = async (input, state) => {
    const tools = createAssistantTools({ getCatalog: async () => planningCatalog, draft: state.bookingDraft });
    const patch = input.text.includes('120')
      ? { guests: 120 }
      : input.text.includes('complete')
        ? fullPlan
        : { guests: 100 };
    await tools.run('prepare_reservation', { patch, clearFields: [] });
    return {
      answer:
        'Your reservation plan has been updated. Review it whenever you are ready; you can finish missing details in the form.',
      bookingDraft: tools.bookingDraft,
      packages: [],
      estimates: [],
      needsAdmin: false
    };
  };
  const guidedPage = await guidedContext.newPage();
  const guidedErrors = [];
  guidedPage.on('pageerror', (e) => guidedErrors.push(e.message));
  await guidedPage.goto(`${base}/portal/assistant`, { waitUntil: 'networkidle' });
  await guidedPage.getByLabel('Your question', { exact: true }).fill('Please reserve for 100 guests');
  await guidedPage.getByRole('button', { name: 'Send question', exact: true }).click();
  await guidedPage.getByRole('button', { name: 'Review reservation', exact: true }).waitFor();
  await guidedPage.reload({ waitUntil: 'networkidle' });
  await guidedPage.getByRole('button', { name: 'Review reservation', exact: true }).waitFor();
  assert.equal(guidedState.bookingDraft.guests, 100);
  await guidedPage.getByLabel('Your question', { exact: true }).fill('Please complete the rest of my details');
  await guidedPage.getByRole('button', { name: 'Send question', exact: true }).click();
  await guidedPage.getByText('18 questions remaining today', { exact: true }).waitFor();
  await guidedPage.getByLabel('Your question', { exact: true }).fill('Change the count to 120 guests');
  await guidedPage.getByRole('button', { name: 'Send question', exact: true }).click();
  await guidedPage.getByText('17 questions remaining today', { exact: true }).waitFor();
  assert.equal(guidedState.bookingDraft.venueName, fullPlan.venueName);
  await guidedPage.getByRole('button', { name: 'Review reservation', exact: true }).click();
  await guidedPage.getByRole('dialog', { name: 'Review booking selections' }).waitFor();
  await guidedPage.screenshot({ path: path.join(output, 'guided-reservation-review.png') });
  await guidedPage.getByRole('button', { name: 'Use selections', exact: true }).click();
  await guidedPage.waitForURL('**/portal/book');
  await guidedPage.getByLabel('Event name', { exact: false }).waitFor();
  assert.equal(await guidedPage.getByLabel('Event name', { exact: false }).inputValue(), fullPlan.eventName);
  assert.equal(await guidedPage.getByLabel('Venue name', { exact: false }).inputValue(), fullPlan.venueName);
  const guidedIntent = await guidedPage.evaluate(() => JSON.parse(sessionStorage.getItem('tm.client.bookingIntent')));
  assert.equal(guidedIntent.guests, 120);
  assert.equal(guidedIntent.budget, 100000);
  assert.deepEqual(guidedIntent.menu.pork, ['Pork BBQ']);
  assert.equal(guidedIntent.styling.theme, 'Rustic');
  assert.equal(guidedIntent.agreeTerms, undefined);
  assert.equal(await guidedPage.getByRole('checkbox', { name: /Terms of Service/i }).isChecked(), false);
  assert.equal(guidedErrors.length, 0, guidedErrors.join('\n'));
  await guidedContext.close();
  const resumeContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const resumeState = await fixture(resumeContext, true);
  const resumePage = await resumeContext.newPage();
  await resumePage.goto(`${base}/portal/assistant`, { waitUntil: 'networkidle' });
  await resumePage.getByRole('button', { name: 'Resume saved reservation', exact: true }).click();
  await resumePage.getByRole('button', { name: 'Review reservation', exact: true }).waitFor();
  assert.equal(resumeState.sends, 0);
  assert.equal(resumeState.bookingDraft.guests, 150);
  assert.equal(resumeState.bookingDraft.venueName, 'Keep this venue');
  // A later form edit can replace an existing assistant plan after an explicit review.
  await resumePage.evaluate(() => {
    const key = 'tm.client.draft.assistant-ui-fixture';
    const current = JSON.parse(localStorage.getItem(key));
    current.form.guests = '175';
    localStorage.setItem(key, JSON.stringify(current));
  });
  await resumePage.reload({ waitUntil: 'networkidle' });
  await resumePage.getByRole('button', { name: 'Resume saved reservation', exact: true }).click();
  await resumePage.getByRole('dialog', { name: 'Resume saved reservation?', exact: true }).waitFor();
  await resumePage.getByRole('button', { name: 'Use saved form', exact: true }).click();
  await resumePage.getByRole('dialog', { name: 'Resume saved reservation?', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(resumeState.bookingDraft.guests, 175);
  assert.equal(resumeState.sends, 0);
  await resumePage.getByRole('button', { name: 'Review reservation', exact: true }).click();
  await resumePage.getByRole('button', { name: 'Use selections', exact: true }).click();
  await resumePage.waitForURL('**/portal/book');
  await resumePage.waitForFunction(() => document.getElementById('f-venueName')?.value === 'Keep this venue');
  assert.equal(await resumePage.getByLabel('Venue name', { exact: false }).inputValue(), 'Keep this venue');
  await resumeContext.close();
  const rentalContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const rentalState = await fixture(rentalContext, true);
  const rentalTools = createAssistantTools({ getCatalog: async () => planningCatalog });
  await rentalTools.run('prepare_reservation', {
    patch: {
      eventName: 'Rental fixture',
      occasion: 'Birthday',
      serviceType: 'Equipment rental',
      date: '2090-12-12',
      startTime: '12:00',
      endTime: '16:00',
      rentals: [{ itemId: rentalItem.id, quantity: 100 }],
      fulfilment: 'delivery',
      venueName: 'Rental venue',
      venueAddress: '123 Rental St',
      city: 'Malvar'
    },
    clearFields: []
  });
  rentalState.bookingDraft = rentalTools.bookingDraft;
  const rentalPage = await rentalContext.newPage();
  const rentalErrors = [];
  rentalPage.on('pageerror', (e) => rentalErrors.push(e.message));
  await rentalPage.goto(`${base}/portal/assistant`, { waitUntil: 'networkidle' });
  await rentalPage.getByRole('button', { name: 'Review reservation', exact: true }).click();
  await rentalPage.getByRole('button', { name: 'Use selections', exact: true }).click();
  await rentalPage.waitForURL('**/portal/book');
  await rentalPage.waitForFunction(() => document.getElementById('f-eventName')?.value === 'Rental fixture');
  assert.equal(await rentalPage.getByLabel('Place name', { exact: false }).inputValue(), 'Rental venue');
  assert.equal(await rentalPage.getByLabel('How many Chair', { exact: true }).inputValue(), '100');
  const rentalIntent = await rentalPage.evaluate(() => JSON.parse(sessionStorage.getItem('tm.client.bookingIntent')));
  assert.equal(rentalIntent.serviceType, 'Equipment rental');
  assert.equal(rentalIntent.rentalQty[rentalItem.id], 100);
  assert.equal(rentalIntent.guests, undefined);
  assert.equal(rentalErrors.length, 0, rentalErrors.join('\n'));
  await rentalPage.screenshot({ path: path.join(output, 'guided-rental-handoff.png') });
  await rentalContext.close();
  const partialContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const partialState = await fixture(partialContext, true);
  partialState.bookingDraft = mergeAssistantBooking({ ...fullPlan, guests: 100 }, {}, ['venueName', 'endTime']);
  const partialPage = await partialContext.newPage();
  await partialPage.goto(`${base}/portal/assistant`, { waitUntil: 'networkidle' });
  await partialPage.getByRole('button', { name: 'Review reservation', exact: true }).click();
  await partialPage.getByRole('button', { name: 'Use selections', exact: true }).click();
  await partialPage.waitForURL('**/portal/book');
  await partialPage.waitForFunction(() => document.getElementById('f-eventName')?.value === 'Fixture celebration');
  assert.equal(await partialPage.getByLabel('Venue name', { exact: false }).inputValue(), '');
  assert.equal(await partialPage.getByRole('combobox', { name: 'End time — Hour', exact: true }).innerText(), '--');
  await partialContext.close();
  const guestPlanContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const guestPlanState = await fixture(guestPlanContext);
  guestPlanState.bookingDraft = { guests: 100, occasion: 'Birthday' };
  const guestPlanPage = await guestPlanContext.newPage();
  await guestPlanPage.goto(base, { waitUntil: 'networkidle' });
  await openAssistant(guestPlanPage);
  await guestPlanPage.getByRole('button', { name: 'Review reservation', exact: true }).click();
  await guestPlanPage.getByRole('button', { name: 'Create account and continue', exact: true }).click();
  await guestPlanPage.waitForURL('**/signup?continue=booking');
  const guestIntent = await guestPlanPage.evaluate(() => JSON.parse(sessionStorage.getItem('tm.client.bookingIntent')));
  assert.equal(guestIntent.guests, 100);
  assert.equal(guestIntent.occasion, 'Birthday');
  assert.equal(guestIntent.assistantCustomerId, null);
  assert.equal(guestPlanState.sends, 0);
  await guestPlanContext.close();
  results.push(
    'guided reservation: saved 100 guests, reload/resume, change to 120, complete menu/theme/venue/addons/budget handoff, unchecked terms, and mobile partial-form resume without an AI charge'
  );
  console.log(JSON.stringify({ passed: results, screenshots: output }, null, 2));
} finally {
  await browser.close();
}
