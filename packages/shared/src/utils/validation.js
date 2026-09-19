/** Field validators shared by every form. Each returns an error string or ''. */
import { RULES } from '../services/config.js';

// Basic email shape: something@something.xx (no spaces)
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Fails when the value is empty or only spaces. */
export const required = (value, label = 'This field') =>
  String(value ?? '').trim() ? '' : `${label} is required.`;

/** Required, and must look like an email address. */
export const validateEmail = (value) => {
  if (!String(value || '').trim()) return 'Email is required.';
  return EMAIL_RE.test(String(value).trim()) ? '' : 'Enter a valid email address.';
};

/** Philippine mobile numbers: 09XXXXXXXXX or +639XXXXXXXXX. */
export const validateMobile = (value) => {
  // Ignore spaces and dashes so "0917-123-4567" is accepted
  const digits = String(value || '').replace(/[\s-]/g, '');
  if (!digits) return 'Mobile number is required.';
  return /^(09\d{9}|\+639\d{9})$/.test(digits) ? '' : 'Enter a valid mobile number, e.g. 0917 123 4567.';
};

/** 8 characters or more, with a number. */
export const validatePassword = (value) => {
  if (!value) return 'Password is required.';
  if (value.length < 8) return 'Use 8 characters or more.';
  if (!/\d/.test(value)) return 'Include at least one number.';
  return '';
};

/**
 * Admin password checklist, shown live under the New password field.
 * `required` rules must all pass; the symbol is optional but makes the password stronger.
 */
export const adminPasswordChecks = (value = '') => [
  { key: 'length', label: '8+ characters', met: value.length >= 8, required: true },
  { key: 'case', label: 'Upper & lowercase', met: /[a-z]/.test(value) && /[A-Z]/.test(value), required: true },
  { key: 'number', label: 'A number', met: /\d/.test(value), required: true },
  { key: 'symbol', label: 'A symbol', met: /[^A-Za-z0-9\s]/.test(value), required: false }
];

/**
 * Strength of an admin password from 0 to 4 with a label: one point per check met,
 * plus one for 12+ characters (capped at 4). Empty passwords score 0.
 */
export const adminPasswordStrength = (value = '') => {
  if (!value) return { score: 0, label: '' };
  const met = adminPasswordChecks(value).filter((c) => c.met).length;
  const score = Math.min(4, met + (value.length >= 12 ? 1 : 0));
  return { score, label: ['Weak', 'Weak', 'Fair', 'Good', 'Strong'][score] };
};

/** Admin passwords must pass every required check (8+ characters, upper & lowercase, a number). */
export const validateAdminPassword = (value) => {
  if (!value) return 'Password is required.';
  const missing = adminPasswordChecks(value).find((c) => c.required && !c.met);
  return missing ? `Password needs: ${missing.label.toLowerCase()}.` : '';
};

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
