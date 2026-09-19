import { MONTH_NAMES, parseISODate, toISODate, todayISO } from '../utils/format.js';
import { HOLDS_DATE, PAYMENT_METHODS, statusLabel } from '../utils/status.js';
import { financials } from './reservationService.js';
import { ApiError, latency, read } from './store.js';

/**
 * Dashboard counters and the Reports page. Every figure is computed from the
 * reservation and payment records, so charts move as bookings are completed.
 */

// Is a date inside the report range? (this_year, last_year, last_12 months, or all)
const inRange = (iso, range) => {
  const date = parseISODate(iso);
  const now = parseISODate(todayISO());
  if (range === 'this_year') return date.getFullYear() === now.getFullYear();
  if (range === 'last_year') return date.getFullYear() === now.getFullYear() - 1;
  if (range === 'last_12') {
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    return date >= start && date <= new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }
  return true;
};

/**
 * Month buckets for the chosen range: the twelve months of the year (or of the last 12 months), and for
 * "All time" every month from the first one in `dates` (YYYY-MM-DD strings) up to this month.
 */
function monthBuckets(range, dates = []) {
  const now = parseISODate(todayISO());
  if (range === 'all') {
    const first = dates.length ? parseISODate(dates.reduce((a, b) => (a < b ? a : b))) : now;
    const count = (now.getFullYear() - first.getFullYear()) * 12 + now.getMonth() - first.getMonth() + 1;
    return Array.from({ length: Math.max(1, count) }, (_, i) => {
      const d = new Date(first.getFullYear(), first.getMonth() + i, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }
  if (range === 'last_12') {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }
  const year = range === 'last_year' ? now.getFullYear() - 1 : now.getFullYear();
  return Array.from({ length: 12 }, (_, month) => ({ year, month }));
}

/** Everything the admin dashboard shows. */
export async function getDashboardSummary() {
  await latency(200, 450);
  const data = read();
  const today = todayISO();
  const now = parseISODate(today);

  // Approved/confirmed events happening today, earliest start first
  const eventsToday = data.reservations
    .filter((r) => r.date === today && HOLDS_DATE.includes(r.status))
    .map((r) => {
      const customer = data.customers.find((c) => c.id === r.customerId);
      const pkg = data.packages.find((p) => p.id === r.packageId);
      return { ...r, customerName: customer ? customer.name : '', packageName: pkg ? pkg.name : '', ...financials(r, data.payments) };
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Requests waiting for review, newest first
  const pending = data.reservations
    .filter((r) => r.status === 'pending')
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r) => ({
      ref: r.ref,
      eventName: r.eventName,
      occasion: r.occasion,
      date: r.date,
      guests: r.guests,
      createdAt: r.createdAt,
      customerName: (data.customers.find((c) => c.id === r.customerId) || {}).name,
      packageName: (data.packages.find((p) => p.id === r.packageId) || {}).name
    }));

  // Sum of payments verified in the current month
  const revenueThisMonth = data.payments
    .filter((p) => {
      if (p.status !== 'verified') return false;
      const d = new Date(p.verifiedAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
    .reduce((sum, p) => sum + p.amount, 0);

  // Next 5 approved events after today
  const upcoming = data.reservations
    .filter((r) => HOLDS_DATE.includes(r.status) && r.date > today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5)
    .map((r) => ({ ref: r.ref, eventName: r.eventName, date: r.date, startTime: r.startTime, guests: r.guests, status: r.status }));

  return {
    eventsToday,
    pending,
    pendingOldestDays: pending.length ? Math.max(...pending.map((p) => Math.floor((Date.now() - p.createdAt) / 86400000))) : 0,
    unverifiedPayments: data.payments.filter((p) => p.status === 'awaiting').length,
    revenueThisMonth,
    upcoming
  };
}

/** Reports page figures for a date range. */
export async function getReport(range = 'this_year') {
  await latency(250, 550);
  const data = read();

  // "decided" = requests the admin has approved or declined; used for the decline rate
  const completed = data.reservations.filter((r) => r.status === 'completed' && inRange(r.date, range));
  const decided = data.reservations.filter((r) => ['approved', 'downpayment_paid', 'confirmed', 'completed', 'declined'].includes(r.status) && inRange(r.date, range));
  const declined = decided.filter((r) => r.status === 'declined');

  // Revenue = verified payments in range; average per event uses completed events' totals
  const verified = data.payments.filter((p) => p.status === 'verified' && inRange(toISODate(new Date(p.verifiedAt)), range));
  const revenue = verified.reduce((sum, p) => sum + p.amount, 0);
  const completedRevenue = completed.reduce((sum, r) => sum + financials(r, data.payments).total, 0);

  // Revenue chart: one bar per month, or one per year for "All time" (from the first verified payment to this year)
  const revenueBy = range === 'all' ? 'year' : 'month';
  const sumWhere = (test) => verified.filter((p) => test(new Date(p.verifiedAt))).reduce((sum, p) => sum + p.amount, 0);
  let revenueChart;
  if (revenueBy === 'year') {
    const thisYear = parseISODate(todayISO()).getFullYear();
    const firstYear = verified.length ? Math.min(...verified.map((p) => new Date(p.verifiedAt).getFullYear())) : thisYear;
    revenueChart = Array.from({ length: thisYear - firstYear + 1 }, (_, i) => firstYear + i).map((year) => ({
      label: String(year),
      value: sumWhere((d) => d.getFullYear() === year)
    }));
  } else {
    revenueChart = monthBuckets(range).map(({ year, month }) => ({
      label: MONTH_NAMES[month].slice(0, 3),
      value: sumWhere((d) => d.getFullYear() === year && d.getMonth() === month)
    }));
  }

  // Bookings per package, most booked first
  const packageCounts = data.packages
    .map((pkg) => ({
      name: pkg.name,
      count: data.reservations.filter((r) => r.packageId === pkg.id && !['declined', 'cancelled'].includes(r.status) && inRange(r.date, range)).length
    }))
    .sort((a, b) => b.count - a.count);

  return {
    range,
    eventsServed: completed.length,
    revenue,
    averagePerEvent: completed.length ? Math.round(completedRevenue / completed.length) : 0,
    declineRate: decided.length ? Math.round((declined.length / decided.length) * 100) : 0,
    revenueBy,
    revenueChart,
    packageCounts
  };
}

/** Rows for the saved reports (monthly_sales or outstanding), shaped for both on-screen tables and TXT export. */
export async function runSavedReport(kind, range = 'this_year') {
  await latency(300, 650);
  const data = read();
  const customerName = (id) => (data.customers.find((c) => c.id === id) || {}).name || '';

  // Monthly sales: one row per month with totals split by payment method
  if (kind === 'monthly_sales') {
    const verified = data.payments.filter((p) => p.status === 'verified' && inRange(toISODate(new Date(p.verifiedAt)), range));
    // "All time" lists every month from the first verified payment, so the rows add up to all the payments counted
    const rows = monthBuckets(range, verified.map((p) => toISODate(new Date(p.verifiedAt)))).map(({ year, month }) => {
      const inMonth = verified.filter((p) => {
        const d = new Date(p.verifiedAt);
        return d.getFullYear() === year && d.getMonth() === month;
      });
      const byMethod = (method) => inMonth.filter((p) => p.method === method).reduce((s, p) => s + p.amount, 0);
      return {
        Month: `${MONTH_NAMES[month]} ${year}`,
        Payments: inMonth.length,
        [PAYMENT_METHODS.gcash]: byMethod('gcash'),
        [PAYMENT_METHODS.bank]: byMethod('bank'),
        [PAYMENT_METHODS.cash]: byMethod('cash'),
        Total: inMonth.reduce((s, p) => s + p.amount, 0)
      };
    });
    return { title: 'Monthly sales summary', money: [PAYMENT_METHODS.gcash, PAYMENT_METHODS.bank, PAYMENT_METHODS.cash, 'Total'], rows };
  }

  // Outstanding balances: approved bookings that still owe money, by event date
  if (kind === 'outstanding') {
    const rows = data.reservations
      .filter((r) => ['approved', 'downpayment_paid', 'confirmed', 'completed'].includes(r.status))
      .map((r) => ({ r, ...financials(r, data.payments) }))
      .filter((m) => m.balance > 0)
      .sort((a, b) => a.r.date.localeCompare(b.r.date))
      .map((m) => ({
        Reference: m.r.ref,
        Customer: customerName(m.r.customerId),
        Event: m.r.eventName,
        'Event date': m.r.date,
        Status: statusLabel(m.r.status),
        Total: m.total,
        Paid: m.paid,
        Balance: m.balance
      }));
    return { title: 'Outstanding balances', money: ['Total', 'Paid', 'Balance'], rows };
  }

  throw new ApiError('INVALID', 'Unknown report.');
}
