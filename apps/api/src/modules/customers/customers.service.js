import { cleanMobile, normaliseEmail } from '@tm/shared/src/domain/account.js';
import { customerBookings, customerDirectory, customerSummary } from '@tm/shared/src/domain/customer.js';
import { validateEmail, validateMobile } from '@tm/shared/src/utils/validation.js';
import { tx } from '../../db.js';
import { ApiError } from '../../lib/ApiError.js';
import { findReservations } from '../reservations/reservations.repo.js';
import * as repo from './customers.repo.js';


const notFound = () => new ApiError('NOT_FOUND', 'Customer not found.');
const emailTaken = () => new ApiError('EMAIL_TAKEN', 'Another account already uses this email.', { field: 'email' });

async function exactCustomer(db, customerId) {
  const [found] = typeof customerId === 'string' && customerId ? await repo.findCustomers(db, { customerId }) : [];
  if (!found || found.id !== customerId) throw notFound();
  return found;
}

export async function listCustomers() {
  return tx(async (conn) => {
    const customers = await repo.findCustomers(conn);
    return customerDirectory(customers, await findReservations(conn));
  });
}

export async function getCustomer(customerId) {
  return tx(async (conn) => {
    const customer = await exactCustomer(conn, customerId);
    const bookings = await findReservations(conn, { customerId: customer.id });
    return { ...customerSummary(customer, bookings), reservations: customerBookings(customer.id, bookings) };
  });
}

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
    if (err.code === 'ER_DUP_ENTRY') throw emailTaken();
    throw err;
  }
}
