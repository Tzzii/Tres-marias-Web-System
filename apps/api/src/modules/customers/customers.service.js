import { cleanMobile, normaliseEmail } from '@tm/shared/src/domain/account.js';
import { customerBookings, customerDirectory, customerSummary } from '@tm/shared/src/domain/customer.js';
import { validateEmail, validateMobile } from '@tm/shared/src/utils/validation.js';
import { tx } from '../../db.js';
import { ApiError } from '../../lib/ApiError.js';
import { findReservations } from '../reservations/reservations.repo.js';
import * as repo from './customers.repo.js';

/**
 * The admin's customer directory on the server (docs/backend-development-phases.md Phase 9, §9.7):
 * every customer with their figures, one customer with their bookings, and the admin's correction of
 * a customer's email and mobile number. Same return shapes, error codes and messages as the browser
 * version (customerService.js). Admin only: the routes sit behind the admin router's guard, since this
 * is personal information (Data Privacy Act, RA 10173).
 *
 * The figures (booking counts, balance owed, total spend net of refunds) and the booking history come
 * from @tm/shared/src/domain/customer.js, the code the browser version runs, over the bookings read by
 * reservations.repo.js findReservations() (with their payments and refunds). Each answer is read in one
 * transaction, so its customers, bookings, payments and refunds are one consistent snapshot.
 *
 * Differences from the browser version, on purpose: a customer id must be spelled exactly as stored
 * (the column's collation ignores case and trailing spaces; the browser version finds only the exact
 * id), and an email another customer uses with different accents also counts as taken (the database's
 * UNIQUE email index compares emails that way).
 */

const notFound = () => new ApiError('NOT_FOUND', 'Customer not found.');
const emailTaken = () => new ApiError('EMAIL_TAKEN', 'Another account already uses this email.', { field: 'email' });

// The customer with exactly this id (as stored), or NOT_FOUND
async function exactCustomer(db, customerId) {
  const [found] = typeof customerId === 'string' && customerId ? await repo.findCustomers(db, { customerId }) : [];
  if (!found || found.id !== customerId) throw notFound();
  return found;
}

/** Admin: every customer with their summary, sorted by name (customerDirectory). */
export async function listCustomers() {
  return tx(async (conn) => {
    const customers = await repo.findCustomers(conn);
    return customerDirectory(customers, await findReservations(conn));
  });
}

/** Admin: one customer's summary plus their reservations, newest event date first. */
export async function getCustomer(customerId) {
  return tx(async (conn) => {
    const customer = await exactCustomer(conn, customerId);
    const bookings = await findReservations(conn, { customerId: customer.id });
    return { ...customerSummary(customer, bookings), reservations: customerBookings(customer.id, bookings) };
  });
}

/**
 * Admin: correct a customer's email and mobile number (the customer owns the rest of their profile).
 * Same order as the browser version: the email's format, then the mobile number's (INVALID with
 * meta.field), then the customer (NOT_FOUND), then that no other customer uses the email
 * (EMAIL_TAKEN). The email is saved trimmed and in lower case, the mobile number without spaces or
 * dashes (domain/account.js). The customer's row is locked while it changes. Returns the summary.
 */
export async function updateCustomerContact(customerId, { email = '', mobile = '' } = {}) {
  const address = normaliseEmail(email);
  const emailError = validateEmail(address);
  if (emailError) throw new ApiError('INVALID', emailError, { field: 'email' });
  const mobileError = validateMobile(mobile);
  if (mobileError) throw new ApiError('INVALID', mobileError, { field: 'mobile' });
  try {
    return await tx(async (conn) => {
      const locked = typeof customerId === 'string' && customerId ? await repo.lockCustomer(conn, customerId) : null;
      if (!locked || locked.id !== customerId) throw notFound();
      if (await repo.emailUsedByAnother(conn, address, locked.id)) throw emailTaken();
      const customer = { ...locked, email: address, mobile: cleanMobile(mobile) };
      await repo.updateContact(conn, customer.id, customer);
      return customerSummary(customer, await findReservations(conn, { customerId: customer.id }));
    });
  } catch (err) {
    // Two corrections to the same email at the same moment: the UNIQUE email index stops the second
    if (err.code === 'ER_DUP_ENTRY') throw emailTaken();
    throw err;
  }
}
