import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { stampWrites } from './middleware/changes.js';
import { notFound, errorHandler } from './middleware/errors.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { adminAccountRoutes, authRoutes, customerAccountRoutes } from './modules/auth/auth.routes.js';
import { calendarAdminRoutes, calendarRoutes } from './modules/calendar/calendar.routes.js';
import { catalogAdminRoutes, catalogRoutes } from './modules/catalog/catalog.routes.js';
import { changesRoutes } from './modules/changes/changes.routes.js';
import { customerAdminRoutes } from './modules/customers/customers.routes.js';
import { feedbackAdminRoutes, feedbackPublishedRoutes, feedbackRoutes } from './modules/feedback/feedback.routes.js';
import { inventoryAdminRoutes } from './modules/inventory/inventory.routes.js';
import { threadAdminRoutes, threadRoutes } from './modules/messages/messages.routes.js';
import { outsourceAdminRoutes } from './modules/outsource/outsource.routes.js';
import { paymongoWebhook } from './modules/payments/paymongo.webhook.js';
import {
  balanceAdminRoutes,
  paymentAdminRoutes,
  paymentReservationRoutes,
  paymentRoutes,
  refundAdminRoutes,
  refundRoutes
} from './modules/payments/payments.routes.js';
import { reportAdminRoutes } from './modules/reports/reports.routes.js';
import { rentalRoutes, reservationAdminRoutes, reservationRoutes } from './modules/reservations/reservations.routes.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(morgan(config.isProduction ? 'combined' : 'dev'));
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, done) => done(null, !origin || config.corsOrigins.includes(origin)),
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: false
    })
  );

  app.post('/api/webhooks/paymongo', express.raw({ type: 'application/json', limit: '1mb' }), paymongoWebhook);

  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now() }));

  app.use('/api', apiLimiter);

  app.use('/api', stampWrites);

  app.use('/api/auth', authRoutes);

  app.use('/api/me', requireAuth, requireRole('customer'), customerAccountRoutes);
  app.use('/api/reservations', requireAuth, requireRole('customer'), reservationRoutes);
  app.use('/api/threads', requireAuth, requireRole('customer'), threadRoutes);

  app.use('/api/payments', requireAuth, requireRole('customer'), paymentRoutes);
  app.use('/api/refunds', requireAuth, requireRole('customer'), refundRoutes);

  app.use('/api/feedback/published', feedbackPublishedRoutes);
  app.use('/api/feedback', requireAuth, requireRole('customer'), feedbackRoutes);

  app.use('/api/rentals', requireAuth, rentalRoutes);
  app.use('/api/changes', requireAuth, changesRoutes);

  app.use('/api', catalogRoutes);
  app.use('/api', calendarRoutes);

  const admin = express.Router();
  admin.use(requireAuth, requireRole('admin'));
  admin.use('/me', adminAccountRoutes);
  admin.use(catalogAdminRoutes);
  admin.use('/calendar', calendarAdminRoutes);
  admin.use('/reservations', reservationAdminRoutes);
  admin.use('/reservations', paymentReservationRoutes);
  admin.use('/payments', paymentAdminRoutes);
  admin.use('/balances', balanceAdminRoutes);
  admin.use('/refunds', refundAdminRoutes);
  admin.use('/threads', threadAdminRoutes);
  admin.use('/customers', customerAdminRoutes);
  admin.use('/feedback', feedbackAdminRoutes);
  admin.use('/inventory', inventoryAdminRoutes);
  admin.use('/outsource', outsourceAdminRoutes);
  admin.use('/reports', reportAdminRoutes);
  app.use('/api/admin', admin);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
