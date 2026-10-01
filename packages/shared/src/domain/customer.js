import { daysFromToday } from '../utils/format.js';
import { financials } from './money.js';

/**
 * Customer directory rules that need no stored data, for the admin's Customers page: how many
 * bookings a customer made (all, upcoming, completed), the balance they still owe, what they have
 * spent, and their booking history.
 *
 * Pure (no store.js, no localStorage, no React), so the browser service (customerService.js) and the
 * API server (apps/api/src/modules/customers) work out the same figures with the same money rules
 * (financials() in domain/money.js; docs/backend-development-phases.md §7.8).
 *
 * `bookings` are reservations as { reservation, payments, refunds, packageName }: `payments` and
 * `refunds` may also hold other bookings' records (financials() keeps the booking's own), and
 * `packageName` is the booked package's name. The API's reservations.repo.js findReservations() rows
 * have this shape; the browser version builds it from its store. Only the customer's own bookings
 * (reservation.customerId) are counted, whatever else is passed.
 */

// Bookings that ended before the event: they owe nothing and count for no spend
const ENDED = ['declined', 'cancelled'];
// Bookings whose balance the customer owes: approved and after (a pending request has only an estimate)
const OWING = ['approved', 'downpayment_paid', 'confirmed', 'completed'];

// The customer's own bookings among `bookings`
const ownedBy = (customerId, bookings) => bookings.filter(({ reservation }) => reservation.customerId === customerId);

/**
 * A customer's summary: contact details, sign-up time, how many bookings they made (all of them,
 * the upcoming ones that are still going ahead, the completed ones), the balance still owed on
 * approved bookings and after, and their total spend: what they paid on bookings that did not end
 * early, less anything returned to them (financials().paid is net of refunds).
 */
export function customerSummary(customer, bookings) {
  const own = ownedBy(customer.id, bookings);
  const active = own.filter(({ reservation }) => !ENDED.includes(reservation.status));
  const money = active.map(({ reservation, payments, refunds }) => ({ status: reservation.status, ...financials(reservation, payments, refunds) }));
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    mobile: customer.mobile,
    company: customer.company || '',
    createdAt: customer.createdAt,
    reservationCount: own.length,
    upcomingCount: active.filter(({ reservation: r }) => r.status !== 'completed' && daysFromToday(r.date) >= 0).length,
    completedCount: own.filter(({ reservation }) => reservation.status === 'completed').length,
    balance: money.filter((m) => OWING.includes(m.status)).reduce((sum, m) => sum + m.balance, 0),
    totalSpend: money.reduce((sum, m) => sum + m.paid, 0)
  };
}

/**
 * The customer's booking history for the Customers page's side panel, newest event date first (on
 * the same date, the later ref first): each booking's ref, event, date, status, guests and package
 * name, with its money figures (financials(): total, paid, balance, refunds …).
 */
export function customerBookings(customerId, bookings) {
  return ownedBy(customerId, bookings)
    .map(({ reservation: r, payments, refunds, packageName }) => ({
      ref: r.ref,
      eventName: r.eventName,
      date: r.date,
      status: r.status,
      guests: r.guests,
      packageName,
      ...financials(r, payments, refunds)
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.ref.localeCompare(a.ref));
}

/**
 * Every customer's summary (customerSummary()), by name; customers with the same name by sign-up
 * time, then id, so both versions list them in one order.
 */
export function customerDirectory(customers, bookings) {
  // Each customer's bookings, found once instead of once per customer
  const byCustomer = new Map();
  bookings.forEach((booking) => {
    const id = booking.reservation.customerId;
    if (!byCustomer.has(id)) byCustomer.set(id, []);
    byCustomer.get(id).push(booking);
  });
  return customers
    .map((customer) => customerSummary(customer, byCustomer.get(customer.id) || []))
    .sort((a, b) => a.name.localeCompare(b.name) || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}
