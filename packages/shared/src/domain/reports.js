import { MONTH_NAMES, parseISODate, toISODate, todayISO } from '../utils/format.js';
import { HOLDS_DATE, PAYMENT_METHODS, statusLabel } from '../utils/status.js';
import { financials } from './money.js';

/**
 * Dashboard and Reports figures that need no stored data: the admin Dashboard's counters and lists, the
 * Reports page's figures and revenue chart for a date range, and the rows of the two saved reports.
 *
 * Pure (no database, no localStorage, no React): the API server (apps/api/src/modules/reports, Phase 11)
 * works out the numbers with the same money rule as every page (financials() in domain/money.js;
 * docs/backend-development-phases.md §7.8), and the Reports page checks a range with it before asking.
 * A refusal comes back as data, { code, message, meta }: the ApiError each service then throws.
 *
 * `data` holds the records in the app's record shape: { reservations, payments, refunds, customers,
 * packages }. Reservations are full records; payments and refunds are every booking's (financials() picks
 * each booking's own); customers and packages need only { id, name }, and packages come in the
 * catalogue's order, which "Most booked packages" keeps for packages booked equally often. The API reads
 * this object from the database in one transaction (reports.service.js).
 *
 * Money in is verified payments, counted in the month they were verified, less refunds, counted in the
 * month they were sent (`sentOn`), so a refund lowers the month it went out, not the month of the payment.
 * Dates are the local calendar: Asia/Manila, the admin's browser and the API server's fixed time zone.
 * Lists sorted by a date or time break ties by ref, so bookings are listed in one order whatever order
 * their records come in (the API reads them newest first).
 */

/** The ranges the Reports page offers, in its order: this year, the last 12 months, last year, all time. */
export const REPORT_RANGES = ['this_year', 'last_12', 'last_year', 'all'];

/** The saved reports the Reports page can run: the monthly sales summary and the outstanding balances. */
export const SAVED_REPORTS = ['monthly_sales', 'outstanding'];

// A refusal as data: the ApiError a service throws
const refuse = (code, message, meta = {}) => ({ code, message, meta });

// Statuses the admin has decided on (approved and after, or declined): the decline rate's whole
const DECIDED = ['approved', 'downpayment_paid', 'confirmed', 'completed', 'declined'];
// Bookings whose balance the customer owes: approved and after (a pending request has only an estimate)
const OWING = ['approved', 'downpayment_paid', 'confirmed', 'completed'];
// Bookings that ended before the event: not counted as booked
const ENDED = ['declined', 'cancelled'];

// Plain text order (code units), for dates written YYYY-MM-DD, times written HH:MM and refs
const textOrder = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Sum of the amounts of a list of payments or refunds
const sum = (list) => list.reduce((total, item) => total + item.amount, 0);

// The customer or package with this id, or undefined
const byId = (list, id) => list.find((item) => item.id === id);

/** A refusal for a range the Reports page does not offer (REPORT_RANGES), or null. */
export const rangeProblem = (range) => (REPORT_RANGES.includes(range) ? null : refuse('INVALID', 'Unknown report range.', { field: 'range' }));

/** A refusal for a saved report that does not exist (SAVED_REPORTS), or null. */
export const savedReportProblem = (kind) => (SAVED_REPORTS.includes(kind) ? null : refuse('INVALID', 'Unknown report.'));

// Is a date (YYYY-MM-DD) inside the report range? this_year, last_year, last_12 (this month and the eleven before it), or all
function inRange(iso, range) {
  const date = parseISODate(iso);
  const now = parseISODate(todayISO());
  if (range === 'this_year') return date.getFullYear() === now.getFullYear();
  if (range === 'last_year') return date.getFullYear() === now.getFullYear() - 1;
  if (range === 'last_12') {
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    return date >= start && date <= new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }
  return true;
}

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

/**
 * Everything the admin Dashboard shows (getDashboardSummary):
 *   eventsToday         approved to confirmed events on today's date, earliest start first: each full
 *                       reservation record with customerName, packageName and its financials()
 *   pending             requests waiting for review, newest first: { ref, eventName, occasion, date,
 *                       guests, createdAt, customerName, packageName }
 *   pendingOldestDays   whole days since the oldest waiting request came in (0 when there is none)
 *   unverifiedPayments  payments waiting for verification
 *   revenueThisMonth    payments verified this month less refunds sent this month
 *   upcoming            the next 5 approved to confirmed events after today: { ref, eventName, date,
 *                       startTime, guests, status }, soonest first (on one day, the earlier start first)
 */
