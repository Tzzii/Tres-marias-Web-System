import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import {
  AlertBanner,
  AppDialog,
  BrandLogo,
  BusyButton,
  FormField,
  LightSurface,
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
  validateEmail
} from '@tm/shared';
import { useAuth } from '../auth.js';

/**
 * 1q · Admin log in: username and password on the page. When they are correct,
 * a pop-up asks for the 6-digit code emailed to the admin.
 */
export default function LoginPage() {
  useDocumentTitle('Admin sign in', 'Tres Marias Admin');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isAuthenticated, signIn } = useAuth();
  // Page to return to after signing in (?next=...). safeNextPath blocks links to other websites.
  const next = safeNextPath(params.get('next'), '/dashboard');

  // Sign-in form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({}); // per-field error messages
  const [formError, setFormError] = useState(''); // error banner (on the page, or in the code pop-up while it is open)
  const [lockedUntil, setLockedUntil] = useState(null); // time the lockout ends
  const [lockKind, setLockKind] = useState('password'); // what caused the lockout: 'password' or 'code'
  const [busy, setBusy] = useState(false); // true while waiting for the server
  const [shake, setShake] = useState(false); // plays the shake animation on a wrong attempt

  // Code pop-up state (the pop-up is open while `challenge` is set)
  const [challenge, setChallenge] = useState(null); // code request info (ID, masked email, resend time)
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState('idle'); // idle / error / success colour of the code boxes
  const [attemptsLeft, setAttemptsLeft] = useState(RULES.maxCodeAttempts);

  // Seconds left on the lockout and on the "Resend code" timer
  const lockSeconds = useCountdown(lockedUntil);
  const resendSeconds = useCountdown(challenge ? challenge.resendAt : null);

  // When the lockout timer reaches 0, unlock the form and reset attempts
  useEffect(() => {
    if (lockedUntil && lockSeconds === 0) {
      setLockedUntil(null);
      setFormError('');
      setAttemptsLeft(RULES.maxCodeAttempts);
    }
  }, [lockSeconds, lockedUntil]);

  // Already signed in: skip the login page
  if (isAuthenticated) return <Navigate to={next} replace />;

  const locked = Boolean(lockedUntil && lockSeconds > 0);
  const codeOpen = Boolean(challenge);

  // Check the fields, then send username + password to the server.
  // On success the server emails a code and the code pop-up opens.
  const startSignIn = async (event) => {
    event.preventDefault(); // stop the browser from reloading the page
    // Validate fields before calling the server
    const found = {};
    const emailError = validateEmail(email);
    if (emailError) found.email = emailError.replace('Email', 'Username');
    if (!password) found.password = 'Password is required.';
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      const result = await authApi.adminStartSignIn({ email, password });
      setCode('');
      setCodeState('idle');
      setAttemptsLeft(RULES.maxCodeAttempts);
      setChallenge(result);
    } catch (error) {
      // Wrong password or locked: shake the form, clear the password and explain why
      setShake(true);
      setPassword('');
      if (error.code === 'LOCKED') {
        setLockKind('password');
        setLockedUntil(error.meta.lockedUntil);
      } else if (error.code === 'INVALID_CREDENTIALS') {
        const { remaining } = error.meta;
        setFormError(`Incorrect username or password. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} left.`);
      } else setFormError(error.message);
    } finally {
      setBusy(false);
    }
  };

  // Check the emailed code. If correct, save the session and open the dashboard.
  const verify = async (value = code) => {
    if (value.length !== RULES.codeLength) {
      setFormError(`Enter all ${RULES.codeLength} digits.`);
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const result = await authApi.adminVerifyCode({ challengeId: challenge.challengeId, code: value });
      setCodeState('success');
      signIn(result);
      navigate(next, { replace: true });
    } catch (error) {
      // Wrong code: show red boxes, clear the input, and handle each error type
      setBusy(false);
      setCodeState('error');
      setShake(true);
      setCode('');
      if (error.code === 'INVALID_CODE') {
        setAttemptsLeft(error.meta.remaining);
        setFormError(`That code is incorrect. ${error.meta.remaining} ${error.meta.remaining === 1 ? 'attempt' : 'attempts'} left.`);
      } else if (error.code === 'LOCKED') {
        setLockKind('code');
        setLockedUntil(error.meta.lockedUntil);
        setAttemptsLeft(0);
        setFormError('');
      } else if (error.code === 'CHALLENGE_EXPIRED') {
        closeCode(error.message);
      } else setFormError(error.message);
    }
  };

  // Ask the server to email a new code (allowed once the resend timer ends)
  const resend = async () => {
    setBusy(true);
    setFormError('');
    try {
      const result = await authApi.adminResendCode(challenge.challengeId);
      setChallenge((c) => ({ ...c, ...result }));
      setCode('');
      setCodeState('idle');
    } catch (error) {
      closeCode(error.message);
    } finally {
      setBusy(false);
    }
  };

  // Close the code pop-up and go back to the sign-in form, optionally showing a message (e.g. "code expired")
  const closeCode = (message = '') => {
    setChallenge(null);
    setPassword('');
    setCode('');
    setCodeState('idle');
    setFormError(message);
  };

  // ?reason=idle: signed out automatically for inactivity; ?reason=password: signed out after changing the password
  const reason = params.get('reason');

  return (
    <Box component="main" sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', px: 2, py: 5, backgroundImage: tokens.gradientCentered }}>
      <Box sx={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
          <BrandLogo size={120} />
          <Box>
            <Typography sx={{ mt: 1, fontSize: 22, fontWeight: 700, color: tokens.textLight }}>Tres Marias</Typography>
            <Typography sx={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: tokens.gold }}>Admin</Typography>
          </Box>
        </Box>

        <LightSurface>
          <Paper
            component="form"
            noValidate
            onSubmit={startSignIn}
            onAnimationEnd={() => setShake(false)}
            elevation={0}
            sx={{ width: '100%', p: { xs: 3, sm: 3.5 }, display: 'flex', flexDirection: 'column', gap: 2, borderRadius: 2, boxShadow: tokens.shadowCard, ...shakeSx(shake && !codeOpen) }}
          >
            <Typography component="h1" sx={{ fontSize: 21, fontWeight: 700 }}>
              Admin sign in
            </Typography>

            {reason === 'idle' && <AlertBanner tone="info">You were signed out after 15 minutes of inactivity.</AlertBanner>}
            {reason === 'password' && <AlertBanner tone="success">Password changed. Sign in with your new password.</AlertBanner>}
            {/* Banners show here only while the code pop-up is closed; the pop-up has its own.
                The lockout banner names its cause, so closing the pop-up during a code lockout
                doesn't look like a wrong-password lockout. */}
            {locked && !codeOpen && (
              <AlertBanner tone="locked" title={lockKind === 'code' ? 'Verification code locked' : 'Account temporarily locked'}>
                {lockKind === 'code' ? 'Too many incorrect verification codes.' : 'Too many incorrect passwords.'} Try again in <b>{formatCountdown(lockSeconds)}</b>.
              </AlertBanner>
            )}
            {formError && !locked && !codeOpen && <AlertBanner tone="error">{formError}</AlertBanner>}

            <FormField id="admin-email" label="Username" type="email" autoComplete="username" placeholder="name@gmail.com" value={email} onChange={(e) => { setEmail(e.target.value); setErrors((er) => ({ ...er, email: '' })); }} error={errors.email} disabled={busy} autoFocus />
            <PasswordField id="admin-password" label="Password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setErrors((er) => ({ ...er, password: '' })); }} error={errors.password} disabled={busy || locked} />
            <BusyButton type="submit" size="large" busy={busy && !codeOpen} disabled={locked || codeOpen} sx={{ py: 1.3 }}>
              Continue
            </BusyButton>
          </Paper>
        </LightSurface>
      </Box>

      {/* Code pop-up: emailed code boxes, resend link and attempts left. Closing it cancels the sign-in. */}
      <AppDialog open={codeOpen} onClose={() => closeCode()} title="Enter your code" maxWidth="xs" busy={busy}>
        {challenge && (
          <Box
            component="form"
            noValidate
            // Pressing Enter / the main button checks the code
            onSubmit={(e) => {
              e.preventDefault();
              verify();
            }}
            onAnimationEnd={() => setShake(false)}
            sx={{ display: 'flex', flexDirection: 'column', gap: 2, pb: 1, ...shakeSx(shake) }}
          >
            <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
              <MarkEmailReadOutlinedIcon sx={{ color: tokens.goldDark, mt: '2px' }} />
              <Typography sx={{ fontSize: 13.5, lineHeight: 1.55, color: tokens.textSecondary }}>
                We emailed a {RULES.codeLength}-digit code to the address on file, <b>{challenge.maskedEmail}</b>. It expires in {RULES.codeValidMinutes} minutes.
              </Typography>
            </Box>
            {locked && (
              <AlertBanner tone="locked" title="Code entry paused">
                Too many incorrect verification codes. Try again in <b>{formatCountdown(lockSeconds)}</b>.
              </AlertBanner>
            )}
            {formError && !locked && <AlertBanner tone="error">{formError}</AlertBanner>}
            <OtpInput
              length={RULES.codeLength}
              value={code}
              onChange={(value) => {
                setCode(value);
                if (codeState !== 'idle') setCodeState('idle');
                if (formError) setFormError('');
              }}
              // Auto-submit as soon as the last digit is typed
              onComplete={(value) => verify(value)}
              disabled={busy || locked}
              state={codeState}
            />
            <BusyButton type="submit" size="large" busy={busy} disabled={locked || code.length !== RULES.codeLength} sx={{ py: 1.3 }}>
              Verify and sign in
            </BusyButton>
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
          </Box>
        )}
      </AppDialog>
    </Box>
  );
}
