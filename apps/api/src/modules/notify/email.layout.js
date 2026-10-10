import { BUSINESS } from '@tm/shared/src/services/config.js';
import { lightPalette } from '@tm/shared/src/theme/palettes.js';
import { config } from '../../config.js';

/**
 * The one layout every customer email is drawn with (Phase 13A, 2026-10-10), so no email builds HTML by
 * joining strings itself. A builder (customer.emails.js) passes structured parts as plain text, and
 * renderEmail() returns the HTML and the plain-text version of the same email. On purpose:
 *
 * - Every value is escaped here (escapeHtml), so a customer's event name or an admin's reason with
 *   "<script>" or quotes is shown as text, never run or parsed as markup.
 * - The subject is made by emailSubject() only: control characters (CR, LF and the rest) are taken out, so
 *   no text can add a mail header, and a long event name is shortened. No other header carries user text.
 * - Links are made by portalLink() only: config.clientUrl (the website's own address from .env) plus a fixed
 *   portal path; a reservation ref goes through encodeURIComponent. Never the request's Host or Origin.
 * - The look follows the public website's "Warm Ivory & Gold": an ivory page, a white card, an espresso band
 *   with the wordmark as text (no images), one charcoal button, and the full link written under it so the
 *   domain can be read before tapping. Table layout and inline CSS only (what email apps support): no
 *   external CSS, fonts, images, scripts or tracking pixels.
 * - The footer has the business's details as plain text (project rule: no tel:/mailto: links anywhere) and
 *   says we never ask for a password or a one-time code.
 */

// The website's colours (apps/client/src/theme/siteTheme.js; the gold is the shared palette's)
const C = {
  page: '#fbf7f0',
  card: '#ffffff',
  border: '#e8dcc6',
  sand: '#f3eadb',
  ink: '#2b2622',
  inkSoft: '#5e554d',
  inkMuted: '#8a8078',
  gold: lightPalette.gold,
  goldText: '#8a6a2f',
  espresso: '#1f1a17',
  onEspressoSoft: '#cfc4b6',
  buttonText: '#fbf7f0'
};

// A status label's colours: info (gold), success (soft green), attention (soft red: rejected, failed, declined, cancelled)
const TONES = {
  info: { bg: '#f6eddc', fg: C.goldText, line: C.gold },
  success: { bg: '#e6f2e8', fg: '#2f6b40', line: '#4b9a63' },
  attention: { bg: '#fbe9e6', fg: '#a1382d', line: '#c4513f' }
};

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Segoe UI', Helvetica, Arial, sans-serif";

/** Text made safe to put inside HTML: & < > " ' become entities. Anything that is not text becomes text first. */
export const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

// Control characters (C0 including CR, LF and tab, DEL, C1) and the Unicode line and paragraph separators
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;

