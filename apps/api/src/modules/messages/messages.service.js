import { messageChangeable } from '@tm/shared/src/domain/messages.js';
import { RULES } from '@tm/shared/src/services/config.js';
import { pool, tx } from '../../db.js';
import { ApiError } from '../../lib/ApiError.js';
import { now } from '../../lib/time.js';
import { lockOwner } from '../reservations/reservations.repo.js';
import * as repo from './messages.repo.js';

/**
 * The chat rules on the server (docs/backend-development-phases.md Phase 7, §9.5): one conversation
 * per customer with the Tres Marias admin, with the return shapes, error codes and messages the chat
 * pages expect (services/remote/message.js).
 *
 * On purpose:
 * - `side` ('customer' or 'admin'), the customer and the sender's name come from the signed-in account
 *   (the routes pass them), never from the request: a customer can only read and write their own
 *   conversation, and a message always carries its writer's real name.
 * - Messages are in time order (the database keeps no other order).
 * - A thread id or reservation ref must be spelled exactly as stored: the columns' collation ignores
 *   case and trailing spaces, so the service compares the id itself.
 * - Since 2026-10-10 a message typed in the chat box can be edited or deleted by its own side for
 *   RULES.messageEditMinutes (messageChangeable in @tm/shared/src/domain/messages.js); automatic messages
 *   never. Nothing is erased: the earlier texts stay in `history` and a deleted message keeps its text.
 *   The customer is never sent those (forSide): they see the newest text, "edited", or "deleted".
 */

// Longest message a person can type (automatic messages may be longer)
const MESSAGE_MAX = 2000;

const conversationNotFound = () => new ApiError('NOT_FOUND', 'Conversation not found.');

/**
 * What `side` is sent of a message: the admin gets all of it (the earlier texts in `history`, and a deleted
 * message's text, for "View history"); a customer gets neither: no `history`, and '' for a deleted one's text.
 */
function forSide(message, side) {
  if (!message || side === 'admin') return message;
  const { history, ...shown } = message;
  return message.deletedAt ? { ...shown, body: '' } : shown;
}

// Thread info for the conversation list, as `side` may see it. `row` is an entry of repo.findThreads().
const summarize = (row, side) => ({ ...row, lastMessage: forSide(row.lastMessage, side), updatedAt: row.lastMessage ? row.lastMessage.at : 0 });

// The thread the asker may use: it exists, is spelled as stored, and is the customer's own when `customerId` is set; else null
async function allowedThread(db, threadId, customerId) {
  const thread = typeof threadId === 'string' ? await repo.findThread(db, threadId) : null;
  if (!thread || thread.id !== threadId || (customerId != null && thread.customerId !== customerId)) return null;
  return thread;
}

