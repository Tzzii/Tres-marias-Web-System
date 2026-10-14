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


const gone = () => new ApiError('NOT_FOUND', 'This feedback no longer exists.');
const notOpen = () => new ApiError('INVALID_STATE', 'Feedback opens once an event is completed.');
const alreadyReviewed = () => new ApiError('INVALID_STATE', 'You already reviewed this event.');

const clean = (text) => text.toWellFormed().trim();

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

async function adminView(conn, id) {
  const [row] = await repo.findFeedbacks(conn, { id });
  return view(row, { admin: true });
}

async function lockedFeedback(conn, id) {
  const found = typeof id === 'string' && id ? await repo.lockFeedback(conn, id) : null;
  if (!found || found.id !== id) throw gone();
  return found;
}


export async function listFeedbacks({ customerId } = {}) {
  const rows = await repo.findFeedbacks(pool, { customerId });
  return rows.map((row) => view(row, { admin: customerId == null }));
}

export async function listPublished({ limit = 3 } = {}) {
  const rows = await repo.findFeedbacks(pool, { published: true, limit });
  return rows.map((row) => publicReview(view(row, { admin: false })));
}

export async function unreadFeedbackCount() {
  return repo.countUnread(pool);
}


export async function createFeedback(customer, { ref, rating, categories, body } = {}) {
  return tx(async (conn) => {
    const booking = typeof ref === 'string' && ref ? await lockOwner(conn, ref) : null;
    if (!booking || booking.ref !== ref || booking.customerId !== customer.id || booking.status !== 'completed')
      throw notOpen();
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


export async function markFeedbackRead(id) {
  return tx(async (conn) => {
    const feedback = await lockedFeedback(conn, id);
    await repo.updateFeedback(conn, feedback.id, { readByAdmin: true });
    return adminView(conn, feedback.id);
  });
}

export async function markAllFeedbackRead() {
  return { marked: await repo.markAllRead(pool) };
}

export async function setFeedbackStatus(id, status) {
  if (!FEEDBACK_STATUSES.includes(status)) throw new ApiError('INVALID', 'A feedback is either published or hidden.');
  return tx(async (conn) => {
    const feedback = await lockedFeedback(conn, id);
    if (status === 'published' && feedback.flagged)
      throw new ApiError('INVALID_STATE', 'Remove the flag before publishing this feedback.');
    if (status === 'published' && feedback.archived)
      throw new ApiError('INVALID_STATE', 'Restore this feedback from the archive first.');
    await repo.updateFeedback(conn, feedback.id, {
      status,
      ...(status === 'hidden' ? { featured: false } : {}),
      readByAdmin: true
    });
    return adminView(conn, feedback.id);
  });
}

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

export async function setFeedbackArchived(id, archived) {
  return tx(async (conn) => {
    const feedback = await lockedFeedback(conn, id);
    const changes = { archived: Boolean(archived), readByAdmin: true };
    if (archived) Object.assign(changes, { status: 'hidden', featured: false });
    await repo.updateFeedback(conn, feedback.id, changes);
    return adminView(conn, feedback.id);
  });
}

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
    if (booking)
      await postAdminMessage(conn, booking, `About your feedback on ${row.eventName}: ${reply.body}`, null, admin.name);
    return view(row, { admin: true });
  });
}

export async function deleteFeedback(id) {
  return tx(async (conn) => {
    const feedback = await lockedFeedback(conn, id);
    await repo.deleteFeedback(conn, feedback.id);
    return { ok: true };
  });
}
