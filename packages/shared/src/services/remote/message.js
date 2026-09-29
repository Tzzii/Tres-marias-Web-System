import { ApiError } from '../errors.js';
import { http, sessionSide } from '../http.js';

/**
 * The message (chat) service on the API (apps/api/src/modules/messages, endpoint map in
 * docs/backend-development-phases.md §9.5). Same function names, arguments, return shapes and
 * ApiError codes as the browser version (messageService.js), so no page changes when
 * VITE_API_SERVICES includes "messages" (see facade/message.js).
 *
 * - `side` picks the address: /threads for the customer, /admin/threads for the admin. The server takes
 *   the customer and the sender's name from the session, so the page's `customerId` and `senderName`
 *   are not sent (the admin's `customerId` still names whose conversation to open).
 * - openThread() has no side of its own, so it goes by the portal that is signed in. Like the browser
 *   version, it only reads when the conversation exists (no change event), and writes only to start one.
 * - unreadCount() is not used by any page (the badges come from listThreads) and answers 0.
 * Messages written in the other portal show up through the change poller (services/poller.js).
 */

// A thread id in a URL path (never trust a path segment)
const segment = (id) => encodeURIComponent(String(id || ''));
// The chat address for a side
const base = (side) => (side === 'admin' ? '/admin/threads' : '/threads');

/** All threads (admin; with `customerId`, that customer's) or the signed-in customer's thread, most recently active first. */
export function listThreads({ customerId, side } = {}) {
  if (side === 'admin' && customerId) return http.get(`/admin/threads?${new URLSearchParams({ customerId })}`);
  return http.get(base(side));
}

/** One thread with all its messages, each with the event it is about. NOT_FOUND for another customer's, and for no id at all. */
export async function getThread(threadId, { side } = {}) {
  if (!threadId) throw new ApiError('NOT_FOUND', 'Conversation not found.');
  return http.get(`${base(side)}/${segment(threadId)}`);
}

/** Mark every message in a thread as read for `side`. Returns { ok } ({ ok: false } for a thread that is not there). */
export async function markThreadRead(threadId, side) {
  if (!threadId) return { ok: false };
  return http.post(`${base(side)}/${segment(threadId)}/read`, {});
}

/** Add a message (1–2,000 characters), optionally tagged with one of the customer's reservations (`ref`). Returns the message. */
export const sendMessage = (threadId, { side, body, ref = null } = {}) => http.post(`${base(side)}/${segment(threadId)}/messages`, { body, ref });

/**
 * Find the customer's conversation, starting it on first use: { id }. The admin names the customer
 * (`customerId`); a customer always opens their own.
 */
export async function openThread({ customerId } = {}) {
  const side = sessionSide();
  if (side === 'admin' && !customerId) throw new ApiError('NOT_FOUND', 'Customer not found.');
  const existing = await listThreads({ customerId, side });
  if (existing.length) return { id: existing[0].id };
  return http.post(base(side), side === 'admin' ? { customerId } : {});
}

/** @deprecated No page reads it: the badges come from listThreads. Always 0 on the API. */
export const unreadCount = () => 0;
