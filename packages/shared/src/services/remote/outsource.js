import { ApiError } from '../errors.js';
import { http } from '../http.js';

/**
 * Outsourcing on the API (apps/api/src/modules/outsource, endpoint map in
 * docs/backend-development-phases.md §9.10). Same function names, arguments, return shapes and ApiError
 * codes as the browser version (outsourceService.js), so no page changes when VITE_API_SERVICES includes
 * "outsource" (see facade/outsource.js). Admin only: every address is under /api/admin/outsource.
 *
 * - Every write is one request, which emits one change event (http.js), so the page and the sidebar's
 *   "awaiting reply" badge reload.
 * - sendContract really sends: the server emails and texts the partner (integrations/mailer and sms). Its
 *   answer carries `deliveryNote` when a channel did not really go out (no provider connected yet, or the
 *   provider refused it); the page shows it.
 * - Without a contract id there is nothing to send: those calls answer as the browser version would (the
 *   contract is not found). A partner with no id is a new partner, as in the browser version.
 */

// A partner or contract id in a URL path (never trust a path segment)
const segment = (id) => encodeURIComponent(String(id || ''));
const contractNotFound = () => new ApiError('NOT_FOUND', 'Contract not found.');

/** Every partner (archived ones only when asked), by service order then name, with how they are reached and their contract counts. */
export const listPartners = ({ includeArchived = false } = {}) => http.get(`/admin/outsource/partners${includeArchived ? '?includeArchived=true' : ''}`);

/** Every contract, newest first. */
export const listContracts = () => http.get('/admin/outsource/contracts');

/** The bookings a contract can be for: approved to confirmed, soonest first. */
export const listOutsourceEvents = () => http.get('/admin/outsource/events');

/** Add a partner (`id` null) or save changes to one. Returns the partner. */
export const savePartner = (id, values) => (id ? http.put(`/admin/outsource/partners/${segment(id)}`, values) : http.post('/admin/outsource/partners', values));

/** Archive or restore partners (not while a sent contract waits for their answer). Returns { count }. */
export const setPartnerArchived = (ids, archived) => http.post('/admin/outsource/partners/archive', { ids, archived });

/** Save a contract as a draft: a new one (`id` null) or changes to a draft. Returns the contract. */
export const saveContract = (id, values) => (id ? http.put(`/admin/outsource/contracts/${segment(id)}`, values) : http.post('/admin/outsource/contracts', values));

/** Send (or send again) a contract: the same text to the partner's email and mobile number. Returns the contract with `deliveryNote`. */
export async function sendContract(id, { body } = {}) {
  if (!id) throw contractNotFound();
  return http.post(`/admin/outsource/contracts/${segment(id)}/send`, { body });
}

/** Record the partner's answer, the delivery, or a cancellation (a reason for a decline or a cancellation). Returns the contract. */
export async function setContractStatus(id, status, { note = '' } = {}) {
  if (!id) throw contractNotFound();
  return http.post(`/admin/outsource/contracts/${segment(id)}/status`, { status, note });
}

// Constants and pure helpers: the same on both sides (domain/outsource.js, which the server uses too)
export { NO_EVENT, CONTRACT_STATUSES, channelsOf, composeContractText } from '../../domain/outsource.js';
