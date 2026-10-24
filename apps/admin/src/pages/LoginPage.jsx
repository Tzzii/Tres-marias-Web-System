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
  tokens,
  useCountdown,
  useDocumentTitle,
  validateEmail
} from '@tm/shared';
import { useAuth } from '../auth.js';

export default function LoginPage() {
  useDocumentTitle('Admin Sign In', 'Tres Marias Admin');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isAuthenticated, signIn } = useAuth();
  const next = safeNextPath(params.get('next'), '/dashboard');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [lockedUntil, setLockedUntil] = useState(null);
  const [lockKind, setLockKind] = useState('password');
  const [busy, setBusy] = useState(false);

  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState('idle');
  const [attemptsLeft, setAttemptsLeft] = useState(RULES.maxCodeAttempts);

  const lockSeconds = useCountdown(lockedUntil);
  const resendSeconds = useCountdown(challenge ? challenge.resendAt : null);

  useEffect(() => {
    if (lockedUntil && lockSeconds === 0) {
      setLockedUntil(null);
      setFormError('');
      setAttemptsLeft(RULES.maxCodeAttempts);
    }
  }, [lockSeconds, lockedUntil]);

  if (isAuthenticated) return <Navigate to={next} replace />;

  const locked = Boolean(lockedUntil && lockSeconds > 0);
  const codeOpen = Boolean(challenge);

  const startSignIn = async (event) => {
    event.preventDefault();
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
      setBusy(false);
      setCodeState('error');
      setCode('');
      if (error.code === 'INVALID_CODE') {
        setAttemptsLeft(error.meta.remaining);
        setFormError(
          `That code is incorrect. ${error.meta.remaining} ${error.meta.remaining === 1 ? 'attempt' : 'attempts'} left.`
        );
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

  const resend = async () => {
    setBusy(true);
    setFormError('');
    try {
      const result = await authApi.adminResendCode(challenge.challengeId);
      setChallenge((c) => ({ ...c, ...result }));
      setCode('');
      setCodeState('idle');
    } catch (error) {
      if (error.code === 'TOO_SOON') setFormError(error.message);
      else closeCode(error.message);
    } finally {
      setBusy(false);
    }
  };

  const closeCode = (message = '') => {
    setChallenge(null);
    setPassword('');
    setCode('');
    setCodeState('idle');
    setFormError(message);
  };

  const reason = params.get('reason');

  return (
    <Box
      component="main"
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        px: 2,
        py: 5,
        backgroundImage: tokens.gradientCentered
      }}
    >
      <Box
        sx={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}
      >
        <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
          <BrandLogo size={120} />
          <Box>
            <Typography sx={{ mt: 1, fontSize: 22, fontWeight: 700, color: tokens.textLight }}>Tres Marias</Typography>
            <Typography
              sx={{
                fontSize: 11.5,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: tokens.gold
              }}
            >
              Admin
            </Typography>
          </Box>
        </Box>

        <LightSurface>
          <Paper
            component="form"
            noValidate
            onSubmit={startSignIn}
            elevation={0}
            sx={{
              width: '100%',
              p: { xs: 3, sm: 3.5 },
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              borderRadius: 2,
              boxShadow: tokens.shadowCard
            }}
          >
            <Typography component="h1" sx={{ fontSize: 21, fontWeight: 700 }}>
              Admin Sign In
            </Typography>

            {reason === 'idle' && (
              <AlertBanner tone="info">You were signed out after 15 minutes of inactivity.</AlertBanner>
            )}
            {reason === 'password' && (
              <AlertBanner tone="success">Password changed. Sign in with your new password.</AlertBanner>
            )}
            {reason === 'expired' && (
              <AlertBanner tone="info">Your session has ended. Please sign in again.</AlertBanner>
            )}
            {reason === 'replaced' && (
              <AlertBanner
                tone="warning"
                title="You were signed out because your account was signed in on another device."
              >
                If this wasn't you, sign in again and change your password.
              </AlertBanner>
            )}
            {locked && !codeOpen && (
              <AlertBanner
                tone="locked"
                title={lockKind === 'code' ? 'Verification code locked' : 'Account temporarily locked'}
              >
                {lockKind === 'code' ? 'Too many incorrect verification codes.' : 'Too many incorrect passwords.'} Try
                again in <b>{formatCountdown(lockSeconds)}</b>.
              </AlertBanner>
            )}
            {formError && !locked && !codeOpen && <AlertBanner tone="error">{formError}</AlertBanner>}

            <FormField
              id="admin-email"
              label="Username"
              type="email"
              autoComplete="username"
              placeholder="name@gmail.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErrors((er) => ({ ...er, email: '' }));
              }}
              error={errors.email}
              disabled={busy}
              autoFocus
            />
            <PasswordField
              id="admin-password"
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
            <BusyButton
              type="submit"
              size="large"
              busy={busy && !codeOpen}
              disabled={locked || codeOpen}
              sx={{ py: 1.3 }}
            >
              Continue
            </BusyButton>
          </Paper>
        </LightSurface>
      </Box>

      <AppDialog open={codeOpen} onClose={() => closeCode()} title="Enter Your Code" maxWidth="xs" busy={busy}>
        {challenge && (
          <Box
            component="form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              verify();
            }}
            sx={{ display: 'flex', flexDirection: 'column', gap: 2, pb: 1 }}
          >
            <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
              <MarkEmailReadOutlinedIcon sx={{ color: tokens.goldDark, mt: '2px' }} />
              <Typography sx={{ fontSize: 13.5, lineHeight: 1.55, color: tokens.textSecondary }}>
                We emailed a {RULES.codeLength}-digit code to the address on file, <b>{challenge.maskedEmail}</b>. It
                expires in {RULES.codeValidMinutes} minutes.
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
              onComplete={(value) => verify(value)}
              disabled={busy || locked}
              state={codeState}
            />
            <BusyButton
              type="submit"
              size="large"
              busy={busy}
              disabled={locked || code.length !== RULES.codeLength}
              sx={{ py: 1.3 }}
            >
              Verify and sign in
            </BusyButton>
            <Box
              sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
            >
              {resendSeconds > 0 ? (
                <Typography sx={{ fontSize: 12.5, color: tokens.textMuted }}>
                  Resend code in {formatCountdown(resendSeconds)}
                </Typography>
              ) : (
                <Link
                  component="button"
                  type="button"
                  onClick={resend}
                  disabled={busy}
                  sx={{ fontSize: 12.5, fontWeight: 700, color: tokens.goldDark }}
                >
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
