/** Field validators shared by every form. Each returns an error string or ''. */
import { RULES } from '../services/config.js';
import { compactMobile, readPhilippineMobile } from './mobile.js';

// Basic email shape: something@something.xx (no spaces)
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Fails when the value is empty or only spaces. */
export const required = (value, label = 'This field') => (String(value ?? '').trim() ? '' : `${label} is required.`);

/** Required, and must look like an email address. */
export const validateEmail = (value) => {
  if (!String(value || '').trim()) return 'Email is required.';
  return EMAIL_RE.test(String(value).trim()) ? '' : 'Enter a valid email address.';
};

/**
 * Philippine mobile format and mobile ranges, shared by forms and the API. This cannot establish
 * that the number is assigned, active or owned by the person entering it.
 */
export const validateMobile = (value) => {
  if (!compactMobile(value)) return 'Mobile number is required.';
  const national = nationalMobileLength(value);
  if (national !== null && national !== 10) return 'Enter exactly 10 digits after +63, e.g. 917 123 4567.';
  return readPhilippineMobile(value) ? '' : 'Enter a valid Philippine mobile number, e.g. +63 917 123 4567.';
};

const nationalMobileLength = (value) => {
  const compact = compactMobile(value);
  if (!/^\+?\d+$/.test(compact)) return null;
  if (compact.startsWith('+63')) return compact.length - 3;
  if (compact.startsWith('63') && compact.length > 10) return compact.length - 2;
  if (compact.startsWith('0')) return compact.length - 1;
  return compact.startsWith('+') ? null : compact.length;
};

/**
 * The password rule for customers and the admin alike (since 2026-10-10; before, a customer's needed only
 * 8 characters and a number, and the admin's symbol was optional): every check must be met. Shown live as
 * a checklist under a new-password field (PasswordChecklist), and checked again by the server whenever a
 * password is set (sign-up, reset, change). Passwords set before the rule still sign in.
 * A special character is anything that is not a letter A-Z, a digit or a space, e.g. ! @ # - _ .
 */
export const passwordChecks = (value = '') => [
  { key: 'length', label: '8+ characters', met: value.length >= 8, message: 'Use 8 characters or more.' },
  { key: 'lower', label: 'A lowercase letter', met: /[a-z]/.test(value), message: 'Include a lowercase letter.' },
  { key: 'upper', label: 'An uppercase letter', met: /[A-Z]/.test(value), message: 'Include an uppercase letter.' },
  { key: 'number', label: 'A number', met: /\d/.test(value), message: 'Include at least one number.' },
  {
    key: 'symbol',
    label: 'A special character (! @ # -)',
    met: /[^A-Za-z0-9\s]/.test(value),
    message: 'Include a special character, e.g. ! @ # or -.'
  }
];

/**
 * Strength of a password from 0 to 4 with a label, for the bar above the checklist: every check met and
 * 12+ characters is Strong, every check met is Good, three or four is Fair, fewer is Weak; empty is 0.
 */
export const passwordStrength = (value = '') => {
  if (!value) return { score: 0, label: '' };
  const met = passwordChecks(value).filter((c) => c.met).length;
  const score = met === 5 ? (value.length >= 12 ? 4 : 3) : met >= 3 ? 2 : 1;
  return { score, label: ['', 'Weak', 'Fair', 'Good', 'Strong'][score] };
};

/** A customer's new password: the first check of passwordChecks it misses, or '' when it meets them all. */
export const validatePassword = (value) => {
  if (!value) return 'Password is required.';
  const missing = passwordChecks(value).find((c) => !c.met);
  return missing ? missing.message : '';
};

/** An admin's new password: the same rule as a customer's (passwordChecks). */
export const validateAdminPassword = (value) => validatePassword(value);

/** Required whole number between min and max. */
export const validateGuests = (value, min = RULES.minGuests, max = RULES.maxGuests) => {
  const n = Number(value);
  if (value === '' || value === null || value === undefined) return 'Guest count is required.';
  if (!Number.isInteger(n)) return 'Enter a whole number.';
  if (n < min || n > max) return `Between ${min} and ${max} guests.`;
  return '';
};

/** Runs a map of { field: validator(value, values) } and returns only the failures. */
export const collectErrors = (values, rules) =>
  Object.entries(rules).reduce((errors, [field, rule]) => {
    const message = rule(values[field], values);
    if (message) errors[field] = message;
    return errors;
  }, {});
