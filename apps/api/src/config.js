import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/**
 * Settings for the whole API, read once from apps/api/.env and checked here so a bad value
 * stops the server at startup instead of failing halfway through a request.
 *
 * - The .env path comes from this file's location, not the working directory, so scripts run
 *   from the project root (npm run db:reset, node -e …) read the same file as `npm run dev:api`.
 * - Values already in the shell win over .env (dotenv never replaces them), e.g.
 *   `DB_PORT=3310 npm run db:reset` points one run at another database.
 * - The process always runs on Manila time, set here before anything reads the clock: "today",
 *   lead-time checks and the reservation ref all depend on the business's local date, and a VPS
 *   usually runs on UTC. It is fixed on purpose, not a setting, so a host's TZ=UTC cannot shift dates.
 */
export const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BUSINESS_TIME_ZONE = 'Asia/Manila'; // the one place the business operates

dotenv.config({ path: path.join(API_ROOT, '.env'), quiet: true });
process.env.TZ = BUSINESS_TIME_ZONE;

const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';
const problems = []; // collected so one start-up lists every bad setting at once

// Text setting; `fallback` when it is missing or blank
const text = (name, fallback = '') => {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
};

// Whole-number setting; a value that is not a number is reported and replaced by `fallback`
const int = (name, fallback) => {
  const raw = text(name);
  if (raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    problems.push(`${name} must be a whole number (got "${raw}").`);
    return fallback;
  }
  return value;
};

// Comma-separated list, e.g. CORS_ORIGINS=http://localhost:5173,http://localhost:5174
const list = (name, fallback = []) => {
  const raw = text(name);
  return raw === '' ? fallback : raw.split(',').map((s) => s.trim()).filter(Boolean);
};

export const config = {
  env,
  isProduction,
  port: int('PORT', 4000),
  timeZone: BUSINESS_TIME_ZONE,
  apiRoot: API_ROOT,

  // Only these browser origins may call the API (the two portals); never "*"
  corsOrigins: list('CORS_ORIGINS', ['http://localhost:5173', 'http://localhost:5174']),

  // Passed straight to mysql2 (see src/db.js)
  db: {
    host: text('DB_HOST', '127.0.0.1'),
    port: int('DB_PORT', 3306),
    user: text('DB_USER', 'tres_marias'),
    password: process.env.DB_PASSWORD || '', // not trimmed: a password may end in a space
    database: text('DB_NAME', 'tres_marias')
  },

  // Signs the session tokens (src/lib/tokens.js). Checked below.
  jwtSecret: text('JWT_SECRET'),
  // How long a session token lasts: admin, customer, and customer with "Remember me" (§7.3). Checked below.
  jwt: {
    adminTtl: text('JWT_ADMIN_TTL', '8h'),
    customerTtl: text('JWT_CUSTOMER_TTL', '12h'),
    customerRememberTtl: text('JWT_CUSTOMER_REMEMBER_TTL', '7d')
  },

  mail: {
    driver: text('MAIL_DRIVER', 'log'),
    from: text('MAIL_FROM', 'Tres Marias Catering <no-reply@example.com>'),
    smtp: {
      host: text('SMTP_HOST'),
      port: int('SMTP_PORT', 587),
      user: text('SMTP_USER'),
      pass: process.env.SMTP_PASS || ''
    }
  },

  sms: {
    driver: text('SMS_DRIVER', 'log'),
    apiKey: text('SMS_API_KEY'),
    senderName: text('SMS_SENDER_NAME')
  },

  storage: {
    driver: text('STORAGE_DRIVER', 'local'),
    // Relative paths are taken from apps/api, wherever the process was started
    uploadDir: path.resolve(API_ROOT, text('UPLOAD_DIR', 'uploads')),
    maxUploadMb: int('MAX_UPLOAD_MB', 5)
  },

  paymongo: {
    secretKey: text('PAYMONGO_SECRET_KEY'),
    webhookSecret: text('PAYMONGO_WEBHOOK_SECRET'),
    qrExpirySeconds: int('PAYMONGO_QR_EXPIRY_SECONDS', 1800)
  },

  clientUrl: text('CLIENT_URL', 'http://localhost:5173')
};

// Settings that must be right before real customers use the system
if (config.corsOrigins.length === 0) problems.push('CORS_ORIGINS must list at least one origin.');
// Every sign-in signs a token with it, so the API cannot run without one (.env.example has a placeholder for development)
if (!config.jwtSecret) problems.push('JWT_SECRET must be set (at least 32 random characters in production).');
// A duration jsonwebtoken understands: a number of seconds, or a number with ms, s, m, h, d, w or y (e.g. 8h, 7d).
// Checked here so a typo stops the start-up instead of failing every sign-in.
Object.entries({ JWT_ADMIN_TTL: config.jwt.adminTtl, JWT_CUSTOMER_TTL: config.jwt.customerTtl, JWT_CUSTOMER_REMEMBER_TTL: config.jwt.customerRememberTtl })
  .filter(([, value]) => !/^\d+(ms|s|m|h|d|w|y)?$/.test(value))
  .forEach(([name, value]) => problems.push(`${name} must be a duration such as 8h or 7d (got "${value}").`));
if (!['log', 'smtp'].includes(config.mail.driver)) problems.push(`MAIL_DRIVER must be "log" or "smtp" (got "${config.mail.driver}").`);
// Caught here rather than as a 500 on the first email (e.g. an admin sign-in code)
if (config.mail.driver === 'smtp' && (!config.mail.smtp.host || !config.mail.smtp.user)) {
  problems.push('MAIL_DRIVER=smtp needs SMTP_HOST and SMTP_USER (and SMTP_PASS).');
}
if (!['log'].includes(config.sms.driver)) problems.push(`SMS_DRIVER must be "log" (got "${config.sms.driver}").`);
if (!['local'].includes(config.storage.driver)) problems.push(`STORAGE_DRIVER must be "local" (got "${config.storage.driver}").`);
if (isProduction) {
  // A missing secret is already reported above; here a short one or the .env.example placeholder
  if (config.jwtSecret && (config.jwtSecret.length < 32 || config.jwtSecret.startsWith('change-me'))) {
    problems.push('JWT_SECRET must be at least 32 random characters in production.');
  }
  if (!config.db.password) problems.push('DB_PASSWORD must be set in production.');
}

if (problems.length) {
  throw new Error(`Invalid API settings in apps/api/.env:\n- ${problems.join('\n- ')}`);
}
