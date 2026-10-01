import {
  FEEDBACK_STATUSES,
  flagReasonProblem,
  publicReview,
  replyProblem,
  replyText,
  reviewCategories,
  reviewProblem
} from '@tm/shared/src/domain/feedback.js';
import { pool, tx } from '../../db.js';
import { ApiError } from '../../lib/ApiError.js';
import { newId } from '../../lib/ids.js';
import { now } from '../../lib/time.js';
import { postAdminMessage } from '../messages/messages.repo.js';
import { lockOwner } from '../reservations/reservations.repo.js';
import * as repo from './feedback.repo.js';

/**
 * Reviews on the server (docs/backend-development-phases.md Phase 9, §9.8): the review a customer
 * writes after a completed event, the admin's moderation of it on the Feedbacks page (read, publish or
 * hide, feature, flag, archive, reply, delete) and the public website's list, with the return shapes,
 * error codes, messages and meta.field the pages expect; the page's own checks are repeated here in the
 * same order because the server never trusts the page (§3 rule 3). The rules that need no
 * stored data (star ratings, what a review, a reply and a flag's reason need, the public fields) come
 * from @tm/shared/src/domain/feedback.js, the code the pages run too.
 *
 * On purpose:
 * - The customer is the signed-in one (from the token), and so is the admin whose name goes on a reply
 *   and its chat message (req.user.name).
 * - A review id or booking ref must be spelled exactly as stored: the columns' collation ignores case
 *   and trailing spaces, so the service compares the id or ref itself.
 * - Text is saved as well-formed Unicode (a lone half of an emoji, possible only in a hand-made
 *   request, becomes "�").
 * Every change runs in one transaction with the review's row locked (lockFeedback), so two admin
 * actions on one review never undo each other's checks. The reply also posts to the customer's chat,
 * so it keeps the lock order every write keeps: the booking's row, then the review, then the thread.
 * The change stamp moves after every write (middleware/changes.js), so a new review reaches the
 * admin's badge and bell, and a reply the customer's chat, within one poll (about 15 seconds).
 */

const gone = () => new ApiError('NOT_FOUND', 'This feedback no longer exists.');
const notOpen = () => new ApiError('INVALID_STATE', 'Feedback opens once an event is completed.');
const alreadyReviewed = () => new ApiError('INVALID_STATE', 'You already reviewed this event.');

// Text as it is saved: well-formed and without surrounding spaces (only text reaches here; the routes check the type)
const clean = (text) => text.toWellFormed().trim();

/**
 * One review with the names the pages show: who wrote it and which
 * event it is about. The admin's view adds the customer's mobile number and keeps the reason for a
 * flag; a customer's view has neither (that reason is the admin's own note). `row` is an entry of
 * repo.findFeedbacks().
 */
function view(row, { admin }) {
  const { flagReason, ...review } = row.feedback;
  const shaped = {
    ...review,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    eventName: row.eventName,
    eventDate: row.eventDate,
    occasion: row.occasion,
    guests: row.guests,
    packageName: row.packageName
  };
  return admin ? { ...shaped, flagReason, customerMobile: row.customerMobile } : shaped;
}

// One review as the admin sees it, read after a change inside the same transaction
async function adminView(conn, id) {
  const [row] = await repo.findFeedbacks(conn, { id });
  return view(row, { admin: true });
}

// The review to change, with its row locked until the transaction ends; NOT_FOUND unless it exists with exactly this id
async function lockedFeedback(conn, id) {
  const found = typeof id === 'string' && id ? await repo.lockFeedback(conn, id) : null;
  if (!found || found.id !== id) throw gone();
  return found;
}

/* ============================ Reads ============================ */

/**
 * Admin: every review, newest first, with the admin-only details. With `customerId` (the customer
 * portal; the route passes the signed-in customer) only that customer's own reviews, without them.
 */
