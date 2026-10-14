import { BUSINESS } from '@tm/shared/src/services/config.js';
import { lightPalette } from '@tm/shared/src/theme/palettes.js';
import { config } from '../../config.js';


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

const TONES = {
  info: { bg: '#f6eddc', fg: C.goldText, line: C.gold },
  success: { bg: '#e6f2e8', fg: '#2f6b40', line: '#4b9a63' },
  attention: { bg: '#fbe9e6', fg: '#a1382d', line: '#c4513f' }
};

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Segoe UI', Helvetica, Arial, sans-serif";

export const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  );

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;

export const oneLine = (value) =>
  String(value ?? '')
    .replace(CONTROL, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function shorten(value, max = 60) {
  const chars = Array.from(oneLine(value));
  return chars.length > max
    ? `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`
    : chars.join('');
}

export const emailSubject = (what, eventName, ref) =>
  shorten(`${oneLine(what)}: ${shorten(eventName, 60)} (${oneLine(ref)})`, 200);

export const PORTAL_PATHS = Object.freeze({
  payments: '/portal/payments',
  documents: '/portal/documents',
  messages: '/portal/messages',
  testimonials: '/portal/testimonials'
});

export const reservationPath = (ref) => `/portal/reservations/${encodeURIComponent(String(ref ?? ''))}`;

export function portalLink(path) {
  if (typeof path !== 'string' || !path.startsWith('/portal/')) throw new Error(`[notify] Not a portal path: ${path}`);
  return `${config.clientUrl}${path}`;
}

const multiline = (value) => escapeHtml(String(value ?? '').trim()).replace(/\r?\n/g, '<br>');

const paragraph = (text, extra = '') =>
  `<p style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:1.6;color:${C.ink};${extra}">${multiline(text)}</p>`;

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

function listSection(section) {
  if (!section || !section.rows || !section.rows.length) return '';
  return `<p style="margin:0 0 8px;font-family:${SERIF};font-size:16px;font-weight:bold;color:${C.ink}">${escapeHtml(section.heading)}</p>${detailsTable(section.rows)}`;
}

function boxBlock(box) {
  if (!box || !box.text) return '';
  const tone = TONES[box.tone] || TONES.info;
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px"><tr>
<td style="border-left:4px solid ${tone.line};background:${C.page};padding:12px 16px;border-radius:0 8px 8px 0">
${box.title ? `<p style="margin:0 0 4px;font-family:${SANS};font-size:13px;font-weight:bold;color:${tone.fg}">${escapeHtml(box.title)}</p>` : ''}
<p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.55;color:${C.ink}">${multiline(box.text)}</p>
</td></tr></table>`;
}

function buttonBlock(button) {
  const url = portalLink(button.path);
  const href = escapeHtml(url);
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:6px 0 10px"><tr>
<td bgcolor="${C.ink}" style="border-radius:8px;background:${C.ink}">
<a href="${href}" target="_blank" rel="noopener" style="display:inline-block;padding:13px 26px;font-family:${SANS};font-size:15px;font-weight:bold;color:${C.buttonText};text-decoration:none;border-radius:8px">${escapeHtml(button.label)}</a>
</td></tr></table>
<p style="margin:0 0 18px;font-family:${SANS};font-size:12.5px;line-height:1.5;color:${C.inkMuted}">Or open this link: <a href="${href}" target="_blank" rel="noopener" style="color:${C.goldText};word-break:break-all">${href}</a></p>`;
}

function codeBlock(code, validMinutes) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px;background:${C.sand};border:1px solid ${C.border};border-radius:10px;border-collapse:separate"><tr>
<td align="center" style="padding:18px 14px">
<p style="margin:0 0 6px;font-family:${SANS};font-size:13px;color:${C.inkSoft}">Your code</p>
<p style="margin:0;padding-left:8px;font-family:${SANS};font-size:34px;line-height:1.2;font-weight:bold;letter-spacing:8px;color:${C.ink}">${escapeHtml(code)}</p>
<p style="margin:8px 0 0;font-family:${SANS};font-size:13px;color:${C.inkSoft}">Expires in ${escapeHtml(validMinutes)} minutes</p>
</td></tr></table>`;
}

const footerLines = (reason) => [
  `${BUSINESS.name} · ${BUSINESS.address} · ${BUSINESS.phone}`,
  reason,
  'We will never ask for your password or one-time code.'
];

const FOOTER = footerLines(
  "You're receiving this because you have a reservation with Tres Marias. For questions, message us from your account."
);

function frame({ label, tone, preheader, heading, body, footer }) {
  const toneColors = TONES[tone] || TONES.info;
  return `<!DOCTYPE html>
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
${body}
<p style="margin:0 0 22px;font-family:${SANS};font-size:15px;line-height:1.6;color:${C.ink}">${escapeHtml(BUSINESS.name)}</p>
</td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid ${C.border};background:${C.page};border-radius:0 0 14px 14px">
${footer.map((line) => `<p style="margin:0 0 6px;font-family:${SANS};font-size:11.5px;line-height:1.5;color:${C.inkMuted}">${escapeHtml(line)}</p>`).join('\n')}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

const joinLines = (lines) =>
  lines
    .filter((line, i, all) => !(line === '' && all[i - 1] === ''))
    .join('\n')
    .trim();

function requestItemsTable(items) {
  const cell = `padding:10px 12px;font-family:${SANS};font-size:14px;color:${C.ink};vertical-align:top;word-break:break-word;`;
  return `<table width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 18px;border:1px solid ${C.border};border-radius:10px;border-collapse:separate;table-layout:fixed">
<colgroup><col width="65%"><col width="35%"></colgroup>
<thead><tr bgcolor="${C.sand}"><th scope="col" align="left" style="${cell}">Item</th><th scope="col" align="right" style="${cell}white-space:nowrap">Quantity</th></tr></thead>
<tbody>${items.map((item) => `<tr><td style="${cell}border-top:1px solid ${C.border}">${escapeHtml(item.name)}</td><td align="right" style="${cell}border-top:1px solid ${C.border};font-weight:bold;white-space:nowrap">${escapeHtml(item.qty)} pcs</td></tr>`).join('')}</tbody>
</table>`;
}

export function renderPartnerRequestEmail({ ref, text }) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  if (lines[0] === `${BUSINESS.name} · Outsourcing request ${ref}`) lines.shift();
  const blocks = [];
  let words = [];
  let items = [];
  let details = [];
  const flushWords = () => {
    if (words.length) blocks.push(paragraph(words.join('\n')));
    words = [];
  };
  const flushItems = () => {
    if (items.length) blocks.push(requestItemsTable(items));
    items = [];
  };
  const flushDetails = () => {
    if (details.length) blocks.push(detailsTable(details));
    details = [];
  };
  for (const line of lines) {
    const item = /^- (.+): ([1-9]\d*) pcs$/.exec(line);
    const detail = /^(Needed on|Agreed amount:) (.+)$/.exec(line);
    if (item) {
      flushWords();
      flushDetails();
      items.push({ name: item[1], qty: item[2] });
    } else if (detail) {
      flushWords();
      flushItems();
      details.push({ label: detail[1].replace(/:$/, ''), value: detail[2], strong: detail[1].startsWith('Agreed') });
    } else {
      flushItems();
      flushDetails();
      if (!line.trim()) flushWords();
      else words.push(line);
    }
  }
  flushWords();
  flushItems();
  flushDetails();
  const footer = footerLines('This request was sent to your business as an outsourcing partner of Tres Marias.');
  const html = frame({
    label: 'Partner Supply Request',
    tone: 'info',
    preheader: `Supply request ${oneLine(ref)} from ${BUSINESS.name}. Please review the details and confirm availability.`,
    heading: 'Outsourcing Request',
    body: detailsTable([{ label: 'Request number', value: ref, strong: true }]) + blocks.join('\n'),
    footer
  });
  return { html, text };
}

