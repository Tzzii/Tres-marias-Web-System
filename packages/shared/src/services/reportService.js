import { dashboardSummary, rangeProblem, report, savedReport, savedReportProblem } from '../domain/reports.js';
import { ApiError, clone, latency, read } from './store.js';

/**
 * Dashboard counters and the Reports page, on the browser store. Every figure is computed from the
 * reservation, payment and refund records, so charts move as bookings are completed, payments verified
 * and refunds recorded. Money in is verified payments, counted in the month they were verified, less
 * refunds, counted in the month they were sent (`sentOn`).
 *
 * The figures come from domain/reports.js, the same code the API server runs
 * (apps/api/src/modules/reports, Phase 11), so both versions give the same numbers and errors; this file
 * only reads the browser store.
 */

// A refusal from domain/reports.js as the error the pages already handle
const toError = ({ code, message, meta }) => new ApiError(code, message, meta);

/** Everything the admin dashboard shows (dashboardSummary). A copy, like an API answer: today's events carry whole records. */
export async function getDashboardSummary() {
  await latency(200, 450);
  return clone(dashboardSummary(read()));
}

/**
 * Reports page figures for a date range (report): `revenue` and `revenueChart` are net, verified payments
 * less the refunds sent in the same period; `refunds` is the total returned in the range, shown on its own.
 * A range the page does not offer is INVALID ("Unknown report range.").
 */
export async function getReport(range = 'this_year') {
  await latency(250, 550);
  const problem = rangeProblem(range);
  if (problem) throw toError(problem);
  return report(read(), range);
}

/**
 * Rows for the saved reports (monthly_sales or outstanding), shaped for both on-screen tables and TXT
 * export (savedReport). The range is checked first, then the report's name ("Unknown report.").
 */
export async function runSavedReport(kind, range = 'this_year') {
  await latency(300, 650);
  const problem = rangeProblem(range) || savedReportProblem(kind);
  if (problem) throw toError(problem);
  return savedReport(read(), kind, range);
}
