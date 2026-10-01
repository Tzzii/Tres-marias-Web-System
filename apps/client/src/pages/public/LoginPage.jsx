import { useEffect, useState } from 'react';
import { Link as RouterLink, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import {
  AlertBanner,
  BusyButton,
  FormField,
  PasswordField,
  authApi,
  formatCountdown,
  safeNextPath,
  tokens,
  useCountdown,
  useDocumentTitle,
  validateEmail
} from '@tm/shared';
import { useAuth } from '../../auth.js';
import AuthLayout, { BookingIntentBanner, FormCard, useCardFlip } from '../../components/AuthLayout.jsx';
import PasswordResetDialog from '../../components/PasswordResetDialog.jsx';
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

  // Validate, log in, save or forget the email for "Remember me", then continue.
  // `remember` also goes to the server, which then issues a longer-lasting session token.
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
      const result = await authApi.customerLogin({ email, password, remember });
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
        {/* The server ended the session: it expired, or the password was changed on another device */}
        {params.get('reason') === 'expired' && <AlertBanner tone="info">Your session has ended. Please log in again.</AlertBanner>}
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

      {/* Forgot password: email -> code emailed to the account's address -> new password (PasswordResetDialog) */}
      <PasswordResetDialog
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        initialEmail={email}
        // After the reset: close, fill in the email and ask for the new password
        onDone={({ email: resetEmail }) => {
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
