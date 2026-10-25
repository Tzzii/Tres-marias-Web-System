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
import { isRental } from '@tm/shared/src/services/config.js';
import { pool, tx } from '../../db.js';
import { mailer } from '../../integrations/mailer/index.js';
import { ApiError } from '../../lib/ApiError.js';
import { newId, nextCounter } from '../../lib/ids.js';
import { isISODate, now, todayISO } from '../../lib/time.js';
import { markOutbox, saveToOutbox } from '../../outbox/outbox.repo.js';
import * as reservationsRepo from '../reservations/reservations.repo.js';
import * as repo from './outsource.repo.js';
import { outsourceRequestEmail, deliverPartnerRequest } from './outsource.emails.js';


const toError = ({ code, message, meta }) => new ApiError(code, message, meta);
const partnerNotFound = () => new ApiError('NOT_FOUND', 'Partner not found.');
const contractNotFound = () => new ApiError('NOT_FOUND', 'Request not found.');

const MAX_ITEMS = 50;
const ITEM_NAME_MAX = 120;

const isNameTaken = (err) =>
  Boolean(err) &&
  err.code === 'ER_DUP_ENTRY' &&
  String(err.sqlMessage || err.message).includes('uq_outsource_partners_name');
const nameTaken = (name) => new ApiError('NAME_TAKEN', `"${name}" is already a partner.`, { field: 'name' });

async function partnerViewOf(db, id) {
  const [partner] = await repo.findPartners(db, { ids: [id] });
  const stats = (await repo.partnerContractStats(db)).get(id) || { contractCount: 0, openCount: 0, lastSentAt: null };
  return partnerView(partner, stats);
}

async function contractViewOf(db, id) {
  const [row] = await repo.findContracts(db, { id });
  return contractView(row.contract, row.partner, row.reservation);
}

async function lockedContract(conn, id) {
  const contract = typeof id === 'string' && id ? await repo.lockContract(conn, id) : null;
  if (!contract || contract.id !== id) throw contractNotFound();
  return contract;
}

async function logContract(conn, contract, partnerName, text, admin, activityText = text) {
  const at = now();
  await repo.insertContractHistory(conn, contract.id, { at, actor: admin.name, text });
  if (contract.reservationRef !== NO_EVENT && (await repo.readBookingStatus(conn, contract.reservationRef))) {
    await reservationsRepo.insertActivity(conn, contract.reservationRef, {
      at,
      actor: admin.name,
      text: outsourceActivity(partnerName, activityText)
    });
  }
}


export async function listPartners({ includeArchived = false } = {}) {
  const [partners, stats] = await Promise.all([
    repo.findPartners(pool, { includeArchived }),
    repo.partnerContractStats(pool)
  ]);
  return partners
    .map((partner) =>
      partnerView(partner, stats.get(partner.id) || { contractCount: 0, openCount: 0, lastSentAt: null })
    )
    .sort(partnerOrder);
}

export async function listContracts() {
  const rows = await repo.findContracts(pool);
  return rows.map((row) => contractView(row.contract, row.partner, row.reservation));
}

export async function listOutsourceEvents() {
  const bookings = await reservationsRepo.listHeldBookings(pool);
  return bookings.map((r) => ({
    ref: r.ref,
    eventName: r.eventName,
    date: r.date,
    guests: r.guests,
    rental: isRental(r.serviceType),
    venue: `${r.venue.name}, ${r.venue.city}`
  }));
}


