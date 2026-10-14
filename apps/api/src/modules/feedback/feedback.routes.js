import express from 'express';
import { validate } from '../../middleware/validate.js';
import * as schemas from './feedback.schemas.js';
import * as feedback from './feedback.service.js';



export const feedbackPublishedRoutes = express.Router();

feedbackPublishedRoutes.get('/', validate({ query: schemas.publishedQuery }), async (req, res) => {
  res.json(await feedback.listPublished({ limit: req.valid.query.limit }));
});


export const feedbackRoutes = express.Router();

feedbackRoutes.get('/', async (req, res) => {
  res.json(await feedback.listFeedbacks({ customerId: req.user.id }));
});
feedbackRoutes.post('/', validate({ body: schemas.createBody }), async (req, res) => {
  res.status(201).json(await feedback.createFeedback(req.user, req.valid.body));
});


export const feedbackAdminRoutes = express.Router();

feedbackAdminRoutes.get('/', async (req, res) => {
  res.json(await feedback.listFeedbacks());
});
feedbackAdminRoutes.get('/unread-count', async (req, res) => {
  res.json(await feedback.unreadFeedbackCount());
});
feedbackAdminRoutes.post('/read-all', async (req, res) => {
  res.json(await feedback.markAllFeedbackRead());
});

feedbackAdminRoutes.post('/:id/read', validate({ params: schemas.idParams }), async (req, res) => {
  res.json(await feedback.markFeedbackRead(req.valid.params.id));
});
feedbackAdminRoutes.patch(
  '/:id/status',
  validate({ params: schemas.idParams, body: schemas.statusBody }),
  async (req, res) => {
    res.json(await feedback.setFeedbackStatus(req.valid.params.id, req.valid.body.status));
  }
);
feedbackAdminRoutes.patch(
  '/:id/featured',
  validate({ params: schemas.idParams, body: schemas.featuredBody }),
  async (req, res) => {
    res.json(await feedback.setFeedbackFeatured(req.valid.params.id, req.valid.body.featured));
  }
);
feedbackAdminRoutes.patch(
  '/:id/flag',
  validate({ params: schemas.idParams, body: schemas.flagBody }),
  async (req, res) => {
    res.json(await feedback.setFeedbackFlag(req.valid.params.id, req.valid.body));
  }
);
feedbackAdminRoutes.patch(
  '/:id/archived',
  validate({ params: schemas.idParams, body: schemas.archivedBody }),
  async (req, res) => {
    res.json(await feedback.setFeedbackArchived(req.valid.params.id, req.valid.body.archived));
  }
);
feedbackAdminRoutes.post(
  '/:id/reply',
  validate({ params: schemas.idParams, body: schemas.replyBody }),
  async (req, res) => {
    res.json(await feedback.replyToFeedback(req.valid.params.id, req.valid.body.body, req.user));
  }
);
feedbackAdminRoutes.delete('/:id', validate({ params: schemas.idParams }), async (req, res) => {
  res.json(await feedback.deleteFeedback(req.valid.params.id));
});
