import { FEEDBACK_CATEGORIES } from '../services/config.js';

/**
 * Review (testimonial) rules that need no stored data: what a star rating is, what a new review
 * needs, what the admin's reply and a flag's reason need, and what the public website may show of
 * a review.
 *
 * Pure (no store.js, no localStorage, no React), so the browser service (feedbackService.js), the
 * API server (apps/api/src/modules/feedback) and the API client (services/remote/feedback.js) apply
 * the same rules with the same messages (docs/backend-development-phases.md §7.8).
 */

/** Where a review can stand: 'published' (the website may show it) or 'hidden' (with the team). */
export const FEEDBACK_STATUSES = ['published', 'hidden'];

/** A rating is a whole number of stars from 1 to 5 (a number, or digits as text: "4" counts as 4). */
export const validStars = (value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 5;

// The category ratings sent with a review: the object itself, or none when it is not an object
const ratingsIn = (categories) => (categories && typeof categories === 'object' ? categories : {});

/** Average of the category ratings, or 0 when none were given. */
export function categoryAverage(categories = {}) {
  const given = ratingsIn(categories);
  const values = FEEDBACK_CATEGORIES.map(({ key }) => Number(given[key])).filter(validStars);
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * What is wrong with a new review, or null when it can be saved: { field, message } for the first
 * problem, in the order the form shows them: an overall rating of 1–5 stars (`rating`), a rating
 * for every part of the service in FEEDBACK_CATEGORIES (`categories`, so the admin's category
 * averages mean something), and at least 20 characters of text after trimming (`body`).
 */
export function reviewProblem({ rating, categories, body } = {}) {
  if (!validStars(rating)) return { field: 'rating', message: 'Choose an overall rating from 1 to 5 stars.' };
  const given = ratingsIn(categories);
  const missing = FEEDBACK_CATEGORIES.filter(({ key }) => !validStars(given[key]));
  if (missing.length) {
    return { field: 'categories', message: `Please rate ${missing.map((c) => c.label.toLowerCase()).join(', ')}.` };
  }
  if (typeof body !== 'string' || body.trim().length < 20) {
    return { field: 'body', message: 'Tell us a little more (at least 20 characters).' };
  }
  return null;
}

/**
 * The category ratings as a review saves them: one number per FEEDBACK_CATEGORIES key, in that
 * order (other keys sent with the form are left out). Use after reviewProblem() has passed.
 */
export const reviewCategories = (categories) => {
  const given = ratingsIn(categories);
  return Object.fromEntries(FEEDBACK_CATEGORIES.map(({ key }) => [key, Number(given[key])]));
};

/** The admin's reply as it is saved and sent: the text without surrounding spaces. */
export const replyText = (body) => String(body || '').trim();

/** What is wrong with a reply (from replyText()), or '' when it can be sent: 5 to 1,000 characters. */
export function replyProblem(text) {
  if (text.length < 5) return 'Write a reply first (at least 5 characters).';
  if (text.length > 1000) return 'Replies can be up to 1,000 characters.';
  return '';
}

/**
 * What is wrong with the reason for flagging a review, or '' when it is fine: at least 5 characters
 * after trimming. Only the admin sees the reason.
 */
export const flagReasonProblem = (reason) =>
  (typeof reason === 'string' ? reason.trim() : '').length < 5 ? 'Give a short reason for the flag (at least 5 characters).' : '';

/**
 * A review as the public website may show it (Data Privacy Act, RA 10173): its id, the stars, the
 * text, who wrote it and for which event, and what orders the list (featured, createdAt). Nothing
 * else that reaches or identifies the customer (email, mobile number, customer id, reservation ref,
 * event date) and nothing that belongs to the team (flag, archive, read state, reply). `review` is
 * a review with its names (customerName, eventName), as the services shape it.
 */
export const publicReview = (review) => ({
  id: review.id,
  rating: review.rating,
  categories: review.categories,
  body: review.body,
  featured: review.featured,
  createdAt: review.createdAt,
  customerName: review.customerName,
  eventName: review.eventName
});
