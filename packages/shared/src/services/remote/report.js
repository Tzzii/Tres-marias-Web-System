import { rangeProblem, savedReportProblem } from '../../domain/reports.js';
import { ApiError } from '../errors.js';
import { http } from '../http.js';

/**
 * The dashboard and reports on the API (apps/api/src/modules/reports, endpoint map in
 * docs/backend-development-phases.md §9.11). Same function names, arguments, return shapes and ApiError
 * codes as the browser version (reportService.js), so no page changes when VITE_API_SERVICES includes
 * "reports" (see facade/report.js): both work the figures out with domain/reports.js, the API from the
 * database. Admin only: the three addresses are under /api/admin. All three are reads, so they send no
 * change event; the pages reload them on every change the poller reports (services/poller.js).
 * The TXT exports stay in the admin page (apps/admin/src/lib/txt.js).
 */

// A refusal from domain/reports.js as the error the pages already handle
const toError = ({ code, message, meta }) => new ApiError(code, message, meta);

/** Everything the admin dashboard shows: today's events, waiting requests, payments to verify, revenue this month, what's next. */
export const getDashboardSummary = () => http.get('/admin/reports/dashboard');

/**
 * Reports page figures for a range ('this_year' when not given). A range the page does not offer is
 * refused here with the browser version's error, the same one the server gives.
 */
export async function getReport(range = 'this_year') {
  const problem = rangeProblem(range);
  if (problem) throw toError(problem);
  return http.get(`/admin/reports?range=${encodeURIComponent(range)}`);
}

/**
 * A saved report's rows (monthly_sales or outstanding) for a range. The range, then the report's name,
 * are checked here first, in the browser version's order: an empty name has no address to ask.
 */
export async function runSavedReport(kind, range = 'this_year') {
  const problem = rangeProblem(range) || savedReportProblem(kind);
  if (problem) throw toError(problem);
  return http.get(`/admin/reports/saved/${encodeURIComponent(kind)}?range=${encodeURIComponent(range)}`);
}
