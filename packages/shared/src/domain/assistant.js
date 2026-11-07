import { cleanAssistantBooking } from './assistantBooking.js';
/** Public assistant copy and handoff rules. No provider credentials or private records live here. */
export const ASSISTANT_QUESTIONS = Object.freeze([
  'Which package would suit 100 guests?',
  'What is the difference between buffet and catering only?',
  'Are tables and chairs included?',
  'Can I rent equipment without booking catering?',
  'Paano mag-book sa Tres Marias?',
  'How can I check my preferred date?'
]);
export const ASSISTANT_GUEST_LIMIT = 5;
export const ASSISTANT_TEXT_MAX = 2000;
export const ASSISTANT_RECORD_SECONDS = 30;
export const ASSISTANT_PATH = '/portal/assistant';
export const ASSISTANT_AUTH = Object.freeze({
  signup: '/signup?continue=assistant',
  login: '/login?next=%2Fportal%2Fassistant'
});

export function validAssistantDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

/** Only supported, explicit booking selections can leave the assistant. Never copy a computed price. */
export function cleanAssistantIntent(value) {
  return cleanAssistantBooking(value);
}
