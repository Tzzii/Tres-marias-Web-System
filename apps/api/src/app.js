import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { notFound, errorHandler } from './middleware/errors.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { adminAccountRoutes, authRoutes, customerAccountRoutes } from './modules/auth/auth.routes.js';

/**
 * Build the Express app without listen(), so server.js starts it and a test can import it.
 *
 * Order matters:
 * 1. Request log first, so requests refused further down (bad JSON, too large, CORS preflight) still get a log line.
 * 2. Security headers, the CORS list of allowed sites and JSON body reading.
 * 3. GET /api/health, then the general rate limit (100 a minute per IP) for everything else under /api.
 * 4. Routes, each behind its guard (docs §7.2): /api/auth (no token, strict limit on every route),
 *    /api/me (customers only), and /api/admin/* behind ONE router-level guard.
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

  // Phase 8B: the PayMongo webhook goes here, above express.json() and the rate limiter; its signature covers
  // the raw bytes, and PayMongo retries on its own schedule.
  // app.post('/api/webhooks/paymongo', express.raw({ type: 'application/json', limit: '1mb' }), paymongoWebhook);

  app.use(express.json({ limit: '100kb' }));

  // Uptime check; no database, no token, no rate limit
  app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now() }));

  app.use('/api', apiLimiter);

  // Sign-in, sign-up and password reset (public; each route also has the strict per-IP limit)
  app.use('/api/auth', authRoutes);

  // The signed-in customer's own account. Later phases add the customer's other routes the same way.
  app.use('/api/me', requireAuth, requireRole('customer'), customerAccountRoutes);

  // Every admin route sits behind this one router-level guard, so a new admin endpoint cannot be left open:
  // no token (or a stale one) -> 401, a customer's token -> 403, even for an address that does not exist.
  const admin = express.Router();
  admin.use(requireAuth, requireRole('admin'));
  admin.use('/me', adminAccountRoutes);
  // Phase 4 onward: one line per module, e.g. admin.use('/packages', catalogAdminRoutes);
  app.use('/api/admin', admin);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
