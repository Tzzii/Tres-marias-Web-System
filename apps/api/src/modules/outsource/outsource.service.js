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
  partnerView,
  sendProblem,
  sentActivityText,
  sentText,
  statusChanges,
  statusProblem,
  statusText
} from '@tm/shared/src/domain/outsource.js';
import { BUSINESS, isRental } from '@tm/shared/src/services/config.js';
import { pool, tx } from '../../db.js';
import { mailer } from '../../integrations/mailer/index.js';
import { sms } from '../../integrations/sms/index.js';
import { ApiError } from '../../lib/ApiError.js';
import { newId, nextCounter } from '../../lib/ids.js';
import { isISODate, now, todayISO } from '../../lib/time.js';
import { markOutbox, saveToOutbox } from '../../outbox/outbox.repo.js';
import * as reservationsRepo from '../reservations/reservations.repo.js';
import * as repo from './outsource.repo.js';

/**
 * Outsourcing on the server (docs/backend-development-phases.md Phase 10, §9.10): the partners Tres
 * Marias rents from, the contracts sent to them, and each contract's status. Admin only. Same return
 * shapes, error codes, messages and meta.field / meta.row as the browser version (outsourceService.js):
 * the rules, texts and views are @tm/shared/src/domain/outsource.js, the code the browser version runs,
 * and its checks are repeated here in the same order because the server never trusts the page (§3 rule 3).
 *
 * Sending a contract really sends it, through the mail and SMS ports (integrations/mailer and sms), with
 * one text for every channel. Nothing waits on an email or SMS provider while rows are locked: the send
 * is saved first, in one transaction (the contract marked sent, one delivery per channel, each with an
 * outbox row marked 'queued', the history line and the booking's audit-trail line); after the commit
 * each message is handed to its port, and its outbox row records what happened ('sent', 'logged' or
 * 'failed'). A channel that did not really go out (the log driver only prints it, or the provider refused
 * it) adds a line to the contract's history, and the answer carries `deliveryNote`, which the page shows,
 * telling the admin to send the contract themselves (Download as .txt).
 *
 * Differences from the browser version, on purpose:
 * - The admin in the histories and the audit trail is the signed-in one (req.user.name).
 * - A partner, contract or booking must be named exactly as stored: the columns' collation ignores case
 *   and trailing spaces, and the browser version finds only the exact id or ref.
 * - The date needed must be a real "YYYY-MM-DD" day (else "Choose the date the items are needed."), and
 *   text fits its column (a contract's items up to 50 lines, each name up to 120 characters).
 * - Two partner names that differ only by an accent are the same name to the UNIQUE index (NAME_TAKEN).
 * - `deliveryNote` (above); the browser version sends nothing, so its note is always ''.
 *
 * Lock order: the contract's row first (every contract write starts with lockContract), then its
 * partner's row (a send reads it FOR SHARE, so archiving that partner waits for the send, and a send
 * waits for an archive in progress and then refuses the archived partner), then the booking's row (a
 * line in its audit trail reads it through the foreign key). Archiving partners locks their rows first,
 * before it reads their contracts.
 */

// A refusal from domain/outsource.js as an ApiError
const toError = ({ code, message, meta }) => new ApiError(code, message, meta);
const partnerNotFound = () => new ApiError('NOT_FOUND', 'Partner not found.');
const contractNotFound = () => new ApiError('NOT_FOUND', 'Contract not found.');

// The columns' limits (schema.sql) for what the forms leave to the server: a contract's lines and their names
const MAX_ITEMS = 50;
const ITEM_NAME_MAX = 120;

// True when a save failed because another partner already has the name (the UNIQUE name index)
const isNameTaken = (err) => Boolean(err) && err.code === 'ER_DUP_ENTRY' && String(err.sqlMessage || err.message).includes('uq_outsource_partners_name');
const nameTaken = (name) => new ApiError('NAME_TAKEN', `"${name}" is already a partner.`, { field: 'name' });

// A partner as the pages show it, read inside the transaction after a change
async function partnerViewOf(db, id) {
  const [partner] = await repo.findPartners(db, { ids: [id] });
  const stats = (await repo.partnerContractStats(db)).get(id) || { contractCount: 0, openCount: 0, lastSentAt: null };
  return partnerView(partner, stats);
}

// A contract as the pages show it, read after a change
async function contractViewOf(db, id) {
  const [row] = await repo.findContracts(db, { id });
  return contractView(row.contract, row.partner, row.reservation);
}

// The contract `id` names exactly, with its row locked until the transaction ends, or NOT_FOUND
async function lockedContract(conn, id) {
  const contract = typeof id === 'string' && id ? await repo.lockContract(conn, id) : null;
  if (!contract || contract.id !== id) throw contractNotFound();
  return contract;
}

