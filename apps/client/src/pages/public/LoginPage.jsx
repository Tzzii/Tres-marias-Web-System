import { useEffect, useState } from 'react';
import { Link as RouterLink, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined';
import {
  AlertBanner,
  AppDialog,
  BusyButton,
  FormField,
  OtpInput,
  PasswordField,
  RULES,
  authApi,
  formatCountdown,
  safeNextPath,
  shakeSx,
  tokens,
  useCountdown,
  useDocumentTitle,
  validateEmail,
  validatePassword
} from '@tm/shared';
import Button from '@mui/material/Button';
import { useAuth } from '../../auth.js';
import AuthLayout, { BookingIntentBanner, FormCard, useCardFlip } from '../../components/AuthLayout.jsx';
import { readIntent } from '../../lib/booking.js';

// Storage key for the email saved by "Remember me"
const REMEMBERED_EMAIL = 'tm.client.rememberedEmail';

/** 1e · Log in. Same screen from the nav or the gate; only the destination differs. */
export default function LoginPage() {
  useDocumentTitle('Log in');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isAuthenticated, signIn } = useAuth();

  // Page to open after login (?next=...). safeNextPath blocks links to other websites.
  const next = safeNextPath(params.get('next'), '/portal');
  // Coming from "Reserve this date": show the saved booking banner
  const continuingBooking = next.startsWith('/portal/book');
  const intent = continuingBooking ? readIntent() : null;

  // Start with the remembered email, if any
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem(REMEMBERED_EMAIL) || '';
    } catch (e) {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() => Boolean(email));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  // If this email is currently locked out, when the lock ends
  const [lockedUntil, setLockedUntil] = useState(() => authApi.getLockout('customer', email));
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetDone, setResetDone] = useState(false); // shows "Password changed" after a reset
  // "Sign up" flips the card over to the sign-up page (keeps the booking the visitor started)
  const { flipping, flipTo } = useCardFlip();
  const signupPath = continuingBooking ? '/signup?continue=booking' : '/signup';
  // Seconds left on the lockout
  const lockSeconds = useCountdown(lockedUntil);

  // Unlock the form when the countdown finishes
  useEffect(() => {
    if (lockedUntil && lockSeconds === 0) {
      setLockedUntil(null);
      setFormError('');
    }
  }, [lockSeconds, lockedUntil]);

  if (isAuthenticated) return <Navigate to={next} replace />;

  // Validate, log in, save or forget the email for "Remember me", then continue
  const submit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    const emailError = validateEmail(email);
    if (emailError) nextErrors.email = emailError;
    if (!password) nextErrors.password = 'Password is required.';
    setErrors(nextErrors);
    setFormError('');
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    try {
      const result = await authApi.customerLogin({ email, password });
      try {
        if (remember) localStorage.setItem(REMEMBERED_EMAIL, email.trim());
        else localStorage.removeItem(REMEMBERED_EMAIL);
      } catch (e) {
        /* ignore */
      }
      signIn(result, { remember });
      navigate(next, { replace: true });
    } catch (error) {
      setBusy(false);
      setPassword('');
      setShake(true);
      if (error.code === 'LOCKED') {
        setLockedUntil(error.meta.lockedUntil);
        setFormError('');
      } else if (error.code === 'INVALID_CREDENTIALS') {
        // Only warn about the lockout when 2 or fewer attempts are left
        const { remaining } = error.meta;
        setFormError(remaining <= 2 ? `Incorrect email or password. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} left before the account is locked for 5 minutes.` : 'Incorrect email or password.');
      } else {
        setFormError(error.message);
      }
    }
  };

  const locked = Boolean(lockedUntil && lockSeconds > 0);

  return (
    <AuthLayout headline="Welcome to your celebrations." perks={['Follow every reservation from request to event day', 'Pay securely and keep every receipt', 'Message the admin directly']}>
      <FormCard component="form" noValidate onSubmit={submit} shake={shake} flipping={flipping} onAnimationEnd={() => setShake(false)}>
        <Box>
          <Typography component="h1" sx={{ fontSize: 24, fontWeight: 700 }}>
            Log in
          </Typography>
          <Typography sx={{ mt: 0.5, fontSize: 13.5, color: tokens.textSecondary }}>
            {continuingBooking ? "Welcome back. Let's continue your reservation." : 'Welcome back. Sign in to your Tres Marias account.'}
          </Typography>
        </Box>

        {resetDone && !formError && <AlertBanner tone="success">Password changed. Log in with your new password.</AlertBanner>}
        {params.get('reason') === 'idle' && <AlertBanner tone="info">You were signed out after 15 minutes of inactivity. Please log in again.</AlertBanner>}
        <BookingIntentBanner intent={intent} />
        {locked && (
          <AlertBanner tone="locked" title="Account temporarily locked">
            Too many failed attempts. Try again in <b>{formatCountdown(lockSeconds)}</b>.
          </AlertBanner>
        )}
        {formError && !locked && <AlertBanner tone="error">{formError}</AlertBanner>}

        <FormField
          id="login-email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErrors((er) => ({ ...er, email: '' }));
          }}
          // After typing an email, check whether that account is locked
          onBlur={() => setLockedUntil(authApi.getLockout('customer', email))}
          error={errors.email}
          disabled={busy}
        />
        <PasswordField
          id="login-password"
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setErrors((er) => ({ ...er, password: '' }));
          }}
          error={errors.password}
          disabled={busy || locked}
        />

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mt: -0.5 }}>
          <FormControlLabel control={<Checkbox size="small" checked={remember} onChange={(e) => setRemember(e.target.checked)} />} label={<Typography sx={{ fontSize: 13 }}>Remember me</Typography>} />
          <Link component="button" type="button" onClick={() => setForgotOpen(true)} sx={{ fontSize: 13, fontWeight: 600, color: tokens.goldDark }}>
            Forgot password?
          </Link>
        </Box>

        <BusyButton type="submit" size="large" busy={busy} disabled={locked} sx={{ py: 1.3 }}>
          Log in
        </BusyButton>

        <Typography sx={{ textAlign: 'center', fontSize: 13.5, color: tokens.textSecondary }}>
          No account yet?{' '}
          <Link component={RouterLink} to={signupPath} onClick={flipTo(signupPath)} sx={{ fontWeight: 700, color: tokens.goldDark }}>
            Sign up
          </Link>
        </Typography>
      </FormCard>

      <ForgotPasswordDialog
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        initialEmail={email}
        // After the reset: close, fill in the email and ask for the new password
        onDone={(resetEmail) => {
          setForgotOpen(false);
          setEmail(resetEmail);
          setPassword('');
          setFormError('');
          setLockedUntil(null);
          setResetDone(true);
        }}
      />
    </AuthLayout>
  );
}