/** Text on one line: control characters become spaces, runs of spaces become one, and the ends are trimmed. */
export const oneLine = (value) => String(value ?? '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();

/** One line of at most `max` characters, cut with "…" when longer (never in the middle of an emoji). */
export function shorten(value, max = 60) {
  const chars = Array.from(oneLine(value));
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : chars.join('');
}

/**
 * A subject line: "{what happened}: {event} ({ref})", e.g. "Payment received: ₱3,000 for Santos Wedding
 * (RES-2026-1130-01)". The event name is shortened to about 60 characters, and the whole line is one line
 * (no CR/LF: nothing typed by a person can add a mail header) of at most 200 characters (the outbox column is 255).
 */
export const emailSubject = (what, eventName, ref) => shorten(`${oneLine(what)}: ${shorten(eventName, 60)} (${oneLine(ref)})`, 200);

/** The portal pages an email may link to. A reservation's page is built by reservationPath(). */
export const PORTAL_PATHS = Object.freeze({ payments: '/portal/payments', documents: '/portal/documents', messages: '/portal/messages', testimonials: '/portal/testimonials' });

/** "/portal/reservations/RES-2026-1130-01", the ref encoded so it can never change the path. */
export const reservationPath = (ref) => `/portal/reservations/${encodeURIComponent(String(ref ?? ''))}`;

/**
 * The full address of a portal page: config.clientUrl + the path. Only /portal/ paths are allowed, so an
 * email can only ever point at the customer's own pages on this website (behind sign-in; a signed-out
 * customer is sent back there after logging in).
 */
export function portalLink(path) {
  if (typeof path !== 'string' || !path.startsWith('/portal/')) throw new Error(`[notify] Not a portal path: ${path}`);
  return `${config.clientUrl}${path}`;
}

// Escaped text with its line breaks kept (an admin's reason may have several lines)
const multiline = (value) => escapeHtml(String(value ?? '').trim()).replace(/\r?\n/g, '<br>');

// One paragraph of the body
const paragraph = (text, extra = '') =>
  `<p style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:1.6;color:${C.ink};${extra}">${multiline(text)}</p>`;

// The details card: label / value rows, values in bold when `strong`
function detailsTable(rows) {
  if (!rows || !rows.length) return '';
  const cells = rows
    .map(
      (row, i) => `<tr>
<td style="padding:9px 14px;${i ? `border-top:1px solid ${C.border};` : ''}font-family:${SANS};font-size:13px;color:${C.inkSoft};vertical-align:top;width:42%">${escapeHtml(row.label)}</td>
<td style="padding:9px 14px;${i ? `border-top:1px solid ${C.border};` : ''}font-family:${SANS};font-size:14px;color:${C.ink};vertical-align:top;text-align:right;${row.strong ? 'font-weight:bold;' : ''}">${multiline(row.value)}</td>
</tr>`
    )
    .join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px;background:${C.sand};border:1px solid ${C.border};border-radius:10px;border-collapse:separate">${cells}</table>`;
}

// A list under its own heading (e.g. "Damage Charges"): rows of { label, value }
function listSection(section) {
  if (!section || !section.rows || !section.rows.length) return '';
  return `<p style="margin:0 0 8px;font-family:${SERIF};font-size:16px;font-weight:bold;color:${C.ink}">${escapeHtml(section.heading)}</p>${detailsTable(section.rows)}`;
}

// The box with a coloured left border: the reason, the admin's note or the next step
function boxBlock(box) {
  if (!box || !box.text) return '';
  const tone = TONES[box.tone] || TONES.info;
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px"><tr>
<td style="border-left:4px solid ${tone.line};background:${C.page};padding:12px 16px;border-radius:0 8px 8px 0">
${box.title ? `<p style="margin:0 0 4px;font-family:${SANS};font-size:13px;font-weight:bold;color:${tone.fg}">${escapeHtml(box.title)}</p>` : ''}
<p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.55;color:${C.ink}">${multiline(box.text)}</p>
</td></tr></table>`;
}

// The one button ("bulletproof": a table cell, so it shows as a button even where CSS is limited) and the full link under it
function buttonBlock(button) {
  const url = portalLink(button.path);
  const href = escapeHtml(url);
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:6px 0 10px"><tr>
<td bgcolor="${C.ink}" style="border-radius:8px;background:${C.ink}">
<a href="${href}" target="_blank" rel="noopener" style="display:inline-block;padding:13px 26px;font-family:${SANS};font-size:15px;font-weight:bold;color:${C.buttonText};text-decoration:none;border-radius:8px">${escapeHtml(button.label)}</a>
</td></tr></table>
<p style="margin:0 0 18px;font-family:${SANS};font-size:12.5px;line-height:1.5;color:${C.inkMuted}">Or open this link: <a href="${href}" target="_blank" rel="noopener" style="color:${C.goldText};word-break:break-all">${href}</a></p>`;
}

// The footer lines, the same on every email (plain text: no tel: or mailto: links)
const FOOTER = [
  `${BUSINESS.name} · ${BUSINESS.address} · ${BUSINESS.phone}`,
  "You're receiving this because you have a reservation with Tres Marias. For questions, message us from your account.",
  'We will never ask for your password or one-time code.'
];

/**
 * One customer email as { html, text }, from plain-text parts (every one is escaped here):
 *   label        the small status label under the header, e.g. "Quotation Ready" (Title Case)
 *   tone         'info' (gold), 'success' (green) or 'attention' (red: rejected, failed, declined, cancelled)
 *   preheader    the inbox preview line, stating the fact, e.g. "Net total ₱45,000 · Accept it to approve your reservation."
 *   heading      the serif heading, e.g. "Your Quotation Is Ready"
 *   firstName    for "Hi {first name}," ("Hi there," when empty)
 *   intro        one or two short sentences (an array of paragraphs)
 *   details      [{ label, value, strong }] for the details card; amounts with strong: true
 *   sections     [{ heading, rows: [{ label, value }] }], lists under their own heading (e.g. damage charges)
 *   box          { title, text, tone } for the reason, the admin's note or the next step (left out when no text)
 *   after        paragraphs after the details and the box (e.g. "Your contract is in Documents.")
 *   button       { label, path }: the one button; `path` is a portal path (PORTAL_PATHS or reservationPath)
 *   security     a small note under the button, e.g. "If you didn't cancel this, change your password right away and message us."
 * The text version carries the same facts in the same order, with the link on a line of its own.
 */
export function renderEmail({ label, tone = 'info', preheader = '', heading, firstName = '', intro = [], details = [], sections = [], box = null, after = [], button, security = '' }) {
  const toneColors = TONES[tone] || TONES.info;
  const greeting = `Hi ${oneLine(firstName) || 'there'},`;
  const url = portalLink(button.path);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.page}">${escapeHtml(oneLine(preheader))}${'&#8199;&#65279;&#847; '.repeat(30)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${C.page}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:${C.card};border:1px solid ${C.border};border-radius:14px;border-collapse:separate;overflow:hidden">
<tr><td align="center" bgcolor="${C.espresso}" style="background:${C.espresso};padding:22px 24px;border-radius:14px 14px 0 0">
<p style="margin:0;font-family:${SERIF};font-size:22px;letter-spacing:5px;color:${C.gold};font-weight:bold">TRES MARIAS</p>
<p style="margin:4px 0 0;font-family:${SANS};font-size:11px;letter-spacing:3px;color:${C.onEspressoSoft}">CATERING SERVICES</p>
</td></tr>
<tr><td style="padding:24px 28px 8px">
<span style="display:inline-block;padding:4px 11px;border-radius:999px;background:${toneColors.bg};color:${toneColors.fg};font-family:${SANS};font-size:12px;font-weight:bold;letter-spacing:0.3px">${escapeHtml(label)}</span>
<h1 style="margin:14px 0 16px;font-family:${SERIF};font-size:22px;line-height:1.3;font-weight:bold;color:${C.ink}">${escapeHtml(heading)}</h1>
${paragraph(greeting)}
${intro.filter(Boolean).map((text) => paragraph(text)).join('\n')}
${detailsTable(details)}
${sections.map(listSection).join('\n')}
${boxBlock(box)}
${after.filter(Boolean).map((text) => paragraph(text)).join('\n')}
${buttonBlock(button)}
${security ? `<p style="margin:0 0 18px;font-family:${SANS};font-size:12.5px;line-height:1.5;color:${C.inkSoft}">${multiline(security)}</p>` : ''}
<p style="margin:0 0 22px;font-family:${SANS};font-size:15px;line-height:1.6;color:${C.ink}">${escapeHtml(BUSINESS.name)}</p>
</td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid ${C.border};background:${C.page};border-radius:0 0 14px 14px">
${FOOTER.map((line) => `<p style="margin:0 0 6px;font-family:${SANS};font-size:11.5px;line-height:1.5;color:${C.inkMuted}">${escapeHtml(line)}</p>`).join('\n')}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  // The plain-text version: the same facts, the link on its own line
  const lines = ['TRES MARIAS CATERING SERVICES', oneLine(label), '', oneLine(heading), '', greeting, ''];
  intro.filter(Boolean).forEach((text) => lines.push(String(text).trim(), ''));
  if (details.length) {
    details.forEach((row) => lines.push(`${oneLine(row.label)}: ${oneLine(row.value)}`));
    lines.push('');
  }
  sections.filter((section) => section && section.rows && section.rows.length).forEach((section) => {
    lines.push(oneLine(section.heading));
    section.rows.forEach((row) => lines.push(`- ${oneLine(row.label)}: ${oneLine(row.value)}`));
    lines.push('');
  });
  if (box && box.text) lines.push(box.title ? `${oneLine(box.title)}:` : '', String(box.text).trim(), '');
  after.filter(Boolean).forEach((text) => lines.push(String(text).trim(), ''));
  lines.push(`${oneLine(button.label)}:`, url, '');
  if (security) lines.push(String(security).trim(), '');
  lines.push(BUSINESS.name, '', '--', ...FOOTER);
  const text = lines.filter((line, i, all) => !(line === '' && all[i - 1] === '')).join('\n').trim();

  return { html, text };
}
