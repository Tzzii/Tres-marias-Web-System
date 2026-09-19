import { ApiError, clone, latency, read, uid, write } from './store.js';

/**
 * Chat between a customer and the Tres Marias admin: one conversation per customer.
 * A message can carry the `ref` of the reservation it is about (system messages such as
 * receipts, contracts and reminders always do); it is shown as a small tag on the message.
 * Both portals read the same threads. `side` is 'customer' or 'admin' and decides which unread flag applies.
 */

// Name of the message field that tracks whether this side has read it
const unreadFlag = (side) => (side === 'customer' ? 'readByCustomer' : 'readByAdmin');

/**
 * The customer's one conversation, created on first use. Used here and by the reservation and
 * payment services when they post automatic messages.
 */
export function customerThread(data, customerId) {
  let thread = data.threads.find((t) => t.customerId === customerId);
  if (!thread) {
    thread = { id: uid('th'), customerId, messages: [] };
    data.threads.push(thread);
  }
  return thread;
}

/** Thread info for the conversation list: customer, last message and unread count for `side`. */
function summarize(thread, data, side) {
  const customer = data.customers.find((c) => c.id === thread.customerId);
  const last = thread.messages[thread.messages.length - 1] || null;
  return {
    id: thread.id,
    customerId: thread.customerId,
    customerName: customer ? customer.name : '',
    customerEmail: customer ? customer.email : '',
    lastMessage: clone(last),
    updatedAt: last ? last.at : 0,
    unread: thread.messages.filter((m) => !m[unreadFlag(side)]).length
  };
}

/** All threads (admin) or one customer's thread, most recently active first. */
export async function listThreads({ customerId, side }) {
  await latency(150, 380);
  const data = read();
  return data.threads
    .filter((t) => !customerId || t.customerId === customerId)
    .map((t) => summarize(t, data, side))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Synchronous unread count for navigation badges. */
export function unreadCount({ customerId, side }) {
  const flag = unreadFlag(side);
  return read()
    .threads.filter((t) => !customerId || t.customerId === customerId)
    .reduce((sum, t) => sum + t.messages.filter((m) => !m[flag]).length, 0);
}

/**
 * One thread with all its messages. Each message gets the name of the event it is about
 * (`eventName`, empty when untagged). A customer can only open their own thread.
 */
export async function getThread(threadId, { customerId, side }) {
  await latency(120, 300);
  const data = read();
  const thread = data.threads.find((t) => t.id === threadId);
  if (!thread || (customerId && thread.customerId !== customerId)) throw new ApiError('NOT_FOUND', 'Conversation not found.');
  const eventName = (ref) => (ref && data.reservations.find((r) => r.ref === ref)?.eventName) || '';
  return { ...summarize(thread, data, side), messages: thread.messages.map((m) => ({ ...clone(m), eventName: eventName(m.ref) })) };
}

/**
 * Mark every message in a thread as read for one side. With `customerId` (customer portal) only that
 * customer's own thread can be marked. When nothing is unread nothing is saved, so live pages aren't told
 * about a change that didn't happen.
 */
export async function markThreadRead(threadId, side, { customerId } = {}) {
  const flag = unreadFlag(side);
  const current = read().threads.find((t) => t.id === threadId);
  if (!current || (customerId && current.customerId !== customerId)) return { ok: false };
  if (current.messages.every((m) => m[flag])) return { ok: true };
  return write((data) => {
    const thread = data.threads.find((t) => t.id === threadId);
    thread.messages.forEach((m) => {
      m[flag] = true;
    });
    return { ok: true };
  });
}

/**
 * Add a message (1–2,000 characters). It starts as read for the sender and unread for the other side.
 * `ref` optionally tags it with one of the customer's reservations.
 */
export async function sendMessage(threadId, { side, senderName, body, customerId, ref = null }) {
  await latency(250, 500);
  const text = String(body || '').trim();
  if (!text) throw new ApiError('INVALID', 'Write a message first.');
  if (text.length > 2000) throw new ApiError('INVALID', 'Messages can be up to 2,000 characters.');
  return write((data) => {
    const thread = data.threads.find((t) => t.id === threadId);
    if (!thread || (customerId && thread.customerId !== customerId)) throw new ApiError('NOT_FOUND', 'Conversation not found.');
    if (ref && !data.reservations.some((r) => r.ref === ref && r.customerId === thread.customerId)) {
      throw new ApiError('NOT_FOUND', 'We could not find this reservation.');
    }
    const message = {
      id: uid('m'),
      from: side,
      senderName,
      body: text,
      ref: ref || null,
      at: Date.now(),
      readByCustomer: side === 'customer',
      readByAdmin: side === 'admin',
      attachment: null
    };
    thread.messages.push(message);
    return clone(message);
  });
}

/**
 * Find the customer's conversation, creating it on first use. An existing one is only read,
 * so opening the chat doesn't announce a data change (which would make live pages reload again).
 */
export async function openThread({ customerId }) {
  await latency(120, 280);
  const existing = read().threads.find((t) => t.customerId === customerId);
  if (existing) return { id: existing.id };
  return write((data) => {
    if (!data.customers.some((c) => c.id === customerId)) throw new ApiError('NOT_FOUND', 'Customer not found.');
    return { id: customerThread(data, customerId).id };
  });
}