/**
 * Forgot password, in one dialog:
 * 1. email → checked (format, then that an account uses it) → Proceed
 * 2. the 6-digit code texted to the mobile number on the account → Verify
 * 3. the new password (same rules as sign-up) and its confirmation → Save
 * `onDone(email)` runs after the password is saved.
 */
function ForgotPasswordDialog({ open, onClose, initialEmail, onDone }) {
  const [step, setStep] = useState('email'); // 'email' | 'code' | 'password'
  const [email, setEmail] = useState(initialEmail);
  const [challenge, setChallenge] = useState(null); // { challengeId, maskedMobile, expiresAt, resendAt }
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState('idle'); // idle / error / success colour of the code boxes
  const [attemptsLeft, setAttemptsLeft] = useState(RULES.maxCodeAttempts);
  const [lockedUntil, setLockedUntil] = useState(null); // code entry paused until this time
  const [values, setValues] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({}); // per-field messages
  const [formError, setFormError] = useState(''); // banner message
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  const resendSeconds = useCountdown(challenge ? challenge.resendAt : null);
  const lockSeconds = useCountdown(lockedUntil);
  const locked = Boolean(lockedUntil && lockSeconds > 0);

  // Start over each time the dialog opens, using the email typed on the login form
  useEffect(() => {
    if (open) {
      setStep('email');
      setEmail(initialEmail);
      setChallenge(null);
      setCode('');
      setCodeState('idle');
      setAttemptsLeft(RULES.maxCodeAttempts);
      setLockedUntil(null);
      setValues({ password: '', confirm: '' });
      setErrors({});
      setFormError('');
    }
  }, [open, initialEmail]);

  // When a code lockout ends, allow new attempts
  useEffect(() => {
    if (lockedUntil && lockSeconds === 0) {
      setLockedUntil(null);
      setFormError('');
      setAttemptsLeft(RULES.maxCodeAttempts);
    }
  }, [lockSeconds, lockedUntil]);

  // Back to step 1 with a message, e.g. when the request expired
  const restart = (message) => {
    setStep('email');
    setChallenge(null);
    setCode('');
    setCodeState('idle');
    setFormError(message);
  };

  // Step 1: check the email format, then ask the server; it checks the account and texts the code
  const proceed = async () => {
    const message = validateEmail(email);
    if (message) {
      setErrors({ email: message });
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const result = await authApi.startPasswordReset({ email });
      setChallenge(result);
      setCode('');
      setCodeState('idle');
      setAttemptsLeft(RULES.maxCodeAttempts);
      setStep('code');
    } catch (error) {
      if (error.meta && error.meta.field) setErrors({ [error.meta.field]: error.message });
      else setFormError(error.message);
    } finally {
      setBusy(false);
    }
  };

  // Step 2: check the texted code; on success move on to the new password
  const verify = async (value = code) => {
    if (value.length !== RULES.codeLength) {
      setFormError(`Enter all ${RULES.codeLength} digits.`);
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await authApi.verifyPasswordResetCode({ challengeId: challenge.challengeId, code: value });
      setCodeState('success');
      setStep('password');
    } catch (error) {
      // Wrong code: red boxes, clear the input, and explain
      setCodeState('error');
      setShake(true);
      setCode('');
      if (error.code === 'INVALID_CODE') {
        setAttemptsLeft(error.meta.remaining);
        setFormError(`That code is incorrect. ${error.meta.remaining} ${error.meta.remaining === 1 ? 'attempt' : 'attempts'} left.`);
      } else if (error.code === 'LOCKED') {
        setLockedUntil(error.meta.lockedUntil);
        setAttemptsLeft(0);
      } else if (error.code === 'CHALLENGE_EXPIRED') {
        restart(error.message);
      } else setFormError(error.message);
    } finally {
      setBusy(false);
    }
  };

  // Text a new code (allowed once the resend timer ends). Asking too soon only shows the message;
  // any other failure (e.g. the request expired) starts the reset again.
  const resend = async () => {
    setBusy(true);
    setFormError('');
    try {
      const result = await authApi.resendPasswordResetCode(challenge.challengeId);
      setChallenge((c) => ({ ...c, ...result }));
      setCode('');
      setCodeState('idle');
    } catch (error) {
      if (error.code === 'TOO_SOON') setFormError(error.message);
      else restart(error.message);
    } finally {
      setBusy(false);
    }
  };

  // Step 3: check the new password and its confirmation, then save it
  const save = async () => {
    const found = {};
    const passwordError = validatePassword(values.password);
    if (passwordError) found.password = passwordError;
    if (!values.confirm) found.confirm = 'Confirm your password.';
    else if (values.confirm !== values.password) found.confirm = 'Passwords do not match.';
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const result = await authApi.completePasswordReset({ challengeId: challenge.challengeId, password: values.password });
      onDone(result.email);
    } catch (error) {
      if (error.code === 'CHALLENGE_EXPIRED') restart(error.message);
      else if (error.meta && error.meta.field) setErrors({ [error.meta.field]: error.message });
      else setFormError(error.message);
    } finally {
      setBusy(false);
    }
  };

  // Title, line under it and main button for each step
  const STEPS = {
    email: { title: 'Reset your password', description: 'Enter the email you used to sign up. We will text a code to the mobile number on your account.', action: 'Proceed', onClick: proceed },
    code: { title: 'Enter the code', description: '', action: 'Verify', onClick: () => verify() },
    password: { title: 'Create a new password', description: 'Use 8 characters or more, with at least one number.', action: 'Save password', onClick: save }
  };
  const current = STEPS[step];

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      busy={busy}
      maxWidth="xs"
      title={current.title}
      description={current.description || undefined}
      actions={
        <>
          <Button onClick={onClose} sx={{ color: tokens.textSecondary }}>
            Cancel
          </Button>
          <BusyButton busy={busy} onClick={current.onClick} disabled={step === 'code' && (locked || code.length !== RULES.codeLength)}>
            {current.action}
          </BusyButton>
        </>
      }
    >
      {/* Enter in a text field submits the current step (the code boxes check themselves when full) */}
      <Box
        component="form"
        noValidate
        onSubmit={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && step !== 'code' && e.target.tagName === 'INPUT') {
            e.preventDefault();
            current.onClick();
          }
        }}
        onAnimationEnd={() => setShake(false)}
        sx={{ display: 'flex', flexDirection: 'column', gap: 2, ...shakeSx(shake) }}
      >
        {formError && !locked && <AlertBanner tone="error">{formError}</AlertBanner>}

        {step === 'email' && (
          <FormField id="forgot-email" label="Email" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setErrors({}); }} error={errors.email} disabled={busy} autoFocus />
        )}

        {step === 'code' && challenge && (
          <>
            <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
              <SmsOutlinedIcon sx={{ color: tokens.goldDark, mt: '2px' }} />
              <Typography sx={{ fontSize: 13.5, lineHeight: 1.55, color: tokens.textSecondary }}>
                We texted a {RULES.codeLength}-digit code to the mobile number on your account, <b>{challenge.maskedMobile}</b>. It expires in {RULES.codeValidMinutes} minutes.
              </Typography>
            </Box>
            {locked && (
              <AlertBanner tone="locked" title="Code entry paused">
                Too many incorrect codes. Try again in <b>{formatCountdown(lockSeconds)}</b>.
              </AlertBanner>
            )}
            <OtpInput
              length={RULES.codeLength}
              value={code}
              onChange={(value) => {
                setCode(value);
                if (codeState !== 'idle') setCodeState('idle');
                if (formError) setFormError('');
              }}
              // Check as soon as the last digit is typed
              onComplete={(value) => verify(value)}
              disabled={busy || locked}
              state={codeState}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              {resendSeconds > 0 ? (
                <Typography sx={{ fontSize: 12.5, color: tokens.textMuted }}>Resend code in {formatCountdown(resendSeconds)}</Typography>
              ) : (
                <Link component="button" type="button" onClick={resend} disabled={busy} sx={{ fontSize: 12.5, fontWeight: 700, color: tokens.goldDark }}>
                  Resend code
                </Link>
              )}
              <Typography sx={{ fontSize: 12.5, color: attemptsLeft <= 2 ? tokens.redPress : tokens.textMuted }}>
                {attemptsLeft} of {RULES.maxCodeAttempts} attempts left
              </Typography>
            </Box>
            <Link component="button" type="button" onClick={() => restart('')} disabled={busy} sx={{ alignSelf: 'flex-start', fontSize: 12.5, color: tokens.textSecondary }}>
              Use a different email
            </Link>
          </>
        )}

        {step === 'password' && (
          <>
            <PasswordField id="reset-password" label="New password" required autoComplete="new-password" value={values.password} onChange={(e) => { setValues((v) => ({ ...v, password: e.target.value })); setErrors((er) => ({ ...er, password: '' })); }} error={errors.password} disabled={busy} autoFocus />
            <PasswordField id="reset-confirm" label="Confirm new password" required autoComplete="new-password" value={values.confirm} onChange={(e) => { setValues((v) => ({ ...v, confirm: e.target.value })); setErrors((er) => ({ ...er, confirm: '' })); }} error={errors.confirm} disabled={busy} />
          </>
        )}
      </Box>
    </AppDialog>
  );
}
