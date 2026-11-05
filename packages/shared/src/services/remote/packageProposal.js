import { http } from '../http.js';

const path = (id) => `/package-proposals/${encodeURIComponent(id)}`;
export const generate = (body) => http.post('/package-proposals', body, { quiet: true });
export const get = (id) => http.get(path(id));
export const select = (id, revision, optionId) =>
  http.post(`${path(id)}/select`, { revision, optionId }, { quiet: true });
export const getRules = () => http.get('/admin/package-proposal-rules');
export const saveRules = (rules) => http.put('/admin/package-proposal-rules', { rules });
