import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config.js';
import { notFound, errorHandler } from './middleware/errors.js';

/**
 * Build the Express app without listen(), so server.js starts it and a test can import it.
 *
 * Order matters:
 * 1. Request log first, so requests refused further down (bad JSON, too large, CORS preflight) still get a log line.
 * 2. Security headers, the CORS list of allowed sites and JSON body reading.
 * 3. Routes. Until Phase 3 (auth) the only route is GET /api/health: no route may exist before its guard does.
 * 4. The 404 and error handlers last, so every failure leaves in the same { code, message, meta } shape.
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

  // Uptime check; no database, no token
  app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now() }));

  // Phase 3: the rate limiter and the auth routes, then every other module's routes.
  // app.use('/api', apiLimiter);
  // app.use('/api/auth', authRoutes);
  //
  // Phase 3: every admin route sits behind this one router-level guard, so a new admin endpoint cannot be left open.
  // const admin = express.Router();
  // admin.use(requireAuth, requireRole('admin'));
  // admin.use('/packages', catalogAdminRoutes); … (one line per module)
  // app.use('/api/admin', admin);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
