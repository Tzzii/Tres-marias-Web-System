import { BUSINESS } from '../services/config.js';
import { formatDate, peso } from '../utils/format.js';

/**
 * Outsourcing rules that need no stored data: the "no event" value, the contract statuses and the
 * moves allowed between them, how a partner can be reached, and the contract text.
 *
 * Pure (no store.js, no localStorage, no React), so the browser service (outsourceService.js), the
 * seed (outsourceSeed.js) and the API server all use this one copy instead of each keeping its own
 * (docs/backend-development-phases.md §7.8).
 */

// Value used on a contract that is not tied to a reservation (e.g. topping up stock)
export const NO_EVENT = 'none';

// Contract statuses, and the statuses each one may move to next
export const CONTRACT_STATUSES = ['draft', 'sent', 'accepted', 'declined', 'completed', 'cancelled'];
export const NEXT_STATUS = {
  draft: ['cancelled'],
  sent: ['accepted', 'declined', 'cancelled'],
  accepted: ['completed', 'cancelled'],
  declined: [],
  completed: [],
  cancelled: []
};

/** How a partner can be reached, in sending order: ['email', 'sms'], one of the two, or none. */
export const channelsOf = (partner) => [...(partner.email ? ['email'] : []), ...(partner.mobile ? ['sms'] : [])];

/**
 * The contract text, built once and sent unchanged to email and SMS.
 * A pure function, so the compose dialog can show the admin exactly what will go out and their
 * edits to it are what both channels carry.
 */
export function composeContractText({ ref, partner, items = [], needBy, eventName, eventDate, venue, amount, notes }) {
  const greeting = partner.contactPerson ? `Hi ${partner.contactPerson} (${partner.name}),` : `Hi ${partner.name},`;
  const forEvent = eventName ? ` for ${eventName}${eventDate ? ` on ${formatDate(eventDate)}` : ''}` : '';
  const lines = [
    `${BUSINESS.name} · Outsourcing contract ${ref}`,
    '',
    greeting,
    '',
    `We would like to rent the following${forEvent}:`,
    ...items.filter((i) => i.name && i.qty).map((i) => `- ${i.name}: ${i.qty} pcs`),
    ''
  ];
  if (needBy) lines.push(`Needed on ${formatDate(needBy)}${venue ? ` at ${venue}` : ''}.`);
  if (Number(amount) > 0) lines.push(`Agreed amount: ${peso(amount)}.`);
  if (notes && notes.trim()) lines.push(notes.trim());
  lines.push('', 'Please reply YES to accept or NO if you cannot supply this.', `${BUSINESS.name} · ${BUSINESS.phone}`);
  return lines.join('\n');
}
