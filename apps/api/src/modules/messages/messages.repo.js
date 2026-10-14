import { newId } from '../../lib/ids.js';
import { parseJson, toJson } from '../../lib/json.js';
import { now } from '../../lib/time.js';


const first = ([rows]) => rows[0] || null;

const readColumn = (side) => (side === 'customer' ? 'read_by_customer' : 'read_by_admin');

const toMessage = (row) => ({
  id: row.id,
  from: row.from_side,
  senderName: row.sender_name,
  body: row.body,
  ref: row.ref,
  at: row.at,
  readByCustomer: Boolean(row.read_by_customer),
  readByAdmin: Boolean(row.read_by_admin),
  attachment: parseJson(row.attachment),
  typed: Boolean(row.typed),
  editedAt: row.edited_at ?? null,
  deletedAt: row.deleted_at ?? null,
  history: parseJson(row.history) || []
});


export async function findThread(db, threadId) {
  const row = first(await db.query('SELECT id, customer_id FROM threads WHERE id = ?', [threadId]));
  return row && { id: row.id, customerId: row.customer_id };
}

export async function findCustomerId(db, customerId) {
  const row = first(await db.query('SELECT id FROM customers WHERE id = ?', [customerId]));
  return row ? row.id : null;
}

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

export async function findMessages(db, threadId) {
  const [rows] = await db.query(
    `SELECT m.*, r.event_name FROM messages m LEFT JOIN reservations r ON r.ref = m.ref
      WHERE m.thread_id = ? ORDER BY m.at, m.id`,
    [threadId]
  );
  return rows.map((row) => ({ ...toMessage(row), eventName: row.event_name ?? '' }));
}


export async function markRead(db, threadId, side) {
  const column = readColumn(side);
  const [result] = await db.query(`UPDATE messages SET ${column} = 1 WHERE thread_id = ? AND ${column} = 0`, [
    threadId
  ]);
  return result.affectedRows;
}

export async function customerThreadId(conn, customerId) {
  await conn.query('INSERT INTO threads (id, customer_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE id = id', [
    newId('th'),
    customerId
  ]);
  const [[thread]] = await conn.query('SELECT id FROM threads WHERE customer_id = ? FOR UPDATE', [customerId]);
  return thread.id;
}

export async function postMessage(
  conn,
  { customerId, ref = null, from, senderName, body, attachment = null, typed = false }
) {
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
    attachment,
    typed,
    editedAt: null,
    deletedAt: null,
    history: []
  };
  await conn.query(
    `INSERT INTO messages (id, thread_id, from_side, sender_name, body, ref, at, read_by_customer, read_by_admin, attachment, typed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      message.id,
      threadId,
      from,
      senderName,
      body,
      ref,
      message.at,
      message.readByCustomer,
      message.readByAdmin,
      toJson(attachment),
      typed
    ]
  );
  return { threadId, message };
}

export async function lockMessage(conn, threadId, messageId) {
  const row = first(
    await conn.query('SELECT * FROM messages WHERE id = ? AND thread_id = ? FOR UPDATE', [messageId, threadId])
  );
  return row && toMessage(row);
}

export async function editMessageBody(conn, messageId, { body, history, editedAt }) {
  await conn.query('UPDATE messages SET body = ?, history = ?, edited_at = ? WHERE id = ?', [
    body,
    toJson(history),
    editedAt,
    messageId
  ]);
}

export async function markMessageDeleted(conn, messageId, deletedAt) {
  await conn.query('UPDATE messages SET deleted_at = ? WHERE id = ?', [deletedAt, messageId]);
}

export const postAdminMessage = (conn, reservation, body, attachment, senderName) =>
  postMessage(conn, {
    customerId: reservation.customerId,
    ref: reservation.ref,
    from: 'admin',
    senderName,
    body,
    attachment
  });

export const postCustomerMessage = (conn, reservation, body, senderName) =>
  postMessage(conn, { customerId: reservation.customerId, ref: reservation.ref, from: 'customer', senderName, body });
