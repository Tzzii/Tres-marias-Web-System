import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { RULES } from '@tm/shared/src/services/config.js';

/**
 * Settings for the whole API, read once from apps/api/.env and checked here so a bad value
 * stops the server at startup instead of failing halfway through a request.
 *
 * - The .env path comes from this file's location, not the working directory, so scripts run
 *   from the project root (npm run db:reset, node -e …) read the same file as `npm run dev:api`.
 * - Values already in the shell win over .env (dotenv never replaces them), e.g.
 *   `DB_PORT=3310 npm run db:reset` points one run at another database.
 * - NODE_ENV=production adds the go-live rules (Phase 12): a long JWT_SECRET, a DB_PASSWORD, real email
 *   (MAIL_DRIVER=smtp and the business's own MAIL_FROM), a real SMS driver unless ALLOW_SMS_LOG=true,
 *   and CORS_ORIGINS set to the live portals (no localhost default). Each one stops the start-up.
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

  // Only these browser origins may call the API (the two portals); never "*". The localhost default is
  // for development only: production must list its own origins (checked below).
  corsOrigins: list('CORS_ORIGINS', isProduction ? [] : ['http://localhost:5173', 'http://localhost:5174']),

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
    senderName: text('SMS_SENDER_NAME'),
    // Production refuses SMS_DRIVER=log (checked below) unless this is "true": a deliberate, temporary
    // choice while no SMS provider is connected yet. No code goes by SMS; outsourcing requests sent by
    // SMS are then only logged, and the Outsourcing page tells the admin to send them.
    allowLogInProduction: text('ALLOW_SMS_LOG') === 'true'
  },

  storage: {
    driver: text('STORAGE_DRIVER', 'local'),
    // Relative paths are taken from apps/api, wherever the process was started
    uploadDir: path.resolve(API_ROOT, text('UPLOAD_DIR', 'uploads')),
    // The receipt-photo limit; the Payments page tells customers RULES.proofMaxMb, so keep the two equal
    maxUploadMb: int('MAX_UPLOAD_MB', RULES.proofMaxMb)
  },

  // GCash / e-wallet QR payments (Phase 8B). Both secrets are needed before the Payments page offers the
  // QR; `live` is true for a sk_live_ key (then only live webhook events count, see paymongo.webhook.js).
  paymongo: {
    secretKey: text('PAYMONGO_SECRET_KEY'),
    webhookSecret: text('PAYMONGO_WEBHOOK_SECRET'),
    qrExpirySeconds: int('PAYMONGO_QR_EXPIRY_SECONDS', 1800),
    live: text('PAYMONGO_SECRET_KEY').startsWith('sk_live_')
  },

  clientUrl: text('CLIENT_URL', 'http://localhost:5173')
};

// Settings that must be right before real customers use the system
if (config.corsOrigins.length === 0) problems.push("CORS_ORIGINS must list at least one origin (in production: the two portals' https:// addresses).");
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
// A key pasted with a typo or the public key (pk_) would only fail at the first QR; catch it here. Values are never printed.
if (config.paymongo.secretKey && !/^sk_(test|live)_[A-Za-z0-9]+$/.test(config.paymongo.secretKey)) {
  problems.push('PAYMONGO_SECRET_KEY must be a PayMongo secret key (sk_test_… or sk_live_…).');
}
if (config.paymongo.webhookSecret && !/^whsk_[A-Za-z0-9]+$/.test(config.paymongo.webhookSecret)) {
  problems.push("PAYMONGO_WEBHOOK_SECRET must be the webhook's signing secret (whsk_…).");
}
// PayMongo accepts a QR lifetime from 60 to 9,000 seconds
if (config.paymongo.qrExpirySeconds < 60 || config.paymongo.qrExpirySeconds > 9000) {
  problems.push(`PAYMONGO_QR_EXPIRY_SECONDS must be from 60 to 9000 (got ${config.paymongo.qrExpirySeconds}).`);
}
if (isProduction) {
  // A missing secret is already reported above; here a short one or the .env.example placeholder
  if (config.jwtSecret && (config.jwtSecret.length < 32 || config.jwtSecret.startsWith('change-me'))) {
    problems.push('JWT_SECRET must be at least 32 random characters in production.');
  }
  if (!config.db.password) problems.push('DB_PASSWORD must be set in production.');
  // Phase 12: the live server must really send email. Every sign-in, sign-up and password code goes by
  // email; with the log driver they would only be printed in the server's log, and nobody could sign in.
  if (config.mail.driver !== 'smtp') problems.push('MAIL_DRIVER must be "smtp" in production (the log driver only prints the sign-in and sign-up codes).');
  if (/@example\.(com|org|net)\b/i.test(config.mail.from)) problems.push('MAIL_FROM must be the business\'s own address in production (it is still the example one).');
  if (config.sms.driver === 'log' && !config.sms.allowLogInProduction) {
    problems.push('SMS_DRIVER must be a real SMS provider in production. Until one is connected, set ALLOW_SMS_LOG=true to start anyway (texts are then only logged, not sent).');
  }
  // The localhost default is development only: the live portals' own https:// addresses must be listed
  if (config.corsOrigins.some((origin) => origin === '*' || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin))) {
    problems.push('CORS_ORIGINS must list only the live portals in production (no "*", no localhost).');
  }
}

if (problems.length) {
  throw new Error(`Invalid API settings in apps/api/.env:\n- ${problems.join('\n- ')}`);
}
