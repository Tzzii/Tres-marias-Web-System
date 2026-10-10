import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { addDays, todayISO } from '@tm/shared/src/utils/format.js';
import { CUSTOMER_EMAILS } from '../src/modules/notify/customer.emails.js';
import { escapeHtml } from '../src/modules/notify/email.layout.js';

/**
 * `npm run email:preview` — every customer email (Phase 13A) with sample data, written to
 * apps/api/tmp/email-preview/<name>.html and <name>.txt, plus index.html listing each one's subject with
 * links to both versions. Open index.html in a browser to look them over.
 *
 * No database and no mail: the builders are called directly with made-up bookings (dates counted from today,
 * so the cancel-deadline sentence shows both of its forms). The samples include a very long event name, an
 * event name and reasons with <script>, quotes and line breaks, so the escaping and the subject's cut can be
 * checked by eye. Links use CLIENT_URL from apps/api/.env (portalLink).
 * Each email is also checked here: a subject on one line of at most 200 characters, and no raw <script in
 * the HTML. Exits with 1 when one fails. apps/api/tmp/ is ignored by git.
 */

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tmp', 'email-preview');
const DAY_MS = 86400000;
const today = todayISO();

// A booking as the reservations repo returns it, with only the fields the builders read
const booking = (fields) => ({
  ref: 'RES-2026-1130-01',
  eventName: 'Santos Wedding',
  date: addDays(today, 50),
  startTime: '17:00',
  endTime: '22:00',
  serviceType: 'Buffet and Catering',
  createdAt: Date.now() - 2 * DAY_MS,
  downpaymentDue: addDays(today, 7),
  ...fields
});

const santos = booking();
// A very long event name (over 120 characters): the subject must cut it with "…"
const longName = booking({
  ref: 'RES-2026-1205-02',
  eventName:
    'Golden Wedding Anniversary Celebration of Lolo Ramon and Lola Corazon dela Cruz-Villanueva with the Whole Family, Friends and Neighbors of Barangay Magapi',
  date: addDays(today, 80),
  startTime: '22:00',
  endTime: '02:00'
});
// Typed text that must stay text: markup, quotes, an ampersand and a line break (also in the event name)
const hostile = booking({ ref: 'RES-2026-1212-03', eventName: 'Mia & Leo\'s "Garden" Debut <script>alert("x")</script>\r\nBcc: someone@example.com' });
const HOSTILE_TEXT = 'The receipt shows "₱2,000" & the amount sent was different.\nSee <script>alert("x")</script> and it\'s <b>not</b> bold.';
// Requested 60 days ago for an event 10 days away: the paid-booking cancel deadline has passed
const lateDeadline = booking({ ref: 'RES-2026-1018-04', eventName: 'Reyes 7th Birthday', date: addDays(today, 10), startTime: '10:00', endTime: '14:00', createdAt: Date.now() - 60 * DAY_MS, downpaymentDue: addDays(today, 3) });
const rental = booking({ ref: 'RES-2026-1015-05', eventName: 'Barangay Fiesta Equipment', serviceType: 'Equipment rental', startTime: '08:00', endTime: '', date: addDays(today, -3) });

const payment = (fields) => ({ amount: 3000, method: 'bank', receiptNo: 'OR-1001', verifiedAt: Date.now(), ...fields });

