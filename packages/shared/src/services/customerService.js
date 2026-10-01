import { cleanMobile, normaliseEmail } from '../domain/account.js';
import { customerBookings, customerDirectory, customerSummary } from '../domain/customer.js';
import { validateEmail, validateMobile } from '../utils/validation.js';
import { ApiError, latency, read, write } from './store.js';

/**
 * The admin customer directory, on the browser store. Reviews live in feedbackService.js.
 *
 * The figures (booking counts, balance owed, total spend net of refunds) and the booking history
 * come from domain/customer.js, the same rules the API uses (apps/api/src/modules/customers,
 * Phase 9), so both versions answer alike.
 */

// Every booking in the store as the customer rules take it: with the payments, the refunds and the package name
const bookingsIn = (data) =>
  data.reservations.map((reservation) => ({
    reservation,
    payments: data.payments,
    refunds: data.refunds,
    packageName: (data.packages.find((p) => p.id === reservation.packageId) || {}).name
  }));

/** Admin: every customer with their summary, sorted by name (customerDirectory). */
export async function listCustomers() {
  await latency(200, 450);
  const data = read();
  return customerDirectory(data.customers, bookingsIn(data));
}

/** Admin: one customer's summary plus their reservations, newest date first. */
export async function getCustomer(customerId) {
  await latency(150, 350);
  const data = read();
  const customer = data.customers.find((c) => c.id === customerId);
  if (!customer) throw new ApiError('NOT_FOUND', 'Customer not found.');
  const bookings = bookingsIn(data);
  return { ...customerSummary(customer, bookings), reservations: customerBookings(customer.id, bookings) };
}

/**
 * Contact corrections only; the customer owns the rest of their profile. The email and mobile number
 * must be valid (checked first), the customer must exist, and no other customer may use the email.
 * The email is saved trimmed and in lower case, the mobile number without spaces or dashes
 * (domain/account.js). Returns the customer's summary.
 */
export async function updateCustomerContact(customerId, { email = '', mobile = '' }) {
  await latency(350, 600);
  const address = normaliseEmail(email);
  const emailError = validateEmail(address);
  if (emailError) throw new ApiError('INVALID', emailError, { field: 'email' });
  const mobileError = validateMobile(mobile);
  if (mobileError) throw new ApiError('INVALID', mobileError, { field: 'mobile' });
  return write((data) => {
    const customer = data.customers.find((c) => c.id === customerId);
    if (!customer) throw new ApiError('NOT_FOUND', 'Customer not found.');
    // Two accounts can't share an email
    if (data.customers.some((c) => c.email.toLowerCase() === address && c.id !== customerId)) {
      throw new ApiError('EMAIL_TAKEN', 'Another account already uses this email.', { field: 'email' });
    }
    customer.email = address;
    customer.mobile = cleanMobile(mobile);
    return customerSummary(customer, bookingsIn(data));
  });
}
