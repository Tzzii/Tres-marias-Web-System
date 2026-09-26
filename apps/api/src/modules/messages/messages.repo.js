import { newId } from '../../lib/ids.js';
import { toJson } from '../../lib/json.js';
import { now } from '../../lib/time.js';

/**
 * Automatic chat messages written by other modules (docs/backend-development-phases.md Phase 6A,
 * task 2): the thank-you after a booking, a change request, a refund notice, and later quotations,
 * receipts and reminders. Each customer has one conversation with the admin (threads, UNIQUE
 * customer_id), created on first use. The chat endpoints themselves arrive in Phase 7.
 *
 * Every function here takes the transaction's connection, so a message is saved together with the
 * change it is about, or not at all. Lock order: a write that changes a booking and posts a message
 * locks the booking's row first (lockOwner in reservations.repo.js) and the thread after it (here);
 * the message's reservation tag also needs the booking's row, so the other order could deadlock.
 */

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
 * Add a message to the customer's conversation, tagged with the reservation it is about. It starts
 * read for the side that wrote it and unread for the other. Returns { threadId, id }.
 */
async function postMessage(conn, { customerId, ref, from, senderName, body, attachment = null }) {
  const threadId = await customerThreadId(conn, customerId);
  const id = newId('m');
  await conn.query(
    `INSERT INTO messages (id, thread_id, from_side, sender_name, body, ref, at, read_by_customer, read_by_admin, attachment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, threadId, from, senderName, body, ref, now(), from === 'customer', from === 'admin', toJson(attachment)]
  );
  return { threadId, id };
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