export async function savePartner(id, values, admin) {
  return tx(async (conn) => {
    const existing = id
      ? (await repo.findPartners(conn, { ids: [id], lock: true })).find((p) => p.id === id) || null
      : null;
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

export async function deletePartner(id, admin, { transact = tx } = {}) {
  return transact(async (conn) => {
    const contracts = await repo.lockPartnerContracts(conn, id);
    const [partner] = await repo.findPartners(conn, { ids: [id], lock: true });
    if (!partner || partner.id !== id) throw partnerNotFound();
    if (contracts.some((contract) => ['sent', 'accepted'].includes(contract.status))) {
      throw new ApiError('IN_USE', `Complete or cancel ${partner.name}'s awaiting reply or accepted requests first.`);
    }
    const at = now();
    for (const contract of contracts) {
      await repo.insertContractHistory(conn, contract.id, {
        at,
        actor: admin.name,
        text: `Partner "${partner.name}" permanently deleted. Request retained.`
      });
    }
    await repo.deletePartner(conn, partner.id);
  });
}


export async function saveContract(id, values, admin) {
  return tx(async (conn) => {
    const existing = id ? await lockedContract(conn, id) : null;
    if (existing && existing.status !== 'draft')
      throw new ApiError('LOCKED', 'This request has been sent and can no longer be edited.');
    const partnerFound =
      typeof values.partnerId === 'string' && values.partnerId ? await repo.readPartner(conn, values.partnerId) : null;
    const partner = partnerFound && partnerFound.id === values.partnerId ? partnerFound : null;
    const ref = contractRef(values);
    const booking = ref !== NO_EVENT && typeof ref === 'string' ? await repo.readBookingStatus(conn, ref) : null;
    const checked = { ...values, needBy: isISODate(values.needBy) ? values.needBy : '' };
    const problem = contractProblem(checked, {
      partner,
      refStatus: booking && booking.ref === ref ? booking.status : null,
      today: todayISO()
    });
    if (problem) throw toError(problem);
    const items = contractItems(values.items);
    if (items.length > MAX_ITEMS) throw new ApiError('INVALID', `List up to ${MAX_ITEMS} items.`, { field: 'items' });
    const long = items.findIndex((item) => item.name.length > ITEM_NAME_MAX);
    if (long >= 0)
      throw new ApiError('INVALID', `Use ${ITEM_NAME_MAX} characters or fewer for an item name.`, {
        field: 'items',
        row: long
      });

    const fields = {
      partnerId: partner.id,
      reservationRef: ref,
      items,
      needBy: checked.needBy,
      amount: contractAmount(values),
      notes: values.notes.trim()
    };
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

const undeliveredText = ({ to, status }) =>
  status === 'logged'
    ? `The email to ${to} was not sent: no email service is connected yet, so it was only saved in the outbox. Send the request yourself (Save PDF).`
    : `The email to ${to} could not be sent. Send it again, or send the request yourself (Save PDF).`;

function deliveryNote(ref, partnerName, results) {
  const logged = results.some((r) => r.status === 'logged');
  const failed = results.some((r) => r.status === 'failed');
  if (!logged && !failed) return '';
  const parts = [];
  if (logged) parts.push('no email service is connected yet, so the email was only saved');
  if (failed) parts.push('the email could not be sent');
  return `${ref} is marked sent, but ${parts.join(', and ')}. Save the PDF and send it to ${partnerName} yourself.`;
}

async function deliverAll(contract, deliveries, email) {
  const results = [];
  for (const delivery of deliveries) {
    let outcome;
    try {
      outcome = await deliverPartnerRequest(delivery, email, { mailer });
    } catch (err) {
      console.error(`[outsource] ${contract.ref}: the email to ${delivery.to} could not be sent:`, err.message);
      outcome = { status: 'failed', providerId: null, error: err.message };
    }
    await markOutbox(delivery.outboxId, {
      status: outcome.status,
      providerId: outcome.providerId,
      error: outcome.error || null
    }).catch((err) =>
      console.error(`[outsource] ${contract.ref}: could not record the email in the outbox:`, err.message)
    );
    results.push({ ...delivery, status: outcome.status });
  }
  return results;
}

export async function sendContract(id, body, admin) {
  const text = body.trim();
  const saved = await tx(async (conn) => {
    const contract = await lockedContract(conn, id);
    const found = await repo.readPartnerShared(conn, contract.partnerId);
    const partner = found && found.id === contract.partnerId ? found : null;
    const problem = sendProblem(contract, partner, text);
    if (problem) throw toError(problem);

    const at = now();
    const email = outsourceRequestEmail({ ref: contract.ref, body: text });
    const deliveries = contractDeliveries(partner, text, at);
    for (const delivery of deliveries) {
      const { id: outboxId } = await saveToOutbox(
        {
          channel: delivery.channel,
          to: delivery.to,
          subject: email.subject,
          body: text,
          status: 'queued',
          provider: mailer.name,
          meta: { purpose: 'outsourcing_contract', contractId: contract.id, contractRef: contract.ref }
        },
        conn
      );
      delivery.outboxId = outboxId;
      await repo.insertDelivery(conn, contract.id, delivery);
    }
    await repo.updateContract(conn, contract.id, { body: text, status: 'sent', sentAt: at });
    await logContract(conn, contract, partner.name, sentText(deliveries), admin, sentActivityText(deliveries));
    return { contract, partner, deliveries, email };
  });

  const results = await deliverAll(saved.contract, saved.deliveries, saved.email);
  const undelivered = results.filter((r) => r.status !== 'sent');
  if (undelivered.length) {
    await tx(async (conn) => {
      for (const delivery of undelivered)
        await repo.insertContractHistory(conn, saved.contract.id, {
          at: now(),
          actor: admin.name,
          text: undeliveredText(delivery)
        });
    }).catch((err) =>
      console.error(`[outsource] ${saved.contract.ref}: could not note the undelivered channels:`, err.message)
    );
  }
  return {
    ...(await contractViewOf(pool, saved.contract.id)),
    deliveryNote: deliveryNote(saved.contract.ref, saved.partner.name, results)
  };
}

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
