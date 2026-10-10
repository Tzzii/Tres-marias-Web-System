import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dateUnavailableReason } from '@tm/shared/src/domain/availability.js';
import { OCCASIONS, RULES } from '@tm/shared/src/services/config.js';
import { addDays, todayISO } from '@tm/shared/src/utils/format.js';
import { checkSecret } from '../src/lib/passwords.js';
import {
  API_DIR,
  REPO_DIR,
  adminAccount,
  client,
  closePool,
  codeIn,
  config,
  createTestAdmin,
  createTestCustomer,
  freePort,
  lastEmailTo,
  nextIp,
  parseArgs,
  pool,
  removeTestAdmin,
  requireWriteConsent,
  runApiBriefly,
  runDir,
  stampNow,
  startApi,
  tokenFor,
  writeFile
} from './lib/harness.js';

/**
 * `npm run test:security -- --writes-test-data` — the 19 security tests of Phase 12 (docs §8, Phase 12 #4),
 * #20 (one admin sign-in at a time: the newest wins, 2026-10-09), plus a few checks of what Phase 12 added
 * (email codes, production settings, security headers).
 *
 * It starts its own API process (lib/harness.js startApi) on the database in apps/api/.env, with
 * test-only settings: the log mail driver (each emailed code is kept in the outbox table, so the tests can
 * read it), uploads in a temp folder (the test receipts never land in apps/api/uploads), and a pretend
 * PayMongo (lib/fake-paymongo.js, loaded only into that process) with its own webhook secret, so the
 * webhook tests need no network and no real key. #15 starts two more processes in production mode.
 *
 * It makes its own test data first (fixtures()): three test customers (A, B, C, @example.test), an
 * approved one-piece equipment rental for each (booked and approved through the API), and B's bank
 * transfer with a receipt photo. Sessions are signed with JWT_SECRET like the API's own (no password is
 * typed, no code is read from a real inbox); only #20 signs in for real, as a test admin of its own (code
 * from the outbox), which it deletes afterwards. Every call that the rate limits could answer sends its own
 * made-up client address (X-Forwarded-For, which the API trusts from its one proxy), so the tests do not
 * trip over each other; #9 and #11 are the tests that hit the limits on purpose.
 *
 * The data stays (the database is meant to be reset afterwards, see lib/harness.js), so the script needs
 * --writes-test-data. The report goes to docs/security-tests.md (or --out <file>); the exit code is 1 when
 * any test fails. Run it on the live server in Phase 13 too, before `npm run seed:starter`.
 */

// The pretend PayMongo's secrets, given only to this script's own API process
const FAKE_SECRET_KEY = 'sk_test_securitytestsonly';
const FAKE_WEBHOOK_SECRET = 'whsk_securitytestsonly';
const UPLOAD_DIR = path.join(runDir(), 'uploads');

// The API process the tests talk to: development mode with the test-only settings above
const TEST_ENV = {
  NODE_ENV: 'development',
  MAIL_DRIVER: 'log',
  SMS_DRIVER: 'log',
  CORS_ORIGINS: 'http://localhost:5173,http://localhost:5174',
  PAYMONGO_SECRET_KEY: FAKE_SECRET_KEY,
  PAYMONGO_WEBHOOK_SECRET: FAKE_WEBHOOK_SECRET,
  UPLOAD_DIR
};

// Settings that pass the production checks of config.js (none of them reaches a real service in #15)
const productionEnv = (extra = {}) => ({
  NODE_ENV: 'production',
  JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  DB_PASSWORD: config.db.password || 'not-used',
  MAIL_DRIVER: 'smtp',
  SMTP_HOST: 'smtp.invalid',
  SMTP_USER: 'security-test',
  MAIL_FROM: 'Tres Marias <no-reply@tresmarias.test>',
  ALLOW_SMS_LOG: 'true',
  CORS_ORIGINS: 'https://tresmarias.test',
  // The https:// website address the customer emails link to (Phase 13A: production refuses localhost)
  CLIENT_URL: 'https://tresmarias.test',
  PAYMONGO_SECRET_KEY: '',
  PAYMONGO_WEBHOOK_SECRET: '',
  UPLOAD_DIR,
  ...extra
});

// A real 1 x 1 PNG: what a phone screenshot of a bank receipt starts like
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const random = (n = 6) => crypto.randomBytes(n).toString('hex');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// "401 UNAUTHENTICATED" for a check's line
const said = (res) => `${res.status}${res.body && res.body.code ? ` ${res.body.code}` : ''}`;

/* ============================ Results ============================ */

const results = [];

/**
 * One test: `run(ok)` makes the calls and records each check with ok(condition, what happened). The test
 * passes when every check does; a crash is a failure with its message.
 */
async function test(id, title, expected, run) {
  const entry = { id, title, expected, checks: [], passed: true };
  results.push(entry);
  const ok = (condition, text) => {
    entry.checks.push({ ok: Boolean(condition), text });
    if (!condition) entry.passed = false;
    return Boolean(condition);
  };
  try {
    await run(ok);
  } catch (err) {
    ok(false, `stopped with an error: ${err.message}`);
  }
  console.log(`${entry.passed ? 'PASS' : 'FAIL'}  #${id} ${title}`);
  if (!entry.passed) entry.checks.filter((c) => !c.ok).forEach((c) => console.log(`        ✗ ${c.text}`));
}

/* ============================ Test data ============================ */

/**
 * Three test customers with an approved one-piece equipment rental each, on the first date the rental
 * form accepts with at least 10 pieces of an item free (21 days ahead or later), and B's bank transfer
 * with a receipt photo, waiting for the admin. Everything goes through the API, as the pages do it.
 */
