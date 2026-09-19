import { BUSINESS, OUTSOURCE_SERVICES } from './config.js';
import { ApiError, clone, latency, nextId, read, write } from './store.js';
import { formatDate, peso, todayISO } from '../utils/format.js';
import { HOLDS_DATE } from '../utils/status.js';
import { EMAIL_RE } from '../utils/validation.js';

/**
 * Outsourcing (admin): the partners Tres Marias rents from when its own stock runs short,
 * and the contracts sent to them.
 *
 * A partner needs at least one way to be reached: an email address, a mobile number, or both.
 * A contract is written once and sent to every channel that partner has, with the same text in
 * each — `sendContract` takes one `body` and copies it into an email and an SMS delivery, so a
 * partner reachable only by mobile number gets word for word what an emailed partner gets.
 *
 * Contract statuses: draft -> sent -> accepted or declined; accepted -> completed.
 * Cancelled is the exit from draft, sent or accepted.
 */

// Value used on a contract that is not tied to a reservation (e.g. topping up stock)
export const NO_EVENT = 'none';

// Contract statuses, and the statuses each one may move to next
export const CONTRACT_STATUSES = ['draft', 'sent', 'accepted', 'declined', 'completed', 'cancelled'];
const NEXT_STATUS = {
  draft: ['cancelled'],
  sent: ['accepted', 'declined', 'cancelled'],
  accepted: ['completed', 'cancelled'],
  declined: [],
  completed: [],
  cancelled: []
};

// Name of the signed-in admin, for the history logs
const ADMIN_NAME = () => {
  try {
    const user = JSON.parse(sessionStorage.getItem('tm.admin.session') || localStorage.getItem('tm.admin.session'));
    return (user && user.user && user.user.name) || 'Tres Marias team';
  } catch (e) {
    return 'Tres Marias team';
  }
};

/** How a partner can be reached, in sending order: ['email', 'sms'], one of the two, or none. */
export const channelsOf = (partner) => [...(partner.email ? ['email'] : []), ...(partner.mobile ? ['sms'] : [])];

// Add an entry to a contract's history. When the contract is for a reservation, the same line also
// goes in that reservation's audit trail, e.g. "Outsourcing / Batangas Party Rentals: Sent the contract."
const log = (data, contract, text) => {
  const actor = ADMIN_NAME();
  contract.history.push({ at: Date.now(), actor, text });
  if (contract.reservationRef && contract.reservationRef !== NO_EVENT) {
    const reservation = data.reservations.find((r) => r.ref === contract.reservationRef);
    const partner = data.outsourcing.partners.find((p) => p.id === contract.partnerId);
    if (reservation) reservation.activity.push({ at: Date.now(), actor, text: `Outsourcing · ${partner ? partner.name : contract.ref}: ${text}` });
  }
};

// Find a partner or a contract, or throw
const findPartner = (data, id) => {
  const partner = data.outsourcing.partners.find((p) => p.id === id);
  if (!partner) throw new ApiError('NOT_FOUND', 'Partner not found.');
  return partner;
};
const findContract = (data, id) => {
  const contract = data.outsourcing.contracts.find((c) => c.id === id);
  if (!contract) throw new ApiError('NOT_FOUND', 'Contract not found.');
  return contract;
};

/** Partner plus how it can be reached and how its contracts are going. */
function enrichPartner(partner, data) {
  const contracts = data.outsourcing.contracts.filter((c) => c.partnerId === partner.id);
  const sent = contracts.filter((c) => c.sentAt);
  return {
    ...clone(partner),
    channels: channelsOf(partner),
    contractCount: contracts.length,
    openCount: contracts.filter((c) => c.status === 'sent').length,
    lastSentAt: sent.length ? Math.max(...sent.map((c) => c.sentAt)) : null
  };
}

