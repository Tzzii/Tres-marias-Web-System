import { newId } from '../../lib/ids.js';
import { parseJson, toJson } from '../../lib/json.js';
import { now } from '../../lib/time.js';

/**
 * SQL for the chat (docs §7.1: the repo holds SQL only; the rules are in messages.service.js). Each
 * customer has one conversation with the admin (threads, UNIQUE customer_id), created on first use.
 * Records come back in the browser store's shape (messageService.js): a message is { id, from,
 * senderName, body, ref, at, readByCustomer, readByAdmin, attachment }.
 *
 * The messages of a thread are in time order (at, then id): the table keeps no other order. Automatic
 * messages written by other modules (the thank-you after a booking, a change request, a refund notice,
 * quotations, receipts, reminders) go through postAdminMessage / postCustomerMessage below.
 *
 * The write helpers take the transaction's connection, so a message is saved together with the change
 * it is about, or not at all. Lock order: a write that changes a booking and posts a message locks the
 * booking's row first (lockOwner in reservations.repo.js) and the thread after it (here); the message's
 * reservation tag also needs the booking's row, so the other order could deadlock. The reads take `db`:
 * the pool, or a transaction's connection.
 */

// First row of a SELECT, or null
const first = ([rows]) => rows[0] || null;

// The column that says whether `side` ('customer' or 'admin') has read a message. Never built from
// request text: `side` comes from the signed-in account's role.
const readColumn = (side) => (side === 'customer' ? 'read_by_customer' : 'read_by_admin');

// messages row -> message record
const toMessage = (row) => ({
  id: row.id,
  from: row.from_side,
  senderName: row.sender_name,
  body: row.body,
  ref: row.ref,
  at: row.at,
  readByCustomer: Boolean(row.read_by_customer),
  readByAdmin: Boolean(row.read_by_admin),
  attachment: parseJson(row.attachment)
});

/* ============================ Reads ============================ */

/** A thread's owner, { id, customerId } as stored, or null. The lookup ignores case (the column's collation), so callers compare the id. */
export async function findThread(db, threadId) {
  const row = first(await db.query('SELECT id, customer_id FROM threads WHERE id = ?', [threadId]));
  return row && { id: row.id, customerId: row.customer_id };
}

/** A customer's id as stored, or null when there is no such customer. The lookup ignores case, so callers compare it. */
export async function findCustomerId(db, customerId) {
  const row = first(await db.query('SELECT id FROM customers WHERE id = ?', [customerId]));
  return row ? row.id : null;
}

/**
 * Conversations with what the list needs: [{ id, customerId, customerName, customerEmail, lastMessage,
 * unread }], by thread id. `lastMessage` is the newest message (or null) and `unread` counts the messages
 * `side` has not read. Every thread, or one customer's (`customerId`), or one thread (`threadId`).
 * Three queries in all: threads, the newest message of each, and the unread counts.
 */