async function fixtures(call) {
  const adminAcc = await adminAccount();
  const admin = tokenFor(adminAcc, 'admin');
  const [A, B, C] = [await createTestCustomer('A'), await createTestCustomer('B'), await createTestCustomer('C')];
  for (const customer of [A, B, C]) customer.token = tokenFor(customer, 'customer');

  const rentalPackage = (await call('GET', '/packages', { ip: nextIp() })).body.find((p) => p.kind === 'rental');
  if (!rentalPackage) throw new Error('The catalogue has no Equipment Rental package to book.');
  const priced = (await call('GET', '/rental-items', { ip: nextIp() })).body;
  const map = (await call('GET', '/calendar', { ip: nextIp() })).body;
  let date = null;
  let item = null;
  for (let days = RULES.leadDays + 21; days < RULES.leadDays + 400 && !date; days += 1) {
    const iso = addDays(todayISO(), days);
    if (dateUnavailableReason(iso, map, { rental: true })) continue;
    const stock = (await call('GET', `/rentals/availability?date=${iso}`, { token: A.token })).body;
    const free = priced.filter((i) => i.price > 0 && ((stock[i.id] && stock[i.id].left) || 0) >= 10).sort((x, y) => x.price - y.price)[0];
    if (free) [date, item] = [iso, free];
  }
  if (!date) throw new Error('No date in the next 400 days has 10 pieces of a rentable item free.');

  // Book a one-piece rental as the customer; extra fields go into the form as they are
  const book = async (who, extra = {}) => {
    const res = await call('POST', '/reservations', {
      token: who.token,
      body: { packageId: rentalPackage.id, eventName: `Security test ${who.name.slice(-1)}`, occasion: OCCASIONS[0], date, startTime: '10:00', fulfilment: 'pickup', rentalItems: [{ itemId: item.id, qty: 1 }], agreeTerms: true, ...extra }
    });
    if (res.status !== 201) throw new Error(`Booking for ${who.name} failed: ${res.status} ${res.text}`);
    return res.body;
  };
  // The admin prices it (a pick-up rental's quotation is its items) and the customer accepts the
  // quotation, which approves it (there is no admin approve since 2026-10-08)
  const approve = async (who, ref) => {
    const quote = await call('POST', `/admin/reservations/${ref}/quotation`, { token: admin, body: { otherCharges: 0, discount: 0, note: '' } });
    if (quote.status !== 200) throw new Error(`Quotation for ${ref} failed: ${quote.status} ${quote.text}`);
    const accepted = await call('POST', `/reservations/${ref}/accept-quotation`, { token: who.token, body: { sentAt: quote.body.quotation.sentAt } });
    if (accepted.status !== 200) throw new Error(`Accepting the quotation of ${ref} failed: ${accepted.status} ${accepted.text}`);
    return accepted.body;
  };
  const RA = await approve(A, (await book(A)).ref);
  const RB = await approve(B, (await book(B)).ref);
  const RC = await approve(C, (await book(C)).ref);

  // Each booking posted a thank-you in its customer's chat, so A and B each have a conversation
  for (const who of [A, B]) who.thread = (await call('GET', '/threads', { token: who.token })).body[0].id;

  const PB = await payByBank(call, B, RB);
  if (PB.status !== 201 && PB.status !== 200) throw new Error(`B's bank transfer failed: ${PB.status} ${PB.text}`);
  return { admin, adminAcc, A, B, C, RA, RB, RC, PB: PB.body, item, date, rentalPackage };
}

/** A bank transfer with a receipt file, as the Payments page sends it (multipart). */
function payByBank(call, who, booking, { file = PNG, name = 'receipt.png', type = 'image/png', amount = booking.balance } = {}) {
  const form = new FormData();
  form.append('ref', booking.ref);
  form.append('method', 'bank');
  form.append('amount', String(amount));
  form.append('referenceNo', `SECTEST ${random(4)}`);
  form.append('proofName', name);
  form.append('proof', new Blob([file], { type }), name);
  return call('POST', '/payments', { token: who.token, form });
}

/** Files in the test API's upload folder (receipts saved so far). */
const savedFiles = () => {
  const dir = path.join(UPLOAD_DIR, 'proofs');
  return fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
};

/** A PayMongo-style webhook body and its Paymongo-Signature header, signed with `secret`. */
function webhook(type, intentId, secret = FAKE_WEBHOOK_SECRET, eventId = `evt_sectest_${random(8)}`) {
  const raw = JSON.stringify({
    data: { id: eventId, type: 'event', attributes: { type, livemode: false, data: { id: `pay_sectest_${random(6)}`, type: 'payment', attributes: { payment_intent_id: intentId, status: 'paid' } } } }
  });
  const t = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return { raw, header: `t=${t},te=${signature},li=`, eventId };
}

const base64url = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

/* ============================ The tests ============================ */