/** All threads (admin) or one customer's thread, most recently active first; `unread` counts what `side` has not read. */
export async function listThreads({ customerId, side }) {
  const rows = await repo.findThreads(pool, { customerId }, side);
  return rows.map((row) => summarize(row, side)).sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * One thread with all its messages, oldest first, each with the name of the event it is about
 * (`eventName`, '' when untagged). With `customerId`, only that customer's own thread: another one is
 * NOT_FOUND, like one that does not exist.
 */
export async function getThread(threadId, { customerId, side }) {
  const thread = await allowedThread(pool, threadId, customerId);
  if (!thread) throw conversationNotFound();
  const [[row], messages] = await Promise.all([repo.findThreads(pool, { threadId: thread.id }, side), repo.findMessages(pool, thread.id)]);
  return { ...summarize(row, side), messages: messages.map((message) => forSide(message, side)) };
}

/**
 * Mark every message in a thread as read for one side. With `customerId`, only that customer's own
 * thread can be marked. Answers { ok: false } for a thread that is missing or not theirs (not an
 * error: the page just reloads), and { ok: true } otherwise, also when nothing was unread.
 */
export async function markThreadRead(threadId, side, { customerId } = {}) {
  const thread = await allowedThread(pool, threadId, customerId);
  if (!thread) return { ok: false };
  await repo.markRead(pool, thread.id, side);
  return { ok: true };
}

/**
 * Add a message (1–2,000 characters after trimming) to a thread. It starts as read for the sender and
 * unread for the other side, and is `typed` (its writer may edit or delete it for a while, see editMessage).
 * `ref` optionally tags it with one of the thread's customer's reservations.
 * `side`, `senderName` and, for a customer, `customerId` come from the signed-in account.
 * Lock order as every write: a tagged message locks its booking's row first (lockOwner), then the
 * thread (repo.postMessage), so it waits for, and never deadlocks with, a change to that booking.
 * Returns the new message.
 */
export async function sendMessage(threadId, { side, senderName, body, customerId, ref = null }) {
  const text = typeof body === 'string' ? body.toWellFormed().trim() : '';
  if (!text) throw new ApiError('INVALID', 'Write a message first.');
  if (text.length > MESSAGE_MAX) throw new ApiError('INVALID', 'Messages can be up to 2,000 characters.');
  return tx(async (conn) => {
    const thread = await allowedThread(conn, threadId, customerId);
    if (!thread) throw conversationNotFound();
    let tag = null;
    if (ref !== null && ref !== undefined && ref !== '') {
      const owner = typeof ref === 'string' ? await lockOwner(conn, ref) : null;
      if (!owner || owner.ref !== ref || owner.customerId !== thread.customerId) throw new ApiError('NOT_FOUND', 'We could not find this reservation.');
      tag = owner.ref;
    }
    const { message } = await repo.postMessage(conn, { customerId: thread.customerId, ref: tag, from: side, senderName, body: text, typed: true });
    return forSide(message, side);
  });
}

/**
 * The message the asker may change, its row locked for the rest of the transaction: in a thread they may
 * use (a customer only their own), spelled as stored, typed by their own side, not deleted, and sent no more
 * than RULES.messageEditMinutes ago (by the server's clock). NOT_FOUND, FORBIDDEN or INVALID_STATE otherwise.
 */
async function changeableMessage(conn, threadId, messageId, { side, customerId }) {
  const thread = await allowedThread(conn, threadId, customerId);
  if (!thread) throw conversationNotFound();
  const message = typeof messageId === 'string' ? await repo.lockMessage(conn, thread.id, messageId) : null;
  if (!message || message.id !== messageId) throw new ApiError('NOT_FOUND', 'Message not found.');
  if (message.from !== side || !message.typed) throw new ApiError('FORBIDDEN', 'You can only edit or delete messages you typed yourself.');
  if (message.deletedAt) throw new ApiError('INVALID_STATE', 'This message was already deleted.');
  if (!messageChangeable(message, side, now())) {
    throw new ApiError('INVALID_STATE', `Messages can only be edited or deleted within ${RULES.messageEditMinutes} minutes of sending.`);
  }
  return message;
}

/**
 * Change the text of one of the asker's own typed messages (1–2,000 characters after trimming, like a new
 * one), within RULES.messageEditMinutes of sending. The text it had is added to `history` with the time it
 * was written, and `editedAt` is set; the same text again changes nothing. `side` and, for a customer,
 * `customerId` come from the signed-in account. Returns the message as that side sees it.
 */
export async function editMessage(threadId, messageId, { side, customerId, body }) {
  const text = typeof body === 'string' ? body.toWellFormed().trim() : '';
  if (!text) throw new ApiError('INVALID', 'Write a message first.');
  if (text.length > MESSAGE_MAX) throw new ApiError('INVALID', 'Messages can be up to 2,000 characters.');
  return tx(async (conn) => {
    const message = await changeableMessage(conn, threadId, messageId, { side, customerId });
    if (text === message.body) return forSide(message, side);
    const history = [...message.history, { body: message.body, at: message.editedAt || message.at }];
    const editedAt = now();
    await repo.editMessageBody(conn, message.id, { body: text, history, editedAt });
    return forSide({ ...message, body: text, history, editedAt }, side);
  });
}

/**
 * Delete one of the asker's own typed messages, within RULES.messageEditMinutes of sending: both sides then
 * see "This message was deleted". The text is kept (a record the admin can read in "View history").
 * Returns the message as that side sees it.
 */
export async function deleteMessage(threadId, messageId, { side, customerId }) {
  return tx(async (conn) => {
    const message = await changeableMessage(conn, threadId, messageId, { side, customerId });
    const deletedAt = now();
    await repo.markMessageDeleted(conn, message.id, deletedAt);
    return forSide({ ...message, deletedAt }, side);
  });
}

/**
 * Find the customer's conversation, creating it on first use: { id }. A customer opens their own (the
 * route passes the signed-in customer); the admin names the customer, who must exist, spelled as
 * stored (NOT_FOUND 'Customer not found.').
 */
export async function openThread({ customerId }) {
  const stored = typeof customerId === 'string' ? await repo.findCustomerId(pool, customerId) : null;
  if (!stored || stored !== customerId) throw new ApiError('NOT_FOUND', 'Customer not found.');
  return tx(async (conn) => ({ id: await repo.customerThreadId(conn, customerId) }));
}
