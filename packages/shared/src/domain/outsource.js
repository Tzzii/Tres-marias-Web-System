import { BUSINESS, OUTSOURCE_SERVICES } from '../services/config.js';
import { formatDate, peso } from '../utils/format.js';
import { HOLDS_DATE } from '../utils/status.js';
import { EMAIL_RE } from '../utils/validation.js';

/**
 * Outsourcing rules that need no stored data: the "no event" value, the contract statuses and the
 * moves allowed between them, how a partner can be reached, what a partner's details, a contract, a
 * send and a status change need, the lines written to the histories and to a reservation's audit
 * trail, what the pages show of a partner and a contract, and the contract text.
 *
 * Pure (no database, no localStorage, no React), so the API server (apps/api/src/modules/outsource), its
 * seed (apps/api/src/seedData/outsourceSeed.js) and the admin page all use this one copy instead of each
 * keeping its own (docs/backend-development-phases.md §7.8). A refusal comes back as
 * data, { code, message, meta }: the ApiError each service then throws.
 *
 * A "contract" in this code is the stored record of an outsourcing REQUEST (the table, the functions and
 * the ids keep that name). Tres Marias does not send a partner a contract: the partner's own rates and
 * terms are what the admin follows, and the text that goes out only asks whether they can supply the
 * items for the event, answered by text or call to the business number. So every text the admin or a
 * partner reads says "request".
 */

// Value used on a contract that is not tied to a reservation (e.g. topping up stock)
export const NO_EVENT = 'none';

// Contract statuses, and the statuses each one may move to next
export const CONTRACT_STATUSES = ['draft', 'sent', 'accepted', 'declined', 'completed', 'cancelled'];
export const NEXT_STATUS = {
  draft: ['cancelled'],
  sent: ['accepted', 'declined', 'cancelled'],
  accepted: ['completed', 'cancelled'],
  declined: [],
  completed: [],
  cancelled: []
};

// The most a request's outsource price may be, in whole pesos
const MAX_AMOUNT = 10000000;

// A refusal as data: the ApiError a service throws
const refuse = (code, message, meta = {}) => ({ code, message, meta });
const invalid = (message, meta) => refuse('INVALID', message, meta);

/** How a partner can be reached, in sending order: ['email', 'sms'], one of the two, or none. */
export const channelsOf = (partner) => [...(partner.email ? ['email'] : []), ...(partner.mobile ? ['sms'] : [])];

/* ============================ Partners ============================ */

// The email address (trimmed, lower case) and mobile number (without spaces or dashes) as saved
const contactOf = (values) => ({ email: (values.email || '').trim().toLowerCase(), mobile: (values.mobile || '').replace(/[\s-]/g, '') });

/**
 * What is wrong with a partner's details, or null: the partner dialog's rules, in its order. A name of
 * 2+ characters not already used (any case; `names` are the other partners' names, archived ones
 * included), a service from OUTSOURCE_SERVICES, and a way to reach them: an email address, a mobile
 * number or both (a partner with neither could never be sent a request), each well formed.
 */
export function partnerProblem(values, { names = [] } = {}) {
  const name = (values.name || '').trim();
  if (name.length < 2) return invalid('Enter the partner name.', { field: 'name' });
  if (names.some((other) => other.toLowerCase() === name.toLowerCase())) return refuse('NAME_TAKEN', `"${name}" is already a partner.`, { field: 'name' });
  if (!OUTSOURCE_SERVICES.includes(values.service)) return invalid('Choose what they supply.', { field: 'service' });
  const { email, mobile } = contactOf(values);
  if (!email && !mobile) return invalid('Give an email address or a mobile number so requests can reach them.', { field: 'email' });
  if (email && !EMAIL_RE.test(email)) return invalid('Enter a valid email address.', { field: 'email' });
  if (mobile && !/^(09\d{9}|\+639\d{9})$/.test(mobile)) return invalid('Enter a valid mobile number, e.g. +63 917 123 4567.', { field: 'mobile' });
  return null;
}

