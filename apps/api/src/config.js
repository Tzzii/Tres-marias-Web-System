import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import dotenv from 'dotenv';
import { RULES } from '@tm/shared/src/services/config.js';

export const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BUSINESS_TIME_ZONE = 'Asia/Manila';
import { TEXT_MODEL_RATES } from './integrations/ai/textPricing.js';

dotenv.config({ path: path.join(API_ROOT, '.env'), quiet: true });
process.env.TZ = BUSINESS_TIME_ZONE;

const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';
const problems = [];

const text = (name, fallback = '') => {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
};

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

const list = (name, fallback = []) => {
  const raw = text(name);
  return raw === ''
    ? fallback
    : raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
};

const trustedProxies = () => {
  const raw = text('TRUST_PROXY', 'loopback');
  if (raw === 'false') return false;
  const values = raw.split(',').map((value) => value.trim());
  const valid = values.every((value) => {
    if (['loopback', 'linklocal', 'uniquelocal'].includes(value)) return true;
    const [address, prefix, extra] = value.split('/');
    const family = isIP(address);
    if (!family || extra !== undefined) return false;
    if (prefix === undefined) return true;
    return /^\d{1,3}$/.test(prefix) && Number(prefix) > 0 && Number(prefix) <= (family === 4 ? 32 : 128);
  });
  if (!valid) {
    problems.push(
      'TRUST_PROXY must be false or a comma-separated list of trusted IP addresses, nonzero CIDR ranges or named local networks (loopback, linklocal, uniquelocal).'
    );
    return false;
  }
  return values;
};

const AI_TEXT_MODEL = text('AI_TEXT_MODEL', 'gpt-6-luna');
if (!Object.hasOwn(TEXT_MODEL_RATES, AI_TEXT_MODEL)) problems.push('AI_TEXT_MODEL must be gpt-6-luna or gpt-6.1-sol.');

export const config = {
  env,
  isProduction,
  port: int('PORT', 4000),
  timeZone: BUSINESS_TIME_ZONE,
  apiRoot: API_ROOT,
  trustProxy: trustedProxies(),

  corsOrigins: list('CORS_ORIGINS', isProduction ? [] : ['http://localhost:5173', 'http://localhost:5174']),

  db: {
    host: text('DB_HOST', '127.0.0.1'),
    port: int('DB_PORT', 3306),
    user: text('DB_USER', 'tres_marias'),
    password: process.env.DB_PASSWORD || '',
    database: text('DB_NAME', 'tres_marias')
  },

  jwtSecret: text('JWT_SECRET'),
  googleClientId: text('GOOGLE_CLIENT_ID'),
  turnstileSecret: text('TURNSTILE_SECRET_KEY'),
  disifyApiKey: text('DISIFY_API_KEY'),
  assistant: {
    enabled: text('AI_ASSISTANT_ENABLED', 'false') === 'true',
    voiceEnabled: text('AI_ASSISTANT_VOICE_ENABLED', 'false') === 'true',
    apiKey: text('OPENAI_API_KEY'),
    model: AI_TEXT_MODEL,
    transcriptionModel: 'gpt-transcribe',
    speechModel: 'gpt-realtime-2.1-mini',
    voice: text('AI_ASSISTANT_VOICE', 'marin'),
    dailyLimit: int('AI_ASSISTANT_DAILY_QUESTIONS', 20),
    dailyBudgetMicro: int('AI_ASSISTANT_DAILY_BUDGET_CENTS', 0) * 10000,
    monthlyBudgetMicro: int('AI_ASSISTANT_MONTHLY_BUDGET_CENTS', 0) * 10000,
    timeoutMs: 25000,
    turnTimeoutMs: 60000,
    maxOutputTokens: 2048,
    maxCalls: 6,
    maxInputBytes: 64000,
    conversationTtlMs: 24 * 60 * 60 * 1000,
    visitorTtlMs: 90 * 24 * 60 * 60 * 1000
  },
  aiBudget: {
    enabled: text('AI_BUDGET_ENABLED', 'false') === 'true',
    apiKey: text('OPENAI_API_KEY'),
    model: text('AI_BUDGET_MODEL', AI_TEXT_MODEL),
    timeoutMs: int('AI_BUDGET_TIMEOUT_MS', 20000),
    maxOutputTokens: int('AI_BUDGET_MAX_OUTPUT_TOKENS', 2000)
  },
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

  storage: {
    driver: text('STORAGE_DRIVER', 'local'),
    uploadDir: path.resolve(API_ROOT, text('UPLOAD_DIR', 'uploads')),
    maxUploadMb: RULES.photoMaxMb
  },

  paymongo: {
    secretKey: text('PAYMONGO_SECRET_KEY'),
    webhookSecret: text('PAYMONGO_WEBHOOK_SECRET'),
    qrExpirySeconds: int('PAYMONGO_QR_EXPIRY_SECONDS', 1800),
    live: text('PAYMONGO_SECRET_KEY').startsWith('sk_live_')
  },

  clientUrl: text('CLIENT_URL', 'http://localhost:5173').replace(/\/+$/, '')
};

if (config.corsOrigins.length === 0)
  problems.push("CORS_ORIGINS must list at least one origin (in production: the two portals' https:// addresses).");
