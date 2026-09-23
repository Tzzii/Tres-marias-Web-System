// Public face of the report service (dashboard and reports): pages import it through reportApi (@tm/shared).
// Each call goes to the browser-store version or the API version, chosen once at startup (backend.js).
import * as local from '../reportService.js';
import { pickImpl } from '../backend.js';

// The API version arrives in Phase 11 (services/remote/report.js); until then the browser store answers
const impl = pickImpl('reports', local);

export const getDashboardSummary = (...a) => impl.getDashboardSummary(...a);
export const getReport = (...a) => impl.getReport(...a);
export const runSavedReport = (...a) => impl.runSavedReport(...a);
