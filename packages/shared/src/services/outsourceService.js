import { isRental } from './config.js';
import { ApiError, clone, latency, nextId, read, uid, write } from './store.js';
import {
  DRAFTED_TEXT,
  EDITED_TEXT,
  NO_EVENT,
  PARTNER_ADDED_TEXT,
  archiveText,
  contractAmount,
  contractDeliveries,
  contractItems,
  contractProblem,
  contractRef,
  contractView,
  outsourceActivity,
  partnerArchiveProblem,
  partnerEditText,
  partnerFields,
  partnerOrder,
  partnerProblem,
  partnerStats,
  partnerView,
  sendProblem,
  sentActivityText,
  sentText,
  statusChanges,
  statusProblem,
  statusText
} from '../domain/outsource.js';
import { todayISO } from '../utils/format.js';
import { HOLDS_DATE } from '../utils/status.js';

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
 *
 * The rules that need no stored data (NO_EVENT, the statuses and NEXT_STATUS, channelsOf, what a partner,
 * a contract, a send and a status change need, the history lines, the views, composeContractText) live in
 * domain/outsource.js, shared with the seed and the API server (apps/api/src/modules/outsource), so both
 * give the same answers and errors. The public ones are re-exported below, so code that imports them from
 * this file keeps working. The browser store sends nothing anywhere: a send only records its deliveries.
 */

export { CONTRACT_STATUSES, NO_EVENT, channelsOf, composeContractText } from '../domain/outsource.js';

// Name of the signed-in admin, for the history logs
const ADMIN_NAME = () => {
  try {
    const user = JSON.parse(sessionStorage.getItem('tm.admin.session') || localStorage.getItem('tm.admin.session'));
    return (user && user.user && user.user.name) || 'Tres Marias team';
  } catch (e) {
    return 'Tres Marias team';
  }
};

// A refusal from domain/outsource.js as the error the pages already handle
const toError = ({ code, message, meta }) => new ApiError(code, message, meta);

// Add an entry to a contract's history. When the contract is for a reservation, the same line also goes
// in that reservation's audit trail, e.g. "Outsourcing · Batangas Party Rentals: Sent the contract by
// email and SMS." (`activityText`, when given, is the line the audit trail gets instead: the customer
// sees that trail, so a send names the channels there, never the partner's email or mobile number.)
const log = (data, contract, text, activityText = text) => {
  const actor = ADMIN_NAME();
  contract.history.push({ at: Date.now(), actor, text });
  if (contract.reservationRef && contract.reservationRef !== NO_EVENT) {
    const reservation = data.reservations.find((r) => r.ref === contract.reservationRef);
    const partner = data.outsourcing.partners.find((p) => p.id === contract.partnerId);
    if (reservation) reservation.activity.push({ at: Date.now(), actor, text: outsourceActivity(partner ? partner.name : contract.ref, activityText) });
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

/** Partner plus how it can be reached and how its contracts are going (partnerView in domain/outsource.js). */
const enrichPartner = (partner, data) => partnerView(clone(partner), partnerStats(data.outsourcing.contracts.filter((c) => c.partnerId === partner.id)));

/** Contract plus its partner, its event and a one-line summary of the items (contractView in domain/outsource.js). */
function enrichContract(contract, data) {
  const partner = data.outsourcing.partners.find((p) => p.id === contract.partnerId) || null;
  const reservation =
    contract.reservationRef && contract.reservationRef !== NO_EVENT ? data.reservations.find((r) => r.ref === contract.reservationRef) || null : null;
  return contractView(clone(contract), partner, reservation);
}

/** All partners (archived ones only when asked), sorted by service order, then name. */
export async function listPartners({ includeArchived = false } = {}) {
  await latency(160, 400);
  const data = read();
  return data.outsourcing.partners
    .filter((partner) => includeArchived || !partner.archived)
    .map((partner) => enrichPartner(partner, data))
    .sort(partnerOrder);
}

/** All contracts, newest first. */
export async function listContracts() {
  await latency(180, 420);
  const data = read();
  return data.outsourcing.contracts.map((contract) => enrichContract(contract, data)).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Reservations a contract can be assigned to: approved to confirmed bookings, soonest first.
 * `rental` is true for an Equipment Rental booking (it has no guest count).
 */
export async function listOutsourceEvents() {
  await latency(120, 300);
  return read()
    .reservations.filter((r) => HOLDS_DATE.includes(r.status))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ ref: r.ref, eventName: r.eventName, date: r.date, guests: r.guests, rental: isRental(r.serviceType), venue: `${r.venue.name}, ${r.venue.city}` }));
}

/**
 * Add a partner, or save changes to one: pass `id` to edit, or null to add. A partner with neither an
 * email nor a mobile number could not be reached at all, so one of the two is required (partnerProblem).
 */
