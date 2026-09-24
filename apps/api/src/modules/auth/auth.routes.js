import express from 'express';
import { authLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as schemas from './auth.schemas.js';
import * as auth from './auth.service.js';

/**
 * The auth endpoints (docs/backend-development-phases.md §9.1): URL, guard and request shape only;
 * the rules are in auth.service.js. Three routers, mounted by app.js:
 *   authRoutes             /api/auth       no token; every route has the strict 5-a-minute limit
 *   customerAccountRoutes  /api/me         behind requireAuth + requireRole('customer')
 *   adminAccountRoutes     /api/admin/me   behind the admin router's guard (requireAuth + requireRole('admin'))
 * The account an /me route works on is always req.user.id, from the token: never an id from the page.
 */

/* ============================ /api/auth (no token) ============================ */

export const authRoutes = express.Router();

// Customer log in and sign up: a { token, user } session
authRoutes.post('/customer/login', authLimiter, validate({ body: schemas.customerLogin }), async (req, res) => {
  res.json(await auth.customerLogin(req.valid.body));
});
authRoutes.post('/customer/register', authLimiter, validate({ body: schemas.customerRegister }), async (req, res) => {
  res.status(201).json(await auth.customerRegister(req.valid.body));
});

// Forgot password: start (texts a code), resend, verify the code, then save the new password
authRoutes.post('/customer/password-reset', authLimiter, validate({ body: schemas.passwordResetStart }), async (req, res) => {
  res.json(await auth.startPasswordReset(req.valid.body));
});
authRoutes.post('/customer/password-reset/:id/resend', authLimiter, validate({ params: schemas.passwordResetParams }), async (req, res) => {
  res.json(await auth.resendPasswordResetCode(req.valid.params.id));
});
authRoutes.post(
  '/customer/password-reset/:id/verify',
  authLimiter,
  validate({ params: schemas.passwordResetParams, body: schemas.passwordResetVerify }),
  async (req, res) => {
    res.json(await auth.verifyPasswordResetCode({ challengeId: req.valid.params.id, code: req.valid.body.code }));
  }
);
authRoutes.post(
  '/customer/password-reset/:id/complete',
  authLimiter,
  validate({ params: schemas.passwordResetParams, body: schemas.passwordResetComplete }),
  async (req, res) => {
    res.json(await auth.completePasswordReset({ challengeId: req.valid.params.id, password: req.valid.body.password }));
  }
);

// Admin sign-in: password (emails a code), resend the code, verify it (records the device from User-Agent)
authRoutes.post('/admin/start', authLimiter, validate({ body: schemas.adminStart }), async (req, res) => {
  res.json(await auth.adminStartSignIn(req.valid.body));
});
authRoutes.post('/admin/resend', authLimiter, validate({ body: schemas.adminResend }), async (req, res) => {
  res.json(await auth.adminResendCode(req.valid.body.challengeId));
});
authRoutes.post('/admin/verify', authLimiter, validate({ body: schemas.adminVerify }), async (req, res) => {
  res.json(await auth.adminVerifyCode(req.valid.body, req.get('User-Agent') || ''));
});

/* ============================ /api/me (signed-in customer) ============================ */

export const customerAccountRoutes = express.Router();

customerAccountRoutes.get('/', async (req, res) => {
  res.json(await auth.getCustomerProfile(req.user.id));
});
customerAccountRoutes.patch('/', validate({ body: schemas.customerProfile }), async (req, res) => {
  res.json(await auth.updateCustomerProfile(req.user.id, req.valid.body));
});
// Returns { ok, token }: the new token keeps this session going after the password change
customerAccountRoutes.post('/password', validate({ body: schemas.passwordChange }), async (req, res) => {
  res.json(await auth.changeCustomerPassword(req.user, req.valid.body));
});

/* ============================ /api/admin/me (signed-in admin) ============================ */

export const adminAccountRoutes = express.Router();

adminAccountRoutes.get('/', async (req, res) => {
  res.json(await auth.getAdminProfile(req.user.id));
});
adminAccountRoutes.patch('/', validate({ body: schemas.adminProfile }), async (req, res) => {
  res.json(await auth.updateAdminProfile(req.user.id, req.valid.body));
});
adminAccountRoutes.post('/password', validate({ body: schemas.passwordChange }), async (req, res) => {
  res.json(await auth.changeAdminPassword(req.user.id, req.valid.body));
});

// Email / mobile change: start (password + emails a code), resend, confirm with the code
adminAccountRoutes.post('/contact/start', validate({ body: schemas.contactStart }), async (req, res) => {
  res.json(await auth.adminStartContactChange(req.user.id, req.valid.body));
});
adminAccountRoutes.post('/contact/resend', validate({ body: schemas.contactResend }), async (req, res) => {
  res.json(await auth.adminResendContactCode(req.user.id, req.valid.body.challengeId));
});
adminAccountRoutes.post('/contact/confirm', validate({ body: schemas.contactConfirm }), async (req, res) => {
  res.json(await auth.adminConfirmContactChange(req.user.id, req.valid.body));
});
