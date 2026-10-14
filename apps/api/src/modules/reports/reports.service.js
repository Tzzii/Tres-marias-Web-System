import {
  dashboardSummary,
  rangeProblem,
  report,
  savedReport,
  savedReportProblem
} from '@tm/shared/src/domain/reports.js';
import { tx } from '../../db.js';
import { ApiError } from '../../lib/ApiError.js';
import { findReservations } from '../reservations/reservations.repo.js';
import * as repo from './reports.repo.js';


const toError = ({ code, message, meta }) => new ApiError(code, message, meta);

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

export async function getDashboardSummary() {
  return dashboardSummary(await records());
}

export async function getReport(range = 'this_year') {
  const problem = rangeProblem(range);
  if (problem) throw toError(problem);
  return report(await records(), range);
}

export async function runSavedReport(kind, range = 'this_year') {
  const problem = rangeProblem(range) || savedReportProblem(kind);
  if (problem) throw toError(problem);
  return savedReport(await records(), kind, range);
}
