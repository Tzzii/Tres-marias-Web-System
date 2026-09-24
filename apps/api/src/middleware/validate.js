import { ApiError } from '../lib/ApiError.js';

/**
 * Check a request against zod schemas before the route runs, e.g.
 *   router.post('/login', validate({ body: schemas.customerLogin }), handler)
 * Any of `params`, `query` and `body` can be given. The parsed values (defaults filled in, keys the
 * schema does not list removed) are put on req.valid.params / .query / .body, and routes read only
 * those: a field someone added to the request (a customerId, a role) never reaches a service.
 * The first problem becomes 400 INVALID with its message and meta.field, the same shape the forms
 * already show under an input.
 */
export const validate = (schemas) => (req, res, next) => {
  req.valid = {};
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    // A POST without a body leaves req.body undefined in Express 5: check it as an empty object
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