/**
 * A partner's details as saved, once partnerProblem() has passed, in the order an edit's history line
 * names them: { name, service, contactPerson, email, mobile, address, notes }.
 */
export const partnerFields = (values) => ({
  name: (values.name || '').trim(),
  service: values.service,
  contactPerson: (values.contactPerson || '').trim(),
  ...contactOf(values),
  address: (values.address || '').trim(),
  notes: (values.notes || '').trim()
});

/** The history line of a partner edit, e.g. "Changed contactPerson, mobile.", or '' when nothing changed. */
export function partnerEditText(partner, fields) {
  const edits = Object.keys(fields).filter((key) => partner[key] !== fields[key]);
  return edits.length ? `Changed ${edits.join(', ')}.` : '';
}

/** The history line of a new partner, and of archiving or restoring one. */
export const PARTNER_ADDED_TEXT = 'Added as an outsourcing partner.';
export const archiveText = (archived) => (archived ? 'Archived.' : 'Restored from the archive.');

/** Partners that can't be archived because a request sent to them waits for their reply (IN_USE), or null. */
export function partnerArchiveProblem(partners, archived, hasOpenContract) {
  const busy = archived ? partners.filter((partner) => hasOpenContract(partner.id)) : [];
  return busy.length ? refuse('IN_USE', `Close their open requests first: ${busy.map((partner) => partner.name).join(', ')}.`) : null;
}

/**
 * A partner's contract counts: how many it has (`contractCount`), how many were sent and wait for its
 * answer (`openCount`), and when one was last sent (`lastSentAt`, null when none). `contracts` are that
 * partner's contracts.
 */
export function partnerStats(contracts) {
  const sent = contracts.filter((contract) => contract.sentAt);
  return {
    contractCount: contracts.length,
    openCount: contracts.filter((contract) => contract.status === 'sent').length,
    lastSentAt: sent.length ? Math.max(...sent.map((contract) => contract.sentAt)) : null
  };
}

/** A partner as the pages show it: the record, how it can be reached (`channels`) and its partnerStats(). */
export const partnerView = (partner, stats) => ({ ...partner, channels: channelsOf(partner), ...stats });

/** The order of the partner list: by OUTSOURCE_SERVICES, then by name. */
export const partnerOrder = (a, b) => OUTSOURCE_SERVICES.indexOf(a.service) - OUTSOURCE_SERVICES.indexOf(b.service) || a.name.localeCompare(b.name);

/* ============================ Contracts ============================ */

/**
 * A contract's item lines as saved: [{ name (trimmed), qty (a number) }]. Rows with neither a name nor
 * a quantity are dropped first, so a blank last row in the dialog is not an error.
 */
export const contractItems = (items) =>
  (items || []).map((item) => ({ name: (item.name || '').trim(), qty: Number(item.qty) })).filter((item) => item.name || item.qty);

/** The reservation a contract is for: its ref, or NO_EVENT when none is chosen. */
export const contractRef = (values) => (values.reservationRef && values.reservationRef !== NO_EVENT ? values.reservationRef : NO_EVENT);

/** The outsource price as saved: a number of pesos, 0 when left blank. */
export const contractAmount = (values) => Number(values.amount || 0);

/**
 * What is wrong with a new or edited draft, or null: the request dialog's rules, in its order.
 * `partner` is the partner the contract names (null when there is none: NOT_FOUND), and it must not be
 * archived; at least one item, each with a name and a quantity of 1 to 100,000 (meta.row is the row
 * among the item lines kept, see contractItems); the date needed, today or later (`today` is
 * "YYYY-MM-DD"); for a reservation, one that is approved to confirmed (`refStatus` is the status of the
 * reservation named exactly, null when there is none); and an outsource price in whole pesos, 0 to
 * ₱10,000,000 (a request is only edited while it is a draft, so its date is always checked).
 */