// Every variant: [file name, purpose, data] (firstName is what notify.service.js adds)
const VARIANTS = [
  ['quotation-new', 'quotation_ready', { reservation: santos, variant: 'new', net: 45000, note: '' }],
  ['quotation-revised', 'quotation_ready', { reservation: santos, variant: 'revised', net: 48500, note: `We added the extra dessert station you asked for.\n${HOSTILE_TEXT}` }],
  ['quotation-updated-back-to-approved', 'quotation_ready', {
    reservation: santos, variant: 'updated', net: 60000, note: 'Updated for 200 guests, as you asked.', totalBefore: 45000,
    statusBefore: 'downpayment_paid', statusAfter: 'approved', downpaymentStillNeeded: 4500, downpaymentDue: addDays(today, 7), overpaid: 0, damageLines: []
  }],
  ['quotation-updated-confirmed', 'quotation_ready', {
    reservation: santos, variant: 'updated', net: 40000, note: 'The second lechon was removed.', totalBefore: 45000,
    statusBefore: 'downpayment_paid', statusAfter: 'confirmed', downpaymentStillNeeded: 0, downpaymentDue: null, overpaid: 0, damageLines: []
  }],
  ['quotation-updated-overpaid', 'quotation_ready', {
    reservation: santos, variant: 'updated', net: 38000, note: '', totalBefore: 45000,
    statusBefore: 'confirmed', statusAfter: 'confirmed', downpaymentStillNeeded: 0, downpaymentDue: null, overpaid: 2000, damageLines: []
  }],
  ['quotation-updated-rental-damage', 'quotation_ready', {
    reservation: rental, variant: 'updated', net: 5650, note: '', totalBefore: 4200,
    statusBefore: 'confirmed', statusAfter: 'confirmed', downpaymentStillNeeded: 0, downpaymentDue: null, overpaid: 0,
    damageLines: [{ name: 'Monobloc chair', qty: 3, amount: 900 }, { name: 'Round table cloth (white)', qty: 1, amount: 550 }]
  }],
  ['reservation-approved', 'reservation_approved', { reservation: { ...santos, status: 'approved' }, total: 45000, downpayment: 13500, acceptedAt: Date.now() }],
  ['reservation-approved-deadline-passed', 'reservation_approved', { reservation: { ...lateDeadline, status: 'approved' }, total: 28000, downpayment: 8400, acceptedAt: Date.now() }],
  ['reservation-approved-full-payment', 'reservation_approved', { reservation: { ...lateDeadline, status: 'approved' }, total: 28000, downpayment: 28000, acceptedAt: Date.now() }],
  ['payment-received-downpayment', 'payment_received', {
    reservation: longName, payment: payment({ amount: 13500 }), paidSoFar: 13500, balance: 31500, statusBefore: 'approved', statusAfter: 'downpayment_paid'
  }],
  ['payment-received-partial-balance', 'payment_received', {
    reservation: santos, payment: payment({ amount: 10000, receiptNo: 'OR-1002' }), paidSoFar: 23500, balance: 21500, statusBefore: 'downpayment_paid', statusAfter: 'downpayment_paid'
  }],
  ['payment-received-confirmed', 'payment_received', {
    reservation: santos, payment: payment({ amount: 21500, receiptNo: 'OR-1003' }), paidSoFar: 45000, balance: 0, statusBefore: 'downpayment_paid', statusAfter: 'confirmed'
  }],
  ['payment-received-qrph', 'payment_received', {
    reservation: santos, payment: payment({ amount: 5000, method: 'qrph', receiptNo: 'OR-1004' }), paidSoFar: 5000, balance: 40000, statusBefore: 'approved', statusAfter: 'approved'
  }],
  ['payment-received-cash-after-event', 'payment_received', {
    reservation: { ...santos, date: addDays(today, -1) }, payment: payment({ amount: 8000, method: 'cash', receiptNo: 'OR-1005' }), paidSoFar: 45000, balance: 0, statusBefore: 'completed', statusAfter: 'completed'
  }],
  ['payment-received-cancelled-booking', 'payment_received', {
    reservation: santos, payment: payment({ amount: 13500, method: 'qrph', receiptNo: 'OR-1006' }), paidSoFar: 13500, balance: 0, statusBefore: 'cancelled', statusAfter: 'cancelled'
  }],
  ['payment-rejected', 'payment_rejected', { reservation: santos, payment: { amount: 13500, method: 'bank', submittedAt: Date.now() - 3 * 3600000 }, reason: HOSTILE_TEXT }],
  ['qr-payment-failed', 'qr_payment_failed', { reservation: santos, amount: 13500 }],
  ['booking-confirmed-balance', 'booking_confirmed', { reservation: longName, balance: 31500 }],
  ['booking-confirmed-fully-paid', 'booking_confirmed', { reservation: santos, balance: 0 }],
  ['reservation-declined', 'reservation_declined', { reservation: hostile, reason: HOSTILE_TEXT }],
  ['reservation-cancelled-admin-paid', 'reservation_cancelled', { reservation: santos, by: 'admin', reason: 'Our kitchen is closed that week for repairs.\nWe are very sorry.', paid: 13500, at: Date.now() }],
  ['reservation-cancelled-admin-unpaid', 'reservation_cancelled', { reservation: santos, by: 'admin', reason: 'The venue is outside our service area.', paid: 0, at: Date.now() }],
  ['reservation-cancelled-customer-paid', 'reservation_cancelled', { reservation: santos, by: 'customer', reason: 'We moved the wedding to next year.', paid: 13500, at: Date.now() }],
  ['reservation-cancelled-customer-unpaid', 'reservation_cancelled', { reservation: santos, by: 'customer', reason: '', paid: 0, at: Date.now() }],
  ['payment-reminder', 'payment_reminder', {
    reservation: santos,
    dueText: 'A downpayment of at least ₱13,500 is due on 17 Oct 2026. You can pay more, up to the full balance of ₱45,000.'
  }],
  // Phase 13B: the completion with its testimonial invite (an event, and a rental thanked for renting)
  ['event-completed', 'event_completed', { reservation: { ...santos, date: addDays(today, -1) } }],
  ['event-completed-long-name', 'event_completed', { reservation: { ...longName, date: addDays(today, -1) } }],
  ['rental-completed', 'event_completed', { reservation: rental }]
];