export function dashboardSummary(data) {
  const today = todayISO();
  const now = parseISODate(today);

  // Approved/confirmed events happening today, earliest start first (the same start: by ref)
  const eventsToday = data.reservations
    .filter((r) => r.date === today && HOLDS_DATE.includes(r.status))
    .map((r) => {
      const customer = byId(data.customers, r.customerId);
      const pkg = byId(data.packages, r.packageId);
      return { ...r, customerName: customer ? customer.name : '', packageName: pkg ? pkg.name : '', ...financials(r, data.payments, data.refunds) };
    })
    .sort((a, b) => textOrder(a.startTime, b.startTime) || textOrder(a.ref, b.ref));

  // Requests waiting for review, newest first (requested at the same moment: by ref, as the reservation lists)
  const pending = data.reservations
    .filter((r) => r.status === 'pending')
    .sort((a, b) => b.createdAt - a.createdAt || textOrder(a.ref, b.ref))
    .map((r) => ({
      ref: r.ref,
      eventName: r.eventName,
      occasion: r.occasion,
      date: r.date,
      guests: r.guests,
      createdAt: r.createdAt,
      customerName: (byId(data.customers, r.customerId) || {}).name,
      packageName: (byId(data.packages, r.packageId) || {}).name
    }));

  // Payments verified in the current month, less refunds sent in it
  const thisMonth = (d) => d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  const revenueThisMonth =
    sum(data.payments.filter((p) => p.status === 'verified' && thisMonth(new Date(p.verifiedAt)))) - sum(data.refunds.filter((r) => thisMonth(parseISODate(r.sentOn))));

  // Next 5 approved events after today (the same day: the earlier start, then by ref)
  const upcoming = data.reservations
    .filter((r) => HOLDS_DATE.includes(r.status) && r.date > today)
    .sort((a, b) => textOrder(a.date, b.date) || textOrder(a.startTime, b.startTime) || textOrder(a.ref, b.ref))
    .slice(0, 5)
    .map((r) => ({ ref: r.ref, eventName: r.eventName, date: r.date, startTime: r.startTime, guests: r.guests, status: r.status }));

  return {
    eventsToday,
    pending,
    // Never below 0: a request stamped later today (the sample data does this) is "from today", not "-1 days ago"
    pendingOldestDays: pending.reduce((oldest, p) => Math.max(oldest, Math.floor((Date.now() - p.createdAt) / 86400000)), 0),
    unverifiedPayments: data.payments.filter((p) => p.status === 'awaiting').length,
    revenueThisMonth,
    upcoming
  };
}

/**
 * The Reports page's figures for a range (getReport; check the range with rangeProblem first):
 *   eventsServed     completed events dated in the range
 *   revenue          payments verified in the range less refunds sent in it (net)
 *   refunds          what was returned to customers in the range, shown on its own
 *   averagePerEvent  the completed events' totals (financials().total) ÷ their number, rounded
 *   declineRate      declined ÷ decided (approved and after, or declined), in whole percent
 *   revenueBy        'month', or 'year' for "All time"
 *   revenueChart     the same net per month, or per year from the first payment or refund to this year;
 *                    a month with more refunds than payments is below 0
 *   packageCounts    bookings per package (not declined or cancelled), most booked first
 */
