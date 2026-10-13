import { mailer } from '../../integrations/mailer/index.js';
import { ApiError } from '../../lib/ApiError.js';
import { CODE_EMAILS } from './code.emails.js';

/**
 * The emails that carry one-time codes, sent through the mail port (integrations/mailer). With
 * MAIL_DRIVER=log (development) they are printed on the API console and saved in the outbox table
 * instead of being sent; production refuses the log driver (config.js), so there they really go out.
 *
 * Every code goes by email, never by SMS (owner's decision, Phase 12): the admin's sign-in and
 * contact-change codes, and the customer's codes for signing up, resetting a forgotten password,
 * and changing the password or login email in My profile. SMS is kept for notifications and outsourcing requests.
 *
 * What each email says and how it looks is in code.emails.js (CODE_EMAILS, one builder per purpose): since
 * 2026-10-11 they go out as HTML in the same look as the customer notices, with the plain-text version
 * beside it (the log driver prints and keeps that one). This file only says who gets which email.
 *
 * `meta` says what each message is about (never the code itself). A provider that refuses the
 * message becomes DELIVERY_FAILED, so the page shows "try again" instead of waiting for a code
 * that will never come; the caller then cancels or rewinds the request it had just saved.
 */

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
      ...CODE_EMAILS.admin_sign_in({ name: admin.name, code }),
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
  return deliver(
    mailer,
    {
      to: field === 'email' ? value : admin.email,
      ...CODE_EMAILS.admin_contact_change({ name: admin.name, field, value, code }),
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
      ...CODE_EMAILS.customer_sign_up({ name: request.firstName, code }),
      meta: { purpose: 'customer_sign_up', requestId: request.id }
    },
    'sign-up code'
  );
}

/** Email a customer's email-change code to the new address, proving that they own it. */
export function sendCustomerEmailChangeCode(customer, email, code, changeId) {
  return deliver(
    mailer,
    {
      to: email,
      ...CODE_EMAILS.customer_email_change({ name: customer.name, email, code }),
      meta: { purpose: 'customer_email_change', customerId: customer.id, changeId }
    },
    'email change code'
  );
}

/** Email the forgot-password code to the customer's address on file (texted to the mobile before Phase 12). */
export function sendResetCode(customer, code, resetId) {
  return deliver(
    mailer,
    {
      to: customer.email,
      ...CODE_EMAILS.customer_password_reset({ name: customer.name, code }),
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
      ...CODE_EMAILS.customer_password_change({ name: customer.name, code }),
      meta: { purpose: 'customer_password_change', customerId: customer.id, changeId }
    },
    'password change code'
  );
}