/** Contract plus its partner, its event and a one-line summary of the items. */
function enrichContract(contract, data) {
  const partner = data.outsourcing.partners.find((p) => p.id === contract.partnerId);
  const reservation =
    contract.reservationRef && contract.reservationRef !== NO_EVENT ? data.reservations.find((r) => r.ref === contract.reservationRef) : null;
  return {
    ...clone(contract),
    partnerName: partner ? partner.name : 'Removed partner',
    contactPerson: partner ? partner.contactPerson : '',
    service: partner ? partner.service : '',
    partnerEmail: partner ? partner.email : '',
    partnerMobile: partner ? partner.mobile : '',
    channels: partner ? channelsOf(partner) : [],
    eventName: reservation ? reservation.eventName : '',
    eventDate: reservation ? reservation.date : '',
    eventVenue: reservation ? `${reservation.venue.name}, ${reservation.venue.city}` : '',
    itemsSummary: contract.items.map((i) => `${i.name} × ${i.qty}`).join(', ')
  };
}

/**
 * The contract text, built once and sent unchanged to email and SMS.
 * A pure function, so the compose dialog can show the admin exactly what will go out and their
 * edits to it are what both channels carry.
 */
export function composeContractText({ ref, partner, items = [], needBy, eventName, eventDate, venue, amount, notes }) {
  const greeting = partner.contactPerson ? `Hi ${partner.contactPerson} (${partner.name}),` : `Hi ${partner.name},`;
  const forEvent = eventName ? ` for ${eventName}${eventDate ? ` on ${formatDate(eventDate)}` : ''}` : '';
  const lines = [
    `${BUSINESS.name} · Outsourcing contract ${ref}`,
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
  lines.push('', 'Please reply YES to accept or NO if you cannot supply this.', `${BUSINESS.name} · ${BUSINESS.phone}`);
  return lines.join('\n');
}

/** All partners (archived ones only when asked), sorted by service order, then name. */
export async function listPartners({ includeArchived = false } = {}) {
  await latency(160, 400);
  const data = read();
  return data.outsourcing.partners
    .filter((partner) => includeArchived || !partner.archived)
    .map((partner) => enrichPartner(partner, data))
    .sort((a, b) => OUTSOURCE_SERVICES.indexOf(a.service) - OUTSOURCE_SERVICES.indexOf(b.service) || a.name.localeCompare(b.name));
}

/** All contracts, newest first. */
export async function listContracts() {
  await latency(180, 420);
  const data = read();
  return data.outsourcing.contracts.map((contract) => enrichContract(contract, data)).sort((a, b) => b.createdAt - a.createdAt);
}

/** Reservations a contract can be assigned to: approved to confirmed bookings, soonest first. */
export async function listOutsourceEvents() {
  await latency(120, 300);
  return read()
    .reservations.filter((r) => HOLDS_DATE.includes(r.status))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ ref: r.ref, eventName: r.eventName, date: r.date, guests: r.guests, venue: `${r.venue.name}, ${r.venue.city}` }));
}

