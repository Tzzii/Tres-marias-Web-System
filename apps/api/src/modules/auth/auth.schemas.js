import { z } from 'zod';
import { RULES } from '@tm/shared/src/services/config.js';


const text = (max) =>
  z.string({ error: 'This field is required.' }).max(max, { error: `Use ${max} characters or fewer.` });

const optionalText = (max) => text(max).default('');

const password = text(200);

const requestId = z
  .string({ error: 'This request expired. Please start again.' })
  .max(40, { error: 'This request expired. Please start again.' });

const code = z
  .string({ error: `Enter all ${RULES.codeLength} digits.` })
  .regex(new RegExp(`^\\d{${RULES.codeLength}}$`), { error: `Enter all ${RULES.codeLength} digits.` });


export const requestParams = z.object({ id: requestId });
export const codeBody = z.object({ code });
export const signupCodeBody = z.object({ code, remember: z.boolean().default(false) });


export const customerLogin = z.object({
  email: text(254),
  password,
  remember: z.boolean({ error: 'Remember me must be true or false.' }).default(false)
});

export const customerGoogle = z.object({
  credential: text(10000).min(1),
  challenge: text(2000).min(1),
  remember: z.boolean().default(false),
  password: password.optional(),
  profile: z.object({
    firstName: text(60), middleName: optionalText(60), lastName: text(60), mobile: text(20),
    agreeTerms: z.boolean(), termsVersion: text(20)
  }).optional()
});

export const customerRegister = z.object({
  firstName: text(60),
  middleName: optionalText(60),
  lastName: text(60),
  email: text(254),
  mobile: text(20),
  password,
  agreeTerms: z.boolean({ error: 'Please agree to the Terms of Service and Privacy Policy.' }).default(false)
});

export const passwordResetStart = z.object({ email: text(254) });
export const passwordResetComplete = z.object({ password });

export const adminStart = z.object({ email: text(254), password });
export const adminResend = z.object({ challengeId: requestId });
export const adminVerify = z.object({ challengeId: requestId, code });
export const adminUnlock = z.object({ ticket: text(1000), password });


export const termsBody = z.object({ version: text(20) });

export const customerProfile = z.object({ name: text(200), mobile: text(20), company: optionalText(160) });
export const customerEmailChange = z.object({ email: text(254), password });
export const passwordChange = z.object({ current: password, next: password });


export const adminProfile = z.object({ name: text(200) });
export const contactStart = z.object({
  field: z.enum(['email', 'mobile'], { error: 'Unknown field.' }),
  value: text(254),
  password
});
export const contactResend = z.object({ challengeId: requestId });
export const contactConfirm = z.object({ challengeId: requestId, code });
