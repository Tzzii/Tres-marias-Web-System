import { daysFromToday } from '../utils/format.js';
import { financials } from './reservationService.js';
import { ApiError, latency, read, write } from './store.js';

/** The admin customer directory. Reviews live in feedbackService.js. */

/** Build a customer's summary: contact info plus reservation counts, balance owed and total spent. */
function stats(customer, data) {
  const reservations = data.reservations.filter((r) => r.customerId === customer.id);
  const active = reservations.filter((r) => !['declined', 'cancelled'].includes(r.status));
  // Paid / balance figures for each active reservation
  const money = active.map((r) => ({ r, ...financials(r, data.payments) }));
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    mobile: customer.mobile,
    company: customer.company || '',
    createdAt: customer.createdAt,
    reservationCount: reservations.length,
    upcomingCount: active.filter((r) => r.status !== 'completed' && daysFromToday(r.date) >= 0).length,
    completedCount: reservations.filter((r) => r.status === 'completed').length,
    balance: money
      .filter(({ r }) => ['approved', 'downpayment_paid', 'confirmed', 'completed'].includes(r.status))
      .reduce((sum, m) => sum + m.balance, 0),
    totalSpend: money.reduce((sum, m) => sum + m.paid, 0)
  };
}

/** Admin: every customer with their summary, sorted by name. */
export async function listCustomers() {
  await latency(200, 450);
  const data = read();
  return data.customers.map((c) => stats(c, data)).sort((a, b) => a.name.localeCompare(b.name));
}

/** Admin: one customer's summary plus their reservations, newest date first. */
export async function getCustomer(customerId) {
  await latency(150, 350);
  const data = read();
  const customer = data.customers.find((c) => c.id === customerId);
  if (!customer) throw new ApiError('NOT_FOUND', 'Customer not found.');
  return {
    ...stats(customer, data),
    reservations: data.reservations
      .filter((r) => r.customerId === customerId)
      .map((r) => ({
        ref: r.ref,
        eventName: r.eventName,
        date: r.date,
        status: r.status,
        guests: r.guests,
        packageName: (data.packages.find((p) => p.id === r.packageId) || {}).name,
        ...financials(r, data.payments)
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
  };
}

/** Contact corrections only; the customer owns the rest of their profile. */
export async function updateCustomerContact(customerId, { email, mobile }) {
  await latency(350, 600);
  return write((data) => {
    const customer = data.customers.find((c) => c.id === customerId);
    if (!customer) throw new ApiError('NOT_FOUND', 'Customer not found.');
    const address = email.trim().toLowerCase();
    // Two accounts can't share an email
    if (data.customers.some((c) => c.email.toLowerCase() === address && c.id !== customerId)) {
      throw new ApiError('EMAIL_TAKEN', 'Another account already uses this email.', { field: 'email' });
    }
    customer.email = address;
    customer.mobile = mobile.replace(/[\s-]/g, '');
    return stats(customer, data);
  });
}
