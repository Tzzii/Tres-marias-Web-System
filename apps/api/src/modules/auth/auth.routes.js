import express from 'express';
import { optionalAuth } from '../../middleware/auth.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as schemas from './auth.schemas.js';
import * as auth from './auth.service.js';
import { createGoogleRoutes } from './google.routes.js';



export const authRoutes = express.Router();
authRoutes.use(createGoogleRoutes());

authRoutes.post('/customer/login', authLimiter, validate({ body: schemas.customerLogin }), async (req, res) => {
  res.json(await auth.customerLogin(req.valid.body));
});

authRoutes.post('/customer/register', authLimiter, validate({ body: schemas.customerRegister }), async (req, res) => {
  res.json(await auth.startSignUp(req.valid.body));
});
authRoutes.post(
  '/customer/register/:id/resend',
  authLimiter,
  validate({ params: schemas.requestParams }),
  async (req, res) => {
    res.json(await auth.resendSignUpCode(req.valid.params.id));
  }
);
authRoutes.post(
  '/customer/register/:id/verify',
  authLimiter,
  validate({ params: schemas.requestParams, body: schemas.signupCodeBody }),
  async (req, res) => {
    res.status(201).json(await auth.confirmSignUp({ challengeId: req.valid.params.id, ...req.valid.body }));
  }
);

authRoutes.post(
  '/customer/password-reset',
  authLimiter,
  validate({ body: schemas.passwordResetStart }),
  async (req, res) => {
    res.json(await auth.startPasswordReset(req.valid.body));
  }
);
authRoutes.post(
  '/customer/password-reset/:id/resend',
  authLimiter,
  validate({ params: schemas.requestParams }),
  async (req, res) => {
    res.json(await auth.resendPasswordResetCode(req.valid.params.id));
  }
);
authRoutes.post(
  '/customer/password-reset/:id/verify',
  authLimiter,
  validate({ params: schemas.requestParams, body: schemas.codeBody }),
  async (req, res) => {
    res.json(await auth.verifyPasswordResetCode({ challengeId: req.valid.params.id, code: req.valid.body.code }));
  }
);
authRoutes.post(
  '/customer/password-reset/:id/complete',
  authLimiter,
  optionalAuth,
  validate({ params: schemas.requestParams, body: schemas.passwordResetComplete }),
  async (req, res) => {
    res.json(
      await auth.completePasswordReset(
        { challengeId: req.valid.params.id, password: req.valid.body.password },
        req.user || null
      )
    );
  }
);

authRoutes.post('/admin/start', authLimiter, validate({ body: schemas.adminStart }), async (req, res) => {
  res.json(await auth.adminStartSignIn(req.valid.body));
});
authRoutes.post('/admin/resend', authLimiter, validate({ body: schemas.adminResend }), async (req, res) => {
  res.json(await auth.adminResendCode(req.valid.body.challengeId));
});
authRoutes.post('/admin/verify', authLimiter, validate({ body: schemas.adminVerify }), async (req, res) => {
  res.json(await auth.adminVerifyCode(req.valid.body, req.get('User-Agent') || ''));
});
authRoutes.post('/admin/unlock', authLimiter, validate({ body: schemas.adminUnlock }), async (req, res) => {
  res.json(await auth.adminUnlock(req.valid.body));
});


export const customerAccountRoutes = express.Router();

customerAccountRoutes.get('/', async (req, res) => {
  res.json(await auth.getCustomerProfile(req.user.id));
});
customerAccountRoutes.patch('/', validate({ body: schemas.customerProfile }), async (req, res) => {
  res.json(await auth.updateCustomerProfile(req.user.id, req.valid.body));
});
customerAccountRoutes.post('/terms', validate({ body: schemas.termsBody }), async (req, res) => {
  res.json(await auth.acceptTerms(req.user.id, req.valid.body));
});

customerAccountRoutes.post('/email', validate({ body: schemas.customerEmailChange }), async (req, res) => {
  res.json(await auth.startCustomerEmailChange(req.user.id, req.valid.body));
});
customerAccountRoutes.post('/email/:id/resend', validate({ params: schemas.requestParams }), async (req, res) => {
  res.json(await auth.resendCustomerEmailChangeCode(req.user.id, req.valid.params.id));
});
customerAccountRoutes.post(
  '/email/:id/confirm',
  validate({ params: schemas.requestParams, body: schemas.codeBody }),
  async (req, res) => {
    res.json(
      await auth.confirmCustomerEmailChange(req.user.id, {
        challengeId: req.valid.params.id,
        code: req.valid.body.code
      })
    );
  }
);

customerAccountRoutes.post('/password', validate({ body: schemas.passwordChange }), async (req, res) => {
  res.json(await auth.startPasswordChange(req.user.id, req.valid.body));
});
customerAccountRoutes.post('/password/:id/resend', validate({ params: schemas.requestParams }), async (req, res) => {
  res.json(await auth.resendPasswordChangeCode(req.user.id, req.valid.params.id));
});
customerAccountRoutes.post(
  '/password/:id/confirm',
  validate({ params: schemas.requestParams, body: schemas.codeBody }),
  async (req, res) => {
    res.json(
      await auth.confirmPasswordChange(req.user, { challengeId: req.valid.params.id, code: req.valid.body.code })
    );
  }
);


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

adminAccountRoutes.post('/contact/start', validate({ body: schemas.contactStart }), async (req, res) => {
  res.json(await auth.adminStartContactChange(req.user.id, req.valid.body));
});
adminAccountRoutes.post('/contact/resend', validate({ body: schemas.contactResend }), async (req, res) => {
  res.json(await auth.adminResendContactCode(req.user.id, req.valid.body.challengeId));
});
adminAccountRoutes.post('/contact/confirm', validate({ body: schemas.contactConfirm }), async (req, res) => {
  res.json(await auth.adminConfirmContactChange(req.user.id, req.valid.body));
});
