import { z } from 'zod';
import { RULES } from '@tm/shared/src/services/config.js';

/**
 * Request shapes for the auth routes (zod), checked by middleware/validate.js before a service runs.
 *
 * These check only what the service cannot: that each field is text (or a true/false), and that it
 * fits its database column, so an over-long value is a clear 400 instead of a database error.
 * The business checks (required names, email and mobile format, password rules) stay in
 * auth.service.js, which gives the same messages as the browser version. Keys not listed here are
 * dropped, so an id or role added to a request body never reaches a service.
 */

// Text of at most `max` characters; missing or not text -> "This field is required."
const text = (max) =>
  z.string({ error: 'This field is required.' }).max(max, { error: `Use ${max} characters or fewer.` });

// Optional text: missing -> '' (like the browser service's default arguments)
const optionalText = (max) => text(max).default('');

// A password as typed (never trimmed). bcrypt reads only the first 72 bytes; 200 stops absurd input.
const password = text(200);

// A code request id handed out by the start step (chl-…, chc-…, rst-…)
const requestId = z.string({ error: 'This request expired. Please start again.' }).max(40, { error: 'This request expired. Please start again.' });

// The 6-digit code from the email or text
const code = z
  .string({ error: `Enter all ${RULES.codeLength} digits.` })
  .regex(new RegExp(`^\\d{${RULES.codeLength}}$`), { error: `Enter all ${RULES.codeLength} digits.` });

/* ---- /api/auth (no token) ---- */

export const customerLogin = z.object({
  email: text(254),
  password,
  remember: z.boolean({ error: 'Remember me must be true or false.' }).default(false)
});

// Lengths are the customers table's columns (first/middle/last 60, email 254, mobile 20)
export const customerRegister = z.object({
  firstName: text(60),
  middleName: optionalText(60),
  lastName: text(60),
  email: text(254),
  mobile: text(20),
  password
});

export const passwordResetStart = z.object({ email: text(254) });
export const passwordResetParams = z.object({ id: requestId });
export const passwordResetVerify = z.object({ code });
export const passwordResetComplete = z.object({ password });

export const adminStart = z.object({ email: text(254), password });
export const adminResend = z.object({ challengeId: requestId });
export const adminVerify = z.object({ challengeId: requestId, code });

/* ---- /api/me (customer) ---- */

export const customerProfile = z.object({ name: text(200), mobile: text(20), company: optionalText(160) });
export const passwordChange = z.object({ current: password, next: password });

/* ---- /api/admin/me (admin) ---- */

export const adminProfile = z.object({ name: text(200) });
export const contactStart = z.object({
  field: z.enum(['email', 'mobile'], { error: 'Unknown field.' }),
  value: text(254),
  password
});
export const contactResend = z.object({ challengeId: requestId });
export const contactConfirm = z.object({ challengeId: requestId, code });
