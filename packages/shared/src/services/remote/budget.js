import { http } from '../http.js';

/** Explicit generation only. Proposal snapshots do not trigger global booking/catalog change events. */
export const reviewBudget = (context) => http.post('/budget-proposals', context, { quiet: true });
