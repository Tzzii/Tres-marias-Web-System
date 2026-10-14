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

const REMEMBERED_EMAIL = 'tm.client.rememberedEmail';

export default function LoginPage() {
  useDocumentTitle('Log In');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isAuthenticated, signIn } = useAuth();

  const next = safeNextPath(params.get('next'), '/portal');
  const continuingBooking = next.startsWith('/portal/book');
  const intent = continuingBooking ? readIntent() : null;

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
  const [lockedUntil, setLockedUntil] = useState(() => authApi.getLockout('customer', email));
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const { flipping, flipTo } = useCardFlip();
  const signupPath = continuingBooking ? '/signup?continue=booking' : '/signup';
  const lockSeconds = useCountdown(lockedUntil);

  useEffect(() => {
    if (lockedUntil && lockSeconds === 0) {
      setLockedUntil(null);
      setFormError('');
    }
  }, [lockSeconds, lockedUntil]);

  if (isAuthenticated) return <Navigate to={next} replace />;

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
            Log In
          </Typography>
          <Typography sx={{ mt: 0.5, fontSize: 13.5, color: tokens.textSecondary }}>
            {continuingBooking ? "Welcome back. Let's continue your reservation." : 'Welcome back. Sign in to your Tres Marias account.'}
          </Typography>
        </Box>

        {resetDone && !formError && <AlertBanner tone="success">Password changed. Log in with your new password.</AlertBanner>}
        {params.get('reason') === 'idle' && <AlertBanner tone="info">You were signed out after 15 minutes of inactivity. Please log in again.</AlertBanner>}
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

      <PasswordResetDialog
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        initialEmail={email}
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