/**
 * A line in a contract's history, and for a contract that is for a booking, the same line in that
 * booking's audit trail ("Outsourcing · <partner>: …"; `activityText` instead of `text` when given: a
 * send names only the channels there, since the customer sees that trail). `partnerName` is the partner's
 * name, or the contract's ref when there is none.
 */
async function logContract(conn, contract, partnerName, text, admin, activityText = text) {
  const at = now();
  await repo.insertContractHistory(conn, contract.id, { at, actor: admin.name, text });
  if (contract.reservationRef !== NO_EVENT && (await repo.readBookingStatus(conn, contract.reservationRef))) {
    await reservationsRepo.insertActivity(conn, contract.reservationRef, { at, actor: admin.name, text: outsourceActivity(partnerName, activityText) });
  }
}

/* ============================ Reads ============================ */

/** Every partner (archived ones only when asked), by service order then name, with how they are reached and their contract counts. */
export async function listPartners({ includeArchived = false } = {}) {
  const [partners, stats] = await Promise.all([repo.findPartners(pool, { includeArchived }), repo.partnerContractStats(pool)]);
  return partners.map((partner) => partnerView(partner, stats.get(partner.id) || { contractCount: 0, openCount: 0, lastSentAt: null })).sort(partnerOrder);
}

/** Every contract, newest first, with its partner, its event and a one-line summary of the items. */
export async function listContracts() {
  const rows = await repo.findContracts(pool);
  return rows.map((row) => contractView(row.contract, row.partner, row.reservation));
}

/**
 * The bookings a contract can be for: approved to confirmed, soonest first (same date: the earlier
 * request first). `rental` is true for an Equipment Rental booking; `venue` is "name, city".
 */
export async function listOutsourceEvents() {
  const bookings = await reservationsRepo.listHeldBookings(pool);
  return bookings.map((r) => ({ ref: r.ref, eventName: r.eventName, date: r.date, guests: r.guests, rental: isRental(r.serviceType), venue: `${r.venue.name}, ${r.venue.city}` }));
}

/* ============================ Partners ============================ */

/**
 * Add a partner (`id` null) or save changes to one (partnerProblem: a name not already used, what they
 * supply, and an email address or a mobile number, each well formed). As in the browser version the
 * details are checked before the partner is looked up. A new partner gets its first history line; an
 * edit that changes anything lists the fields it changed. Returns the partner as the pages show it.
 */
export async function savePartner(id, values, admin) {
  return tx(async (conn) => {
    const existing = id ? (await repo.findPartners(conn, { ids: [id], lock: true })).find((p) => p.id === id) || null : null;
    const names = (await repo.partnerNames(conn)).filter((p) => p.id !== id).map((p) => p.name);
    const problem = partnerProblem(values, { names });
    if (problem) throw toError(problem);
    const fields = partnerFields(values);
    const at = now();

    let partnerId = id;
    try {
      if (!id) {
        partnerId = newId('op');
        await repo.insertPartner(conn, { id: partnerId, ...fields, archived: false });
        await repo.insertPartnerHistory(conn, partnerId, { at, actor: admin.name, text: PARTNER_ADDED_TEXT });
      } else {
        if (!existing) throw partnerNotFound();
        const text = partnerEditText(existing, fields);
        await repo.updatePartner(conn, existing.id, fields);
        if (text) await repo.insertPartnerHistory(conn, existing.id, { at, actor: admin.name, text });
      }
    } catch (err) {
      if (isNameTaken(err)) throw nameTaken(fields.name);
      throw err;
    }
    return partnerViewOf(conn, partnerId);
  });
}

/**
 * Archive or restore partners (`ids`; a repeated id counts once per mention in `count`, as in the
 * browser version). A partner with a contract sent and still waiting for their answer can't be archived
 * (IN_USE, naming them). Their rows are locked before their contracts are read, so a contract being sent
 * to them at the same moment is either seen here or refused there. Returns { count }.
 */
export async function setPartnerArchived(ids, archived, admin) {
  const flag = Boolean(archived);
  return tx(async (conn) => {
    const unique = [...new Set(ids)];
    const partners = await repo.findPartners(conn, { ids: unique, lock: true });
    const list = ids.map((id) => partners.find((p) => p.id === id) || null);
    if (list.some((p) => !p)) throw partnerNotFound();
    const open = flag ? await repo.partnersWithOpenContracts(conn, unique) : new Set();
    const problem = partnerArchiveProblem(list, flag, (partnerId) => open.has(partnerId));
    if (problem) throw toError(problem);
    const done = new Set();
    for (const partner of list) {
      if (done.has(partner.id) || partner.archived === flag) continue;
      done.add(partner.id);
      await repo.updatePartner(conn, partner.id, { archived: flag });
      await repo.insertPartnerHistory(conn, partner.id, { at: now(), actor: admin.name, text: archiveText(flag) });
    }
    return { count: list.length };
  });
}

