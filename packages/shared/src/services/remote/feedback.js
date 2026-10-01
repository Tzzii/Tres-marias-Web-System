import { FEEDBACK_STATUSES, flagReasonProblem, replyProblem, replyText } from '../../domain/feedback.js';
import { ApiError } from '../errors.js';
import { http, sessionSide } from '../http.js';

/**
 * The review (feedback) service on the API (apps/api/src/modules/feedback, endpoint map in
 * docs/backend-development-phases.md §9.8). Same function names, arguments, return shapes and ApiError
 * codes as the browser version (feedbackService.js), so no page changes when VITE_API_SERVICES includes
 * "feedback" (see facade/feedback.js).
 *
 * - The customer and the admin come from the session, so the page's `customerId` is not sent; the
 *   signed-in portal picks the address (/feedback for a customer, /admin/feedback for the admin), as
 *   for payments. The admin portal lists every review (no page there asks for one customer's).
 * - listPublished() is public: the homepage calls it signed in or not, and gets only the public fields.
 * - Every write is one request, which emits one change event (http.js); a review never takes or frees a
 *   date, so the calendar has nothing to reload. The other portal sees the change through the poller.
 * - Without an id there is nothing to send: those calls still answer as the browser version would,
 *   whose form checks (the status, a flag's reason, the reply) come before the review is looked up.
 */

// A review id in a URL path (never trust a path segment)
const segment = (id) => encodeURIComponent(String(id || ''));
// True in the admin portal
const isAdmin = () => sessionSide() === 'admin';
const gone = () => new ApiError('NOT_FOUND', 'This feedback no longer exists.');

/** Every review with the admin-only details (admin), or the signed-in customer's own reviews; newest first. */
export const listFeedbacks = () => http.get(isAdmin() ? '/admin/feedback' : '/feedback');

/** Public website: the published reviews, featured first, then newest, at most `limit` (1–20). */
export const listPublished = ({ limit = 3 } = {}) => http.get(`/feedback/published?${new URLSearchParams({ limit: String(limit) })}`);

/** Admin: how many reviews are unread. */
export const unreadFeedbackCount = () => http.get('/admin/feedback/unread-count');

/** Customer: review a completed event: { ref, rating, categories, body } -> the review (hidden until the admin publishes it). */
export const createFeedback = (customerId, { ref, rating, categories, body } = {}) => http.post('/feedback', { ref, rating, categories, body });

/** Admin: mark one review as read. */
export async function markFeedbackRead(id) {
  if (!id) throw gone();
  return http.post(`/admin/feedback/${segment(id)}/read`, {});
}

/** Admin: mark every review as read -> { marked }. */
export const markAllFeedbackRead = () => http.post('/admin/feedback/read-all', {});

/** Admin: 'published' (on the website) or 'hidden'. */
export async function setFeedbackStatus(id, status) {
  if (!id) {
    if (!FEEDBACK_STATUSES.includes(status)) throw new ApiError('INVALID', 'A feedback is either published or hidden.');
    throw gone();
  }
  return http.patch(`/admin/feedback/${segment(id)}/status`, { status });
}

/** Admin: feature a review on the website (publishes it) or take it off the featured ones. */
export async function setFeedbackFeatured(id, featured) {
  if (!id) throw gone();
  return http.patch(`/admin/feedback/${segment(id)}/featured`, { featured });
}

/** Admin: flag a review with a reason (at least 5 characters, seen only by the admin), or clear the flag. */
export async function setFeedbackFlag(id, { flagged, reason = '' } = {}) {
  if (!id) {
    const problem = flagged ? flagReasonProblem(reason) : '';
    if (problem) throw new ApiError('INVALID', problem, { field: 'reason' });
    throw gone();
  }
  return http.patch(`/admin/feedback/${segment(id)}/flag`, { flagged, reason: typeof reason === 'string' ? reason : '' });
}

/** Admin: put a review in the archive or restore it. */
export async function setFeedbackArchived(id, archived) {
  if (!id) throw gone();
  return http.patch(`/admin/feedback/${segment(id)}/archived`, { archived });
}

/** Admin: answer a review (5–1,000 characters): saved under it and sent to the customer's chat. */
export async function replyToFeedback(id, body) {
  if (!id) {
    const problem = replyProblem(replyText(body));
    if (problem) throw new ApiError('INVALID', problem, { field: 'body' });
    throw gone();
  }
  return http.post(`/admin/feedback/${segment(id)}/reply`, { body });
}

/** Admin: delete a review for good -> { ok: true }. */
export async function deleteFeedback(id) {
  if (!id) throw gone();
  return http.delete(`/admin/feedback/${segment(id)}`);
}