export async function listFeedbacks({ customerId } = {}) {
  const rows = await repo.findFeedbacks(pool, { customerId });
  return rows.map((row) => view(row, { admin: customerId == null }));
}

/**
 * Public website: the reviews the admin published, featured ones first, then the newest, at most
 * `limit`. Flagged and archived reviews never appear, and each review carries only the public fields
 * (publicReview): no email, mobile number, customer id or reservation ref.
 */
export async function listPublished({ limit = 3 } = {}) {
  const rows = await repo.findFeedbacks(pool, { published: true, limit });
  return rows.map((row) => publicReview(view(row, { admin: false })));
}

/** Admin: how many reviews are unread (the admin layout counts its badge from listFeedbacks instead). */
export async function unreadFeedbackCount() {
  return repo.countUnread(pool);
}

/* ============================ The customer's review ============================ */

/**
 * Customer: review one of their own completed events. One review per event; 1–5 stars overall, a
 * rating for every part of the service and at least 20 characters (reviewProblem). In this order:
 * the booking (INVALID_STATE unless it is theirs and completed), an earlier review
 * (INVALID_STATE), then the form (INVALID with meta.field). The booking's row is locked first, so two
 * reviews of one event sent at the same moment are checked one after the other; the UNIQUE ref index
 * is the last guard. Saved hidden and unread: the admin decides what reaches the website. Returns the
 * review as the customer sees it.
 */
export async function createFeedback(customer, { ref, rating, categories, body } = {}) {
  return tx(async (conn) => {
    const booking = typeof ref === 'string' && ref ? await lockOwner(conn, ref) : null;
    if (!booking || booking.ref !== ref || booking.customerId !== customer.id || booking.status !== 'completed') throw notOpen();
    if (await repo.findFeedbackIdFor(conn, booking.ref)) throw alreadyReviewed();
    const problem = reviewProblem({ rating, categories, body });
    if (problem) throw new ApiError('INVALID', problem.message, { field: problem.field });
    const id = newId('tst');
    try {
      await repo.insertFeedback(conn, {
        id,
        customerId: customer.id,
        ref: booking.ref,
        rating: Number(rating),
        categories: reviewCategories(categories),
        body: clean(body),
        createdAt: now()
      });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw alreadyReviewed();
      throw err;
    }
    const [row] = await repo.findFeedbacks(conn, { id });
    return view(row, { admin: false });
  });
}

/* ============================ The admin's actions ============================ */

/** Admin: mark one review as read (clears it from the Unread tab and the sidebar badge). */
export async function markFeedbackRead(id) {
  return tx(async (conn) => {
    const feedback = await lockedFeedback(conn, id);
    await repo.updateFeedback(conn, feedback.id, { readByAdmin: true });
    return adminView(conn, feedback.id);
  });
}

/** Admin: mark every review as read. Returns { marked }: how many were still unread. */
export async function markAllFeedbackRead() {
  return { marked: await repo.markAllRead(pool) };
}

/**
 * Admin: show a review on the website ('published') or take it off ('hidden'). A flagged or archived
 * review can't be published (INVALID_STATE); hiding also takes it off the featured ones.
 */
export async function setFeedbackStatus(id, status) {
  if (!FEEDBACK_STATUSES.includes(status)) throw new ApiError('INVALID', 'A feedback is either published or hidden.');
  return tx(async (conn) => {
    const feedback = await lockedFeedback(conn, id);
    if (status === 'published' && feedback.flagged) throw new ApiError('INVALID_STATE', 'Remove the flag before publishing this feedback.');
    if (status === 'published' && feedback.archived) throw new ApiError('INVALID_STATE', 'Restore this feedback from the archive first.');
    await repo.updateFeedback(conn, feedback.id, { status, ...(status === 'hidden' ? { featured: false } : {}), readByAdmin: true });
    return adminView(conn, feedback.id);
  });
}

/**
 * Admin: feature a review on the website (featuring publishes it; not while it is flagged or archived)
 * or take it off the featured ones. `featured` counts as true or false the way JavaScript reads it.
 */
