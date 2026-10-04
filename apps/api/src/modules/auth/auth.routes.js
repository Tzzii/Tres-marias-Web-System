import express from 'express';
import { optionalAuth } from '../../middleware/auth.js';
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
 * Every customer code goes by email (Phase 12): sign-up, forgot password and the password change.
 */

/* ============================ /api/auth (no token) ============================ */

export const authRoutes = express.Router();

// Customer log in: a { token, user } session
authRoutes.post('/customer/login', authLimiter, validate({ body: schemas.customerLogin }), async (req, res) => {
  res.json(await auth.customerLogin(req.valid.body));
});

// Sign-up (Phase 12): the form (emails a code to the new address; no account yet), resend the code,
// then the code, which creates the account (201) and returns its { token, user } session
authRoutes.post('/customer/register', authLimiter, validate({ body: schemas.customerRegister }), async (req, res) => {
  res.json(await auth.startSignUp(req.valid.body));
});
authRoutes.post('/customer/register/:id/resend', authLimiter, validate({ params: schemas.requestParams }), async (req, res) => {
  res.json(await auth.resendSignUpCode(req.valid.params.id));
});
authRoutes.post('/customer/register/:id/verify', authLimiter, validate({ params: schemas.requestParams, body: schemas.codeBody }), async (req, res) => {
  res.status(201).json(await auth.confirmSignUp({ challengeId: req.valid.params.id, code: req.valid.body.code }));
});

// Forgot password: start (emails a code), resend, verify the code, then save the new password
authRoutes.post('/customer/password-reset', authLimiter, validate({ body: schemas.passwordResetStart }), async (req, res) => {
  res.json(await auth.startPasswordReset(req.valid.body));
});
authRoutes.post('/customer/password-reset/:id/resend', authLimiter, validate({ params: schemas.requestParams }), async (req, res) => {
  res.json(await auth.resendPasswordResetCode(req.valid.params.id));
});
authRoutes.post(
  '/customer/password-reset/:id/verify',
  authLimiter,
  validate({ params: schemas.requestParams, body: schemas.codeBody }),
  async (req, res) => {
    res.json(await auth.verifyPasswordResetCode({ challengeId: req.valid.params.id, code: req.valid.body.code }));
  }
);
// optionalAuth: a reset finished from My profile ("Forgot your current password?") carries the customer's
// session, and gets a new token for it in the answer; from the Log in page there is none (no token needed)
authRoutes.post(
  '/customer/password-reset/:id/complete',
  authLimiter,
  optionalAuth,
  validate({ params: schemas.requestParams, body: schemas.passwordResetComplete }),
  async (req, res) => {
    res.json(await auth.completePasswordReset({ challengeId: req.valid.params.id, password: req.valid.body.password }, req.user || null));
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
// The screen locked after inactivity: { ticket, password } -> a new session, no emailed code (wrong passwords count as sign-in failures)
authRoutes.post('/admin/unlock', authLimiter, validate({ body: schemas.adminUnlock }), async (req, res) => {
  res.json(await auth.adminUnlock(req.valid.body));
});

/* ============================ /api/me (signed-in customer) ============================ */

export const customerAccountRoutes = express.Router();

customerAccountRoutes.get('/', async (req, res) => {
  res.json(await auth.getCustomerProfile(req.user.id));
});
customerAccountRoutes.patch('/', validate({ body: schemas.customerProfile }), async (req, res) => {
  res.json(await auth.updateCustomerProfile(req.user.id, req.valid.body));
});
// Accept the current Terms of Service and Privacy Policy: { version } -> the customer's details (with termsVersion)
customerAccountRoutes.post('/terms', validate({ body: schemas.termsBody }), async (req, res) => {
  res.json(await auth.acceptTerms(req.user.id, req.valid.body));
});

// Password change (Phase 12): the current and new password (emails a code), resend the code, then the
// code, which saves the new password and returns { ok, token }: the new token keeps this session going
customerAccountRoutes.post('/password', validate({ body: schemas.passwordChange }), async (req, res) => {
  res.json(await auth.startPasswordChange(req.user.id, req.valid.body));
});
customerAccountRoutes.post('/password/:id/resend', validate({ params: schemas.requestParams }), async (req, res) => {
  res.json(await auth.resendPasswordChangeCode(req.user.id, req.valid.params.id));
});
customerAccountRoutes.post('/password/:id/confirm', validate({ params: schemas.requestParams, body: schemas.codeBody }), async (req, res) => {
  res.json(await auth.confirmPasswordChange(req.user, { challengeId: req.valid.params.id, code: req.valid.body.code }));
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
