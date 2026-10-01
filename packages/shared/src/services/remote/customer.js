import { normaliseEmail } from '../../domain/account.js';
import { validateEmail, validateMobile } from '../../utils/validation.js';
import { ApiError } from '../errors.js';
import { http } from '../http.js';

/**
 * The customer directory on the API (apps/api/src/modules/customers, endpoint map in
 * docs/backend-development-phases.md §9.7). Same function names, arguments, return shapes and ApiError
 * codes as the browser version (customerService.js), so no page changes when VITE_API_SERVICES includes
 * "customers" (see facade/customer.js). Admin only: the three addresses are under /api/admin.
 * The contact correction is one request, which emits one change event (http.js), so the list and the
 * open side panel reload with the new details.
 */

// A customer id in a URL path (never trust a path segment)
const segment = (id) => encodeURIComponent(String(id || ''));

/** Admin: every customer with their summary (booking counts, balance, total spend), sorted by name. */
export const listCustomers = () => http.get('/admin/customers');

/** Admin: one customer's summary plus their reservations, newest date first. NOT_FOUND for no id at all. */
export async function getCustomer(customerId) {
  if (!customerId) throw new ApiError('NOT_FOUND', 'Customer not found.');
  return http.get(`/admin/customers/${segment(customerId)}`);
}

/**
 * Admin: correct a customer's email and mobile number: { email, mobile } -> the customer's summary.
 * Without an id there is nothing to send; the answer is still the browser version's, whose format
 * checks come before the customer is looked up.
 */
export async function updateCustomerContact(customerId, { email = '', mobile = '' } = {}) {
  if (!customerId) {
    const emailError = validateEmail(normaliseEmail(email));
    if (emailError) throw new ApiError('INVALID', emailError, { field: 'email' });
    const mobileError = validateMobile(mobile);
    if (mobileError) throw new ApiError('INVALID', mobileError, { field: 'mobile' });
    throw new ApiError('NOT_FOUND', 'Customer not found.');
  }
  return http.patch(`/admin/customers/${segment(customerId)}/contact`, { email, mobile });
}
