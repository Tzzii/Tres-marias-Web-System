import { ApiError } from '../lib/ApiError.js';

export const validate = (schemas) => (req, res, next) => {
  req.valid = {};
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue.path.length ? String(issue.path[0]) : null;
      return next(new ApiError('INVALID', issue.message, field ? { field } : {}));
    }
    req.valid[part] = result.data;
  }
  return next();
};
