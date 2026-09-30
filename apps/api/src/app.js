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
import { threadAdminRoutes, threadRoutes } from './modules/messages/messages.routes.js';
import { paymongoWebhook } from './modules/payments/paymongo.webhook.js';
import {
  balanceAdminRoutes,
  paymentAdminRoutes,
  paymentReservationRoutes,
  paymentRoutes,
  refundAdminRoutes,
  refundRoutes
} from './modules/payments/payments.routes.js';
import { rentalRoutes, reservationAdminRoutes, reservationRoutes } from './modules/reservations/reservations.routes.js';

/**
 * Build the Express app without listen(), so server.js starts it and a test can import it.
 *
 * Order matters:
 * 1. Request log first, so requests refused further down (bad JSON, too large, CORS preflight) still get a log line.
 * 2. Security headers, the CORS list of allowed sites and JSON body reading.
 * 3. GET /api/health, then the general rate limit (300 a minute per signed-in account, 100 per IP without
 *    a token) for everything else under /api, then the change stamp, moved after every write that
 *    succeeds (Phase 7).
 * 4. Routes, each behind its guard (docs §7.2): /api/auth (no token, strict limit on every route),
 *    /api/me, /api/reservations, /api/threads, /api/payments and /api/refunds (customers only),
 *    /api/rentals and /api/changes (any signed-in user), the public catalogue reads (Phase 4) and calendar
 *    reads (Phase 5), and /api/admin/* behind ONE router-level guard.
 * 5. The 404 and error handlers last, so every failure leaves in the same { code, message, meta } shape.
 */
export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind one proxy (Nginx) in production: req.ip is the real client for logs and rate limits

  app.use(morgan(config.isProduction ? 'combined' : 'dev'));
  app.use(helmet());
  app.use(cors({
    // Only the two portals (CORS_ORIGINS) may call the API from a browser. Any other origin gets no
    // Access-Control-Allow-Origin header, so the browser refuses to hand it the response.
    // A request without an Origin header (curl, server-to-server) is not a cross-origin browser call; CORS does not apply.
    origin: (origin, done) => done(null, !origin || config.corsOrigins.includes(origin)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false // Bearer token in the Authorization header, no cookies
  }));

  // PayMongo's webhook (Phase 8B), above express.json() and the rate limiter: its signature covers the raw
  // bytes, and PayMongo retries on its own schedule. No token; the signature is its guard.
  app.post('/api/webhooks/paymongo', express.raw({ type: 'application/json', limit: '1mb' }), paymongoWebhook);

  app.use(express.json({ limit: '100kb' }));

  // Uptime check; no database, no token, no rate limit
  app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now() }));

  app.use('/api', apiLimiter);

  // Every write that succeeds moves the change stamp the portals poll (GET /api/changes)
  app.use('/api', stampWrites);

  // Sign-in, sign-up and password reset (public; each route also has the strict per-IP limit)
  app.use('/api/auth', authRoutes);

  // The signed-in customer's own account. Later phases add the customer's other routes the same way.
  app.use('/api/me', requireAuth, requireRole('customer'), customerAccountRoutes);

  // The signed-in customer's own bookings: list, detail, book, cancel, change request (Phase 6A)
  app.use('/api/reservations', requireAuth, requireRole('customer'), reservationRoutes);

  // The signed-in customer's own conversation with the admin (Phase 7)
  app.use('/api/threads', requireAuth, requireRole('customer'), threadRoutes);

  // The signed-in customer's payments (bank-transfer upload, own receipts) and refunds (Phase 8). The
  // guard runs before the upload is read, so a request without a valid token never sends a file in.
  app.use('/api/payments', requireAuth, requireRole('customer'), paymentRoutes);
  app.use('/api/refunds', requireAuth, requireRole('customer'), refundRoutes);

  // Rental stock on a date: the customer's rental form and the admin's rental edit dialog both read it,
  // so any signed-in user (the route honours excludeRef for an admin only)
  app.use('/api/rentals', requireAuth, rentalRoutes);

  // The change stamp both portals poll every 15 seconds (Phase 7), for any signed-in user
  app.use('/api/changes', requireAuth, changesRoutes);

  // Public catalogue reads: /api/packages, /addons, /dishes, /catalog, /catalog/price-per-plate, /rental-items.
  // No guard; the three list routes read an optional token themselves (an admin sees hidden and archived records).
  app.use('/api', catalogRoutes);

  // Public calendar reads: /api/calendar (the availability map) and /api/calendar/check. No guard, no token needed.
  app.use('/api', calendarRoutes);

  // Every admin route sits behind this one router-level guard, so a new admin endpoint cannot be left open:
  // no token (or a stale one) -> 401, a customer's token -> 403, even for an address that does not exist.
  const admin = express.Router();
  admin.use(requireAuth, requireRole('admin'));
  admin.use('/me', adminAccountRoutes);
  // One line per module from here on. Catalogue manager: /packages, /addons, /dishes, /catalog/price-per-plate
  admin.use(catalogAdminRoutes);
  // Calendar: /calendar/blocks (block, unblock) and /calendar/capacity
  admin.use('/calendar', calendarAdminRoutes);
  // Reservations: every booking, one in full (Phase 6A), and the admin's actions and edits (Phase 6B);
  // then the money actions on one booking: cash, payment reminder, refund (Phase 8)
  admin.use('/reservations', reservationAdminRoutes);
  admin.use('/reservations', paymentReservationRoutes);
  // Payments: every payment, the uploaded receipts, verify and reject; the ledger; refunds (Phase 8)
  admin.use('/payments', paymentAdminRoutes);
  admin.use('/balances', balanceAdminRoutes);
  admin.use('/refunds', refundAdminRoutes);
  // Chat: every customer's conversation (Phase 7)
  admin.use('/threads', threadAdminRoutes);
  app.use('/api/admin', admin);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
