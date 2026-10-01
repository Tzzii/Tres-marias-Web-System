import { BUSINESS, RULES } from '@tm/shared/src/services/config.js';
import { maskMobile } from '@tm/shared/src/utils/format.js';
import { mailer } from '../../integrations/mailer/index.js';
import { ApiError } from '../../lib/ApiError.js';

/**
 * The emails that carry one-time codes, sent through the mail port (integrations/mailer). With
 * MAIL_DRIVER=log (development) they are printed on the API console and saved in the outbox table
 * instead of being sent; production refuses the log driver (config.js), so there they really go out.
 *
 * Every code goes by email, never by SMS (owner's decision, Phase 12): the admin's sign-in and
 * contact-change codes, and the customer's codes for signing up, resetting a forgotten password and
 * changing the password in My profile. SMS is kept for notifications and outsourcing requests.
 *
 * `meta` says what each message is about (never the code itself). A provider that refuses the
 * message becomes DELIVERY_FAILED, so the page shows "try again" instead of waiting for a code
 * that will never come; the caller then cancels or rewinds the request it had just saved.
 */

// "Wilma W. Cabiscuelas" -> "Wilma", for the greeting
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
 * because codes are never sent by SMS.
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

/**
 * Email the sign-up code to the address typed on the sign-up form (Phase 12). The account is created
 * only when this code comes back, which proves the customer owns the address. `request` is the
 * signup_requests record (email and first name).
 */
export function sendSignUpCode(request, code) {
  return deliver(
    mailer,
    {
      to: request.email,
      subject: `Your ${BUSINESS.shortName} sign-up code`,
      text: [
        `Hi ${firstWord(request.firstName)},`,
        '',
        `Your code to finish creating your ${BUSINESS.shortName} account is:`,
        '',
        code,
        '',
        `It expires in ${RULES.codeValidMinutes} minutes. Never share this code with anyone.`,
        'If you did not sign up, you can ignore this email: no account is made without this code.',
        '',
        SIGNATURE
      ].join('\n'),
      meta: { purpose: 'customer_sign_up', requestId: request.id }
    },
    'sign-up code'
  );
}

/** Email the forgot-password code to the customer's address on file (texted to the mobile before Phase 12). */
export function sendResetCode(customer, code, resetId) {
  return deliver(
    mailer,
    {
      to: customer.email,
      subject: `Your ${BUSINESS.shortName} password reset code`,
      text: [
        `Hi ${firstWord(customer.name)},`,
        '',
        `Use this code to choose a new password for your ${BUSINESS.shortName} account:`,
        '',
        code,
        '',
        `It expires in ${RULES.codeValidMinutes} minutes. Never share this code with anyone.`,
        'If you did not ask to reset your password, you can ignore this email: your password stays the same.',
        '',
        SIGNATURE
      ].join('\n'),
      meta: { purpose: 'customer_password_reset', customerId: customer.id, resetId }
    },
    'password reset code'
  );
}

/**
 * Email the code that confirms a password change made in My profile (Phase 12): the customer typed
 * the current password and a new one, and the new one is saved only when this code comes back.
 */
export function sendPasswordChangeCode(customer, code, changeId) {
  return deliver(
    mailer,
    {
      to: customer.email,
      subject: `Confirm your new ${BUSINESS.shortName} password`,
      text: [
        `Hi ${firstWord(customer.name)},`,
        '',
        `Use this code to confirm the new password of your ${BUSINESS.shortName} account:`,
        '',
        code,
        '',
        `It expires in ${RULES.codeValidMinutes} minutes. Never share this code with anyone.`,
        'If you did not just change your password, do not use this code: your password stays the same. To be safe, choose a new one with "Forgot password?" on the Log in page.',
        '',
        SIGNATURE
      ].join('\n'),
      meta: { purpose: 'customer_password_change', customerId: customer.id, changeId }
    },
    'password change code'
  );
}
