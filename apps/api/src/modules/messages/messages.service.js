import { messageChangeable } from '@tm/shared/src/domain/messages.js';
import { RULES } from '@tm/shared/src/services/config.js';
import { pool, tx } from '../../db.js';
import { ApiError } from '../../lib/ApiError.js';
import { now } from '../../lib/time.js';
import { lockOwner } from '../reservations/reservations.repo.js';
import * as repo from './messages.repo.js';


const MESSAGE_MAX = 2000;

const conversationNotFound = () => new ApiError('NOT_FOUND', 'Conversation not found.');

function forSide(message, side) {
  if (!message || side === 'admin') return message;
  const { history, ...shown } = message;
  return message.deletedAt ? { ...shown, body: '' } : shown;
}

const summarize = (row, side) => ({
  ...row,
  lastMessage: forSide(row.lastMessage, side),
  updatedAt: row.lastMessage ? row.lastMessage.at : 0
});

async function allowedThread(db, threadId, customerId) {
  const thread = typeof threadId === 'string' ? await repo.findThread(db, threadId) : null;
  if (!thread || thread.id !== threadId || (customerId != null && thread.customerId !== customerId)) return null;
  return thread;
}

export async function listThreads({ customerId, side }) {
  const rows = await repo.findThreads(pool, { customerId }, side);
  return rows.map((row) => summarize(row, side)).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getThread(threadId, { customerId, side }) {
  const thread = await allowedThread(pool, threadId, customerId);
  if (!thread) throw conversationNotFound();
  const [[row], messages] = await Promise.all([
    repo.findThreads(pool, { threadId: thread.id }, side),
    repo.findMessages(pool, thread.id)
  ]);
  return { ...summarize(row, side), messages: messages.map((message) => forSide(message, side)) };
}

export async function markThreadRead(threadId, side, { customerId } = {}) {
  const thread = await allowedThread(pool, threadId, customerId);
  if (!thread) return { ok: false };
  await repo.markRead(pool, thread.id, side);
  return { ok: true };
}

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
      if (!owner || owner.ref !== ref || owner.customerId !== thread.customerId)
        throw new ApiError('NOT_FOUND', 'We could not find this reservation.');
      tag = owner.ref;
    }
    const { message } = await repo.postMessage(conn, {
      customerId: thread.customerId,
      ref: tag,
      from: side,
      senderName,
      body: text,
      typed: true
    });
    return forSide(message, side);
  });
}

async function changeableMessage(conn, threadId, messageId, { side, customerId }) {
  const thread = await allowedThread(conn, threadId, customerId);
  if (!thread) throw conversationNotFound();
  const message = typeof messageId === 'string' ? await repo.lockMessage(conn, thread.id, messageId) : null;
  if (!message || message.id !== messageId) throw new ApiError('NOT_FOUND', 'Message not found.');
  if (message.from !== side || !message.typed)
    throw new ApiError('FORBIDDEN', 'You can only edit or delete messages you typed yourself.');
  if (message.deletedAt) throw new ApiError('INVALID_STATE', 'This message was already deleted.');
  if (!messageChangeable(message, side, now())) {
    throw new ApiError(
      'INVALID_STATE',
      `Messages can only be edited or deleted within ${RULES.messageEditMinutes} minutes of sending.`
    );
  }
  return message;
}

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

export async function deleteMessage(threadId, messageId, { side, customerId }) {
  return tx(async (conn) => {
    const message = await changeableMessage(conn, threadId, messageId, { side, customerId });
    const deletedAt = now();
    await repo.markMessageDeleted(conn, message.id, deletedAt);
    return forSide({ ...message, deletedAt }, side);
  });
}

export async function openThread({ customerId }) {
  const stored = typeof customerId === 'string' ? await repo.findCustomerId(pool, customerId) : null;
  if (!stored || stored !== customerId) throw new ApiError('NOT_FOUND', 'Customer not found.');
  return tx(async (conn) => ({ id: await repo.customerThreadId(conn, customerId) }));
}