export function report(data, range) {
  // "decided" = requests the admin has approved or declined; used for the decline rate
  const completed = data.reservations.filter((r) => r.status === 'completed' && inRange(r.date, range));
  const decided = data.reservations.filter((r) => DECIDED.includes(r.status) && inRange(r.date, range));
  const declined = decided.filter((r) => r.status === 'declined');

  // Revenue = verified payments in range less refunds sent in range; average per event uses completed events' totals
  const verified = data.payments.filter((p) => p.status === 'verified' && inRange(toISODate(new Date(p.verifiedAt)), range));
  const returned = data.refunds.filter((r) => inRange(r.sentOn, range));
  const refunds = sum(returned);
  const revenue = sum(verified) - refunds;
  const completedRevenue = completed.reduce((total, r) => total + financials(r, data.payments, data.refunds).total, 0);

  // Revenue chart: one bar per month, or one per year for "All time" (from the first payment or refund to this year)
  const revenueBy = range === 'all' ? 'year' : 'month';
  const sumWhere = (test) => sum(verified.filter((p) => test(new Date(p.verifiedAt)))) - sum(returned.filter((r) => test(parseISODate(r.sentOn))));
  let revenueChart;
  if (revenueBy === 'year') {
    const thisYear = parseISODate(todayISO()).getFullYear();
    const years = [...verified.map((p) => new Date(p.verifiedAt).getFullYear()), ...returned.map((r) => parseISODate(r.sentOn).getFullYear())];
    // Never after this year, so the chart always ends on it (and a long list needs no spread into Math.min)
    const firstYear = years.reduce((first, year) => Math.min(first, year), thisYear);
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

  // Bookings per package, most booked first; packages booked equally often keep the catalogue's order
  const packageCounts = data.packages
    .map((pkg) => ({
      name: pkg.name,
      count: data.reservations.filter((r) => r.packageId === pkg.id && !ENDED.includes(r.status) && inRange(r.date, range)).length
    }))
    .sort((a, b) => b.count - a.count);

  return {
    range,
    eventsServed: completed.length,
    revenue,
    refunds,
    averagePerEvent: completed.length ? Math.round(completedRevenue / completed.length) : 0,
    declineRate: decided.length ? Math.round((declined.length / decided.length) * 100) : 0,
    revenueBy,
    revenueChart,
    packageCounts
  };
}

/**
 * A saved report's rows for a range (runSavedReport; check the range and the kind first), shaped for the
 * on-screen table and the TXT export: { title, money (the columns that are amounts), rows }. Each row's
 * keys are its columns, in order.
 *   monthly_sales  one row per month of the range: payments verified, split by method, their total, the
 *                  refunds sent that month and the net ("All time": every month from the first payment
 *                  or refund, so the rows add up to everything counted)
 *   outstanding    approved bookings and after that still owe money (financials().balance), by event
 *                  date, then ref; the range does not apply (a balance is owed whenever the event is)
 * Returns null for a kind that is not in SAVED_REPORTS.
 */
export function savedReport(data, kind, range) {
  const customerName = (id) => (byId(data.customers, id) || {}).name || '';

  // Monthly sales: one row per month with the payments split by method, then the refunds sent that month and the net
  if (kind === 'monthly_sales') {
    const verified = data.payments.filter((p) => p.status === 'verified' && inRange(toISODate(new Date(p.verifiedAt)), range));
    const returned = data.refunds.filter((r) => inRange(r.sentOn, range));
    // "All time" lists every month from the first payment or refund, so the rows add up to everything counted
    const rows = monthBuckets(range, [...verified.map((p) => toISODate(new Date(p.verifiedAt))), ...returned.map((r) => r.sentOn)]).map(({ year, month }) => {
      const sameMonth = (d) => d.getFullYear() === year && d.getMonth() === month;
      const inMonth = verified.filter((p) => sameMonth(new Date(p.verifiedAt)));
      const refunded = sum(returned.filter((r) => sameMonth(parseISODate(r.sentOn))));
      const byMethod = (method) => sum(inMonth.filter((p) => p.method === method));
      return {
        Month: `${MONTH_NAMES[month]} ${year}`,
        Payments: inMonth.length,
        [PAYMENT_METHODS.qrph]: byMethod('qrph'),
        [PAYMENT_METHODS.bank]: byMethod('bank'),
        [PAYMENT_METHODS.cash]: byMethod('cash'),
        Total: sum(inMonth),
        Refunds: refunded,
        Net: sum(inMonth) - refunded
      };
    });
    return { title: 'Monthly sales summary', money: [PAYMENT_METHODS.qrph, PAYMENT_METHODS.bank, PAYMENT_METHODS.cash, 'Total', 'Refunds', 'Net'], rows };
  }

  // Outstanding balances: approved bookings that still owe money, by event date (the same date: by ref)
  if (kind === 'outstanding') {
    const rows = data.reservations
      .filter((r) => OWING.includes(r.status))
      .map((r) => ({ r, ...financials(r, data.payments, data.refunds) }))
      .filter((m) => m.balance > 0)
      .sort((a, b) => textOrder(a.r.date, b.r.date) || textOrder(a.r.ref, b.r.ref))
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

  return null;
}