export async function savePartner(id, values) {
  await latency(300, 550);
  return write((data) => {
    const names = data.outsourcing.partners.filter((p) => p.id !== id).map((p) => p.name);
    const problem = partnerProblem(values, { names });
    if (problem) throw toError(problem);
    const fields = partnerFields(values);

    if (!id) {
      const partner = {
        id: uid('op'),
        ...fields,
        archived: false,
        history: [{ at: Date.now(), actor: ADMIN_NAME(), text: PARTNER_ADDED_TEXT }]
      };
      data.outsourcing.partners.push(partner);
      return enrichPartner(partner, data);
    }

    // Describe what changed for the history
    const partner = findPartner(data, id);
    const text = partnerEditText(partner, fields);
    Object.assign(partner, fields);
    if (text) partner.history.push({ at: Date.now(), actor: ADMIN_NAME(), text });
    return enrichPartner(partner, data);
  });
}

/** Archive or restore partners. A partner still waiting to answer a contract can't be archived. */
export async function setPartnerArchived(ids, archived) {
  await latency(250, 450);
  return write((data) => {
    const partners = ids.map((id) => findPartner(data, id));
    const open = (partnerId) => data.outsourcing.contracts.some((c) => c.partnerId === partnerId && c.status === 'sent');
    const problem = partnerArchiveProblem(partners, archived, open);
    if (problem) throw toError(problem);
    partners.forEach((partner) => {
      if (partner.archived === archived) return;
      partner.archived = archived;
      partner.history.push({ at: Date.now(), actor: ADMIN_NAME(), text: archiveText(archived) });
    });
    return { count: partners.length };
  });
}

/**
 * Save a contract as a draft: pass `id` to change an existing draft, or null for a new one.
 * Only drafts can be edited; once sent, a contract's terms are what the partner received.
 * The partner, items, date, event and amount are checked by contractProblem (domain/outsource.js).
 */
export async function saveContract(id, values) {
  await latency(320, 600);
  return write((data) => {
    const existing = id ? findContract(data, id) : null;
    if (existing && existing.status !== 'draft') throw new ApiError('LOCKED', 'This contract has been sent and can no longer be edited.');
    const partner = data.outsourcing.partners.find((p) => p.id === values.partnerId) || null;
    const ref = contractRef(values);
    const reservation = ref === NO_EVENT ? null : data.reservations.find((r) => r.ref === ref);
    const problem = contractProblem(values, { partner, refStatus: reservation ? reservation.status : null, today: todayISO() });
    if (problem) throw toError(problem);
    const fields = { partnerId: values.partnerId, reservationRef: ref, items: contractItems(values.items), needBy: values.needBy, amount: contractAmount(values), notes: (values.notes || '').trim() };

    if (!existing) {
      const contract = {
        id: uid('oc'),
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
      log(data, contract, DRAFTED_TEXT);
      return enrichContract(contract, data);
    }

    Object.assign(existing, fields);
    log(data, existing, EDITED_TEXT);
    return enrichContract(existing, data);
  });
}

/**
 * Send (or send again) a contract to its partner.
 *
 * The same `body` goes to every channel the partner has: an email when they have an email address,
 * an SMS when they have a mobile number, both when they have both. A partner reachable only by SMS
 * therefore gets exactly the wording an emailed partner gets. An archived partner is sent nothing.
 * The browser store only records the deliveries (nothing leaves the browser), so `deliveryNote`, which
 * the API version fills in when a channel did not really go out, is always ''.
 */
export async function sendContract(id, { body } = {}) {
  await latency(500, 900);
  return write((data) => {
    const contract = findContract(data, id);
    const partner = data.outsourcing.partners.find((p) => p.id === contract.partnerId) || null;
    const text = (body || '').trim();
    const problem = sendProblem(contract, partner, text);
    if (problem) throw toError(problem);

    // One delivery per channel, every one of them carrying the identical text
    const deliveries = contractDeliveries(partner, text, Date.now());
    contract.body = text;
    contract.deliveries = [...contract.deliveries, ...deliveries];
    contract.status = 'sent';
    contract.sentAt = deliveries[0].at;
    log(data, contract, sentText(deliveries), sentActivityText(deliveries));
    return { ...enrichContract(contract, data), deliveryNote: '' };
  });
}

/**
 * Record what happened next: 'accepted' or 'declined' when the partner answers, 'completed' once the
 * items have arrived, 'cancelled' when the request is called off. A decline or a cancellation needs a
 * short note, so the reason stays on file. Marking a contract completed without a note keeps what the
 * partner said when they accepted.
 */
export async function setContractStatus(id, status, { note = '' } = {}) {
  await latency(300, 550);
  return write((data) => {
    const contract = findContract(data, id);
    const reason = note.trim();
    const problem = statusProblem(contract, status, reason);
    if (problem) throw toError(problem);
    Object.assign(contract, statusChanges(status, reason, Date.now()));
    log(data, contract, statusText(status, reason));
    return enrichContract(contract, data);
  });
}
