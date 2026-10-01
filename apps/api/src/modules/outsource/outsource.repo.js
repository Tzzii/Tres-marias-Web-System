import { parseJson, toJson } from '../../lib/json.js';

/**
 * SQL for outsourcing: partners, their contracts, each contract's deliveries, and both histories
 * (docs §7.1: the repo holds SQL only; the rules are in outsource.service.js and
 * @tm/shared/src/domain/outsource.js). Records come back in the shape domain/outsource.js works
 * with, the way the seeder saves them and scripts/db-roundtrip.js reads them:
 *   partner   { id, name, service, contactPerson, email, mobile, address, notes, archived, history }
 *   contract  { id, ref, partnerId, reservationRef, items, needBy, amount, notes, status, body,
 *               deliveries: [{ channel, to, at, body }], createdAt, sentAt, answeredAt, answerNote, history }
 * Histories and deliveries come in the order they were written (id). A delivery's outbox row stays on
 * the server (outbox_id): the record carries what the partner was sent, not how it went out.
 *
 * Every function takes `db`: the pool, or a transaction's connection so reads and writes see and lock
 * the same rows. Lock order for an outsourcing write (outsource.service.js): the contract's row, then
 * its partner's row (a send reads it FOR SHARE; archiving a partner locks it FOR UPDATE), and the
 * booking's row last (a history line's audit-trail copy only reads it, through its foreign key).
 */

// First row of a SELECT, or null
const first = ([rows]) => rows[0] || null;

// Rows grouped by one column: Map(value -> rows), rows in the order read
function groupBy(rows, key) {
  const groups = new Map();
  rows.forEach((row) => {
    if (!groups.has(row[key])) groups.set(row[key], []);
    groups.get(row[key]).push(row);
  });
  return groups;
}

const toHistory = (rows = []) => rows.map((h) => ({ at: h.at, actor: h.actor, text: h.text }));

// outsource_partners row + its history rows -> partner record
const toPartner = (row, history) => ({
  id: row.id,
  name: row.name,
  service: row.service,
  contactPerson: row.contact_person,
  email: row.email,
  mobile: row.mobile,
  address: row.address,
  notes: row.notes,
  archived: Boolean(row.archived),
  history: toHistory(history)
});

// outsource_contracts row + its delivery and history rows -> contract record
const toContract = (row, deliveries = [], history = []) => ({
  id: row.id,
  ref: row.ref,
  partnerId: row.partner_id,
  reservationRef: row.reservation_ref,
  items: parseJson(row.items, []),
  needBy: row.need_by,
  amount: row.amount,
  notes: row.notes,
  status: row.status,
  body: row.body,
  deliveries: deliveries.map((d) => ({ channel: d.channel, to: d.to_address, at: d.at, body: d.body })),
  createdAt: row.created_at,
  sentAt: row.sent_at,
  answeredAt: row.answered_at,
  answerNote: row.answer_note,
  history: toHistory(history)
});

/* ============================ Partners ============================ */

/**
 * Partners with their histories: every one, not the archived ones (`includeArchived: false`), or the
 * ones in `ids` (the lookup ignores case and trailing spaces, the column's collation, so callers compare
 * the ids they get back). `lock` locks their rows until the transaction ends (FOR UPDATE), as the first
 * read, so what follows sees what was saved before (see setPartnerArchived).
 */
export async function findPartners(db, { ids, includeArchived = true, lock = false } = {}) {
  if (ids && !ids.length) return [];
  const conditions = [];
  const params = [];
  if (ids) {
    conditions.push('p.id IN (?)');
    params.push(ids);
  }
  if (!includeArchived) conditions.push('p.archived = 0');
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await db.query(`SELECT p.* FROM outsource_partners p ${where} ORDER BY p.id${lock ? ' FOR UPDATE' : ''}`, params);
  if (!rows.length) return [];
  const [history] = await db.query('SELECT partner_id, at, actor, text FROM outsource_partner_history WHERE partner_id IN (?) ORDER BY id', [rows.map((row) => row.id)]);
  const byPartner = groupBy(history, 'partner_id');
  return rows.map((row) => toPartner(row, byPartner.get(row.id)));
}

/**
 * A partner's record with its row read FOR SHARE until the transaction ends (a send: archiving the same
 * partner then waits, and a send waits for an archive in progress), or null. The lookup ignores case, so
 * callers compare the id.
 */
