// Public face of the report service (dashboard and reports): pages import it through reportApi (@tm/shared).
// Each call goes to the browser-store version or the API version, chosen once at startup (backend.js).
import * as local from '../reportService.js';
import * as remote from '../remote/report.js';
import { pickImpl } from '../backend.js';

// The API version since Phase 11 (services/remote/report.js), when VITE_API_SERVICES includes "reports"
const impl = pickImpl('reports', local, remote);

export const getDashboardSummary = (...a) => impl.getDashboardSummary(...a);
export const getReport = (...a) => impl.getReport(...a);
export const runSavedReport = (...a) => impl.runSavedReport(...a);