export function renderEmail({
  label,
  tone = 'info',
  preheader = '',
  heading,
  firstName = '',
  intro = [],
  details = [],
  sections = [],
  box = null,
  after = [],
  button,
  security = ''
}) {
  const greeting = `Hi ${oneLine(firstName) || 'there'},`;
  const url = portalLink(button.path);

  const body = [
    paragraph(greeting),
    intro
      .filter(Boolean)
      .map((text) => paragraph(text))
      .join('\n'),
    detailsTable(details),
    sections.map(listSection).join('\n'),
    boxBlock(box),
    after
      .filter(Boolean)
      .map((text) => paragraph(text))
      .join('\n'),
    buttonBlock(button),
    security
      ? `<p style="margin:0 0 18px;font-family:${SANS};font-size:12.5px;line-height:1.5;color:${C.inkSoft}">${multiline(security)}</p>`
      : ''
  ].join('\n');
  const html = frame({ label, tone, preheader, heading, body, footer: FOOTER });

  const lines = ['TRES MARIAS CATERING SERVICES', oneLine(label), '', oneLine(heading), '', greeting, ''];
  intro.filter(Boolean).forEach((text) => lines.push(String(text).trim(), ''));
  if (details.length) {
    details.forEach((row) => lines.push(`${oneLine(row.label)}: ${oneLine(row.value)}`));
    lines.push('');
  }
  sections
    .filter((section) => section && section.rows && section.rows.length)
    .forEach((section) => {
      lines.push(oneLine(section.heading));
      section.rows.forEach((row) => lines.push(`- ${oneLine(row.label)}: ${oneLine(row.value)}`));
      lines.push('');
    });
  if (box && box.text) lines.push(box.title ? `${oneLine(box.title)}:` : '', String(box.text).trim(), '');
  after.filter(Boolean).forEach((text) => lines.push(String(text).trim(), ''));
  lines.push(`${oneLine(button.label)}:`, url, '');
  if (security) lines.push(String(security).trim(), '');
  lines.push(BUSINESS.name, '', '--', ...FOOTER);

  return { html, text: joinLines(lines) };
}

export function renderCodeEmail({
  label,
  preheader = '',
  heading,
  firstName = '',
  intro,
  code,
  validMinutes,
  ifNotYou,
  reason
}) {
  const greeting = `Hi ${oneLine(firstName) || 'there'},`;
  const digits = oneLine(code);
  const footer = footerLines(reason);

  const body = [
    paragraph(greeting),
    paragraph(intro),
    codeBlock(digits, validMinutes),
    boxBlock({ title: 'Never share this code with anyone', text: ifNotYou, tone: 'info' })
  ].join('\n');
  const html = frame({ label, tone: 'info', preheader, heading, body, footer });

  const text = joinLines([
    'TRES MARIAS CATERING SERVICES',
    oneLine(label),
    '',
    oneLine(heading),
    '',
    greeting,
    '',
    String(intro).trim(),
    '',
    digits,
    '',
    `It expires in ${validMinutes} minutes. Never share this code with anyone.`,
    String(ifNotYou).trim(),
    '',
    BUSINESS.name,
    '',
    '--',
    ...footer
  ]);

  return { html, text };
}
