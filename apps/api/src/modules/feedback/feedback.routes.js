import express from 'express';
import { validate } from '../../middleware/validate.js';
import * as schemas from './feedback.schemas.js';
import * as feedback from './feedback.service.js';

/**
 * The review endpoints of Phase 9 (docs/backend-development-phases.md §9.8): URL, guard and request
 * shape only; the rules are in feedback.service.js. Three routers, mounted by app.js:
 *   feedbackPublishedRoutes  /api/feedback/published  no guard: the public website's reviews. Mounted
 *                                                      before the customer guard of /api/feedback.
 *   feedbackRoutes           /api/feedback...         behind requireAuth + requireRole('customer'): the
 *                                                      signed-in customer's own reviews
 *   feedbackAdminRoutes      /api/admin/feedback...   behind the admin router's guard: every review and
 *                                                      the admin's moderation
 * The customer, and the admin who signs a reply, are always req.user (from the token), never an id or
 * a name sent by the page.
 */

/* ============================ /api/feedback/published (public) ============================ */

export const feedbackPublishedRoutes = express.Router();

// ?limit=3 -> the published reviews, featured first, with only the public fields
feedbackPublishedRoutes.get('/', validate({ query: schemas.publishedQuery }), async (req, res) => {
  res.json(await feedback.listPublished({ limit: req.valid.query.limit }));
});

/* ============================ /api/feedback (customer) ============================ */

export const feedbackRoutes = express.Router();

// The customer's own reviews, newest first (without the admin's notes)
feedbackRoutes.get('/', async (req, res) => {
  res.json(await feedback.listFeedbacks({ customerId: req.user.id }));
});
// Review a completed event: { ref, rating, categories, body } -> 201 with the review
feedbackRoutes.post('/', validate({ body: schemas.createBody }), async (req, res) => {
  res.status(201).json(await feedback.createFeedback(req.user, req.valid.body));
});

/* ============================ /api/admin/feedback ============================ */

export const feedbackAdminRoutes = express.Router();

// Every review, newest first, with the admin-only details
feedbackAdminRoutes.get('/', async (req, res) => {
  res.json(await feedback.listFeedbacks());
});
// How many are unread (a number)
feedbackAdminRoutes.get('/unread-count', async (req, res) => {
  res.json(await feedback.unreadFeedbackCount());
});
// Mark every review read -> { marked }
feedbackAdminRoutes.post('/read-all', async (req, res) => {
  res.json(await feedback.markAllFeedbackRead());
});

// The actions on one review: each answers with the review as the admin sees it
feedbackAdminRoutes.post('/:id/read', validate({ params: schemas.idParams }), async (req, res) => {
  res.json(await feedback.markFeedbackRead(req.valid.params.id));
});
// { status: 'published' | 'hidden' }
feedbackAdminRoutes.patch('/:id/status', validate({ params: schemas.idParams, body: schemas.statusBody }), async (req, res) => {
  res.json(await feedback.setFeedbackStatus(req.valid.params.id, req.valid.body.status));
});
// { featured }
feedbackAdminRoutes.patch('/:id/featured', validate({ params: schemas.idParams, body: schemas.featuredBody }), async (req, res) => {
  res.json(await feedback.setFeedbackFeatured(req.valid.params.id, req.valid.body.featured));
});
// { flagged, reason }
feedbackAdminRoutes.patch('/:id/flag', validate({ params: schemas.idParams, body: schemas.flagBody }), async (req, res) => {
  res.json(await feedback.setFeedbackFlag(req.valid.params.id, req.valid.body));
});
// { archived }
feedbackAdminRoutes.patch('/:id/archived', validate({ params: schemas.idParams, body: schemas.archivedBody }), async (req, res) => {
  res.json(await feedback.setFeedbackArchived(req.valid.params.id, req.valid.body.archived));
});
// { body } -> the reply is saved under the review and sent to the customer's chat, signed by the signed-in admin
feedbackAdminRoutes.post('/:id/reply', validate({ params: schemas.idParams, body: schemas.replyBody }), async (req, res) => {
  res.json(await feedback.replyToFeedback(req.valid.params.id, req.valid.body.body, req.user));
});
// Delete for good -> { ok: true }
feedbackAdminRoutes.delete('/:id', validate({ params: schemas.idParams }), async (req, res) => {
  res.json(await feedback.deleteFeedback(req.valid.params.id));
});