// Check a partner's details. A partner with neither an email nor a mobile number could not be
// reached at all, so one of the two is required; whichever is filled in must be well formed.
function validatePartner(data, values, id) {
  const name = (values.name || '').trim();
  if (name.length < 2) throw new ApiError('INVALID', 'Enter the partner name.', { field: 'name' });
  if (data.outsourcing.partners.some((p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase())) {
    throw new ApiError('NAME_TAKEN', `"${name}" is already a partner.`, { field: 'name' });
  }
  if (!OUTSOURCE_SERVICES.includes(values.service)) throw new ApiError('INVALID', 'Choose what they supply.', { field: 'service' });
  const email = (values.email || '').trim().toLowerCase();
  const mobile = (values.mobile || '').replace(/[\s-]/g, '');
  if (!email && !mobile) throw new ApiError('INVALID', 'Give an email address or a mobile number so contracts can reach them.', { field: 'email' });
  if (email && !EMAIL_RE.test(email)) throw new ApiError('INVALID', 'Enter a valid email address.', { field: 'email' });
  if (mobile && !/^(09\d{9}|\+639\d{9})$/.test(mobile)) throw new ApiError('INVALID', 'Enter a valid mobile number, e.g. 0917 123 4567.', { field: 'mobile' });
  return { name, email, mobile };
}

/** Add a partner, or save changes to one: pass `id` to edit, or null to add. */
export async function savePartner(id, values) {
  await latency(300, 550);
  return write((data) => {
    const { name, email, mobile } = validatePartner(data, values, id);
    const fields = {
      name,
      service: values.service,
      contactPerson: (values.contactPerson || '').trim(),
      email,
      mobile,
      address: (values.address || '').trim(),
      notes: (values.notes || '').trim()
    };

    if (!id) {
      const partner = {
        id: `op-${Date.now().toString(36)}`,
        ...fields,
        archived: false,
        history: [{ at: Date.now(), actor: ADMIN_NAME(), text: 'Added as an outsourcing partner.' }]
      };
      data.outsourcing.partners.push(partner);
      return enrichPartner(partner, data);
    }

    // Describe what changed for the history
    const partner = findPartner(data, id);
    const edits = Object.keys(fields).filter((key) => partner[key] !== fields[key]);
    Object.assign(partner, fields);
    if (edits.length) partner.history.push({ at: Date.now(), actor: ADMIN_NAME(), text: `Changed ${edits.join(', ')}.` });
    return enrichPartner(partner, data);
  });
}

/** Archive or restore partners. A partner still waiting to answer a contract can't be archived. */
export async function setPartnerArchived(ids, archived) {
  await latency(250, 450);
  return write((data) => {
    const partners = ids.map((id) => findPartner(data, id));
    const busy = archived ? partners.filter((p) => data.outsourcing.contracts.some((c) => c.partnerId === p.id && c.status === 'sent')) : [];
    if (busy.length) throw new ApiError('IN_USE', `Close their open contracts first: ${busy.map((p) => p.name).join(', ')}.`);
    partners.forEach((partner) => {
      if (partner.archived === archived) return;
      partner.archived = archived;
      partner.history.push({ at: Date.now(), actor: ADMIN_NAME(), text: archived ? 'Archived.' : 'Restored from the archive.' });
    });
    return { count: partners.length };
  });
}

// Check a contract's partner, items, date and amount. Rows with neither a name nor a quantity are
// dropped first, so a blank last row in the dialog is not an error.
function validateContract(data, values, contract) {
  const partner = findPartner(data, values.partnerId);
  if (partner.archived) throw new ApiError('INVALID', 'That partner is archived. Restore them first.', { field: 'partnerId' });
  const items = (values.items || [])
    .map((item) => ({ name: (item.name || '').trim(), qty: Number(item.qty) }))
    .filter((item) => item.name || item.qty);
  if (!items.length) throw new ApiError('INVALID', 'List at least one item.', { field: 'items' });
  const bad = items.findIndex((item) => !item.name || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 100000);
  if (bad >= 0) throw new ApiError('INVALID', 'Each item needs a name and a quantity of 1 or more.', { field: 'items', row: bad });
  if (!values.needBy) throw new ApiError('INVALID', 'Choose the date the items are needed.', { field: 'needBy' });
  // A contract that is still a draft has to be needed today or later; one already sent keeps its date
  if (!contract || contract.status === 'draft') {
    if (values.needBy < todayISO()) throw new ApiError('INVALID', 'The date needed is in the past.', { field: 'needBy' });
  }
  const ref = values.reservationRef && values.reservationRef !== NO_EVENT ? values.reservationRef : NO_EVENT;
  if (ref !== NO_EVENT) {
    const reservation = data.reservations.find((r) => r.ref === ref);
    if (!reservation || !HOLDS_DATE.includes(reservation.status)) throw new ApiError('INVALID', 'Choose an approved or confirmed reservation.', { field: 'reservationRef' });
  }
  const amount = Number(values.amount || 0);
  if (!(amount >= 0) || amount > 10000000) throw new ApiError('INVALID', 'Enter the agreed amount in pesos.', { field: 'amount' });
  return { items, ref, amount };
}

/**
 * Save a contract as a draft: pass `id` to change an existing draft, or null for a new one.
 * Only drafts can be edited; once sent, a contract's terms are what the partner received.
 */
export async function saveContract(id, values) {
  await latency(320, 600);
  return write((data) => {
    const existing = id ? findContract(data, id) : null;
    if (existing && existing.status !== 'draft') throw new ApiError('LOCKED', 'This contract has been sent and can no longer be edited.');
    const { items, ref, amount } = validateContract(data, values, existing);
    const fields = { partnerId: values.partnerId, reservationRef: ref, items, needBy: values.needBy, amount, notes: (values.notes || '').trim() };

    if (!existing) {
      const contract = {
        id: `oc-${Date.now().toString(36)}`,
        ref: nextId(data, 'outsource', `OUT-${new Date().getFullYear()}-`),
        ...fields,
        status: 'draft',
        body: '',
        deliveries: [],
        createdAt: Date.now(),
        sentAt: null,
        answeredAt: null,
        answerNote: '',
        history: []
      };
      data.outsourcing.contracts.push(contract);
      log(data, contract, 'Drafted the contract.');
      return enrichContract(contract, data);
    }

    Object.assign(existing, fields);
    log(data, existing, 'Edited the draft.');
    return enrichContract(existing, data);
  });
}

/**
 * Send (or send again) a contract to its partner.
 *
 * The same `body` goes to every channel the partner has: an email when they have an email address,
 * an SMS when they have a mobile number, both when they have both. A partner reachable only by SMS
 * therefore gets exactly the wording an emailed partner gets.
 */
export async function sendContract(id, { body } = {}) {
  await latency(500, 900);
  return write((data) => {
    const contract = findContract(data, id);
    if (!['draft', 'sent'].includes(contract.status)) throw new ApiError('LOCKED', 'Only a draft or an unanswered contract can be sent.');
    const partner = findPartner(data, contract.partnerId);
    const channels = channelsOf(partner);
    if (!channels.length) throw new ApiError('NO_CHANNEL', `${partner.name} has no email address or mobile number. Add one first.`, { field: 'partner' });
    const text = (body || '').trim();
    if (text.length < 20) throw new ApiError('INVALID', 'The contract text is too short to send.', { field: 'body' });

    const at = Date.now();
    // One delivery per channel, every one of them carrying the identical text
    const deliveries = channels.map((channel) => ({ channel, to: channel === 'email' ? partner.email : partner.mobile, at, body: text }));
    contract.body = text;
    contract.deliveries = [...contract.deliveries, ...deliveries];
    contract.status = 'sent';
    contract.sentAt = at;
    const where = deliveries.map((d) => `${d.channel === 'email' ? 'email' : 'SMS'} (${d.to})`).join(' and ');
    log(data, contract, `Sent the contract by ${where}.`);
    return enrichContract(contract, data);
  });
}

/**
 * Record what happened next: 'accepted' or 'declined' when the partner answers, 'completed' once the
 * items have arrived, 'cancelled' when the request is called off. A decline or a cancellation needs a
 * short note, so the reason stays on file.
 */
export async function setContractStatus(id, status, { note = '' } = {}) {
  await latency(300, 550);
  return write((data) => {
    const contract = findContract(data, id);
    if (!NEXT_STATUS[contract.status].includes(status)) throw new ApiError('INVALID', `A ${contract.status} contract cannot be marked ${status}.`);
    const reason = note.trim();
    if (['declined', 'cancelled'].includes(status) && reason.length < 5) throw new ApiError('INVALID', 'Give a short reason.', { field: 'note' });

    contract.status = status;
    contract.answerNote = reason;
    if (['accepted', 'declined'].includes(status)) contract.answeredAt = Date.now();
    const labels = {
      accepted: 'Partner accepted the contract.',
      declined: 'Partner declined the contract.',
      completed: 'Marked delivered and completed.',
      cancelled: 'Cancelled the contract.'
    };
    log(data, contract, `${labels[status]}${reason ? ` Reason: ${reason}` : ''}`);
    return enrichContract(contract, data);
  });
}
