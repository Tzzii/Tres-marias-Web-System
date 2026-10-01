import { dashboardSummary, rangeProblem, report, savedReport, savedReportProblem } from '@tm/shared/src/domain/reports.js';
import { tx } from '../../db.js';
import { ApiError } from '../../lib/ApiError.js';
import { findReservations } from '../reservations/reservations.repo.js';
import * as repo from './reports.repo.js';

/**
 * The admin Dashboard and the Reports page on the server (docs/backend-development-phases.md Phase 11,
 * §9.11): the dashboard summary, the figures for a date range and the two saved reports. Same return
 * shapes, error codes and messages as the browser version (reportService.js), because both work the
 * figures out with @tm/shared/src/domain/reports.js (and financials() in domain/money.js, so the money
 * matches the Customers and Payments pages): revenue net of refunds, the decline rate, the average per
 * event, bookings per package, outstanding balances. Only the computed figures leave the server, never the
 * raw records behind them (apart from today's events, which the dashboard shows in full).
 *
 * The plan's first idea was GROUP BY in SQL; the figures are computed by the shared rules instead (§4.1),
 * so they cannot drift from the browser version or from financials(), and the SQL only reads the records.
 * Admin only: the routes sit behind the admin router's guard. Reads only: nothing is written or locked.
 */

// A refusal from domain/reports.js as an ApiError
const toError = ({ code, message, meta }) => new ApiError(code, message, meta);

/**
 * Every record the figures are worked out from, in the browser store's shape ({ reservations, payments,
 * refunds, customers, packages }), read in one transaction so they form one consistent snapshot (a
 * payment verified halfway through is either in every figure or in none). Every payment and refund
 * belongs to a reservation (foreign keys), so the bookings' own lists hold them all.
 */
async function records() {
  return tx(async (conn) => {
    const bookings = await findReservations(conn);
    const customers = await repo.findCustomerNames(conn);
    const packages = await repo.findPackageNames(conn);
    return {
      reservations: bookings.map((b) => b.reservation),
      payments: bookings.flatMap((b) => b.payments),
      refunds: bookings.flatMap((b) => b.refunds),
      customers,
      packages
    };
  });
}

/** Admin: everything the Dashboard shows (dashboardSummary). */
export async function getDashboardSummary() {
  return dashboardSummary(await records());
}

/** Admin: the Reports page's figures for a range (report). An unknown range is INVALID ("Unknown report range."). */
export async function getReport(range = 'this_year') {
  const problem = rangeProblem(range);
  if (problem) throw toError(problem);
  return report(await records(), range);
}

/**
 * Admin: a saved report's rows for a range (savedReport): monthly_sales or outstanding. The range is checked
 * first, then the report's name (INVALID "Unknown report."), as in the browser version.
 */
export async function runSavedReport(kind, range = 'this_year') {
  const problem = rangeProblem(range) || savedReportProblem(kind);
  if (problem) throw toError(problem);
  return savedReport(await records(), kind, range);
}
