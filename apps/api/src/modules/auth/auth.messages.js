import { BUSINESS, RULES } from '@tm/shared/src/services/config.js';
import { maskMobile } from '@tm/shared/src/utils/format.js';
import { mailer } from '../../integrations/mailer/index.js';
import { sms } from '../../integrations/sms/index.js';
import { ApiError } from '../../lib/ApiError.js';

/**
 * The emails and texts that carry one-time codes, sent through the mail and SMS ports
 * (integrations/mailer, integrations/sms). With MAIL_DRIVER=log / SMS_DRIVER=log (development)
 * they are printed on the API console and saved in the outbox table instead of being sent.
 *
 * `meta` says what each message is about (never the code itself). A provider that refuses the
 * message becomes DELIVERY_FAILED, so the page shows "try again" instead of waiting for a code
 * that will never come; the caller then cancels or rewinds the request it had just saved.
 */

// "Teresa Marquez" -> "Teresa", for the greeting
const firstWord = (name) => String(name || '').split(' ')[0] || 'there';

// The sign-off under every email
const SIGNATURE = BUSINESS.name;

// Send through a port; a failure is logged here (with the reason) and reported to the page without it
async function deliver(port, message, what) {
  try {
    return await port.send(message);
  } catch (err) {
    console.error(`[auth] Could not send the ${what}:`, err.message);
    throw new ApiError('DELIVERY_FAILED', 'We could not send the code right now. Please try again in a moment.');
  }
}

/** Email the second sign-in step's code to the admin's address on file. */
export function sendSignInCode(admin, code, challengeId) {
  return deliver(
    mailer,
    {
      to: admin.email,
      subject: `Your ${BUSINESS.shortName} sign-in code`,
      text: [
        `Hi ${firstWord(admin.name)},`,
        '',
        `Your code to finish signing in to the ${BUSINESS.shortName} admin dashboard is:`,
        '',
        code,
        '',
        `It expires in ${RULES.codeValidMinutes} minutes. If you did not just try to sign in, change your password right away.`,
        '',
        SIGNATURE
      ].join('\n'),
      meta: { purpose: 'admin_sign_in', adminId: admin.id, challengeId }
    },
    'sign-in code'
  );
}

/**
 * Email the code that confirms a new email or mobile number. A new email gets the code itself (it
 * proves the admin owns that address); a new mobile number is confirmed through the email on file,
 * because codes are never sent by SMS to admins.
 */
export function sendContactCode(admin, { field, value }, code, challengeId) {
  const isEmail = field === 'email';
  return deliver(
    mailer,
    {
      to: isEmail ? value : admin.email,
      subject: isEmail ? `Confirm your new email for ${BUSINESS.shortName}` : `Confirm your new mobile number for ${BUSINESS.shortName}`,
      text: [
        `Hi ${firstWord(admin.name)},`,
        '',
        isEmail
          ? `Use this code to make ${value} the email of your ${BUSINESS.shortName} admin account:`
          : `Use this code to make ${maskMobile(value)} the mobile number of your ${BUSINESS.shortName} admin account:`,
        '',
        code,
        '',
        `It expires in ${RULES.codeValidMinutes} minutes. If you did not ask for this change, change your password right away.`,
        '',
        SIGNATURE
      ].join('\n'),
      meta: { purpose: 'admin_contact_change', adminId: admin.id, field, challengeId }
    },
    'confirmation code'
  );
}

/** Text the forgot-password code to the mobile number on the customer's account. */
export function sendResetCode(customer, code, resetId) {
  return deliver(
    sms,
    {
      to: customer.mobile,
      body: `${BUSINESS.shortName}: ${code} is your password reset code. It expires in ${RULES.codeValidMinutes} minutes. Never share this code with anyone.`,
      meta: { purpose: 'customer_password_reset', customerId: customer.id, resetId }
    },
    'password reset code'
  );
}
