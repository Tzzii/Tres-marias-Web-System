/** Customer OTP regression checks against a running client. API responses and sessions are isolated fixtures. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { TERMS_VERSION } from '../packages/shared/src/legal/terms.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const clientUrl = process.env.UI_CLIENT_URL || 'http://localhost:5173';
const output = process.env.UI_OUTPUT_DIR || path.join(os.tmpdir(), 'tres-marias-customer-code-review');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const results = [];
const customer = {
  id: 'otp-customer-fixture',
  firstName: 'Maria',
  lastName: 'Santos',
  name: 'Maria Santos',
  email: 'preview@example.test',
  mobile: '09171234567',
  company: '',
  termsVersion: TERMS_VERSION
};
await fs.mkdir(output, { recursive: true });

async function fixture(scenario) {
  const context = await browser.newContext({
    viewport: { width: scenario.width || 1440, height: 1000 },
    reducedMotion: scenario.reduced ? 'reduce' : 'no-preference'
  });
  const profile = scenario.flow.startsWith('change-');
  await context.addInitScript(
    ({ customer, profile }) => {
      localStorage.setItem('tm.colorMode', 'light');
      if (profile)
        sessionStorage.setItem(
          'tm.client.session',
          JSON.stringify({ token: 'isolated-customer-fixture', user: customer, lastActivity: Date.now() })
        );
    },
    { customer, profile }
  );
  let checks = 0;
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname.replace(/^\/api/, '');
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*'
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    let json = [];
    let status = 200;
    const challenge = {
      challengeId: 'customer-code-fixture',
      maskedEmail: 'pr•••@example.test',
      expiresAt: Date.now() + 120000,
      resendAt: Date.now() - 1000
    };
    if (request.method() === 'POST') {
      if (endpoint.endsWith('/verify') || endpoint.endsWith('/confirm')) {
        checks++;
        const { code } = request.postDataJSON();
        if (code === '111111') {
          status = 401;
          json = { code: 'INVALID_CODE', message: 'Incorrect code.', meta: { remaining: 4 } };
        } else if (code === '222222') {
          status = 503;
          json = { code: 'SERVER_ERROR', message: 'Please try again shortly.' };
        } else if (code === '333333') {
          status = 400;
          json = { code: 'CHALLENGE_EXPIRED', message: 'This request expired. Please start again.' };
        } else if (code === '444444') {
          status = 423;
          json = { code: 'LOCKED', message: 'Code entry paused.', meta: { lockedUntil: Date.now() + 300000 } };
        } else {
          assert.equal(code, '246810', 'verification sends the entered code');
          json = endpoint.includes('/register/')
            ? { token: 'isolated-created-customer', user: customer }
            : endpoint.includes('/email/')
              ? { ...customer, email: 'new@example.test' }
              : { ok: true, token: endpoint.includes('/me/password/') ? 'isolated-renewed-customer' : undefined };
        }
      } else if (endpoint.endsWith('/complete')) json = { ok: true, email: customer.email };
      else if (
        ['/auth/customer/register', '/auth/customer/password-reset', '/me/email', '/me/password'].includes(endpoint) ||
        endpoint.endsWith('/resend')
      )
        json = challenge;
      else throw new Error(`Unexpected write: ${endpoint}`);
    } else if (endpoint === '/me') json = customer;
    else if (endpoint === '/catalog')
      json = { packages: [], addons: [], dishes: [], rentals: [], minDownpayment: 3000, pricePerPlate: 150 };
    else if (endpoint === '/calendar') json = { capacity: 5, blocked: [], booked: {}, events: [] };
    else if (endpoint === '/appearance') json = {};
    else if (endpoint === '/changes') json = { version: 1 };
    else if (endpoint === '/catalog/min-downpayment') json = { minDownpayment: 3000 };
    else if (endpoint === '/catalog/price-per-plate') json = { pricePerPlate: 150 };
    await route.fulfill({ json, status, headers });
  });
  await context.routeWebSocket('**', (socket) => socket.close());
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.on('pageerror', (error) => errors.push(`${scenario.flow}: ${error.message}`));
  await page.goto(
    `${clientUrl}${profile ? '/portal/settings?tab=account' : scenario.flow === 'signup' ? '/signup' : '/login'}`
  );
  if (scenario.flow === 'password-reset') {
    await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
    await page.locator('#forgot-email').fill(customer.email);
    await page.getByRole('dialog').getByRole('button', { name: 'Proceed', exact: true }).click();
  } else if (scenario.flow === 'signup') {
    for (const [field, value] of Object.entries({
      firstName: 'Maria',
      lastName: 'Santos',
      email: customer.email,
      mobile: '09171234567',
      password: 'Fixture-password-123!',
      confirm: 'Fixture-password-123!'
    })) {
      await page.locator(`#signup-${field}`).fill(value);
    }
    await page.locator('#signup-agree').check();
    await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  } else if (scenario.flow === 'change-email') {
    await page.getByRole('button', { name: 'Change', exact: true }).click();
    await page.locator('#new-email').fill('new@example.test');
    await page.locator('#email-current-password').fill('Fixture-password-123!');
    await page.getByRole('dialog').getByRole('button', { name: 'Send code', exact: true }).click();
  } else {
    await page.locator('#pw-current').fill('Fixture-password-123!');
    await page.locator('#pw-next').fill('New-fixture-password-123!');
    await page.locator('#pw-confirm').fill('New-fixture-password-123!');
    await page.getByRole('button', { name: 'Update password', exact: true }).click();
  }
  await page.getByRole('textbox', { name: 'Digit 1', exact: true }).waitFor();
  return { context, page, count: () => checks };
}

async function enter(page, code) {
  await page.getByRole('textbox', { name: 'Digit 1', exact: true }).fill(code);
}

try {
  const scenarios = [
    { flow: 'password-reset' },
    { flow: 'signup' },
    { flow: 'change-email' },
    { flow: 'change-password' },
    { flow: 'password-reset', width: 320 },
    { flow: 'change-email', width: 390 },
    { flow: 'signup', width: 390, reduced: true }
  ].filter((scenario) => !process.env.UI_CODE_FLOW || scenario.flow === process.env.UI_CODE_FLOW);
  for (const scenario of scenarios) {
    const { context, page, count } = await fixture(scenario);
    const stage = page.locator('.tm-code-verification');
    await enter(page, '111111');
    await page.getByText('That code is incorrect. 4 attempts left.').waitFor();
    if (!scenario.reduced) {
      await page.locator('.tm-code-verification[data-state="error"]').waitFor();
      assert.equal(await stage.locator('.tm-code-glass').count(), 6, 'wrong codes shatter all six boxes');
      const fit = await stage.evaluate((root) => {
        const row = root.getBoundingClientRect();
        const effect = root.querySelector('.tm-code-breakup').getBoundingClientRect();
        const scrollbars = [];
        for (let el = root.parentElement; el; el = el.parentElement) {
          if (/auto|scroll/.test(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 1)
            scrollbars.push(el.tagName);
        }
        return { left: effect.left - row.left, right: effect.right - row.right, scrollbars };
      });
      assert.ok(fit.left >= -1 && fit.right <= 1, 'glass effect stays within the OTP row width');
      assert.deepEqual(fit.scrollbars, [], 'glass effect does not create a horizontal scrollbar');
      assert.equal(await stage.locator('input').first().isDisabled(), true, 'input stays disabled during shatter');
    }
    await page.locator('.tm-code-verification[data-state="idle"]').waitFor();
    const first = stage.locator('input').first();
    assert.equal(await first.inputValue(), '');
    assert.equal(
      await first.evaluate((el) => document.activeElement === el),
      true,
      'retry returns focus to the first digit'
    );
    if (scenario.flow === 'password-reset' && !scenario.width) {
      await enter(page, '222222');
      await page.getByText('Please try again shortly.').waitFor();
      assert.equal(await first.inputValue(), '2', 'server failures preserve the entered code');
      assert.equal(await stage.locator('.tm-code-shard').count(), 0);
    }
    await enter(page, '246810');
    await page.locator('.tm-code-verification[data-state="success"]').waitFor();
    assert.equal(await first.isDisabled(), true);
    assert.equal(
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).isDisabled(),
      true
    );
    if (scenario.flow === 'signup')
      assert.equal(
        await page.evaluate(() => sessionStorage.getItem('tm.client.session')),
        null,
        'sign-up waits for the animation before entering the portal'
      );
    if (scenario.flow === 'password-reset')
      assert.equal(await page.locator('#reset-password').count(), 0, 'password step waits for the animation');
    if (!scenario.reduced) {
      assert.equal(
        await first.evaluate((el) => getComputedStyle(el).animationName),
        'tmCodeGather',
        'animation works inside the static customer portal too'
      );
      await page.locator('.tm-code-verification[data-loading="true"]').waitFor();
      const radii = await stage.evaluate((root) => {
        const rect = root.getBoundingClientRect();
        return [...root.querySelectorAll('input')].map((input) => {
          const box = input.getBoundingClientRect();
          return Math.hypot(
            box.x + box.width / 2 - rect.x - rect.width / 2,
            box.y + box.height / 2 - rect.y - rect.height / 2
          );
        });
      });
      assert.ok(
        radii.every((radius) => Math.abs(radius - 58) < 2),
        'all boxes form the circle around the check'
      );
      assert.equal(
        await stage.locator('.tm-code-loading-ring').evaluate((el) => getComputedStyle(el).animationName),
        'tmCodeSpin'
      );
      if (!scenario.width)
        await page.getByRole('dialog').screenshot({ path: path.join(output, `${scenario.flow}-success.png`) });
    } else assert.equal(await first.evaluate((el) => getComputedStyle(el).animationName), 'none');
    assert.equal(
      count(),
      scenario.flow === 'password-reset' && !scenario.width ? 3 : 2,
      'one request is sent per verification'
    );
    if (scenario.flow === 'signup') {
      await page.waitForURL(`${clientUrl}/portal`);
      assert.equal(
        await page.evaluate(() => JSON.parse(sessionStorage.getItem('tm.client.session')).user.id),
        customer.id
      );
    } else if (scenario.flow === 'password-reset') {
      await page.locator('#reset-password').waitFor();
      await page.locator('#reset-password').fill('New-fixture-password-123!');
      await page.locator('#reset-confirm').fill('New-fixture-password-123!');
      await page.getByRole('button', { name: 'Save password', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.getByText('Password changed. Log in with your new password.').waitFor();
    } else {
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      if (scenario.flow === 'change-email')
        assert.equal(await page.locator('#profile-email').inputValue(), 'new@example.test');
      else assert.equal(await page.locator('#pw-current').inputValue(), '');
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    results.push({ ...scenario, passed: true });
    console.log(`Passed: ${scenario.flow}, ${scenario.width || 1440}px${scenario.reduced ? ', reduced motion' : ''}`);
    await context.close();
  }
  assert.deepEqual(errors, [], 'no browser runtime errors');
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ results, errors }, null, 2));
} finally {
  await browser.close();
}