export function contractProblem(values, { partner, refStatus, today }) {
  if (!partner) return refuse('NOT_FOUND', 'Partner not found.');
  if (partner.archived) return invalid('That partner is archived. Restore them first.', { field: 'partnerId' });
  const items = contractItems(values.items);
  if (!items.length) return invalid('List at least one item.', { field: 'items' });
  const bad = items.findIndex((item) => !item.name || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 100000);
  if (bad >= 0) return invalid('Each item needs a name and a quantity of 1 or more.', { field: 'items', row: bad });
  if (!values.needBy) return invalid('Choose the date the items are needed.', { field: 'needBy' });
  if (values.needBy < today) return invalid('The date needed is in the past.', { field: 'needBy' });
  if (contractRef(values) !== NO_EVENT && !HOLDS_DATE.includes(refStatus)) return invalid('Choose an approved or confirmed reservation.', { field: 'reservationRef' });
  const amount = contractAmount(values);
  if (!Number.isInteger(amount) || amount < 0 || amount > MAX_AMOUNT) {
    return invalid(`Enter the outsource price in whole pesos, up to ${peso(MAX_AMOUNT)}.`, { field: 'amount' });
  }
  return null;
}

/** The history lines of a draft: when it is written, and when it is changed. */
export const DRAFTED_TEXT = 'Drafted the request.';
export const EDITED_TEXT = 'Edited the draft.';

/**
 * What stops a request from being sent, or null: it must be a draft or sent and still unanswered
 * (LOCKED otherwise), its partner must exist, must not be archived (an archived partner is given no new
 * contracts; restore them first) and must have an email address or a mobile number (NO_CHANNEL), and
 * the text (`text`, already trimmed) must be at least 20 characters.
 */
export function sendProblem(contract, partner, text) {
  if (!['draft', 'sent'].includes(contract.status)) return refuse('LOCKED', 'Only a draft or an unanswered request can be sent.');
  if (!partner) return refuse('NOT_FOUND', 'Partner not found.');
  if (partner.archived) return invalid('That partner is archived. Restore them first.', { field: 'partner' });
  if (!channelsOf(partner).length) return refuse('NO_CHANNEL', `${partner.name} has no email address or mobile number. Add one first.`, { field: 'partner' });
  if (text.length < 20) return invalid('The request text is too short to send.', { field: 'body' });
  return null;
}

/**
 * One send's deliveries: one per channel the partner has (channelsOf), each carrying the identical text,
 * so a partner reachable only by SMS gets word for word what an emailed partner gets.
 */
export const contractDeliveries = (partner, text, at) =>
  channelsOf(partner).map((channel) => ({ channel, to: channel === 'email' ? partner.email : partner.mobile, at, body: text }));

// "email" or "SMS", as the history lines name a channel
const channelWord = (channel) => (channel === 'email' ? 'email' : 'SMS');

/** The request's history line of a send, with where it went, e.g. "Sent the request by email (a@b.ph) and SMS (09171112233)." */
export const sentText = (deliveries) => `Sent the request by ${deliveries.map((d) => `${channelWord(d.channel)} (${d.to})`).join(' and ')}.`;

/**
 * The same send in the reservation's audit trail, e.g. "Sent the request by email and SMS.": the
 * customer sees that trail too, so it names the channels only, never the partner's email address or
 * mobile number.
 */
export const sentActivityText = (deliveries) => `Sent the request by ${deliveries.map((d) => channelWord(d.channel)).join(' and ')}.`;

/** What is wrong with a status change, or null: a move NEXT_STATUS allows, and a reason of 5+ characters for a decline or a cancellation. */
export function statusProblem(contract, status, reason) {
  if (!NEXT_STATUS[contract.status].includes(status)) return invalid(`A ${contract.status} request cannot be marked ${status}.`);
  if (['declined', 'cancelled'].includes(status) && reason.length < 5) return invalid('Give a short reason.', { field: 'note' });
  return null;
}

