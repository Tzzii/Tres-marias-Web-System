import { FEEDBACK_CATEGORIES } from './config.js';
import { postAdminMessage } from './reservationService.js';
import { ApiError, clone, latency, read, write } from './store.js';

/**
 * Customer feedback: the review a customer writes after a completed event
 * (the customer portal calls them testimonials) and everything the admin does
 * with it on the Feedbacks page.
 *
 * One review per completed reservation: an overall star rating, a short text and
 * a rating for each part of the service (see FEEDBACK_CATEGORIES). Both portals
 * read the same records, so a review written in the portal is the same record the
 * admin moderates, and the admin's reply comes back to the customer as a message.
 *
 * Moderation state on a review:
 *   status      'hidden'  new reviews start here — not on the public website yet
 *               'published'  the website may show it
 *   featured    published and pinned to the top of the homepage reviews
 *   flagged     set aside with a reason (never shown on the website)
 *   archived    put away; out of the main list but kept, and can be restored
 *   readByAdmin false until the admin reads or acts on it (the sidebar badge)
 *   reply       the admin's answer, also delivered to the customer's chat thread
 */

// Name of the signed-in admin, recorded on replies
const ADMIN_NAME = () => {
  try {
    const user = JSON.parse(sessionStorage.getItem('tm.admin.session') || localStorage.getItem('tm.admin.session'));
    return (user && user.user && user.user.name) || 'Tres Marias team';
  } catch (e) {
    return 'Tres Marias team';
  }
};

/** Find a feedback by id, or throw. */
function findOrThrow(data, id) {
  const feedback = data.testimonials.find((t) => t.id === id);
  if (!feedback) throw new ApiError('NOT_FOUND', 'This feedback no longer exists.');
  return feedback;
}