async function runTests(call, fx) {
  const { admin, adminAcc, A, B, C, RA, RB, RC, PB } = fx;

  await test(1, "IDOR — Customer A opens Customer B's reservation", '404', async (ok) => {
    const own = await call('GET', `/reservations/${RB.ref}`, { token: B.token });
    ok(own.status === 200, `B opens their own booking ${RB.ref}: ${said(own)} (control)`);
    const peek = await call('GET', `/reservations/${RB.ref}`, { token: A.token });
    ok(peek.status === 404, `A opens B's booking: ${said(peek)}`);
    const cancel = await call('POST', `/reservations/${RB.ref}/cancel`, { token: A.token, body: { reason: 'Trying to cancel it' } });
    ok(cancel.status === 404, `A cancels B's booking: ${said(cancel)}`);
    const change = await call('POST', `/reservations/${RB.ref}/change-request`, { token: A.token, body: { message: 'Please move it' } });
    ok(change.status === 404, `A asks for a change on B's booking: ${said(change)}`);
    const accept = await call('POST', `/reservations/${RB.ref}/accept-quotation`, { token: A.token, body: { sentAt: RB.quotation.sentAt } });
    ok(accept.status === 404, `A accepts B's quotation: ${said(accept)}`);
    const list = await call('GET', '/reservations', { token: A.token });
    ok(!list.body.some((r) => r.ref === RB.ref), "A's list of bookings does not show B's");
    const after = await call('GET', `/reservations/${RB.ref}`, { token: B.token });
    ok(after.body.status === 'approved', `B's booking is still ${after.body.status}`);
  });

  await test(2, "IDOR — the receipt photo of B's payment", '404', async (ok) => {
    const own = await call('GET', `/payments/${PB.id}/proof`, { token: B.token });
    ok(own.status === 200 && /^image\/png/.test(own.headers.get('content-type') || ''), `B opens their own receipt: ${own.status} ${own.headers.get('content-type')} (control)`);
    const peek = await call('GET', `/payments/${PB.id}/proof`, { token: A.token });
    ok(peek.status === 404, `A opens B's receipt: ${said(peek)}`);
    const list = await call('GET', '/payments', { token: A.token });
    ok(!list.body.some((p) => p.id === PB.id), "A's payments do not list B's");
    const anon = await call('GET', `/payments/${PB.id}/proof`, { ip: nextIp() });
    ok(anon.status === 401, `No token at all: ${said(anon)}`);
  });

  await test(3, "IDOR — B's chat conversation", '404', async (ok) => {
    const own = await call('GET', `/threads/${B.thread}`, { token: B.token });
    ok(own.status === 200, `B opens their own conversation: ${said(own)} (control)`);
    const peek = await call('GET', `/threads/${B.thread}`, { token: A.token });
    ok(peek.status === 404, `A opens B's conversation: ${said(peek)}`);
    const post = await call('POST', `/threads/${B.thread}/messages`, { token: A.token, body: { body: 'Hello from A' } });
    ok(post.status === 404, `A writes in B's conversation: ${said(post)}`);
    const read = await call('POST', `/threads/${B.thread}/read`, { token: A.token });
    ok(read.status === 200 && read.body.ok === false, `A marks B's conversation read: ${read.status} { ok: ${read.body && read.body.ok} } (nothing changed)`);
    const tag = await call('POST', `/threads/${A.thread}/messages`, { token: A.token, body: { body: 'About this booking', ref: RB.ref } });
    ok(tag.status === 404, `A tags B's booking in A's own conversation: ${said(tag)}`);
  });

  // Admin addresses tried by #4 and #5 (the last one does not exist: the admin guard answers first)
  const adminCalls = [
    ['GET', '/admin/reservations'],
    ['GET', '/admin/customers'],
    ['GET', '/admin/reports/dashboard'],
    ['POST', `/admin/reservations/${RB.ref}/quotation`],
    ['POST', `/admin/payments/${PB.id}/verify`],
    ['DELETE', '/admin/feedback/anything'],
    ['GET', '/admin/no-such-page']
  ];

  await test(4, 'A customer token on admin addresses', '403', async (ok) => {
    for (const [method, url] of adminCalls) {
      const res = await call(method, url, { token: A.token, body: method === 'POST' ? {} : undefined });
      ok(res.status === 403, `${method} /api${url}: ${said(res)}`);
    }
    const payment = (await call('GET', '/payments', { token: B.token })).body.find((p) => p.id === PB.id);
    ok(payment && payment.status === 'awaiting', `B's payment is still ${payment && payment.status} (not verified by the customer token)`);
  });

  await test(5, 'No token on admin addresses', '401', async (ok) => {
    for (const [method, url] of adminCalls) {
      const res = await call(method, url, { ip: nextIp(), body: method === 'POST' ? {} : undefined });
      ok(res.status === 401, `${method} /api${url}: ${said(res)}`);
    }
  });

  await test(6, 'An edited session token (JWT)', '401', async (ok) => {
    const [header, payload, signature] = A.token.split('.');
    const flipped = `${header}.${payload}.${signature.slice(0, -2)}${signature.endsWith('A') ? 'BB' : 'AA'}`;
    let res = await call('GET', '/me', { token: flipped });
    ok(res.status === 401, `Signature changed: ${said(res)}`);
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const promoted = `${header}.${base64url({ ...claims, role: 'admin', sub: adminAcc.id })}.${signature}`;
    res = await call('GET', '/admin/reservations', { token: promoted });
    ok(res.status === 401, `Payload changed to the admin's id and role, old signature kept: ${said(res)}`);
    const none = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ ...claims, role: 'admin', sub: adminAcc.id })}.`;
    res = await call('GET', '/admin/reservations', { token: none });
    ok(res.status === 401, `"alg: none" token with no signature: ${said(res)}`);
    const forged = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ ...claims, role: 'admin', sub: adminAcc.id })}`;
    const forgedToken = `${forged}.${crypto.createHmac('sha256', 'a-guessed-secret').update(forged).digest('base64url')}`;
    res = await call('GET', '/admin/reservations', { token: forgedToken });
    ok(res.status === 401, `Signed with a guessed secret: ${said(res)}`);
    res = await call('GET', '/me', { token: 'not-a-token' });
    ok(res.status === 401, `Not a JWT at all: ${said(res)}`);
  });

  await test(7, 'An expired session token', '401', async (ok) => {
    const expired = tokenFor(A, 'customer', { expiresAt: Math.floor(Date.now() / 1000) - 60 });
    let res = await call('GET', '/me', { token: expired });
    ok(res.status === 401, `Token that expired a minute ago: ${said(res)}`);
    const stale = tokenFor({ ...A, passwordChangedAt: 1234567890 }, 'customer');
    res = await call('GET', '/me', { token: stale });
    ok(res.status === 401, `Token from another password version (made before a password change): ${said(res)}`);
    res = await call('GET', '/me', { token: A.token });
    ok(res.status === 200, `A's current token still works: ${said(res)} (control)`);
  });

  await test(8, 'A customerId in the body or the address is ignored', 'Only the signed-in customer\'s own data', async (ok) => {
    const list = await call('GET', `/reservations?customerId=${encodeURIComponent(B.id)}`, { token: A.token });
    ok(list.status === 200 && list.body.length > 0 && list.body.every((r) => r.customerId === A.id), `GET /api/reservations?customerId=<B>: ${list.body.length} booking(s), all A's`);
    const pays = await call('GET', `/payments?customerId=${encodeURIComponent(B.id)}`, { token: A.token });
    ok(pays.status === 200 && !pays.body.some((p) => p.customerId === B.id), "GET /api/payments?customerId=<B>: none of B's payments");
    const made = await call('POST', '/reservations', {
      token: A.token,
      body: { customerId: B.id, packageId: fx.rentalPackage.id, eventName: 'Booked for someone else?', occasion: OCCASIONS[0], date: fx.date, startTime: '11:00', fulfilment: 'pickup', rentalItems: [{ itemId: fx.item.id, qty: 1 }], agreeTerms: true }
    });
    ok(made.status === 201 && made.body.customerId === A.id, `POST /api/reservations with customerId <B>: ${said(made)}, saved for ${made.body && made.body.customerId === A.id ? 'A (the signed-in customer)' : 'someone else!'}`);
    const bList = await call('GET', '/reservations', { token: B.token });
    ok(!bList.body.some((r) => r.ref === made.body.ref), "B's list does not get A's new booking");
    const me = await call('PATCH', '/me', { token: A.token, body: { name: A.name, mobile: A.mobile, company: '', id: B.id, email: B.email } });
    ok(me.status === 200 && me.body.id === A.id && me.body.email === A.email, `PATCH /api/me with B's id and email in the body: ${said(me)}, still A's own account`);
  });

  await test(9, 'Brute force on the log-in', '423 after 5 wrong passwords', async (ok) => {
    const ip = nextIp();
    for (let i = 1; i <= 4; i += 1) {
      const res = await call('POST', '/auth/customer/login', { ip, body: { email: C.email, password: `wrong-password-${i}` } });
      ok(res.status === 401 && res.body.meta.remaining === 5 - i, `Wrong password ${i}: ${said(res)}, ${res.body.meta && res.body.meta.remaining} left`);
    }
    const fifth = await call('POST', '/auth/customer/login', { ip, body: { email: C.email, password: 'wrong-password-5' } });
    ok(fifth.status === 423 && fifth.body.meta.lockedUntil > Date.now(), `Wrong password 5: ${said(fifth)}, locked for ${Math.round((fifth.body.meta.lockedUntil - Date.now()) / 60000)} min`);
    const right = await call('POST', '/auth/customer/login', { ip: nextIp(), body: { email: C.email, password: C.password } });
    ok(right.status === 423, `The right password from another address while locked: ${said(right)} (the lock is on the account)`);
    const [[row]] = await pool.query("SELECT locked_until FROM login_attempts WHERE scope = 'customer' AND identifier = ?", [C.email]);
    ok(row && row.locked_until > Date.now(), 'The lock is saved in the database (login_attempts), so clearing the browser does not lift it');
  });

  await test(10, 'Brute force on the emailed codes', '423 after 5 wrong codes', async (ok) => {
    // (a) Forgot password
    let res = await call('POST', '/auth/customer/password-reset', { ip: nextIp(), body: { email: B.email } });
    ok(res.status === 200 && res.body.challengeId && /•/.test(res.body.maskedEmail), `Forgot password for B: ${said(res)}, code emailed to ${res.body.maskedEmail}`);
    const code = codeIn(await lastEmailTo(B.email));
    ok(code && !res.text.includes(code), 'The answer does not contain the code (it went only to the email)');
    const resetId = res.body.challengeId;
    const wrong = (c) => (c === '000000' ? '111111' : '000000');
    const ip = nextIp();
    for (let i = 1; i <= 4; i += 1) {
      res = await call('POST', `/auth/customer/password-reset/${resetId}/verify`, { ip, body: { code: wrong(code) } });
      ok(res.status === 401 && res.body.code === 'INVALID_CODE', `Reset code, wrong ${i}: ${said(res)}`);
    }
    res = await call('POST', `/auth/customer/password-reset/${resetId}/verify`, { ip, body: { code: wrong(code) } });
    ok(res.status === 423, `Reset code, wrong 5: ${said(res)}`);
    res = await call('POST', `/auth/customer/password-reset/${resetId}/verify`, { ip: nextIp(), body: { code } });
    ok(res.status === 423, `The right reset code while paused: ${said(res)}`);

    // (b) Sign-up: no account exists until the code is right
    const email = `sectest-signup-${random(4)}@example.test`;
    res = await call('POST', '/auth/customer/register', { ip: nextIp(), body: { firstName: 'Security', lastName: 'Signup', email, mobile: '09170000000', password: 'Signup-Test-2026', agreeTerms: true } });
    ok(res.status === 200 && res.body.challengeId, `Sign-up form: ${said(res)}, code emailed to ${res.body.maskedEmail}`);
    const [[{ made }]] = await pool.query('SELECT COUNT(*) AS made FROM customers WHERE email = ?', [email]);
    ok(made === 0, 'No account exists yet');
    const signupId = res.body.challengeId;
    const signupCode = codeIn(await lastEmailTo(email));
    const ip2 = nextIp();
    for (let i = 1; i <= 4; i += 1) {
      res = await call('POST', `/auth/customer/register/${signupId}/verify`, { ip: ip2, body: { code: wrong(signupCode) } });
      ok(res.status === 401, `Sign-up code, wrong ${i}: ${said(res)}`);
    }
    res = await call('POST', `/auth/customer/register/${signupId}/verify`, { ip: ip2, body: { code: wrong(signupCode) } });
    ok(res.status === 423, `Sign-up code, wrong 5: ${said(res)}`);
    const [[{ still }]] = await pool.query('SELECT COUNT(*) AS still FROM customers WHERE email = ?', [email]);
    ok(still === 0, 'Still no account after the wrong codes');

    // (c) Password change in My profile: the current password, then the emailed code
    res = await call('POST', '/me/password', { token: A.token, body: { current: A.password, next: 'Changed-Test-2026' } });
    ok(res.status === 200 && res.body.challengeId, `Change password for A (current password right): ${said(res)}, code emailed`);
    const changeId = res.body.challengeId;
    const changeCode = codeIn(await lastEmailTo(A.email));
    for (let i = 1; i <= 4; i += 1) {
      res = await call('POST', `/me/password/${changeId}/confirm`, { token: A.token, body: { code: wrong(changeCode) } });
      ok(res.status === 401, `Change code, wrong ${i}: ${said(res)}`);
    }
    res = await call('POST', `/me/password/${changeId}/confirm`, { token: A.token, body: { code: wrong(changeCode) } });
    ok(res.status === 423, `Change code, wrong 5: ${said(res)}`);
    const [[account]] = await pool.query('SELECT password_hash FROM customers WHERE id = ?', [A.id]);
    ok(await checkSecret(A.password, account.password_hash), "A's password did not change");
  });

  await test(11, 'Rate limits', '429', async (ok) => {
    const ip = nextIp();
    let last = null;
    for (let i = 1; i <= 6; i += 1) last = await call('POST', '/auth/customer/login', { ip, body: { email: `nobody-${random(3)}@example.test`, password: 'x' } });
    ok(last.status === 429 && Number(last.headers.get('retry-after')) > 0, `6th log-in attempt in a minute from one address: ${said(last)}, Retry-After ${last.headers.get('retry-after')} s`);
    const ip2 = nextIp();
    const answers = [];
    for (let i = 1; i <= 101; i += 1) answers.push((await call('GET', '/catalog/price-per-plate', { ip: ip2 })).status);
    ok(answers.slice(0, 100).every((s) => s === 200) && answers[100] === 429, `101 requests without a token in a minute from one address: the first 100 answered, the 101st ${answers[100]}`);
    const other = await call('GET', '/catalog/price-per-plate', { ip: nextIp() });
    ok(other.status === 200, `Another address meanwhile: ${other.status} (the limit is per address)`);
  });

  await test(12, "SQL injection (' OR 1=1 --)", 'No effect: every value is a query parameter', async (ok) => {
    let res = await call('POST', '/auth/customer/login', { ip: nextIp(), body: { email: "' OR '1'='1' -- ", password: "' OR '1'='1' -- " } });
    ok(res.status === 401, `Log in with ' OR '1'='1' -- as email and password: ${said(res)}`);
    res = await call('GET', `/reservations/${encodeURIComponent("' OR 1=1 -- ")}`, { token: A.token });
    ok(res.status === 404, `A opens the booking "' OR 1=1 -- ": ${said(res)}`);
    const all = await call('GET', '/admin/threads', { token: admin });
    res = await call('GET', `/admin/threads?customerId=${encodeURIComponent("' OR 1=1 -- ")}`, { token: admin });
    ok(res.status === 200 && Array.isArray(res.body) && res.body.length === 0 && all.body.length > 0, `Admin conversations filtered by customerId "' OR 1=1 -- ": ${res.body.length} (of ${all.body.length})`);
    const text = "Robert'); DROP TABLE customers; --";
    res = await call('POST', `/threads/${A.thread}/messages`, { token: A.token, body: { body: text } });
    ok(res.status === 201 && res.body.body === text, `A sends a message with "'); DROP TABLE customers; --": ${said(res)}, saved word for word`);
    const [[{ customers }]] = await pool.query('SELECT COUNT(*) AS customers FROM customers');
    ok(customers > 0, `The customers table is still there (${customers} rows)`);
  });

  await test(13, 'Upload with a renamed extension', '400', async (ok) => {
    const before = savedFiles();
    let res = await payByBank(call, A, RA, { file: Buffer.from('This is a text file, not a picture of a receipt.'), name: 'receipt.png', type: 'image/png' });
    ok(res.status === 400 && res.body.meta.field === 'proof', `Text file named receipt.png: ${said(res)} "${res.body.message}"`);
    res = await payByBank(call, A, RA, { file: Buffer.concat([Buffer.from('MZ'), crypto.randomBytes(200)]), name: 'receipt.jpg', type: 'image/jpeg' });
    ok(res.status === 400, `A Windows program (starts with "MZ") named receipt.jpg: ${said(res)}`);
    res = await payByBank(call, A, RA, { file: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), name: 'receipt.png', type: 'image/png' });
    ok(res.status === 400, `An SVG with a script named receipt.png: ${said(res)}`);
    const payments = (await call('GET', '/payments', { token: A.token })).body.filter((p) => p.ref === RA.ref);
    ok(payments.length === 0, 'No payment was saved for A');
    ok(savedFiles() === before, 'No file was written to the upload folder');
  });

  await test(14, 'Double verify / double check-out', '409', async (ok) => {
    let res = await call('POST', `/admin/payments/${PB.id}/verify`, { token: admin });
    ok(res.status === 200 && /^OR-\d+$/.test(res.body.receiptNo || ''), `Verify B's payment: ${said(res)}, receipt ${res.body.receiptNo}`);
    res = await call('POST', `/admin/payments/${PB.id}/verify`, { token: admin });
    ok(res.status === 409, `Verify it again: ${said(res)}`);

    const paid = await payByBank(call, A, RA);
    ok(paid.status === 201, `A sends a bank transfer for ${RA.ref}: ${said(paid)}`);
    const both = await Promise.all([1, 2].map(() => call('POST', `/admin/payments/${paid.body.id}/verify`, { token: admin })));
    const statuses = both.map((r) => r.status).sort();
    ok(statuses[0] === 200 && statuses[1] === 409, `Two verifies of A's payment at the same moment: ${statuses.join(' and ')}`);
    const [[{ receipts }]] = await pool.query("SELECT COUNT(*) AS receipts FROM payments WHERE id = ? AND receipt_no IS NOT NULL AND receipt_no <> ''", [paid.body.id]);
    ok(receipts === 1, 'One receipt number for it');

    res = await call('POST', `/admin/inventory/rentals/${RB.ref}/check-out`, { token: admin });
    ok(res.status === 200, `Check out B's rented item: ${said(res)}`);
    res = await call('POST', `/admin/inventory/rentals/${RB.ref}/check-out`, { token: admin });
    ok(res.status === 409, `Check it out again: ${said(res)} "${res.body.message}"`);
    const twice = await Promise.all([1, 2].map(() => call('POST', `/admin/inventory/rentals/${RA.ref}/check-out`, { token: admin })));
    const outs = twice.map((r) => r.status).sort();
    ok(outs[0] === 200 && outs[1] === 409, `Two check-outs of A's rental at the same moment: ${outs.join(' and ')}`);
    const [[{ pieces }]] = await pool.query('SELECT COALESCE(SUM(qty), 0) AS pieces FROM inventory_allocations WHERE reservation_ref = ?', [RA.ref]);
    ok(Number(pieces) === 1, `Pieces out for A's one-piece rental: ${pieces}`);
  });

  await test(15, 'An error in production', 'No stack trace or SQL in the answer', async (ok) => {
    // The database is unreachable (a port nothing listens on), so the first database read fails
    const deadPort = String(await freePort());
    const prod = await startApi({ label: 'production-api', env: productionEnv({ DB_PORT: deadPort }) });
    try {
      const res = await client(prod.base)('GET', '/packages');
      ok(res.status === 500, `Production, database down: GET /api/packages -> ${res.status}`);
      ok(res.body && res.body.code === 'SERVER_ERROR' && JSON.stringify(res.body.meta) === '{}', `Answer: ${res.text}`);
      ok(!/ECONNREFUSED|\bat\s|Error:|SELECT|mysql|stack/i.test(res.text), 'No error name, stack line, SQL or driver text in it');
      ok(res.headers.get('x-powered-by') === null, 'No X-Powered-By header (the server does not say it runs Express)');
    } finally {
      await prod.stop();
    }
    // The same failure in development shows the reason, to help debugging (never in production)
    const dev = await startApi({ label: 'development-api', env: { ...productionEnv({ DB_PORT: deadPort }), NODE_ENV: 'development' } });
    try {
      const res = await client(dev.base)('GET', '/packages');
      ok(res.status === 500 && res.body.meta.detail, `The same request in development: ${res.status} with meta.detail "${res.body.meta.detail}" (for comparison)`);
    } finally {
      await dev.stop();
    }
  });

  await test(16, 'CORS from another website', 'Blocked', async (ok) => {
    const evil = 'https://evil.example';
    let res = await call('GET', '/packages', { ip: nextIp(), headers: { Origin: evil } });
    ok(!res.headers.get('access-control-allow-origin'), `GET from ${evil}: no Access-Control-Allow-Origin (the browser keeps the answer from that page)`);
    res = await call('OPTIONS', '/reservations', { ip: nextIp(), headers: { Origin: evil, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
    ok(!res.headers.get('access-control-allow-origin'), `Pre-flight for a booking from ${evil}: ${res.status}, no Access-Control-Allow-Origin (the browser never sends the booking)`);
    res = await call('GET', '/packages', { ip: nextIp(), headers: { Origin: 'http://localhost:5173' } });
    ok(res.headers.get('access-control-allow-origin') === 'http://localhost:5173', `GET from the customer portal's own origin: allowed (${res.headers.get('access-control-allow-origin')}) (control)`);
    ok(res.headers.get('access-control-allow-credentials') !== 'true', 'Credentials (cookies) are never allowed cross-site');
  });

  await test(17, 'XSS in a chat message', 'Shown as text (React escaping)', async (ok) => {
    const text = '<img src=x onerror="alert(\'xss\')"><script>alert(1)</script>';
    let res = await call('POST', `/threads/${B.thread}/messages`, { token: B.token, body: { body: text } });
    ok(res.status === 201, `B sends ${text}: ${said(res)}`);
    res = await call('GET', `/threads/${B.thread}`, { token: B.token });
    const stored = res.body.messages.find((m) => m.body === text);
    ok(stored, 'It comes back as the same text, nothing removed or run on the server');
    ok(/^application\/json/.test(res.headers.get('content-type') || '') && res.headers.get('x-content-type-options') === 'nosniff', 'Served as JSON with X-Content-Type-Options: nosniff (a browser never runs it as a page)');
    // The pages print every text through React, which escapes it; nothing in the code writes raw HTML
    const raw = [];
    const scan = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !['node_modules', 'dist'].includes(entry.name)) scan(full);
        else if (/\.(jsx?|mjs)$/.test(entry.name) && /dangerouslySetInnerHTML|\.innerHTML\s*=|document\.write\(/.test(fs.readFileSync(full, 'utf8'))) raw.push(path.relative(REPO_DIR, full));
      }
    };
    ['apps/client/src', 'apps/admin/src', 'packages/shared/src'].forEach((dir) => scan(path.join(REPO_DIR, dir)));
    ok(raw.length === 0, raw.length ? `Raw HTML written in: ${raw.join(', ')}` : 'No dangerouslySetInnerHTML, innerHTML or document.write anywhere in the two portals or @tm/shared: React shows the message as text');
  });

  // The QR for #18 and #19: C opens a GCash QR (PayMongo is the test fake in this API process)
  const qr = await call('POST', '/payments/qr', { token: C.token, body: { ref: RC.ref, amount: RC.balance } });
  const [[qrRow]] = qr.status === 201 ? await pool.query('SELECT intent_id FROM qr_payments WHERE id = ?', [qr.body.id]) : [[null]];
  const qrPayments = async () => (await pool.query("SELECT id, receipt_no FROM payments WHERE ref = ? AND method = 'qrph'", [RC.ref]))[0];

  await test(18, 'A fake PayMongo webhook (no or wrong Paymongo-Signature)', '401, nothing changes', async (ok) => {
    ok(qr.status === 201 && qrRow, `C opens a GCash QR for ${RC.ref}: ${said(qr)}`);
    const event = webhook('payment.paid', qrRow.intent_id);
    const send = (headers, raw = event.raw) => call('POST', '/webhooks/paymongo', { ip: nextIp(), raw, headers: { 'Content-Type': 'application/json', ...headers } });
    let res = await send({});
    ok(res.status === 401, `"payment.paid" with no signature: ${said(res)}`);
    res = await send({ 'Paymongo-Signature': `t=${Math.floor(Date.now() / 1000)},te=${'0'.repeat(64)},li=` });
    ok(res.status === 401, `With a made-up signature: ${said(res)}`);
    res = await send({ 'Paymongo-Signature': webhook('payment.paid', qrRow.intent_id, 'whsk_guessed_secret').header });
    ok(res.status === 401, `Signed with another secret: ${said(res)}`);
    res = await send({ 'Paymongo-Signature': event.header }, event.raw.replace('"paid"', '"paid" '));
    ok(res.status === 401, `Signed, but the body changed after signing: ${said(res)}`);
    ok((await qrPayments()).length === 0, 'No payment was recorded');
    const [[{ seen }]] = await pool.query('SELECT COUNT(*) AS seen FROM webhook_events WHERE id = ?', [event.eventId]);
    ok(seen === 0, 'Nothing was noted as received');
  });

  await test(19, 'The same PayMongo webhook event twice', 'One payment, one OR', async (ok) => {
    const event = webhook('payment.paid', qrRow.intent_id);
    const send = () => call('POST', '/webhooks/paymongo', { ip: nextIp(), raw: event.raw, headers: { 'Content-Type': 'application/json', 'Paymongo-Signature': event.header } });
    const first = await send();
    const second = await send();
    ok(first.status === 200 && second.status === 200, `The signed event sent twice: ${first.status}, then ${second.status} (PayMongo stops retrying)`);
    const again = webhook('payment.paid', qrRow.intent_id);
    const third = await call('POST', '/webhooks/paymongo', { ip: nextIp(), raw: again.raw, headers: { 'Content-Type': 'application/json', 'Paymongo-Signature': again.header } });
    ok(third.status === 200, `Another event about the same payment: ${third.status}`);
    const recorded = await qrPayments();
    ok(recorded.length === 1 && /^OR-\d+$/.test(recorded[0].receipt_no || ''), `Payments recorded for ${RC.ref}: ${recorded.length}, receipt ${recorded.map((p) => p.receipt_no).join(', ')}`);
    const peek = await call('GET', `/payments/qr/${qr.body.id}`, { token: A.token });
    ok(peek.status === 404, `A opens C's QR: ${said(peek)}`);
  });

  await test(20, 'A newer admin sign-in ends the older session', '401 SESSION_REPLACED', async (ok) => {
    // A test admin of its own, so the real admin's sign-in is not touched; deleted at the end
    const testAdmin = await createTestAdmin();
    const replaced = (res) => res.status === 401 && res.body && res.body.code === 'SESSION_REPLACED';
    try {
      // The real two steps: password (emails a code), then the code from the outbox
      const signIn = async (device) => {
        const start = await call('POST', '/auth/admin/start', { ip: nextIp(), body: { email: testAdmin.email, password: testAdmin.password } });
        const code = codeIn(await lastEmailTo(testAdmin.email));
        const res = await call('POST', '/auth/admin/verify', { ip: nextIp(), body: { challengeId: start.body && start.body.challengeId, code } });
        ok(res.status === 200 && res.body.token && res.body.unlockTicket, `${device} signs in with the password and the emailed code: ${said(res)}`);
        return res.body || {};
      };

      const laptop = await signIn('The laptop');
      let res = await call('GET', '/admin/me', { token: laptop.token });
      ok(res.status === 200, `The laptop opens My Account: ${said(res)} (control)`);

      const phone = await signIn('Then the phone');
      res = await call('GET', '/admin/me', { token: laptop.token });
      ok(replaced(res), `The laptop's next request: ${said(res)}`);
      res = await call('GET', '/changes', { token: laptop.token });
      ok(replaced(res), `The laptop's 15-second check for changes: ${said(res)}`);
      res = await call('GET', '/admin/reservations', { token: laptop.token });
      ok(replaced(res), `The laptop opens the reservations: ${said(res)}`);
      res = await call('POST', '/auth/admin/unlock', { ip: nextIp(), body: { ticket: laptop.unlockTicket, password: testAdmin.password } });
      ok(replaced(res), `The laptop's lock screen, with the right password: ${said(res)}`);
      res = await call('GET', '/admin/me', { token: phone.token });
      ok(res.status === 200, `The phone works: ${said(res)}`);

      // The phone's own lock screen keeps the phone's sign-in
      res = await call('POST', '/auth/admin/unlock', { ip: nextIp(), body: { ticket: phone.unlockTicket, password: testAdmin.password } });
      ok(res.status === 200 && res.body.token, `The phone's lock screen, with the right password: ${said(res)} (control)`);
      const unlocked = res.body && res.body.token;
      const both = [await call('GET', '/admin/me', { token: unlocked }), await call('GET', '/admin/me', { token: phone.token })];
      ok(both.every((r) => r.status === 200), `After unlocking, the phone's new and old tokens both work: ${both.map(said).join(', ')} (same sign-in)`);

      // A token made before this rule (no session id) ends with "session ended", not "another device"
      res = await call('GET', '/admin/me', { token: tokenFor(testAdmin, 'admin') });
      ok(res.status === 401 && res.body.code === 'UNAUTHENTICATED', `An admin token with no session id: ${said(res)}`);

      // Signing in on the laptop again moves the session back: now the phone is out
      const laptopAgain = await signIn('The laptop (again)');
      res = await call('GET', '/admin/me', { token: phone.token });
      ok(replaced(res), `The phone's next request: ${said(res)}`);
      res = await call('GET', '/admin/me', { token: laptopAgain.token });
      ok(res.status === 200, `The laptop works again: ${said(res)}`);

      // Customers keep several sessions; the real admin's session is untouched
      res = await call('GET', '/me', { token: A.token });
      ok(res.status === 200, `Customer A, signed in all along, is not affected: ${said(res)}`);
      res = await call('GET', '/admin/reservations', { token: admin });
      ok(res.status === 200, `The real admin's session is not affected: ${said(res)}`);
    } finally {
      await removeTestAdmin(testAdmin);
    }
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM admins WHERE id = ?', [testAdmin.id]);
    ok(n === 0, 'The test admin was deleted afterwards');
  });

  /* ---------------- Extra checks of what Phase 12 added ---------------- */

  await test('E1', 'Sign-up, password reset and password change with the emailed code', 'Works with the right code; each code works once', async (ok) => {
    // Sign-up: the account appears only with the right code, which then can't be used again
    const email = `sectest-new-${random(4)}@example.test`;
    let res = await call('POST', '/auth/customer/register', { ip: nextIp(), body: { firstName: 'Security', middleName: '', lastName: 'Newcomer', email, mobile: '09171234567', password: 'Newcomer-2026', agreeTerms: true } });
    const id = res.body.challengeId;
    const code = codeIn(await lastEmailTo(email));
    res = await call('POST', `/auth/customer/register/${id}/verify`, { ip: nextIp(), body: { code } });
    ok(res.status === 201 && res.body.token && res.body.user.email === email, `Sign-up with the right code: ${said(res)}, account made and signed in`);
    res = await call('POST', `/auth/customer/register/${id}/verify`, { ip: nextIp(), body: { code } });
    ok(res.status === 410, `The same code again: ${said(res)}`);
    res = await call('POST', '/auth/customer/register', { ip: nextIp(), body: { firstName: 'Security', lastName: 'Again', email, mobile: '09171234567', password: 'Newcomer-2026', agreeTerms: true } });
    ok(res.status === 409 && res.body.code === 'EMAIL_TAKEN', `Signing up again with that email: ${said(res)}`);

    // Forgot password for C (locked out by #9): a finished reset lifts the lock
    res = await call('POST', '/auth/customer/password-reset', { ip: nextIp(), body: { email: C.email } });
    const resetId = res.body.challengeId;
    res = await call('POST', `/auth/customer/password-reset/${resetId}/verify`, { ip: nextIp(), body: { code: codeIn(await lastEmailTo(C.email)) } });
    ok(res.status === 200, `C verifies the emailed reset code: ${said(res)}`);
    res = await call('POST', `/auth/customer/password-reset/${resetId}/complete`, { ip: nextIp(), body: { password: 'Reset-Test-2026' } });
    ok(res.status === 200 && !res.body.token, `C saves a new password from the Log in page: ${said(res)} (no session, so no token)`);
    res = await call('POST', '/auth/customer/login', { ip: nextIp(), body: { email: C.email, password: 'Reset-Test-2026' } });
    ok(res.status === 200, `C logs in with the new password: ${said(res)} (the reset lifted the lock)`);
    res = await call('GET', '/me', { token: C.token });
    ok(res.status === 401, `C's session from before the reset: ${said(res)} (every older session ended)`);

    // Password change for B in My profile: current password + emailed code; this session goes on
    res = await call('POST', '/me/password', { token: B.token, body: { current: 'not-the-password', next: 'Changed-B-2026' } });
    ok(res.status === 401 && res.body.meta.field === 'current', `A wrong current password: ${said(res)}, no code sent`);
    res = await call('POST', '/me/password', { token: B.token, body: { current: B.password, next: 'Changed-B-2026' } });
    const changeId = res.body.challengeId;
    res = await call('POST', `/me/password/${changeId}/confirm`, { token: B.token, body: { code: codeIn(await lastEmailTo(B.email)) } });
    ok(res.status === 200 && res.body.token, `B confirms with the emailed code: ${said(res)}, a new token for this session`);
    const fresh = res.body.token;
    ok((await call('GET', '/me', { token: B.token })).status === 401, "B's old token stopped working");
    ok((await call('GET', '/me', { token: fresh })).status === 200, "B's new token works");
    res = await call('POST', `/me/password/${changeId}/confirm`, { token: fresh, body: { code: '123456' } });
    ok(res.status === 410, `Using that request again: ${said(res)}`);
  });

  await test('E2', 'Production refuses unsafe settings', 'The API does not start', async (ok) => {
    const run = await runApiBriefly(productionEnv({ MAIL_DRIVER: 'log', SMS_DRIVER: 'log', ALLOW_SMS_LOG: 'false', CORS_ORIGINS: 'http://localhost:5173', CLIENT_URL: 'http://localhost:5173', JWT_SECRET: 'short' }));
    ok(!run.started && run.code === 1, `NODE_ENV=production with development settings: ${run.started ? 'it started!' : `stopped (exit ${run.code})`}`);
    for (const needle of ['MAIL_DRIVER must be "smtp" in production', 'SMS_DRIVER must be a real SMS provider', 'CORS_ORIGINS must list only the live portals', 'CLIENT_URL must be the live website', 'JWT_SECRET must be at least 32']) {
      ok(run.output.includes(needle), `It says: "${needle} …"`);
    }
    const good = await runApiBriefly(productionEnv({ DB_PORT: String(await freePort()) }), 4000);
    ok(good.started, 'With production settings it starts (control)');
  });

  await test('E3', 'Security headers', 'Set on every answer', async (ok) => {
    const res = await call('GET', '/health', { ip: nextIp() });
    ok(res.headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options: nosniff');
    ok(/max-age=\d+/.test(res.headers.get('strict-transport-security') || ''), `Strict-Transport-Security: ${res.headers.get('strict-transport-security')}`);
    ok(/frame-ancestors 'self'/.test(res.headers.get('content-security-policy') || '') || res.headers.get('x-frame-options'), 'Pages of other websites cannot frame it (frame-ancestors / X-Frame-Options)');
    ok(res.headers.get('x-powered-by') === null, 'No X-Powered-By');
  });
}

/* ============================ Report ============================ */

function report(base, fx) {
  const main = results.filter((r) => typeof r.id === 'number');
  const extra = results.filter((r) => typeof r.id !== 'number');
  const passed = (list) => list.filter((r) => r.passed).length;
  const lines = [
    '# Security tests — Tres Marias API (Phase 12)',
    '',
    `Generated by \`npm run test:security\` (apps/api/scripts/security-tests.js) on ${stampNow()} (Manila).`,
    `Database "${config.db.database}" on ${config.db.host}:${config.db.port}; the script's own API process at \`${base}\` (development mode,`,
    'log mail driver, a test-only PayMongo stand-in and webhook secret); #15 and E2 start production-mode processes.',
    '',
    `**Result: ${passed(main)} of ${main.length} security tests passed${passed(main) === main.length ? ' ✅' : ' ❌'}**, and ${passed(extra)} of ${extra.length} extra checks of Phase 12.`,
    '',
    `Test data made for the run: customers ${fx ? `${fx.A.email}, ${fx.B.email} and ${fx.C.email}` : '(not made)'}, each with an approved`,
    `one-piece equipment rental${fx ? ` on ${fx.date} (${fx.RA.ref}, ${fx.RB.ref}, ${fx.RC.ref})` : ''}, booked and approved through the API.`,
    '',
    '| # | Test | Expected | Result |',
    '|---|---|---|:---:|',
    ...results.map((r) => `| ${r.id} | ${r.title} | ${r.expected} | ${r.passed ? '✅' : '❌'} |`),
    '',
    '## What each test did',
    ''
  ];
  for (const r of results) {
    lines.push(`### ${r.id}. ${r.title} — ${r.passed ? 'passed' : 'FAILED'}`, '', `Expected: ${r.expected}.`, '');
    r.checks.forEach((c) => lines.push(`- ${c.ok ? '✅' : '❌'} ${c.text}`));
    lines.push('');
  }
  lines.push(
    '## Running it again',
    '',
    '```bash',
    'npm run test:security -- --writes-test-data',
    '```',
    '',
    'It adds test customers, bookings and payments to the database in `apps/api/.env`, so run it on a copy you',
    'will reset (locally: back up first, or `npm run seed:api` afterwards; on the live server: before',
    '`npm run seed:starter`, docs Phase 13). The route audit (`npm run audit:routes -- --writes-test-data`) checks',
    'the guard of every route; together they are the security checks of Phase 12.',
    ''
  );
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: npm run test:security -- --writes-test-data [--out <file>]');
    return 0;
  }
  if (args.base) {
    console.error('The security tests start their own API process (they need test-only settings); --base is for the route audit.');
    return 1;
  }
  requireWriteConsent(args, 'The security tests');
  const api = await startApi({ label: 'security-api', env: TEST_ENV, preload: path.join(API_DIR, 'scripts', 'lib', 'fake-paymongo.js') });
  const call = client(api.base);
  console.log(`Security tests against ${api.base} (its own API process; log: ${api.logFile})...`);
  let fx = null;
  try {
    fx = await fixtures(call);
    console.log(`Test data: ${fx.RA.ref}, ${fx.RB.ref}, ${fx.RC.ref} on ${fx.date}`);
    await runTests(call, fx);
  } catch (err) {
    console.error('The tests could not run:', err.message);
    results.push({ id: '—', title: 'Setting up the test data', expected: 'Works', checks: [{ ok: false, text: err.message }], passed: false });
  } finally {
    await api.stop();
    await closePool().catch(() => {});
  }
  await wait(100);
  const out = args.out ? path.resolve(args.out) : path.join(REPO_DIR, 'docs', 'security-tests.md');
  writeFile(out, report(api.base, fx));
  const failed = results.filter((r) => !r.passed).length;
  console.log(`${results.length - failed} of ${results.length} passed. Report: ${out}`);
  return failed ? 1 : 0;
}

process.exitCode = await main();
