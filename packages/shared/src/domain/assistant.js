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
export const ASSISTANT_GUEST_RESET_MS = 3 * 24 * 60 * 60 * 1000;
export const ASSISTANT_TEXT_MAX = 2000;
export const ASSISTANT_RECORD_SECONDS = 30;
export const ASSISTANT_PATH = '/portal/assistant';
export const ASSISTANT_BUDGET_PATH = '/portal/ai-budgeting';

/** Fast paths complement the semantic gate; capabilities remain restricted regardless of wording. */
export function assistantPackageIntent(text = '', draft = {}) {
  const value = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/p\s+a\s+c\s+k\s+a\s+g\s+e/g, 'package')
    .replace(/\s+/g, ' ')
    .trim();
  const packageTopic = /pack(?:age|ages|ge)|pakete|budget|menu|equipment|setup|food|catering/.test(value);
  // Creating a reservation for an existing package is different from creating its contents.
  if (
    /(?:make|create|gumawa|gagawa|gawan|gawin).{0,20}(?:reservation|booking|reserbasyon)/.test(value) &&
    !/(?:build|customi[sz]e|assemble|generate|bumuo|magbuo)|(?:custom|sarili).{0,20}package/.test(value)
  )
    return 'reservation';
  const creation =
    /\b(?:build|create|make|construct|assemble|compose|customi[sz]e|customise|generate|allocate|allocation|breakdown|itemi[sz]e)\b|mag[ -]?(?:buo|build|customi[sz]e)|(?:bumuo|bubuo|buoin|buuin|gumawa|gagawa|gawan|gawin|dagdagan|palitan)|generate_package_proposals|\bdesign (?:me|my|a|an|the|our)\b/.test(
      value
    );
  const negatedCreation =
    /(?:do not|don't|dont|not asking (?:you )?to|no need to|huwag|wag|ayaw kong|hindi(?: ako| ko)?|di(?: ako| ko)?)\s+(?:\w+\s+){0,2}(?:build|create|make|generate|customize|gumawa|gagawa|bumuo|bubuo|magbuo)/.test(
      value
    );
  if (packageTopic && creation && !negatedCreation) return 'package_build';
  if (
    /(?:want|need|like|gusto|kailangan).{0,30}(?:custom|sarili|personalized|personalised|tailor.?made).{0,20}(?:package|pakete)/.test(
      value
    ) &&
    !negatedCreation &&
    !/(?:reserv|book|already selected)/.test(value)
  )
    return 'package_build';
  if (
    draft.planningMode === 'custom' &&
    !draft.packageProposalRef &&
    /^(?:yes|oo|sige|continue|proceed|next|go ahead|ituloy|tuloy)|add .*(?:chairs|tables|dish)|make it (?:cheaper|better)|\b\d+\s*(?:guests|pax|bisita)\b/.test(
      value
    )
  )
    return 'package_build';
  if (
    /(?:reserve|reservation|booking|\bbook\b|magpa.?reserve|mag.?book)/.test(value) &&
    !/(?:no|not|without|hindi|di|wala).{0,24}(?:reserv|book)/.test(value)
  )
    return 'reservation';
  if (packageTopic && /budget|\d[\d,.]*\s*k?\b|magkano|how much/.test(value)) return 'budget_inquiry';
  return 'inquiry';
}
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