/**
 * True when `text` has a character that could break a mail header line: C0 controls (CR, LF, tab…), DEL,
 * C1 controls, or the Unicode line (U+2028) and paragraph (U+2029) separators. Tested by code point, so the
 * file holds no escape sequences an editor could turn into the characters themselves.
 */
const hasControl = (text) =>
  Array.from(text).some((ch) => {
    const code = ch.codePointAt(0);
    return code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029;
  });

/**
 * What is wrong with one built email, as a list of messages (empty when fine): the subject must be one line
 * (no control characters) of 1 to 200 characters, the HTML must have no raw "<script" and both versions
 * must have text.
 */
function problemsOf({ subject, html, text }) {
  const problems = [];
  if (typeof subject !== 'string' || !subject.trim()) problems.push('empty subject');
  else {
    if (hasControl(subject)) problems.push('control character in the subject');
    if (Array.from(subject).length > 200) problems.push(`subject longer than 200 characters (${Array.from(subject).length})`);
  }
  if (!html || /<script/i.test(html)) problems.push(html ? 'raw <script in the HTML' : 'no HTML');
  if (!text) problems.push('no text version');
  return problems;
}

/** Build every variant, write its files and the index, check each one. Returns the exit code. */
function main() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const rows = [];
  let failed = 0;
  for (const [name, purpose, data] of VARIANTS) {
    const email = CUSTOMER_EMAILS[purpose]({ ...data, firstName: 'Maria' });
    fs.writeFileSync(path.join(OUT_DIR, `${name}.html`), email.html, 'utf8');
    fs.writeFileSync(path.join(OUT_DIR, `${name}.txt`), `Subject: ${email.subject}\n\n${email.text}\n`, 'utf8');
    const problems = problemsOf(email);
    if (problems.length) {
      failed += 1;
      console.error(`FAIL ${name}: ${problems.join('; ')}`);
    }
    rows.push({ name, purpose, subject: email.subject, problems });
  }

  const list = rows
    .map(
      (row) => `<tr>
<td><a href="${escapeHtml(row.name)}.html">${escapeHtml(row.name)}</a> · <a href="${escapeHtml(row.name)}.txt">text</a></td>
<td><code>${escapeHtml(row.purpose)}</code></td>
<td>${escapeHtml(row.subject)}${row.problems.length ? `<br><strong style="color:#a1382d">${escapeHtml(row.problems.join('; '))}</strong>` : ''}</td>
</tr>`
    )
    .join('\n');
  const index = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Customer Email Previews</title>
<style>
body { margin: 0; padding: 24px 16px; background: #fbf7f0; color: #2b2622; font: 14px/1.5 'Segoe UI', Helvetica, Arial, sans-serif; }
h1 { font: bold 22px Georgia, serif; margin: 0 0 4px; }
p { margin: 0 0 16px; color: #5e554d; }
table { border-collapse: collapse; width: 100%; max-width: 1100px; background: #fff; border: 1px solid #e8dcc6; }
th, td { text-align: left; vertical-align: top; padding: 8px 12px; border-top: 1px solid #e8dcc6; }
th { background: #f3eadb; font-size: 13px; }
a { color: #8a6a2f; }
</style>
</head>
<body>
<h1>Customer Email Previews</h1>
<p>${rows.length} emails built with sample data on ${escapeHtml(today)} (npm run email:preview).</p>
<table>
<tr><th>Preview</th><th>Purpose</th><th>Subject</th></tr>
${list}
</table>
</body>
</html>
`;
  const indexPath = path.join(OUT_DIR, 'index.html');
  fs.writeFileSync(indexPath, index, 'utf8');

  console.log(`Wrote ${rows.length} emails (HTML and text) to ${OUT_DIR}`);
  console.log(`Open ${pathToFileURL(indexPath).href}`);
  if (failed) console.error(`${failed} of ${rows.length} emails failed the checks above.`);
  return failed ? 1 : 0;
}

process.exitCode = main();