export async function findThreads(db, { customerId, threadId } = {}, side) {
  const conditions = [];
  const params = [];
  if (customerId != null) {
    conditions.push('t.customer_id = ?');
    params.push(customerId);
  }
  if (threadId != null) {
    conditions.push('t.id = ?');
    params.push(threadId);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [[threads], [latest], [counts]] = await Promise.all([
    db.query(
      `SELECT t.id, t.customer_id, c.name AS customer_name, c.email AS customer_email
         FROM threads t LEFT JOIN customers c ON c.id = t.customer_id ${where} ORDER BY t.id`,
      params
    ),
    db.query(
      `SELECT x.* FROM (
         SELECT m.*, ROW_NUMBER() OVER (PARTITION BY m.thread_id ORDER BY m.at DESC, m.id DESC) AS place
           FROM messages m JOIN threads t ON t.id = m.thread_id ${where}
       ) x WHERE x.place = 1`,
      params
    ),
    db.query(
      `SELECT m.thread_id, COUNT(*) AS unread FROM messages m JOIN threads t ON t.id = m.thread_id
        ${where ? `${where} AND` : 'WHERE'} m.${readColumn(side)} = 0 GROUP BY m.thread_id`,
      params
    )
  ]);
  const lastByThread = new Map(latest.map((row) => [row.thread_id, toMessage(row)]));
  const unreadByThread = new Map(counts.map((row) => [row.thread_id, Number(row.unread)]));
  return threads.map((t) => ({
    id: t.id,
    customerId: t.customer_id,
    customerName: t.customer_name ?? '',
    customerEmail: t.customer_email ?? '',
    lastMessage: lastByThread.get(t.id) || null,
    unread: unreadByThread.get(t.id) || 0
  }));
}

/** Every message of a thread, oldest first, each with the name of the event it is about (`eventName`, '' when untagged). */
export async function findMessages(db, threadId) {
  const [rows] = await db.query(
    `SELECT m.*, r.event_name FROM messages m LEFT JOIN reservations r ON r.ref = m.ref
      WHERE m.thread_id = ? ORDER BY m.at, m.id`,
    [threadId]
  );
  return rows.map((row) => ({ ...toMessage(row), eventName: row.event_name ?? '' }));
}

/* ============================ Writes ============================ */

/** Mark every message in a thread as read for one side. Returns how many were unread. */
export async function markRead(db, threadId, side) {
  const column = readColumn(side);
  const [result] = await db.query(`UPDATE messages SET ${column} = 1 WHERE thread_id = ? AND ${column} = 0`, [threadId]);
  return result.affectedRows;
}

/**
 * The id of the customer's conversation, creating it on first use. The insert and the read both lock
 * the thread row: when two writes for the same customer create it at the same moment, the second waits
 * for the first and then reads the same row, so a customer never gets two conversations. (Reading
 * first and inserting only when nothing was found would let both lock the same gap and deadlock.)
 */
export async function customerThreadId(conn, customerId) {
  await conn.query('INSERT INTO threads (id, customer_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE id = id', [newId('th'), customerId]);
  const [[thread]] = await conn.query('SELECT id FROM threads WHERE customer_id = ? FOR UPDATE', [customerId]);
  return thread.id;
}

/**
 * Add a message to the customer's conversation, tagged with the reservation it is about (`ref`, or
 * null). It starts read for the side that wrote it and unread for the other. Returns { threadId, message }.
 */
export async function postMessage(conn, { customerId, ref = null, from, senderName, body, attachment = null }) {
  const threadId = await customerThreadId(conn, customerId);
  const message = {
    id: newId('m'),
    from,
    senderName,
    body,
    ref,
    at: now(),
    readByCustomer: from === 'customer',
    readByAdmin: from === 'admin',
    attachment
  };
  await conn.query(
    `INSERT INTO messages (id, thread_id, from_side, sender_name, body, ref, at, read_by_customer, read_by_admin, attachment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [message.id, threadId, from, senderName, body, ref, message.at, message.readByCustomer, message.readByAdmin, toJson(attachment)]
  );
  return { threadId, message };
}

/**
 * A message from the Tres Marias team in the customer's chat, e.g. the thank-you after a booking.
 * `reservation` needs { ref, customerId }; `attachment` is null or { name, kind, ref }; `senderName`
 * is the signed-in admin's name (req.user.name) or 'Tres Marias team' for automatic messages.
 */
export const postAdminMessage = (conn, reservation, body, attachment, senderName) =>
  postMessage(conn, { customerId: reservation.customerId, ref: reservation.ref, from: 'admin', senderName, body, attachment });

/** A message from the customer (a change request, a refund notice), unread for the admin until opened. */
export const postCustomerMessage = (conn, reservation, body, senderName) =>
  postMessage(conn, { customerId: reservation.customerId, ref: reservation.ref, from: 'customer', senderName, body });
