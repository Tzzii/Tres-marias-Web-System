import { config } from '../src/config.js';
import { closePool, pool, tx } from '../src/db.js';
import { emailSubject, escapeHtml, oneLine, portalLink, reservationPath, shorten } from '../src/modules/notify/email.layout.js';
import { CUSTOMER_EMAILS } from '../src/modules/notify/customer.emails.js';
import { queueCustomerEmail, useMailerForTests } from '../src/modules/notify/notify.service.js';

/**
 * `npm run test:email` — checks of the customer email notices (Phase 13A, 2026-10-10):
 *
 * 1. Every email (every purpose and variant, with a hostile event name and reason): the HTML escapes what
 *    people typed (no raw <script>, quotes escaped), the subject is one line (no CR/LF) of at most 200
 *    characters with a long event name cut short, every link in the HTML starts with CLIENT_URL and goes to
 *    a /portal/ page, the text version has the link on a line of its own, and nothing private is in it.
 * 2. The helpers themselves: escapeHtml, oneLine, shorten, emailSubject, portalLink, reservationPath.
 * 3. With a stub mailer and the local database (read, plus rows it removes again): a transaction that rolls
 *    back sends nothing and leaves no outbox row; a mailer that throws doesn't change the action's result,
 *    and its outbox row ends up 'failed'; queueCustomerEmail refuses to run outside tx().
 * Part 3 needs MySQL and at least one customer in the local database; it writes one outbox row and removes it.
 */

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  -> ${detail}`}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------- sample data (the contract in customer.emails.js) ----------------
const HOSTILE = 'The "Best" <script>alert("x")</script> Party & Reunion of the Santos–Reyes Family with All the Cousins From Batangas and Laguna\r\nBcc: someone@example.com';
const REASON = 'Your receipt was <b>blurry</b> & "unreadable".\nPlease send a clearer photo. <script>alert(1)</script>';
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const reservation = {
  ref: 'RES-2026-1130-01',
  eventName: HOSTILE,
  date: day(40),
  startTime: '10:00',
  endTime: '14:00',
  serviceType: 'Buffet and Catering',
  createdAt: Date.now() - 2 * 86400000,
  downpaymentDue: day(7),
  status: 'approved',
  customerId: 'cus-test'
};
const SAMPLES = [
  ['quotation_ready new', 'quotation_ready', { reservation: { ...reservation, status: 'pending' }, variant: 'new', net: 45000, note: REASON, totalBefore: 40000, statusBefore: 'pending', statusAfter: 'pending', downpaymentStillNeeded: 0, downpaymentDue: null, overpaid: 0, damageLines: [] }],
  ['quotation_ready revised', 'quotation_ready', { reservation: { ...reservation, status: 'pending' }, variant: 'revised', net: 47000, note: '', totalBefore: 45000, statusBefore: 'pending', statusAfter: 'pending', downpaymentStillNeeded: 0, downpaymentDue: null, overpaid: 0, damageLines: [] }],
  ['quotation_ready updated back to approved', 'quotation_ready', { reservation, variant: 'updated', net: 60000, note: '', totalBefore: 45000, statusBefore: 'downpayment_paid', statusAfter: 'approved', downpaymentStillNeeded: 1500, downpaymentDue: day(7), overpaid: 0, damageLines: [] }],
  ['quotation_ready updated overpaid + damage', 'quotation_ready', { reservation: { ...reservation, serviceType: 'Equipment rental' }, variant: 'updated', net: 2000, note: '', totalBefore: 5000, statusBefore: 'confirmed', statusAfter: 'confirmed', downpaymentStillNeeded: 0, downpaymentDue: null, overpaid: 3000, damageLines: [{ name: 'Monobloc <Chair>', qty: 2, amount: 400 }] }],
  ['reservation_approved', 'reservation_approved', { reservation, total: 45000, downpayment: 3000, acceptedAt: Date.now() }],
  ['payment_received', 'payment_received', { reservation, payment: { amount: 3000, method: 'bank', receiptNo: 'OR-1001', verifiedAt: Date.now() }, paidSoFar: 3000, balance: 42000, statusBefore: 'approved', statusAfter: 'downpayment_paid' }],
  ['payment_received + confirmed', 'payment_received', { reservation, payment: { amount: 42000, method: 'qrph', receiptNo: 'OR-1002', verifiedAt: Date.now() }, paidSoFar: 45000, balance: 0, statusBefore: 'downpayment_paid', statusAfter: 'confirmed' }],
  ['payment_rejected', 'payment_rejected', { reservation, payment: { amount: 3000, method: 'bank', submittedAt: Date.now() }, reason: REASON }],
  ['qr_payment_failed', 'qr_payment_failed', { reservation, amount: 3000 }],
  ['booking_confirmed', 'booking_confirmed', { reservation, balance: 42000 }],
  ['reservation_declined', 'reservation_declined', { reservation: { ...reservation, status: 'pending' }, reason: REASON }],
  ['reservation_cancelled admin', 'reservation_cancelled', { reservation, by: 'admin', reason: REASON, paid: 3000, at: Date.now() }],
  ['reservation_cancelled customer', 'reservation_cancelled', { reservation, by: 'customer', reason: REASON, paid: 0, at: Date.now() }],
  ['payment_reminder', 'payment_reminder', { reservation, dueText: 'A downpayment of at least ₱3,000 is due on 17 Oct 2026.' }],
  ['event_completed', 'event_completed', { reservation: { ...reservation, status: 'confirmed', date: day(-1) } }],
  ['event_completed rental', 'event_completed', { reservation: { ...reservation, status: 'confirmed', date: day(-1), serviceType: 'Equipment rental' } }]
];

// ---------------- 1. every email ----------------
console.log(`\nCLIENT_URL = ${config.clientUrl}\n`);
const purposesSeen = new Set();
for (const [name, purpose, data] of SAMPLES) {
  purposesSeen.add(purpose);
  let email;
  try {
    email = CUSTOMER_EMAILS[purpose]({ ...data, firstName: 'Ana <b>' });
  } catch (err) {
    check(`${name}: builds`, false, err.message);
    continue;
  }
  const { subject, html, text } = email;
  check(`${name}: subject is one line, no CR/LF/control characters`, typeof subject === 'string' && subject.length > 0 && !/[\u0000-\u001f\u007f]/.test(subject), JSON.stringify(subject));
  check(`${name}: subject at most 200 characters, long name cut with …`, subject.length <= 200 && subject.includes('…') && !subject.includes('Bcc'), subject);
  check(`${name}: subject names the ref`, subject.includes(reservation.ref), subject);
  check(`${name}: HTML has no raw <script> or <b> from data`, !/<script/i.test(html) && !html.includes('<b>blurry') && !html.includes('Ana <b>'), 'raw markup found');
  check(`${name}: typed text is escaped`, html.includes('&lt;script&gt;') && html.includes('&quot;'), 'escaped text not found');
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  check(`${name}: has a link, every link starts with CLIENT_URL + /portal/`, hrefs.length > 0 && hrefs.every((h) => h.startsWith(`${config.clientUrl}/portal/`)), hrefs.join(' '));
  check(`${name}: no tel:, mailto:, images, scripts or external CSS`, !/href="(tel|mailto):|<img|<script|<link|@import|url\(/i.test(html), 'found one');
  check(`${name}: text version has the link on its own line`, text.split('\n').some((line) => line.trim() === hrefs[0]), 'link line missing');
  check(`${name}: footer lines present`, text.includes('We will never ask for your password or one-time code.') && html.includes('We will never ask for your password or one-time code.'));
  check(`${name}: under 50 KB`, Buffer.byteLength(html) < 50 * 1024, `${Buffer.byteLength(html)} bytes`);
  check(`${name}: no bank account number`, !text.includes('4471') && !html.includes('4471'));
}
check('every purpose has a sample', Object.keys(CUSTOMER_EMAILS).every((p) => purposesSeen.has(p)), Object.keys(CUSTOMER_EMAILS).filter((p) => !purposesSeen.has(p)).join(', '));

// Phase 13B: the completion email invites a testimonial, names no amount, and thanks a rental for renting
const completedEvent = CUSTOMER_EMAILS.event_completed({ reservation: { ...reservation, eventName: 'Santos Wedding', status: 'confirmed' }, firstName: 'Ana' });
const completedRental = CUSTOMER_EMAILS.event_completed({ reservation: { ...reservation, eventName: 'Fiesta Chairs', serviceType: 'Equipment rental' }, firstName: 'Ana' });
check('event_completed: the button goes to Testimonials', completedEvent.html.includes(`href="${config.clientUrl}/portal/testimonials"`) && completedEvent.text.includes(`${config.clientUrl}/portal/testimonials`));
check('event_completed: subject thanks for celebrating', completedEvent.subject === `Thank you for celebrating with us: Santos Wedding (${reservation.ref})`, completedEvent.subject);
check('event_completed: no peso amount in it', !completedEvent.text.includes('₱') && !completedRental.text.includes('₱'));
check('event_completed rental: thanks for renting and says the items are back', completedRental.subject.startsWith('Thank you for renting with us') && completedRental.text.includes('All your rented items are back'), completedRental.subject);

// ---------------- 2. helpers ----------------
check('escapeHtml', escapeHtml(`<a href="x">'&'</a>`) === '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
check('oneLine removes CR, LF, tab and line separators', oneLine('a\r\nb\tc\u2028d\u0007e') === 'a b c d e');
check('shorten cuts with …', shorten('x'.repeat(100), 60).length === 60 && shorten('x'.repeat(100), 60).endsWith('…'));
check('shorten keeps an emoji whole', !shorten(`${'x'.repeat(58)}🎉🎉🎉`, 60).includes('\ud83c…'));
check('emailSubject strips header injection', !/[\r\n]/.test(emailSubject('Booking confirmed', 'Party\r\nBcc: a@b.c', 'RES-1\r\nX: y')));
check('reservationPath encodes the ref', reservationPath('RES-1/../../admin?x=1') === '/portal/reservations/RES-1%2F..%2F..%2Fadmin%3Fx%3D1');
let refused = false;
try {
  portalLink('https://evil.example/portal/x');
} catch {
  refused = true;
}
check('portalLink refuses anything but a /portal/ path', refused);

// ---------------- 3. transactions, with a stub mailer ----------------
const sent = [];
useMailerForTests({ name: 'stub', deliver: async (message) => {
  sent.push(message);
  return { status: 'sent', providerId: 'stub-1' };
} });
let outsideRefused = false;
try {
  await queueCustomerEmail({ query: async () => [[]] }, { customerId: 'x', ref: 'RES-X', purpose: 'qr_payment_failed', data: {} });
} catch {
  outsideRefused = true;
}
check('queueCustomerEmail refuses to run outside tx()', outsideRefused);

let customer = null;
try {
  [[customer]] = await pool.query("SELECT id FROM customers WHERE email <> '' ORDER BY created_at LIMIT 1");
} catch (err) {
  console.log(`(skipping the database checks: ${err.message})`);
}
if (customer) {
  const data = { reservation: { ...reservation, eventName: 'Email test', customerId: customer.id }, amount: 3000 };
  // a) rolled back: nothing delivered, no outbox row
  let outboxId = null;
  try {
    await tx(async (conn) => {
      outboxId = await queueCustomerEmail(conn, { customerId: customer.id, ref: 'RES-EMAIL-TEST', purpose: 'qr_payment_failed', data });
      throw new Error('the action failed');
    });
  } catch {
    /* expected */
  }
  await sleep(300);
  const [[{ n: rolledRows }]] = await pool.query('SELECT COUNT(*) AS n FROM outbox WHERE id = ?', [outboxId || '']);
  check('rolled-back transaction: queued inside it, then nothing delivered', outboxId && sent.length === 0, `outboxId=${outboxId}, sent=${sent.length}`);
  check('rolled-back transaction: no outbox row left', Number(rolledRows) === 0, `${rolledRows} rows`);

  // b) committed, with a mailer that throws: the action's answer is unchanged, the row is marked failed
  useMailerForTests({ name: 'stub', deliver: async () => {
    throw new Error('SMTP is down (test)');
  } });
  let committedId = null;
  const answer = await tx(async (conn) => {
    committedId = await queueCustomerEmail(conn, { customerId: customer.id, ref: 'RES-EMAIL-TEST', purpose: 'qr_payment_failed', data });
    return 'the action result';
  });
  await sleep(500);
  const [[row]] = await pool.query('SELECT status, error, meta FROM outbox WHERE id = ?', [committedId || '']);
  check("a throwing mailer doesn't change the action's result", answer === 'the action result', String(answer));
  check('the outbox row is marked failed with the reason', row && row.status === 'failed' && /SMTP is down/.test(row.error || ''), JSON.stringify(row));
  const meta = row ? (typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta) : {};
  check('the outbox meta holds only purpose, ref and customerId', meta && Object.keys(meta).sort().join(',') === 'customerId,purpose,ref', JSON.stringify(meta));

  // c) committed with a working mailer: delivered once, after the commit, with html and text
  sent.length = 0;
  useMailerForTests({ name: 'stub', deliver: async (message) => {
    sent.push(message);
    return { status: 'sent', providerId: 'stub-2' };
  } });
  let okId = null;
  await tx(async (conn) => {
    okId = await queueCustomerEmail(conn, { customerId: customer.id, ref: 'RES-EMAIL-TEST', purpose: 'qr_payment_failed', data });
    check('not delivered before the commit', sent.length === 0);
  });
  await sleep(500);
  const [[okRow]] = await pool.query('SELECT status, provider_id FROM outbox WHERE id = ?', [okId || '']);
  check('delivered once after the commit, with both html and text', sent.length === 1 && sent[0].html && sent[0].text, `sent=${sent.length}`);
  check('the outbox row is marked sent with the provider id', okRow && okRow.status === 'sent' && okRow.provider_id === 'stub-2', JSON.stringify(okRow));

  // Remove the test rows
  await pool.query('DELETE FROM outbox WHERE id IN (?, ?)', [committedId || '', okId || '']);
  const [[{ n: left }]] = await pool.query("SELECT COUNT(*) AS n FROM outbox WHERE JSON_UNQUOTE(JSON_EXTRACT(meta, '$.ref')) = 'RES-EMAIL-TEST'");
  check('test outbox rows removed', Number(left) === 0, `${left} left`);
}
useMailerForTests();
await closePool();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