/* ============================ Contracts ============================ */

/**
 * Save a contract as a draft: a new one (`id` null; it gets the next OUT-YYYY- number) or changes to a
 * draft (LOCKED once sent: its terms are what the partner received). contractProblem checks the
 * partner (not archived), the items, the date needed (today or later), the booking (approved to
 * confirmed) and the amount (whole pesos up to ₱10,000,000). A draft for a booking also goes in that
 * booking's audit trail. Returns the contract as the pages show it.
 */
export async function saveContract(id, values, admin) {
  return tx(async (conn) => {
    const existing = id ? await lockedContract(conn, id) : null;
    if (existing && existing.status !== 'draft') throw new ApiError('LOCKED', 'This contract has been sent and can no longer be edited.');
    const partnerFound = typeof values.partnerId === 'string' && values.partnerId ? await repo.readPartner(conn, values.partnerId) : null;
    const partner = partnerFound && partnerFound.id === values.partnerId ? partnerFound : null;
    const ref = contractRef(values);
    const booking = ref !== NO_EVENT && typeof ref === 'string' ? await repo.readBookingStatus(conn, ref) : null;
    // A date that is not a real YYYY-MM-DD day is answered as a missing one, at the same step
    const checked = { ...values, needBy: isISODate(values.needBy) ? values.needBy : '' };
    const problem = contractProblem(checked, { partner, refStatus: booking && booking.ref === ref ? booking.status : null, today: todayISO() });
    if (problem) throw toError(problem);
    const items = contractItems(values.items);
    if (items.length > MAX_ITEMS) throw new ApiError('INVALID', `List up to ${MAX_ITEMS} items.`, { field: 'items' });
    const long = items.findIndex((item) => item.name.length > ITEM_NAME_MAX);
    if (long >= 0) throw new ApiError('INVALID', `Use ${ITEM_NAME_MAX} characters or fewer for an item name.`, { field: 'items', row: long });

    const fields = { partnerId: partner.id, reservationRef: ref, items, needBy: checked.needBy, amount: contractAmount(values), notes: values.notes.trim() };
    if (!existing) {
      const contract = {
        id: newId('oc'),
        ref: `OUT-${todayISO().slice(0, 4)}-${String(await nextCounter(conn, 'outsource')).padStart(4, '0')}`,
        ...fields,
        status: 'draft',
        body: '',
        createdAt: now(),
        sentAt: null,
        answeredAt: null,
        answerNote: ''
      };
      await repo.insertContract(conn, contract);
      await logContract(conn, contract, partner.name, DRAFTED_TEXT, admin);
      return contractViewOf(conn, contract.id);
    }
    await repo.updateContract(conn, existing.id, fields);
    await logContract(conn, { ...existing, ...fields }, partner.name, EDITED_TEXT, admin);
    return contractViewOf(conn, existing.id);
  });
}

// "email" or "SMS"
const CHANNEL_WORD = { email: 'email', sms: 'SMS' };

// The contract's history line for a channel that did not really go out: only logged (no provider yet), or refused
const undeliveredText = ({ channel, to, status }) =>
  status === 'logged'
    ? `The ${CHANNEL_WORD[channel]} to ${to} was not sent: no ${CHANNEL_WORD[channel]} service is connected yet, so it was only saved in the outbox. Send the contract yourself (Download as .txt).`
    : `The ${CHANNEL_WORD[channel]} to ${to} could not be sent. Send it again, or send the contract yourself (Download as .txt).`;

/**
 * The note the page shows after a send when a channel did not really go out, e.g. "OUT-2026-0008 is
 * marked sent, but no SMS service is connected yet, so the SMS was only saved. Download the .txt and
 * send it to Aling Nena Chairs and Tables yourself." '' when every channel went out.
 */
function deliveryNote(ref, partnerName, results) {
  const logged = results.filter((r) => r.status === 'logged').map((r) => CHANNEL_WORD[r.channel]);
  const failed = results.filter((r) => r.status === 'failed').map((r) => CHANNEL_WORD[r.channel]);
  if (!logged.length && !failed.length) return '';
  const parts = [];
  if (logged.length) parts.push(`no ${logged.join(' or ')} service is connected yet, so the ${logged.join(' and ')} ${logged.length > 1 ? 'were' : 'was'} only saved`);
  if (failed.length) parts.push(`the ${failed.join(' and ')} could not be sent`);
  return `${ref} is marked sent, but ${parts.join(', and ')}. Download the .txt and send it to ${partnerName} yourself.`;
}

