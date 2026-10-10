import { RULES } from '../services/config.js';

/**
 * Editing and deleting chat messages (the owner's request, 2026-10-10). Pure (no database, no React), so the
 * chat panel and the API server (apps/api/src/modules/messages) answer the same.
 *
 * - Only a message its writer typed in the chat box (`typed`), and only by the same side ('customer' or
 *   'admin'): automatic messages (quotations, receipts, contracts, billing changes, change and cancel
 *   requests) are the booking's record and never change.
 * - Only for RULES.messageEditMinutes after it was sent, and not once it is deleted.
 * - Nothing is erased: an edit keeps the earlier text in `history`, a delete only marks the message
 *   (`deletedAt`). Customers see "Edited" or "This message was deleted"; the admin can read every version.
 */

/** The edit and delete window in milliseconds. */
export const MESSAGE_CHANGE_MS = RULES.messageEditMinutes * 60 * 1000;

/**
 * True when `side` may still edit or delete `message` ({ from, typed, at, deletedAt }) at `now` (ms):
 * it is that side's own typed message, not deleted, sent no more than MESSAGE_CHANGE_MS ago.
 */
export function messageChangeable(message, side, now = Date.now()) {
  return Boolean(message && message.typed && message.from === side && !message.deletedAt && now - message.at <= MESSAGE_CHANGE_MS);
}

/**
 * Every version of a message, oldest first, for the admin's "View history": [{ kind, body, at }], `kind`
 * being 'original', 'edited' or 'deleted' (the deleted step has no text of its own: the version before it
 * is the text that was deleted).
 * `message` is the admin's copy ({ body, at, editedAt, deletedAt, history }).
 */
export function messageVersions(message) {
  const earlier = Array.isArray(message.history) ? message.history : [];
  const texts = [...earlier, { body: message.body, at: message.editedAt || message.at }];
  const versions = texts.map((version, i) => ({ kind: i === 0 ? 'original' : 'edited', body: version.body, at: version.at }));
  if (message.deletedAt) versions.push({ kind: 'deleted', body: '', at: message.deletedAt });
  return versions;
}

/** The words a deleted message shows in its place, in the chat and in previews. */
export const DELETED_MESSAGE_TEXT = 'This message was deleted';

/** A message's text for a one-line preview (the conversation list, the bell): DELETED_MESSAGE_TEXT once deleted. */
export const messagePreview = (message) => (message ? (message.deletedAt ? DELETED_MESSAGE_TEXT : message.body) : '');
