import { http } from '../http.js';

/** Read aggregate admin telemetry only; this never calls the AI provider. */
export const getUsage = () => http.get('/admin/ai-usage');
