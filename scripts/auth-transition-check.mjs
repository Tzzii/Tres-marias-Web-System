/** Auth transition checks against a running client; all API traffic uses isolated fixtures. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const clientUrl = process.env.UI_CLIENT_URL || 'http://localhost:5173';
const output = process.env.UI_OUTPUT_DIR || path.join(os.tmpdir(), 'tres-marias-auth-review');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const errors = [];
const writes = [];

async function settle(page) {
  await page.waitForFunction(() => {
    const root = document.querySelector('.tm-auth-layout');
    return root?.dataset.authSwitching === 'false' && root.dataset.authDisplayed === root.dataset.authMode;
  });
  await page.locator('.tm-auth-layout').evaluate(async (root) => {
    await Promise.allSettled(root.getAnimations({ subtree: true }).map((animation) => animation.finished));
  });
}

async function verifyLayout(page, signup, desktop) {
  await settle(page);
  const geometry = await page.locator('.tm-auth-layout').evaluate((root) => {
    const brand = root.querySelector('.tm-auth-brand-panel[aria-hidden="false"]');
    const form = root.querySelector('.tm-auth-form-panel');
    const cover = root.querySelector('.tm-auth-cover');
    return {
      brandX: brand.getBoundingClientRect().x,
      formX: form.getBoundingClientRect().x,
      coverLeft: cover.getBoundingClientRect().left,
      coverRight: cover.getBoundingClientRect().right,
      width: root.clientWidth,
      selector: Boolean(root.querySelector('nav[aria-label="Account access"]')),
      overflow: document.documentElement.scrollWidth > innerWidth,
      forms: root.querySelectorAll('form').length,
      focus: document.activeElement.tagName,
      opacity: getComputedStyle(root.querySelector('.tm-auth-form-content')).opacity
    };
  });
  assert.equal(geometry.overflow, false, 'no horizontal overflow');
  assert.equal(geometry.forms, 1, 'only the current form is mounted');
  assert.equal(geometry.selector, false, 'the removed Login/Sign up selector stays absent');
  assert.equal(geometry.opacity, '1', 'incoming form is fully visible');
  assert.ok(
    desktop ? (signup ? geometry.formX < geometry.brandX : geometry.formX > geometry.brandX) : geometry.formX === 0
  );
  if (desktop) {
    assert.ok(Math.abs((signup ? geometry.coverLeft : geometry.coverRight) - geometry.width / 2) < 1);
  }
  return geometry;
}

try {
  for (const scenario of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'small-desktop', width: 900, height: 700 },
    { name: 'mobile', width: 390, height: 844 },
    { name: 'desktop-reduced-motion', width: 1440, height: 900, reduced: true },
    { name: 'mobile-reduced-motion', width: 390, height: 844, reduced: true }
  ]) {
    const desktop = scenario.width >= 900;
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
      reducedMotion: scenario.reduced ? 'reduce' : 'no-preference'
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`${scenario.name}: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error')
        errors.push(`${scenario.name}: ${message.text()}`);
    });
    await page.route('**/api/**', (route) => {
      if (route.request().method() !== 'GET') writes.push(route.request().url());
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ packages: [], addons: [], dishes: [], minDownpayment: 3000 })
      });
    });
    await page.goto(`${clientUrl}/login?next=/portal/book`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await verifyLayout(page, false, desktop);
    await page.locator('#login-email').fill('preview@example.test');
    const brand = page.locator('.tm-auth-brand-panel[aria-hidden="false"]');
    await (desktop ? brand : page.locator('form')).getByRole('link', { name: 'Sign up', exact: true }).click();
    await page.waitForURL('**/signup?continue=booking');
    if (desktop && !scenario.reduced) {
      assert.equal(
        await page.locator('#login-email').inputValue(),
        'preview@example.test',
        'outgoing form survives until covered'
      );
      assert.equal(await page.locator('main').getAttribute('inert'), '', 'covered form cannot receive interaction');
      assert.equal(
        await page.locator('form').getByText("Welcome back. Let's continue your reservation.").count(),
        1,
        'outgoing route retains its booking context'
      );
    }
    const signup = await verifyLayout(page, true, desktop);
    assert.equal(signup.focus, 'H1', 'route change focuses the new heading');
    await page.screenshot({ path: path.join(output, `${scenario.name}-signup.png`), fullPage: true });

    // Switch from the bottom of the long form, using the existing inline link.
    await page.locator('form').getByRole('link', { name: 'Log in', exact: true }).click();
    await page.waitForURL('**/login?next=/portal/book');
    await verifyLayout(page, false, desktop);
    assert.equal(await page.evaluate(() => window.scrollY), 0, 'mobile document scroll resets immediately');
    assert.equal(await page.locator('.tm-auth-form-panel').evaluate((node) => node.scrollTop), 0);

    await page.locator('form').getByRole('link', { name: 'Sign up', exact: true }).click();
    await page.waitForURL('**/signup?continue=booking');
    await verifyLayout(page, true, desktop);
    // Reverse navigation before the route-swap timer fires; no stale timer may win afterwards.
    await page.goBack();
    await page.waitForTimeout(65);
    await page.goForward();
    await page.waitForTimeout(65);
    await page.goBack();
    await verifyLayout(page, false, desktop);
    await page.goForward();
    await verifyLayout(page, true, desktop);

    // Existing validation must still work after the interrupted route changes.
    await page.locator('form').getByRole('button', { name: 'Create an account', exact: true }).click();
    assert.equal(await page.locator('#signup-firstName').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('#signup-firstName').evaluate((node) => node === document.activeElement), true);
    if (scenario.reduced) {
      assert.equal(
        await page
          .locator('.tm-auth-layout')
          .evaluate(
            (root) =>
              root.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length
          ),
        0,
        'reduced motion skips panel and content animations'
      );
    }
    // A direct URL load starts on the correct side without a cover sweep from the other route.
    await page.goto(`${clientUrl}/signup?continue=booking`);
    await verifyLayout(page, true, desktop);
    results.push({ scenario: scenario.name, result: 'passed' });
    await context.close();
  }
  assert.deepEqual(errors, [], 'no browser runtime errors');
  assert.deepEqual(writes, [], 'checks never submit an auth request');
  console.log(JSON.stringify({ results, errors, writes, screenshots: output }, null, 2));
} finally {
  await browser.close();
}