export async function setFeedbackFeatured(id, featured) {
  return tx(async (conn) => {
    const feedback = await lockedFeedback(conn, id);
    const changes = { featured: Boolean(featured), readByAdmin: true };
    if (featured) {
      if (feedback.flagged) throw new ApiError('INVALID_STATE', 'Remove the flag before featuring this feedback.');
      if (feedback.archived) throw new ApiError('INVALID_STATE', 'Restore this feedback from the archive first.');
      changes.status = 'published';
    }
    await repo.updateFeedback(conn, feedback.id, changes);
    return adminView(conn, feedback.id);
  });
}

/**
 * Admin: flag a review with a reason of at least 5 characters, only the admin sees (flagReasonProblem;
 * checked before the review is looked up). A flagged review comes off the
 * website and the featured ones. Clearing the flag also clears the reason and leaves the review hidden
 * until the admin publishes it again.
 */
export async function setFeedbackFlag(id, { flagged, reason = '' } = {}) {
  const problem = flagged ? flagReasonProblem(reason) : '';
  if (problem) throw new ApiError('INVALID', problem, { field: 'reason' });
  return tx(async (conn) => {
    const feedback = await lockedFeedback(conn, id);
    const changes = { flagged: Boolean(flagged), flagReason: flagged ? clean(reason) : '', readByAdmin: true };
    if (flagged) Object.assign(changes, { status: 'hidden', featured: false });
    await repo.updateFeedback(conn, feedback.id, changes);
    return adminView(conn, feedback.id);
  });
}

/** Admin: put a review in the archive (off the website and the featured ones, out of the main list) or restore it (still hidden). */
export async function setFeedbackArchived(id, archived) {
  return tx(async (conn) => {
    const feedback = await lockedFeedback(conn, id);
    const changes = { archived: Boolean(archived), readByAdmin: true };
    if (archived) Object.assign(changes, { status: 'hidden', featured: false });
    await repo.updateFeedback(conn, feedback.id, changes);
    return adminView(conn, feedback.id);
  });
}

/**
 * Admin: answer a review (5–1,000 characters after trimming, replyProblem; checked before the review is
 * looked up). The answer is kept on the review, signed with the admin's
 * name, so the customer sees it under their review, and the same words go to the customer's chat,
 * tagged with the event ("About your feedback on …: …"), in the same transaction. Replying again
 * replaces the answer and sends the new one. `admin` is the signed-in admin (req.user).
 * Lock order: the review's booking is found without a lock (outside the transaction), then its row is
 * locked (lockOwner), then the review's (it may have been deleted meanwhile: NOT_FOUND), then the
 * thread (postAdminMessage), like every other write that posts to the chat.
 */
export async function replyToFeedback(id, body, admin) {
  const text = replyText(body);
  const problem = replyProblem(text);
  if (problem) throw new ApiError('INVALID', problem, { field: 'body' });
  const target = typeof id === 'string' && id ? await repo.findFeedbackRef(pool, id) : null;
  if (!target || target.id !== id) throw gone();
  return tx(async (conn) => {
    const booking = await lockOwner(conn, target.ref);
    const feedback = await lockedFeedback(conn, id);
    const reply = { body: text.toWellFormed(), at: now(), by: admin.name };
    await repo.updateFeedback(conn, feedback.id, { reply, readByAdmin: true });
    const [row] = await repo.findFeedbacks(conn, { id: feedback.id });
    if (booking) await postAdminMessage(conn, booking, `About your feedback on ${row.eventName}: ${reply.body}`, null, admin.name);
    return view(row, { admin: true });
  });
}

/** Admin: delete a review for good (abusive or mistaken reviews). The customer may then write a new one. */
export async function deleteFeedback(id) {
  return tx(async (conn) => {
    const feedback = await lockedFeedback(conn, id);
    await repo.deleteFeedback(conn, feedback.id);
    return { ok: true };
  });
}
