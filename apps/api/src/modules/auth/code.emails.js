import { BUSINESS, RULES } from '@tm/shared/src/services/config.js';
import { maskMobile } from '@tm/shared/src/utils/format.js';
import { renderCodeEmail } from '../notify/email.layout.js';

/**
 * The one-time-code emails (2026-10-11): one builder per purpose, builder(data) -> { subject, html, text }.
 * Every email is drawn by renderCodeEmail() (notify/email.layout.js), the same Warm Ivory & Gold frame as
 * the customer notices, which escapes every value, so nothing here builds HTML. Before this they were plain
 * text only; the words are the same. auth.messages.js sends them (and says who gets each one).
 *
 * Each email has the code large in a card, how long it works (RULES.codeValidMinutes), "Never share this
 * code with anyone" with what to do if they did not ask for it, and a footer line saying why it came. No
 * button and no link: the code is typed into the page that asked for it. The subject is a fixed sentence
 * with the business's short name: nothing a person typed, and never the code.
 *
 * admin_sign_in            { name, code }                 the second step of the admin's sign-in
 * admin_contact_change     { name, field, value, code }   confirms the admin's new email ('email': the new
 *                                                         address is shown) or mobile number (shown masked)
 * customer_sign_up         { name, code }                 finishes creating a customer account
 * customer_email_change    { name, email, code }          confirms a customer's new login email
 * customer_password_reset  { name, code }                 "Forgot password?" on the Log in page
 * customer_password_change { name, code }                 confirms a new password set in My profile
 */

// "Wilma W. Cabiscuelas" -> "Wilma", for the greeting ('' when there is no name: the layout then says "Hi there,")
const firstWord = (name) =>
  String(name || '')
    .trim()
    .split(/\s+/)[0] || '';

// The inbox preview line of every code email: how long the code works, never the code itself
const PREHEADER = `Your code expires in ${RULES.codeValidMinutes} minutes. Never share it with anyone.`;

// What every code email shares: the greeting's first name, the code, how long it works and the preview line
const common = ({ name, code }) => ({
  firstName: firstWord(name),
  code,
  validMinutes: RULES.codeValidMinutes,
  preheader: PREHEADER
});

/** admin_sign_in: the code for the second step of signing in to the admin dashboard. */
function adminSignIn(data) {
  return {
    subject: `Your ${BUSINESS.shortName} sign-in code`,
    ...renderCodeEmail({
      ...common(data),
      label: 'Sign-In Code',
      heading: 'Finish Signing In',
      intro: `Your code to finish signing in to the ${BUSINESS.shortName} admin dashboard is:`,
      ifNotYou: 'If you did not just try to sign in, change your password right away.',
      reason: `You're receiving this because a sign-in to the ${BUSINESS.shortName} admin dashboard was started with your password.`
    })
  };
}

/**
 * admin_contact_change: the code that confirms the admin's new email or mobile number. `field` is 'email'
 * (the new address is shown in full) or the mobile number (shown masked, e.g. "+63 925 ••• 2345").
 */
function adminContactChange(data) {
  const isEmail = data.field === 'email';
  return {
    subject: isEmail
      ? `Confirm your new email for ${BUSINESS.shortName}`
      : `Confirm your new mobile number for ${BUSINESS.shortName}`,
    ...renderCodeEmail({
      ...common(data),
      label: isEmail ? 'Confirm New Email' : 'Confirm New Mobile Number',
      heading: isEmail ? 'Confirm Your New Email' : 'Confirm Your New Mobile Number',
      intro: isEmail
        ? `Use this code to make ${data.value} the email of your ${BUSINESS.shortName} admin account:`
        : `Use this code to make ${maskMobile(data.value)} the mobile number of your ${BUSINESS.shortName} admin account:`,
      ifNotYou: 'If you did not ask for this change, change your password right away.',
      reason: `You're receiving this because a change of ${isEmail ? 'email' : 'mobile number'} was started in your ${BUSINESS.shortName} admin account.`
    })
  };
}

/** customer_sign_up: the code that finishes creating a customer account (no account is made without it). */
function customerSignUp(data) {
  return {
    subject: `Your ${BUSINESS.shortName} sign-up code`,
    ...renderCodeEmail({
      ...common(data),
      label: 'Sign-Up Code',
      heading: 'Finish Creating Your Account',
      intro: `Your code to finish creating your ${BUSINESS.shortName} account is:`,
      ifNotYou: 'If you did not sign up, you can ignore this email: no account is made without this code.',
      reason: `You're receiving this because this email address was used to sign up for a ${BUSINESS.shortName} account.`
    })
  };
}

/** customer_email_change: proves that the customer owns the new login address before it is saved. */
function customerEmailChange(data) {
  return {
    subject: `Confirm your new email for ${BUSINESS.shortName}`,
    ...renderCodeEmail({
      ...common(data),
      label: 'Confirm New Email',
      heading: 'Confirm Your New Email',
      intro: `Use this code to make ${data.email} the login email for your ${BUSINESS.shortName} account:`,
      ifNotYou: 'If you did not ask for this change, do not use this code: your login email stays the same.',
      reason: `You're receiving this because an email change was started in your ${BUSINESS.shortName} customer account.`
    })
  };
}

/** customer_password_reset: the code for choosing a new password after "Forgot password?". */
function customerPasswordReset(data) {
  return {
    subject: `Your ${BUSINESS.shortName} password reset code`,
    ...renderCodeEmail({
      ...common(data),
      label: 'Password Reset Code',
      heading: 'Reset Your Password',
      intro: `Use this code to choose a new password for your ${BUSINESS.shortName} account:`,
      ifNotYou: 'If you did not ask to reset your password, you can ignore this email: your password stays the same.',
      reason: `You're receiving this because a password reset was asked for your ${BUSINESS.shortName} account.`
    })
  };
}

/** customer_password_change: the code that confirms a new password set in My profile. */
function customerPasswordChange(data) {
  return {
    subject: `Confirm your new ${BUSINESS.shortName} password`,
    ...renderCodeEmail({
      ...common(data),
      label: 'Password Change Code',
      heading: 'Confirm Your New Password',
      intro: `Use this code to confirm the new password of your ${BUSINESS.shortName} account:`,
      ifNotYou:
        'If you did not just change your password, do not use this code: your password stays the same. To be safe, choose a new one with "Forgot password?" on the Log in page.',
      reason: `You're receiving this because a password change was started in your ${BUSINESS.shortName} account.`
    })
  };
}

/** Every one-time-code email, by purpose (the `purpose` in the message's meta, see auth.messages.js). */
export const CODE_EMAILS = {
  admin_sign_in: adminSignIn,
  admin_contact_change: adminContactChange,
  customer_sign_up: customerSignUp,
  customer_email_change: customerEmailChange,
  customer_password_reset: customerPasswordReset,
  customer_password_change: customerPasswordChange
};
