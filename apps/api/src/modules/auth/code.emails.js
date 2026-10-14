import { BUSINESS, RULES } from '@tm/shared/src/services/config.js';
import { maskMobile } from '@tm/shared/src/utils/format.js';
import { renderCodeEmail } from '../notify/email.layout.js';


const firstWord = (name) =>
  String(name || '')
    .trim()
    .split(/\s+/)[0] || '';

const PREHEADER = `Your code expires in ${RULES.codeValidMinutes} minutes. Never share it with anyone.`;

const common = ({ name, code }) => ({
  firstName: firstWord(name),
  code,
  validMinutes: RULES.codeValidMinutes,
  preheader: PREHEADER
});

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

export const CODE_EMAILS = {
  admin_sign_in: adminSignIn,
  admin_contact_change: adminContactChange,
  customer_sign_up: customerSignUp,
  customer_email_change: customerEmailChange,
  customer_password_reset: customerPasswordReset,
  customer_password_change: customerPasswordChange
};
