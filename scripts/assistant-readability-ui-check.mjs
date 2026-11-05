/** Local API fixtures only: exercises long replies without accounts, AI calls or database writes. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TERMS_VERSION } from '../packages/shared/src/legal/terms.js';
import { ASSISTANT_QUESTIONS } from '../packages/shared/src/domain/assistant.js';
import { buildBusinessSeed } from '../apps/api/src/seedData/seed.js';
import { bookingPlan } from '../apps/api/src/modules/assistant/assistant.booking.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base = process.env.UI_CLIENT_URL || 'http://localhost:5173';
const output = path.resolve(process.env.UI_OUTPUT_DIR || 'tmp/assistant-readability-ui');
await fs.mkdir(output, { recursive: true });
const seed = buildBusinessSeed();
const catalog = { ...seed, rentals: [], pricePerPlate: 600, minDownpayment: 3000, sixHourFee: 5000 };
const user = {
  id: 'assistant-readability-fixture',
  name: 'Isabel Santos',
  firstName: 'Isabel',
  lastName: 'Santos',
  email: 'readability@example.invalid',
  mobile: '09171234567',
  termsVersion: TERMS_VERSION
};
const longAnswer = [
  'Let’s make your celebration feel personal. Here is a complete guide to planning a birthday for 100 guests.',
  ...Array.from(
    { length: 12 },
    (_, i) =>
      `${i + 1}. ${['Your catering package', 'The menu and dietary requests', 'Your venue and event schedule', 'Styling and finishing touches'][i % 4]}\nAllow enough time to compare your choices with your family. Share the details that matter most to you, including your guest count, preferred dishes, theme, and budget. Our team will review the final arrangements and confirm availability before your reservation is approved.`
  ),
  'End of your planning guide. You can read every detail above before deciding what to do next.'
].join('\n\n');
const failureMessage = 'Your question could not be sent. Please try again; your draft is saved.';

async function fixture(context, mode, planningStarted = false) {
  const messages = [];
  let failedOnce = false;
  const draft = planningStarted ? { planningStarted: true } : {};
  await context.routeWebSocket('**', (socket) => socket.close());
  await context.addInitScript(
    ({ user, mode }) => {
      localStorage.setItem(
        'tm.client.session',
        JSON.stringify({ token: 'readability-fixture', user, lastActivity: Date.now() })
      );
      localStorage.setItem('tm.colorMode', mode);
    },
    { user, mode }
  );
  const snapshot = () => ({
    conversationId: 'readability-conversation',
    bookingDraft: draft,
    bookingCatalog: planningStarted ? catalog : undefined,
    bookingPlan: planningStarted ? bookingPlan(draft, catalog) : null,
    draftRevision: 0,
    expiresAt: Date.now() + 86400000,
    allowance: { used: messages.length, limit: 20, remaining: 20 - messages.length, pending: false },
    messages
  });
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname.replace(/^\/api/, '');
    const reply = (body) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (endpoint === '/assistant/config')
      return reply({
        available: true,
        enabled: true,
        voiceAvailable: true,
        questions: ASSISTANT_QUESTIONS,
        dailyLimit: 20
      });
    if (endpoint === '/assistant/session' || endpoint.startsWith('/assistant/conversations/')) {
      if (endpoint.endsWith('/messages')) {
        const input = request.postDataJSON();
        if (input.text === 'Please show a retry error' && !failedOnce) {
          failedOnce = true;
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ message: failureMessage })
          });
        }
        messages.push({
          id: `reply-${messages.length}`,
          requestId: input.requestId,
          text: input.text,
          source: 'text',
          status: 'completed',
          createdAt: Date.now(),
          response: { answer: longAnswer, packages: [], estimates: [], needsAdmin: false }
        });
      }
      return reply(snapshot());
    }
    if (endpoint === '/me') return reply(user);
    if (endpoint === '/changes') return reply({ stamp: 1 });
    if (endpoint === '/calendar') return reply({ capacity: 2, blocked: [], booked: {}, events: [] });
    if (endpoint === '/catalog')
      return reply({
        packages: [],
        addons: [],
        dishes: [],
        rentals: [],
        pricePerPlate: 600,
        minDownpayment: 3000,
        sixHourFee: 5000
      });
    if (endpoint.startsWith('/catalog/') || endpoint === '/auth/payment-details') return reply({});
    if (endpoint.startsWith('/appearance/')) return reply({ version: null });
    return reply([]);
  });
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const failures = [];
try {
  for (const [label, viewport, mode, planningStarted] of [
    ['desktop', { width: 1440, height: 900 }, 'light'],
    ['short-laptop', { width: 1366, height: 768 }, 'light'],
    ['tablet', { width: 768, height: 1024 }, 'light'],
    ['phone', { width: 390, height: 844 }, 'light'],
    ['small-phone', { width: 320, height: 568 }, 'light'],
    ['dark', { width: 1440, height: 900 }, 'dark'],
    ['planning-desktop', { width: 1440, height: 900 }, 'light', true],
    ['planning-phone', { width: 390, height: 844 }, 'light', true],
    ['planning-dark', { width: 1440, height: 900 }, 'dark', true]
  ]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    await fixture(context, mode, planningStarted);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const check = (condition, message) => {
      if (!condition) failures.push(`${label}: ${message}`);
    };
    await page.goto(`${base}/portal/assistant`, { waitUntil: 'networkidle' });
    await page
      .getByText('20 questions remaining today', { exact: true })
      .waitFor({ timeout: 10000 })
      .catch(async (error) => {
        await page.screenshot({ path: path.join(output, `${label}-load-error.png`) });
        throw new Error(
          `${error.message}\n${errors.join('\n')}\n${(await page.locator('body').innerText()).slice(0, 2000)}`
        );
      });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(output, `${label}-welcome.png`) });
    const details = page.getByRole('button', { name: /Event details/ });
    check((await details.count()) === 1, 'event details are available on demand');
    check(
      (await page.locator('[data-assistant-summary]').count()) === 0,
      'closed event summary leaves the conversation full width'
    );
    await page
      .getByLabel('Your question', { exact: true })
      .fill('Help me plan a birthday for 100 guests. Please include all the details.');
    await page.getByRole('button', { name: 'Send question', exact: true }).click();
    await page.getByText('19 questions remaining today', { exact: true }).waitFor();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const answer = page.locator('.tm-assistant-message--reply');
    const metrics = await answer.evaluate((el) => {
      const body = el.querySelector('.tm-assistant-answer p') || el.querySelector('.MuiTypography-body2');
      const thread = el.closest('[data-assistant-thread]');
      return {
        font: parseFloat(getComputedStyle(body).fontSize),
        line: parseFloat(getComputedStyle(body).lineHeight),
        top: el.getBoundingClientRect().top,
        threadOverflow: getComputedStyle(thread).overflowY,
        clipped: el.scrollHeight > el.clientHeight + 1
      };
    });
    check(metrics.font >= 16, `reply text is at least 16px (received ${metrics.font})`);
    check(metrics.line / metrics.font >= 1.7, 'reply lines have comfortable spacing');
    check(
      metrics.top >= 65 && metrics.top < viewport.height * 0.65,
      `new long replies open at their beginning (${metrics.top}px)`
    );
    check(metrics.threadOverflow === 'visible', 'long replies use normal page scrolling');
    check(!metrics.clipped, 'the reply itself does not clip any text');
    check(
      !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)),
      'no horizontal page overflow'
    );
    await page.screenshot({ path: path.join(output, `${label}-reply.png`) });
    const lastLine = page.getByText('End of your planning guide.', { exact: false });
    await lastLine.scrollIntoViewIfNeeded();
    check(await lastLine.isVisible(), 'the final paragraph of a long answer remains accessible');
    await page.getByLabel('Your question', { exact: true }).fill('One more question\nwith a second line');
    const sendBox = await page.getByRole('button', { name: 'Send question', exact: true }).boundingBox();
    const bottomNav = await page.locator('nav[aria-label="Quick navigation"]').boundingBox();
    check(sendBox.y + sendBox.height <= (bottomNav?.y ?? viewport.height), 'the composer clears the mobile navigation');
    await page.getByRole('button', { name: 'Send question', exact: true }).click();
    await page.getByText('18 questions remaining today', { exact: true }).waitFor();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const nextReply = await page.locator('.tm-assistant-message--reply').last().boundingBox();
    check(
      nextReply.y >= 65 && nextReply.y < viewport.height * 0.65,
      `the next long reply also opens at its beginning (${nextReply.y}px)`
    );
    if (await details.count()) {
      await details.click();
      await page.getByRole('dialog', { name: 'Your event details' }).waitFor();
      check(await page.locator('[data-assistant-summary]').isVisible(), 'saved event details are readable when opened');
      await page.getByRole('button', { name: 'Close event details', exact: true }).click();
      await page.getByRole('dialog', { name: 'Your event details' }).waitFor({ state: 'hidden' });
      await details.click();
      await page.getByRole('dialog', { name: 'Your event details' }).waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('dialog', { name: 'Your event details' }).waitFor({ state: 'hidden' });
      check(
        await details.evaluate((el) => el === document.activeElement),
        'closing event details restores keyboard focus'
      );
    }
    if (planningStarted) {
      await page.getByRole('button', { name: 'Review saved details', exact: true }).click();
      const review = page.locator('.tm-assistant-review-summary').last();
      const contrast = await review.evaluate((el) => {
        const luminance = (color) =>
          color
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number)
            .map((v) => {
              const channel = v / 255;
              return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
            })
            .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
        const bg = luminance(getComputedStyle(el).backgroundColor);
        const text = luminance(getComputedStyle(el.querySelector('p')).color);
        return (Math.max(bg, text) + 0.05) / (Math.min(bg, text) + 0.05);
      });
      check(contrast >= 4.5, `guided review text remains readable in ${mode} mode (${contrast.toFixed(2)}:1)`);
    }
    await page
      .locator('.tm-assistant-message--reply')
      .last()
      .evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await page.getByLabel('Your question', { exact: true }).fill('Please show a retry error');
    await page.getByRole('button', { name: 'Send question', exact: true }).click();
    const failure = page.getByRole('alert').filter({ hasText: failureMessage });
    await failure.waitFor();
    const failureBox = await failure.boundingBox();
    check(
      failureBox.y >= 65 && failureBox.y + failureBox.height <= (bottomNav?.y ?? viewport.height),
      'a failed-send message is visible beside the input'
    );
    check(
      (await page.getByLabel('Your question', { exact: true }).inputValue()) === 'Please show a retry error',
      'a failed send preserves the question for retry'
    );
    await page.getByRole('button', { name: 'Send question', exact: true }).click();
    await page.getByText('17 questions remaining today', { exact: true }).waitFor();
    check((await failure.count()) === 0, 'retry clears the error and receives an answer');
    check(errors.length === 0, `no browser errors: ${errors.join('; ')}`);
    console.log(`${label}: checked long replies, text size, scrolling, composer, summary and overflow`);
    await context.close();
  }
  assert.deepEqual(failures, [], failures.join('\n'));
  console.log(`Assistant readability checks passed. Screenshots: ${output}`);
} finally {
  await browser.close();
}