/** A rating is a whole number of stars from 1 to 5. */
const validStars = (value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 5;

/**
 * One feedback with the names the pages show: who wrote it and which event it is about.
 * `admin` adds the details only the admin sees (contact number, flag reason).
 */
function shape(feedback, data, { admin = false } = {}) {
  const reservation = data.reservations.find((r) => r.ref === feedback.ref);
  const customer = data.customers.find((c) => c.id === feedback.customerId);
  const pkg = reservation ? data.packages.find((p) => p.id === reservation.packageId) : null;
  const shaped = {
    ...clone(feedback),
    categories: clone(feedback.categories) || {},
    customerName: customer ? customer.name : '',
    customerEmail: customer ? customer.email : '',
    eventName: reservation ? reservation.eventName : '',
    eventDate: reservation ? reservation.date : '',
    occasion: reservation ? reservation.occasion : '',
    guests: reservation ? reservation.guests : 0,
    packageName: pkg ? pkg.name : ''
  };
  // The contact number and the admin's note on a flag stay on the admin side
  if (!admin) {
    delete shaped.flagReason;
    return shaped;
  }
  return { ...shaped, customerMobile: customer ? customer.mobile : '' };
}

/** Average of the category ratings, or 0 when none were given. */
export function categoryAverage(categories = {}) {
  const values = FEEDBACK_CATEGORIES.map(({ key }) => Number(categories[key])).filter(validStars);
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Admin: every feedback, newest first. With `customerId` (customer portal) it
 * returns only that customer's own reviews, without the admin-only details.
 */
export async function listFeedbacks({ customerId } = {}) {
  await latency(150, 350);
  const data = read();
  return data.testimonials
    .filter((t) => !customerId || t.customerId === customerId)
    .map((t) => shape(t, data, { admin: !customerId }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Public website: the reviews the admin published, featured ones first, then newest.
 * Flagged and archived reviews never appear here.
 */
export async function listPublished({ limit = 3 } = {}) {
  await latency(150, 350);
  const data = read();
  return data.testimonials
    .filter((t) => t.status === 'published' && !t.archived && !t.flagged)
    .map((t) => shape(t, data))
    .sort((a, b) => Number(b.featured) - Number(a.featured) || b.createdAt - a.createdAt)
    .slice(0, limit);
}

/** How many feedbacks the admin has not read yet (sidebar badge). */
export async function unreadFeedbackCount() {
  await latency(80, 180);
  return read().testimonials.filter((t) => !t.readByAdmin).length;
}

/**
 * Customer: review a completed event. One review per event, 1–5 stars overall,
 * a rating for every category and at least 20 characters of text. It reaches the
 * admin's Feedbacks page unread and stays off the website until the admin publishes it.
 */
export async function createFeedback(customerId, { ref, rating, categories = {}, body }) {
  await latency(400, 700);
  return write((data) => {
    // Must be this customer's own completed reservation
    const reservation = data.reservations.find((r) => r.ref === ref && r.customerId === customerId);
    if (!reservation || reservation.status !== 'completed') {
      throw new ApiError('INVALID_STATE', 'Feedback opens once an event is completed.');
    }
    if (data.testimonials.some((t) => t.ref === ref)) throw new ApiError('INVALID_STATE', 'You already reviewed this event.');
    if (!validStars(rating)) throw new ApiError('INVALID', 'Choose an overall rating from 1 to 5 stars.', { field: 'rating' });
    // Every category has to be rated, so the admin's category ratings mean something
    const missing = FEEDBACK_CATEGORIES.filter(({ key }) => !validStars(categories[key]));
    if (missing.length) {
      throw new ApiError('INVALID', `Please rate ${missing.map((c) => c.label.toLowerCase()).join(', ')}.`, { field: 'categories' });
    }
    if (!body || body.trim().length < 20) throw new ApiError('INVALID', 'Tell us a little more (at least 20 characters).', { field: 'body' });
    const feedback = {
      id: `tst-${Date.now().toString(36)}`,
      customerId,
      ref,
      rating: Number(rating),
      categories: Object.fromEntries(FEEDBACK_CATEGORIES.map(({ key }) => [key, Number(categories[key])])),
      body: body.trim(),
      createdAt: Date.now(),
      status: 'hidden',
      featured: false,
      flagged: false,
      flagReason: '',
      archived: false,
      readByAdmin: false,
      reply: null
    };
    data.testimonials.push(feedback);
    return shape(feedback, data);
  });
}

/** Admin: mark one feedback as read (clears it from the Unread tab and the sidebar badge). */
export async function markFeedbackRead(id) {
  return write((data) => {
    const feedback = findOrThrow(data, id);
    feedback.readByAdmin = true;
    return shape(feedback, data, { admin: true });
  });
}

/** Admin: mark every feedback as read. Returns how many were still unread. */
export async function markAllFeedbackRead() {
  await latency(200, 400);
  return write((data) => {
    const unread = data.testimonials.filter((t) => !t.readByAdmin);
    unread.forEach((t) => {
      t.readByAdmin = true;
    });
    return { marked: unread.length };
  });
}

/** Admin: show a feedback on the website ('published') or take it off ('hidden'). */
export async function setFeedbackStatus(id, status) {
  await latency(300, 550);
  if (!['published', 'hidden'].includes(status)) throw new ApiError('INVALID', 'A feedback is either published or hidden.');
  return write((data) => {
    const feedback = findOrThrow(data, id);
    if (status === 'published' && feedback.flagged) throw new ApiError('INVALID_STATE', 'Remove the flag before publishing this feedback.');
    if (status === 'published' && feedback.archived) throw new ApiError('INVALID_STATE', 'Restore this feedback from the archive first.');
    feedback.status = status;
    // A hidden review cannot stay featured on the homepage
    if (status === 'hidden') feedback.featured = false;
    feedback.readByAdmin = true;
    return shape(feedback, data, { admin: true });
  });
}

/** Admin: feature a feedback on the website (featuring publishes it) or remove it from the featured ones. */
export async function setFeedbackFeatured(id, featured) {
  await latency(300, 550);
  return write((data) => {
    const feedback = findOrThrow(data, id);
    if (featured) {
      if (feedback.flagged) throw new ApiError('INVALID_STATE', 'Remove the flag before featuring this feedback.');
      if (feedback.archived) throw new ApiError('INVALID_STATE', 'Restore this feedback from the archive first.');
      feedback.status = 'published';
    }
    feedback.featured = Boolean(featured);
    feedback.readByAdmin = true;
    return shape(feedback, data, { admin: true });
  });
}

/**
 * Admin: flag a feedback for a reason (it comes off the website while it is flagged),
 * or clear the flag. Clearing leaves it hidden until the admin publishes it again.
 */
export async function setFeedbackFlag(id, { flagged, reason = '' }) {
  await latency(300, 550);
  if (flagged && reason.trim().length < 5) throw new ApiError('INVALID', 'Give a short reason for the flag (at least 5 characters).', { field: 'reason' });
  return write((data) => {
    const feedback = findOrThrow(data, id);
    feedback.flagged = Boolean(flagged);
    feedback.flagReason = flagged ? reason.trim() : '';
    if (flagged) {
      feedback.status = 'hidden';
      feedback.featured = false;
    }
    feedback.readByAdmin = true;
    return shape(feedback, data, { admin: true });
  });
}

/** Admin: put a feedback in the archive (off the website, out of the main list) or restore it. */
export async function setFeedbackArchived(id, archived) {
  await latency(300, 550);
  return write((data) => {
    const feedback = findOrThrow(data, id);
    feedback.archived = Boolean(archived);
    if (archived) {
      feedback.status = 'hidden';
      feedback.featured = false;
    }
    feedback.readByAdmin = true;
    return shape(feedback, data, { admin: true });
  });
}

/**
 * Admin: answer a feedback (5–1,000 characters). The answer is kept on the feedback,
 * so the customer sees it under their review, and is also sent to the chat thread of
 * that event, so it arrives as a message in the customer portal. Replying again replaces
 * the answer and sends the new one.
 */
export async function replyToFeedback(id, body) {
  await latency(400, 700);
  const text = String(body || '').trim();
  if (text.length < 5) throw new ApiError('INVALID', 'Write a reply first (at least 5 characters).', { field: 'body' });
  if (text.length > 1000) throw new ApiError('INVALID', 'Replies can be up to 1,000 characters.', { field: 'body' });
  return write((data) => {
    const feedback = findOrThrow(data, id);
    feedback.reply = { body: text, at: Date.now(), by: ADMIN_NAME() };
    feedback.readByAdmin = true;
    // Deliver the same words to the customer's chat thread for that event
    const reservation = data.reservations.find((r) => r.ref === feedback.ref);
    if (reservation) postAdminMessage(data, reservation, `About your feedback on ${reservation.eventName}: ${text}`);
    return shape(feedback, data, { admin: true });
  });
}

/** Admin: delete a feedback for good (abusive or mistaken reviews). The customer may then write a new one. */
export async function deleteFeedback(id) {
  await latency(350, 600);
  return write((data) => {
    const index = data.testimonials.findIndex((t) => t.id === id);
    if (index === -1) throw new ApiError('NOT_FOUND', 'This feedback no longer exists.');
    data.testimonials.splice(index, 1);
    return { ok: true };
  });
}
