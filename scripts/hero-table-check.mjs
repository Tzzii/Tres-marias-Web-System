/** Browser regression for the public hero. Isolated read-only fixtures; no database writes. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildBusinessSeed } from '../apps/api/src/seedData/seed.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const url = process.env.UI_CLIENT_URL || 'http://localhost:5173';
const output = process.env.UI_OUTPUT_DIR || path.resolve('tmp/hero-table-review');
await fs.mkdir(output, { recursive: true });
const seed = buildBusinessSeed();
const errors = [],
  writes = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });

async function fixture(viewport, { reducedMotion = 'no-preference', noWebGL = false } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion, deviceScaleFactor: 1 });
  await context.addInitScript(
    ({ noWebGL }) => {
      localStorage.setItem('tm.colorMode', 'light');
      if (noWebGL) {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          return String(type).includes('webgl') ? null : original.call(this, type, ...args);
        };
      }
    },
    { noWebGL }
  );
  await context.route('**/api/**', (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
      });
    if (request.method() !== 'GET') {
      writes.push(request.method() + ' ' + request.url());
      return route.abort();
    }
    const endpoint = new URL(request.url()).pathname.replace(/^\/api/, '');
    let body = [];
    if (endpoint === '/packages') body = seed.packages.map((pkg) => ({ ...pkg, visible: true, archived: false }));
    if (endpoint === '/catalog/pricing') body = seed.settings;
    if (endpoint === '/catalog/min-downpayment') body = { minDownpayment: seed.settings.minDownpayment };
    if (endpoint === '/catalog/price-per-plate') body = { pricePerPlate: seed.settings.pricePerPlate };
    if (endpoint === '/changes') body = { version: 1 };
    if (endpoint === '/appearance') body = {};
    if (endpoint === '/calendar') body = { capacity: 5, blocked: [], booked: {}, events: [] };
    return route.fulfill({ json: body, headers: { 'access-control-allow-origin': '*' } });
  });
  await context.routeWebSocket('**', (socket) => socket.close());
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('h1').waitFor();
  return { context, page };
}

async function progress(page, amount) {
  await page.evaluate((amount) => {
    const desktop = matchMedia('(min-width:900px) and (min-height:680px)').matches;
    const track = document.querySelector(desktop ? '[data-hero-scroll]' : '[data-hero-table-track]');
    const panel = document.querySelector(desktop ? '[data-hero-panel]' : '[data-hero-table-viewport]');
    const header = document.querySelector('.MuiAppBar-root').getBoundingClientRect().height;
    const top = window.scrollY + track.getBoundingClientRect().top;
    window.scrollTo({
      top: top - header - (desktop ? 0 : 12) + (track.offsetHeight - panel.offsetHeight) * amount,
      behavior: 'instant'
    });
  }, amount);
  await page.waitForFunction(
    (amount) => Math.abs(Number(document.querySelector('[data-hero-table-track]').dataset.progress) - amount) < 0.02,
    amount
  );
}

async function noOverflow(page) {
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    'No horizontal page overflow'
  );
}

try {
  for (const [label, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['laptop', { width: 1280, height: 720 }],
    ['phone', { width: 390, height: 844 }],
    ['narrow', { width: 320, height: 740 }],
    ['tablet', { width: 768, height: 1024 }]
  ]) {
    const { page, context } = await fixture(viewport);
    const figure = page.locator('[data-hero-table-track]');
    await page.waitForSelector('[data-table-state="ready"]');
    assert.equal(await figure.locator('canvas').count(), 1);
    assert.equal(await page.locator('.tm-hero-photo-layer').count(), 0);
    assert.equal((await page.locator('h1').innerText()).replace(/\s+/g, ' '), 'Celebrations Worth Savouring');
    await noOverflow(page);
    if (label === 'desktop') await page.screenshot({ path: path.join(output, 'desktop-start.png') });
    await progress(page, 0.5);
    assert.match(await figure.locator('figcaption').innerText(), /Bring in the details/);
    await progress(page, 0.96);
    assert.match(await figure.locator('figcaption').innerText(), /Let the celebration begin/);
    const pinned = await page
      .locator(viewport.width >= 900 ? '[data-hero-panel]' : '[data-hero-table-viewport]')
      .evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          position: getComputedStyle(element).position,
          top: rect.top,
          bottom: rect.bottom,
          viewportHeight: innerHeight
        };
      });
    assert.equal(pinned.position, 'sticky', label + ' pins the intended surface');
    assert.ok(pinned.top >= 70 && pinned.bottom <= pinned.viewportHeight + 2, label + ' scene fits in the viewport');
    await page.screenshot({ path: path.join(output, `${label}-complete.png`) });
    await progress(page, 0.1);
    assert.match(await figure.locator('figcaption').innerText(), /Set the scene/);
    await noOverflow(page);
    console.log(`PASS ${label}: assembles, reverses, fits and preserves headline`);
    if (label === 'desktop') {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.locator('[data-hero-scroll]').getByRole('button', { name: 'See our packages', exact: true }).click();
      await page.waitForFunction(
        () => Math.abs(document.getElementById('packages').getBoundingClientRect().top - 100) < 8
      );
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.locator('[data-hero-scroll]').getByRole('button', { name: 'Check availability', exact: true }).click();
      await page.waitForFunction(
        () => Math.abs(document.getElementById('availability').getBoundingClientRect().top - 100) < 8
      );
      console.log('PASS hero buttons reach packages and availability');
      await page.goto(url + '/login', { waitUntil: 'networkidle' });
      assert.equal(await page.locator('[data-hero-table-track] canvas').count(), 0);
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-table-state="ready"]');
      assert.equal(await page.locator('[data-hero-table-track] canvas').count(), 1);
      await page
        .locator('[data-hero-table-track] canvas')
        .evaluate((canvas) => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
      await page.waitForSelector('[data-table-state="static"]');
      assert.equal(await page.locator('[data-hero-table-track] canvas').count(), 0);
      assert.equal(
        await figure
          .locator('img')
          .evaluate((img) => img.complete && img.naturalWidth > 0 && getComputedStyle(img).opacity === '1'),
        true
      );
      console.log('PASS navigation cleanup and lost-context image fallback');
    }
    await context.close();
  }
  for (const [label, options] of [
    ['reduced', { reducedMotion: 'reduce' }],
    ['no-webgl', { noWebGL: true }]
  ]) {
    const { page, context } = await fixture({ width: 1440, height: 900 }, options);
    await page.waitForSelector('[data-table-state="static"]');
    assert.equal(await page.locator('[data-hero-table-track] canvas').count(), 0);
    assert.equal(
      await page.locator('[data-hero-table-track] img').evaluate((img) => img.complete && img.naturalWidth > 0),
      true
    );
    assert.equal(
      await page.locator('[data-hero-panel]').evaluate((element) => getComputedStyle(element).position),
      'relative'
    );
    await noOverflow(page);
    await page.screenshot({ path: path.join(output, `${label}.png`) });
    console.log(`PASS ${label}: complete static scene and normal page flow`);
    await context.close();
  }
  for (const viewport of [
    { width: 844, height: 390 },
    { width: 1280, height: 650 }
  ]) {
    const { page, context } = await fixture(viewport);
    await page.waitForSelector('[data-table-state="static"]');
    assert.equal(await page.locator('[data-hero-table-track] canvas').count(), 0);
    assert.equal(
      await page.locator('[data-hero-panel]').evaluate((element) => getComputedStyle(element).position),
      'relative'
    );
    await noOverflow(page);
    console.log(`PASS ${viewport.width}×${viewport.height}: short screens use the complete static scene`);
    await context.close();
  }
  assert.deepEqual(errors, [], 'No page runtime errors');
  assert.deepEqual(writes, [], 'No writes during UI checks');
  console.log(`PASS all hero checks; screenshots: ${output}`);
} finally {
  await browser.close();
}