// The history line of each status change
const STATUS_TEXT = {
  accepted: 'Partner accepted the request.',
  declined: 'Partner declined the request.',
  completed: 'Marked delivered and completed.',
  cancelled: 'Cancelled the request.'
};

/** The history line of a status change, with the reason when one was given, e.g. "Partner declined the request. Reason: Fully booked." */
export const statusText = (status, reason) => `${STATUS_TEXT[status]}${reason ? ` Reason: ${reason}` : ''}`;

/**
 * The contract fields a status change saves: the status; the note (the reason for a decline or a
 * cancellation), except that marking a contract completed without a note keeps what the partner said
 * when they accepted; and when the partner answered (`answeredAt`, for accepted and declined).
 */
export function statusChanges(status, reason, at) {
  const changes = { status };
  if (status !== 'completed' || reason) changes.answerNote = reason;
  if (['accepted', 'declined'].includes(status)) changes.answeredAt = at;
  return changes;
}

/**
 * A line of a reservation's audit trail about one of its contracts, e.g. "Outsourcing · Batangas Party
 * Rentals: Drafted the request." `who` is the partner's name (the contract's ref when there is none).
 */
export const outsourceActivity = (who, text) => `Outsourcing · ${who}: ${text}`;

/**
 * A contract as the pages show it: the record plus its partner's name, contact person, service, email,
 * mobile and channels, its event's name, date and venue, and a one-line summary of the items
 * ("Monobloc chair × 150, Round table × 15"). `partner` and `reservation` ({ eventName, date, venue:
 * { name, city } }) may be null.
 */
export function contractView(contract, partner, reservation) {
  return {
    ...contract,
    partnerName: partner ? partner.name : 'Removed partner',
    contactPerson: partner ? partner.contactPerson : '',
    service: partner ? partner.service : '',
    partnerEmail: partner ? partner.email : '',
    partnerMobile: partner ? partner.mobile : '',
    channels: partner ? channelsOf(partner) : [],
    eventName: reservation ? reservation.eventName : '',
    eventDate: reservation ? reservation.date : '',
    eventVenue: reservation ? `${reservation.venue.name}, ${reservation.venue.city}` : '',
    itemsSummary: contract.items.map((item) => `${item.name} × ${item.qty}`).join(', ')
  };
}

/**
 * The request text, built once and sent unchanged to email and SMS. It is not a contract: it asks the
 * partner whether they can supply these items for the event. The last line tells them to text or call the
 * business number to confirm (a reply to an SMS sender name goes nowhere, so the text never asks them to
 * "reply"); the admin hears the answer on that phone and records it. The price is the partner's own, the
 * one the admin follows.
 * A pure function, so the compose dialog can show the admin exactly what will go out and their
 * edits to it are what both channels carry.
 */
export function composeContractText({ ref, partner, items = [], needBy, eventName, eventDate, venue, amount, notes }) {
  const greeting = partner.contactPerson ? `Hi ${partner.contactPerson} (${partner.name}),` : `Hi ${partner.name},`;
  const forEvent = eventName ? ` for ${eventName}${eventDate ? ` on ${formatDate(eventDate)}` : ''}` : '';
  const lines = [
    `${BUSINESS.name} · Outsourcing request ${ref}`,
    '',
    greeting,
    '',
    `We would like to rent the following${forEvent}:`,
    ...items.filter((i) => i.name && i.qty).map((i) => `- ${i.name}: ${i.qty} pcs`),
    ''
  ];
  if (needBy) lines.push(`Needed on ${formatDate(needBy)}${venue ? ` at ${venue}` : ''}.`);
  if (Number(amount) > 0) lines.push(`Agreed amount: ${peso(amount)}.`);
  if (notes && notes.trim()) lines.push(notes.trim());
  lines.push('', `Please text or call ${BUSINESS.phone} to confirm.`);
  return lines.join('\n');
}