export async function readPartnerShared(conn, id) {
  const row = first(await conn.query('SELECT * FROM outsource_partners WHERE id = ? FOR SHARE', [id]));
  return row ? toPartner(row, []) : null;
}

/** A partner's record without its history, or null (no lock). The lookup ignores case, so callers compare the id. */
export async function readPartner(db, id) {
  const row = first(await db.query('SELECT * FROM outsource_partners WHERE id = ?', [id]));
  return row ? toPartner(row, []) : null;
}

/** Every partner's id and name (archived ones included), for the "already a partner" check. */
export async function partnerNames(db) {
  const [rows] = await db.query('SELECT id, name FROM outsource_partners');
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

/**
 * Each partner's contract counts, Map(partnerId -> { contractCount, openCount, lastSentAt }) (the numbers
 * partnerStats() in domain/outsource.js gives from a contract list): how many contracts, how many sent
 * and still waiting for the partner's answer, and when one was last sent (null when none).
 */
export async function partnerContractStats(db) {
  const [rows] = await db.query(
    `SELECT partner_id, COUNT(*) AS contracts, SUM(status = 'sent') AS open, MAX(sent_at) AS last_sent
       FROM outsource_contracts GROUP BY partner_id`
  );
  return new Map(
    rows.map((row) => [row.partner_id, { contractCount: Number(row.contracts), openCount: Number(row.open), lastSentAt: row.last_sent === null ? null : Number(row.last_sent) }])
  );
}

/** The ids of the partners in `ids` that have a contract sent and still waiting for their answer (status 'sent'). */
export async function partnersWithOpenContracts(db, ids) {
  if (!ids.length) return new Set();
  const [rows] = await db.query("SELECT DISTINCT partner_id FROM outsource_contracts WHERE partner_id IN (?) AND status = 'sent'", [ids]);
  return new Set(rows.map((row) => row.partner_id));
}

/** Save a new partner. A name already in use (any case or accent) fails with ER_DUP_ENTRY (UNIQUE name). */
export async function insertPartner(conn, partner) {
  await conn.query(
    `INSERT INTO outsource_partners (id, name, service, contact_person, email, mobile, address, notes, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [partner.id, partner.name, partner.service, partner.contactPerson, partner.email, partner.mobile, partner.address, partner.notes, partner.archived]
  );
}

// Partner fields updatePartner() may change -> column. A fixed list, so a key from anywhere else never becomes SQL.
const PARTNER_COLUMNS = {
  name: 'name',
  service: 'service',
  contactPerson: 'contact_person',
  email: 'email',
  mobile: 'mobile',
  address: 'address',
  notes: 'notes',
  archived: 'archived'
};

/** Change some of a partner's fields, in the record's shape. A new name already in use fails with ER_DUP_ENTRY. */
export async function updatePartner(conn, id, changes) {
  const sets = [];
  const params = [];
  Object.entries(changes).forEach(([field, value]) => {
    if (!PARTNER_COLUMNS[field]) throw new Error(`updatePartner: "${field}" is not a field it can save.`);
    sets.push(`${PARTNER_COLUMNS[field]} = ?`);
    params.push(value);
  });
  if (!sets.length) return;
  await conn.query(`UPDATE outsource_partners SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
}

/** Add an entry to a partner's history. */
export async function insertPartnerHistory(conn, partnerId, { at, actor, text }) {
  await conn.query('INSERT INTO outsource_partner_history (partner_id, at, actor, text) VALUES (?, ?, ?, ?)', [partnerId, at, actor, text]);
}

/* ============================ Contracts ============================ */

/**
 * Contracts with their deliveries and histories, each with its partner's record (null when missing) and
 * its event ({ eventName, date, venue: { name, city } }, null when it is for no event or the booking is
 * missing): [{ contract, partner, reservation }], newest first (created_at, then ref: the order they
 * were drafted in). Every contract, or one (`id`; the lookup ignores case, so callers compare the id).
 */
export async function findContracts(db, { id } = {}) {
  const [rows] = await db.query(
    `SELECT c.*,
            p.name AS p_name, p.service AS p_service, p.contact_person AS p_contact_person, p.email AS p_email, p.mobile AS p_mobile,
            p.address AS p_address, p.notes AS p_notes, p.archived AS p_archived,
            r.ref AS r_ref, r.event_name AS r_event_name, r.date AS r_date, r.venue_name AS r_venue_name, r.city AS r_city
       FROM outsource_contracts c
       LEFT JOIN outsource_partners p ON p.id = c.partner_id
       LEFT JOIN reservations r ON r.ref = c.reservation_ref
      ${id != null ? 'WHERE c.id = ?' : ''}
      ORDER BY c.created_at DESC, c.ref`,
    id != null ? [id] : []
  );
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [[deliveries], [history]] = await Promise.all([
    db.query('SELECT contract_id, channel, to_address, at, body FROM outsource_deliveries WHERE contract_id IN (?) ORDER BY id', [ids]),
    db.query('SELECT contract_id, at, actor, text FROM outsource_contract_history WHERE contract_id IN (?) ORDER BY id', [ids])
  ]);
  const byContract = { deliveries: groupBy(deliveries, 'contract_id'), history: groupBy(history, 'contract_id') };
  return rows.map((row) => ({
    contract: toContract(row, byContract.deliveries.get(row.id), byContract.history.get(row.id)),
    partner:
      row.p_name === null
        ? null
        : toPartner(
            {
              id: row.partner_id, name: row.p_name, service: row.p_service, contact_person: row.p_contact_person, email: row.p_email,
              mobile: row.p_mobile, address: row.p_address, notes: row.p_notes, archived: row.p_archived
            },
            []
          ),
    reservation: row.r_ref === null ? null : { eventName: row.r_event_name, date: row.r_date, venue: { name: row.r_venue_name, city: row.r_city } }
  }));
}

/**
 * A contract's record (without deliveries and history) with its row locked until the transaction ends,
 * or null. Every write on a contract starts here, so two writes on one contract run one after the other.
 * The lookup ignores case, so callers compare the id.
 */
export async function lockContract(conn, id) {
  const row = first(await conn.query('SELECT * FROM outsource_contracts WHERE id = ? FOR UPDATE', [id]));
  return row ? toContract(row) : null;
}

/** Save a new contract (a draft). */
export async function insertContract(conn, c) {
  await conn.query(
    `INSERT INTO outsource_contracts (id, ref, partner_id, reservation_ref, items, need_by, amount, notes, status, body, created_at, sent_at, answered_at, answer_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [c.id, c.ref, c.partnerId, c.reservationRef, toJson(c.items), c.needBy, c.amount, c.notes, c.status, c.body, c.createdAt, c.sentAt, c.answeredAt, c.answerNote]
  );
}

// Contract fields updateContract() may change -> [column, how the value is stored]
const plain = (value) => value;
const CONTRACT_COLUMNS = {
  partnerId: ['partner_id', plain],
  reservationRef: ['reservation_ref', plain],
  items: ['items', toJson],
  needBy: ['need_by', plain],
  amount: ['amount', plain],
  notes: ['notes', plain],
  status: ['status', plain],
  body: ['body', plain],
  sentAt: ['sent_at', plain],
  answeredAt: ['answered_at', plain],
  answerNote: ['answer_note', plain]
};

/** Change some of a contract's fields, in the record's shape (items are stored with toJson). */
export async function updateContract(conn, id, changes) {
  const sets = [];
  const params = [];
  Object.entries(changes).forEach(([field, value]) => {
    if (!CONTRACT_COLUMNS[field]) throw new Error(`updateContract: "${field}" is not a field it can save.`);
    const [column, store] = CONTRACT_COLUMNS[field];
    sets.push(`${column} = ?`);
    params.push(store(value));
  });
  if (!sets.length) return;
  await conn.query(`UPDATE outsource_contracts SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
}

/** Add a delivery (one channel of one send) with the outbox row that carries it. */
export async function insertDelivery(conn, contractId, { channel, to, at, body, outboxId }) {
  await conn.query('INSERT INTO outsource_deliveries (contract_id, channel, to_address, at, body, outbox_id) VALUES (?, ?, ?, ?, ?, ?)', [contractId, channel, to, at, body, outboxId]);
}

/** Add an entry to a contract's history. */
export async function insertContractHistory(conn, contractId, { at, actor, text }) {
  await conn.query('INSERT INTO outsource_contract_history (contract_id, at, actor, text) VALUES (?, ?, ?, ?)', [contractId, at, actor, text]);
}

/** A booking's status and ref as stored, { ref, status }, or null (no lock). The lookup ignores case, so callers compare the ref. */
export async function readBookingStatus(db, ref) {
  const row = first(await db.query('SELECT ref, status FROM reservations WHERE ref = ?', [ref]));
  return row && { ref: row.ref, status: row.status };
}