if (!config.jwtSecret) problems.push('JWT_SECRET must be set (at least 32 random characters in production).');
for (const name of ['AI_ASSISTANT_ENABLED', 'AI_ASSISTANT_VOICE_ENABLED'])
  if (!['true', 'false'].includes(text(name, 'false'))) problems.push(`${name} must be true or false.`);
if (config.assistant.dailyLimit < 1 || config.assistant.dailyLimit > 200)
  problems.push('AI_ASSISTANT_DAILY_QUESTIONS must be from 1 to 200.');
if (config.assistant.dailyBudgetMicro > 10000000 || config.assistant.monthlyBudgetMicro > 40000000)
  problems.push('Assistant budgets must not exceed 1,000 US cents daily (US) or 4,000 US cents monthly (US).');
if (
  !['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar'].includes(
    config.assistant.voice
  )
)
  problems.push('AI_ASSISTANT_VOICE must be a supported built-in voice.');
if (!['true', 'false'].includes(text('AI_BUDGET_ENABLED', 'false')))
  problems.push('AI_BUDGET_ENABLED must be true or false.');
if (config.aiBudget.model !== AI_TEXT_MODEL)
  problems.push(`AI_BUDGET_MODEL must be ${AI_TEXT_MODEL} to match the booking assistant.`);
if (config.aiBudget.timeoutMs < 1000 || config.aiBudget.timeoutMs > 60000)
  problems.push('AI_BUDGET_TIMEOUT_MS must be from 1000 to 60000.');
if (config.aiBudget.maxOutputTokens < 256 || config.aiBudget.maxOutputTokens > 4000)
  problems.push('AI_BUDGET_MAX_OUTPUT_TOKENS must be from 256 to 4000.');
if (config.googleClientId && !/^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(config.googleClientId))
  problems.push('GOOGLE_CLIENT_ID must be the Web OAuth client ID ending in .apps.googleusercontent.com.');
Object.entries({
  JWT_ADMIN_TTL: config.jwt.adminTtl,
  JWT_CUSTOMER_TTL: config.jwt.customerTtl,
  JWT_CUSTOMER_REMEMBER_TTL: config.jwt.customerRememberTtl
})
  .filter(([, value]) => !/^\d+(ms|s|m|h|d|w|y)?$/.test(value))
  .forEach(([name, value]) => problems.push(`${name} must be a duration such as 8h or 7d (got "${value}").`));
if (!['log', 'smtp'].includes(config.mail.driver))
  problems.push(`MAIL_DRIVER must be "log" or "smtp" (got "${config.mail.driver}").`);
if (config.mail.driver === 'smtp' && (!config.mail.smtp.host || !config.mail.smtp.user)) {
  problems.push('MAIL_DRIVER=smtp needs SMTP_HOST and SMTP_USER (and SMTP_PASS).');
}
if (!['local'].includes(config.storage.driver))
  problems.push(`STORAGE_DRIVER must be "local" (got "${config.storage.driver}").`);
if (text('MAX_UPLOAD_MB') && int('MAX_UPLOAD_MB', RULES.photoMaxMb) !== RULES.photoMaxMb) {
  problems.push(`MAX_UPLOAD_MB must be ${RULES.photoMaxMb} to match the system-wide photo limit.`);
}
if (config.paymongo.secretKey && !/^sk_(test|live)_[A-Za-z0-9]+$/.test(config.paymongo.secretKey)) {
  problems.push('PAYMONGO_SECRET_KEY must be a PayMongo secret key (sk_test_… or sk_live_…).');
}
if (config.paymongo.webhookSecret && !/^whsk_[A-Za-z0-9]+$/.test(config.paymongo.webhookSecret)) {
  problems.push("PAYMONGO_WEBHOOK_SECRET must be the webhook's signing secret (whsk_…).");
}
if (config.paymongo.qrExpirySeconds < 60 || config.paymongo.qrExpirySeconds > 9000) {
  problems.push(`PAYMONGO_QR_EXPIRY_SECONDS must be from 60 to 9000 (got ${config.paymongo.qrExpirySeconds}).`);
}
if (isProduction) {
  if (config.jwtSecret && (config.jwtSecret.length < 32 || config.jwtSecret.startsWith('change-me'))) {
    problems.push('JWT_SECRET must be at least 32 random characters in production.');
  }
  if (!config.db.password) problems.push('DB_PASSWORD must be set in production.');
  if (config.mail.driver !== 'smtp')
    problems.push(
      'MAIL_DRIVER must be "smtp" in production (the log driver only prints the sign-in and sign-up codes).'
    );
  if (/@example\.(com|org|net)\b/i.test(config.mail.from))
    problems.push("MAIL_FROM must be the business's own address in production (it is still the example one).");
  if (
    config.corsOrigins.some(
      (origin) => origin === '*' || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin)
    )
  ) {
    problems.push('CORS_ORIGINS must list only the live portals in production (no "*", no localhost).');
  }
  if (
    !/^https:\/\//i.test(config.clientUrl) ||
    /^https:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(config.clientUrl)
  ) {
    problems.push(
      "CLIENT_URL must be the live website's https:// address in production (e.g. https://tresmariascater.com), not localhost."
    );
  }
}

if (problems.length) {
  throw new Error(`Invalid API settings in apps/api/.env:\n- ${problems.join('\n- ')}`);
}