/**
 * Hand each queued delivery to its port after the send was saved, and record how it went on its outbox
 * row. A provider that refuses a message (or a port that fails) never undoes the send: that channel is
 * 'failed', with the reason in the outbox row and on the server console. Returns the deliveries with
 * their `status`: 'sent', 'logged' or 'failed'.
 */
async function deliverAll(contract, deliveries, subject) {
  const results = [];
  for (const delivery of deliveries) {
    let outcome;
    try {
      outcome = delivery.channel === 'email' ? await mailer.deliver({ to: delivery.to, subject, text: delivery.body }) : await sms.deliver({ to: delivery.to, body: delivery.body });
    } catch (err) {
      console.error(`[outsource] ${contract.ref}: the ${CHANNEL_WORD[delivery.channel]} to ${delivery.to} could not be sent:`, err.message);
      outcome = { status: 'failed', providerId: null, error: err.message };
    }
    await markOutbox(delivery.outboxId, { status: outcome.status, providerId: outcome.providerId, error: outcome.error || null }).catch((err) =>
      console.error(`[outsource] ${contract.ref}: could not record the ${CHANNEL_WORD[delivery.channel]} in the outbox:`, err.message)
    );
    results.push({ ...delivery, status: outcome.status });
  }
  return results;
}

/**
 * Send (or send again) a contract to its partner (sendProblem: a draft or an unanswered contract, a
 * partner who is not archived and can be reached, and at least 20 characters of text). The same text
 * goes to every channel the partner has: an email when they have an email address, an SMS when they
 * have a mobile number, both when they have both. Saved first, then sent (see the top of this file).
 * Returns the contract as the pages show it, plus `deliveryNote` ('' when every channel went out).
 */
export async function sendContract(id, body, admin) {
  const text = body.trim();
  const saved = await tx(async (conn) => {
    const contract = await lockedContract(conn, id);
    const found = await repo.readPartnerShared(conn, contract.partnerId);
    const partner = found && found.id === contract.partnerId ? found : null;
    const problem = sendProblem(contract, partner, text);
    if (problem) throw toError(problem);

    // One delivery per channel, every one of them carrying the identical text, each with its outbox row
    const at = now();
    const subject = `Outsourcing contract ${contract.ref} from ${BUSINESS.name}`;
    const deliveries = contractDeliveries(partner, text, at);
    for (const delivery of deliveries) {
      const { id: outboxId } = await saveToOutbox(
        {
          channel: delivery.channel,
          to: delivery.to,
          subject: delivery.channel === 'email' ? subject : null,
          body: text,
          status: 'queued',
          provider: delivery.channel === 'email' ? mailer.name : sms.name,
          meta: { purpose: 'outsourcing_contract', contractId: contract.id, contractRef: contract.ref }
        },
        conn
      );
      delivery.outboxId = outboxId;
      await repo.insertDelivery(conn, contract.id, delivery);
    }
    await repo.updateContract(conn, contract.id, { body: text, status: 'sent', sentAt: at });
    await logContract(conn, contract, partner.name, sentText(deliveries), admin, sentActivityText(deliveries));
    return { contract, partner, deliveries, subject };
  });

  // After the commit: hand each message over, then note on the contract any channel that did not go out
  const results = await deliverAll(saved.contract, saved.deliveries, saved.subject);
  const undelivered = results.filter((r) => r.status !== 'sent');
  if (undelivered.length) {
    await tx(async (conn) => {
      for (const delivery of undelivered) await repo.insertContractHistory(conn, saved.contract.id, { at: now(), actor: admin.name, text: undeliveredText(delivery) });
    }).catch((err) => console.error(`[outsource] ${saved.contract.ref}: could not note the undelivered channels:`, err.message));
  }
  return { ...(await contractViewOf(pool, saved.contract.id)), deliveryNote: deliveryNote(saved.contract.ref, saved.partner.name, results) };
}

/**
 * Record what happened next (statusProblem: a move NEXT_STATUS allows, and a reason of 5+ characters for
 * a decline or a cancellation): 'accepted' or 'declined' when the partner answers, 'completed' once the
 * items have arrived, 'cancelled' when the request is called off. Marking a contract completed without a
 * note keeps what the partner said when they accepted (statusChanges). Returns the contract.
 */
export async function setContractStatus(id, status, note, admin) {
  const reason = note.trim();
  return tx(async (conn) => {
    const contract = await lockedContract(conn, id);
    const problem = statusProblem(contract, status, reason);
    if (problem) throw toError(problem);
    await repo.updateContract(conn, contract.id, statusChanges(status, reason, now()));
    const partner = await repo.readPartner(conn, contract.partnerId);
    await logContract(conn, contract, partner ? partner.name : contract.ref, statusText(status, reason), admin);
    return contractViewOf(conn, contract.id);
  });
}
