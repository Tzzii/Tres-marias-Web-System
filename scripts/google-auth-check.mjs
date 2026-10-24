/** Google customer flows against a local server. SDK, API and email responses are isolated fixtures. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TERMS_VERSION } from '../packages/shared/src/legal/terms.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base = process.env.UI_CLIENT_URL || 'http://localhost:5173';
const output = path.resolve(process.env.UI_OUTPUT_DIR || 'tmp/google-auth-ui');
const clientEnv = await fs.readFile(new URL('../apps/client/.env.local', import.meta.url), 'utf8').catch(() => '');
const clientId = process.env.GOOGLE_UI_CLIENT_ID || clientEnv.match(/^VITE_GOOGLE_CLIENT_ID=(.+)$/m)?.[1].trim();
assert.ok(clientId, 'Set VITE_GOOGLE_CLIENT_ID in apps/client/.env.local or GOOGLE_UI_CLIENT_ID for this check');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const fixtureUser = {
  id: 'fixture-customer',
  name: 'Maria Santos',
  firstName: 'Maria',
  middleName: '',
  lastName: 'Santos',
  email: 'maria@gmail.com',
  mobile: '09171234567',
  company: '',
  role: 'customer',
  hasPassword: false,
  termsVersion: TERMS_VERSION,
  createdAt: Date.now()
};
const token = `fixture.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fixture`;
const session = { token, user: fixtureUser };
const sdk = `window.google={accounts:{id:{initialize(options){window.googleFixtureOptions=options},renderButton(parent){
 const button=document.createElement('button');button.type='button';button.textContent='Continue with Google';
 button.style.cssText='display:block;margin:auto;width:100%;height:44px;background:white;border:1px solid #dadce0;border-radius:4px;font:500 14px Arial';
 button.onclick=()=>window.googleFixtureOptions.callback({credential:'fixture-google-token'});parent.appendChild(button)
}}}};`;

async function scenario(name, viewport, reply, run, { failedSdk = false } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const writes = [];
  const errors = [];
  let scripts = 0;
  page.on('pageerror', (err) => errors.push(err.message));
  await page.route('https://accounts.google.com/gsi/client', (route) => {
    scripts++;
    return failedSdk && scripts === 1
      ? route.abort()
      : route.fulfill({ contentType: 'application/javascript', body: sdk });
  });
  await page.routeWebSocket('**/api/realtime/**', (socket) => socket.close());
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (request.method() === 'OPTIONS') return json({});
    if (request.method() !== 'GET') {
      const body = request.postDataJSON();
      writes.push({ path: url.pathname, body });
      const result = await reply(url.pathname, body, writes);
      return json(result.body ?? result, Number.isInteger(result.status) ? result.status : 200);
    }
    if (url.pathname.endsWith('/auth/customer/google/config'))
      return json({ clientId, nonce: 'fixture-nonce', challenge: 'fixture-challenge' });
    if (url.pathname.endsWith('/me')) return json(fixtureUser);
    if (url.pathname.endsWith('/catalog'))
      return json({ packages: [], addons: [], dishes: [], categories: [], minDownpayment: 3000 });
    if (url.pathname.endsWith('/changes')) return json({ version: 0 });
    return json([]);
  });
  try {
    await page.goto(`${base}/login?next=/portal/book`);
    await page.getByRole('heading', { name: 'Log In', exact: true }).waitFor();
    await run({ page, writes, scripts: () => scripts });
    assert.deepEqual(errors, [], 'no unhandled application errors');
    assert.equal(
      writes.filter((entry) => entry.path.endsWith('/customer/login')).length,
      0,
      'Google dialogs never submit the surrounding password form'
    );
    const saved = await page.evaluate(() => ({ local: { ...localStorage }, tab: { ...sessionStorage } }));
    assert.ok(
      !JSON.stringify(saved).includes('fixture-google-token'),
      'Google credential never persists in browser storage'
    );
    results.push({ name, result: 'passed' });
  } finally {
    await context.close();
  }
}

try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 }
  ]) {
    await scenario(
      `new-customer-${viewport.width}`,
      viewport,
      (url, body, writes) => {
        assert.ok(url.endsWith('/customer/google'));
        assert.equal(body.challenge, 'fixture-challenge');
        if (writes.length === 1) return { status: 'profile_required', profile: fixtureUser };
        assert.equal(body.profile.mobile, '09171234567');
        assert.equal(body.profile.agreeTerms, true);
        assert.equal(body.profile.termsVersion, TERMS_VERSION);
        return session;
      },
      async ({ page, writes }) => {
        await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('heading', { name: 'Complete your account' }).waitFor();
        assert.equal(writes.length, 1);
        await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
        assert.equal(writes.length, 1, 'missing mobile is caught before registration');
        await page.locator('#google-mobile').fill('09171234567');
        await page.locator('#google-agree').check();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(output, `profile-${viewport.width}.png`), fullPage: true });
        await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
        await page.waitForURL((url) => url.pathname === '/portal/book');
        const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('tm.client.session')));
        assert.equal(saved.user.id, fixtureUser.id);
        await page.goto(`${base}/portal/profile`);
        await page.getByRole('button', { name: 'Set a password', exact: true }).waitFor();
      }
    );
  }
  await scenario(
    'existing-customer-link-and-remember',
    { width: 1366, height: 900 },
    (url, body, writes) => {
      if (writes.length === 1) return { status: 'link_required', email: fixtureUser.email };
      if (body.password !== 'correct-password')
        return {
          status: 401,
          body: {
            code: 'INVALID_CREDENTIALS',
            message: 'The existing account password is incorrect.',
            meta: { field: 'password' }
          }
        };
      assert.equal(body.remember, true);
      return { ...session, user: { ...fixtureUser, hasPassword: true } };
    },
    async ({ page }) => {
      await page.getByRole('checkbox', { name: 'Remember me' }).check();
      await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
      await page.locator('#google-link-password').fill('wrong-password');
      await page.getByRole('button', { name: 'Connect and sign in' }).click();
      await page.getByText('The existing account password is incorrect.', { exact: true }).waitFor();
      await page.locator('#google-link-password').fill('correct-password');
      await page.getByRole('button', { name: 'Connect and sign in' }).click();
      await page.waitForURL((url) => url.pathname === '/portal/book');
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tm.client.session')));
      assert.equal(saved.user.id, fixtureUser.id);
    }
  );
  await scenario(
    'route-switch-sdk-retry-and-email-fallback',
    { width: 390, height: 844 },
    () => {
      throw new Error('No writes expected');
    },
    async ({ page, scripts }) => {
      await page.getByRole('button', { name: 'Try again', exact: true }).click();
      await page.getByRole('button', { name: 'Continue with Google', exact: true }).waitFor();
      const afterRetry = scripts();
      await page.locator('form').getByRole('link', { name: 'Sign up', exact: true }).click();
      await page.waitForURL('**/signup?continue=booking');
      await page.getByRole('button', { name: 'Continue with Google', exact: true }).waitFor();
      assert.equal(scripts(), afterRetry, 'route switches reuse the SDK');
      await page.getByRole('button', { name: 'Create an account', exact: true }).click();
      assert.equal(await page.locator('#signup-firstName').getAttribute('aria-invalid'), 'true');
      await page.screenshot({ path: path.join(output, 'signup-mobile.png'), fullPage: true });
    },
    { failedSdk: true }
  );
  await scenario(
    'third-party-email-code-keeps-remember-me',
    { width: 1366, height: 900 },
    (url, body, writes) => {
      if (url.endsWith('/register/email-fixture/verify')) {
        assert.equal(body.code, '123456');
        assert.equal(body.remember, true);
        return session;
      }
      if (writes.length === 1)
        return { status: 'profile_required', profile: { ...fixtureUser, email: 'maria@third-party.example' } };
      return {
        status: 'email_required',
        challengeId: 'email-fixture',
        maskedEmail: 'm***@third-party.example',
        expiresAt: Date.now() + 300000,
        resendAt: Date.now() + 60000
      };
    },
    async ({ page }) => {
      await page.getByRole('checkbox', { name: 'Remember me' }).check();
      await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
      await page.locator('#google-mobile').fill('09171234567');
      await page.locator('#google-agree').check();
      await page.getByRole('button', { name: 'Create account', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('heading', { name: 'Confirm Your Email' }).waitFor();
      await dialog.locator('input').first().focus();
      await page.keyboard.type('123456');
      await page.waitForURL((url) => url.pathname === '/portal/book');
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tm.client.session')));
      assert.equal(saved.user.id, fixtureUser.id);
    }
  );
  console.log(JSON.stringify({ results, output }, null, 2));
} finally {
  await browser.close();
}
