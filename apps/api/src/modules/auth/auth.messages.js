import { mailer } from '../../integrations/mailer/index.js';
import { ApiError } from '../../lib/ApiError.js';
import { CODE_EMAILS } from './code.emails.js';


async function deliver(port, message, what) {
  try {
    return await port.send(message);
  } catch (err) {
    console.error(`[auth] Could not send the ${what}:`, err.message);
    throw new ApiError('DELIVERY_FAILED', 'We could not send the code right now. Please try again in a moment.');
  }
}

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
