import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import {
  AlertBanner,
  BrandLogo,
  BusyButton,
  LightSurface,
  PasswordField,
  RULES,
  authApi,
  formatCountdown,
  initials,
  safeNextPath,
  tokens,
  useCountdown,
  useDocumentTitle
} from '@tm/shared';
import { useAuth } from '../auth.js';

export default function UnlockPage() {
  useDocumentTitle('Screen Locked', 'Tres Marias Admin');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isAuthenticated, locked, signIn, signOut } = useAuth();
  const next = safeNextPath(params.get('next'), '/dashboard');

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(RULES.maxLoginAttempts);
  const [lockedUntil, setLockedUntil] = useState(null);
  const lockSeconds = useCountdown(lockedUntil);

  if (isAuthenticated) return <Navigate to={next} replace />;
  if (!locked && !lockedUntil) return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;

  const unlock = async (event) => {
    event.preventDefault();
    if (!password) {
      setError('Enter your password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await authApi.adminUnlock({ ticket: locked.unlockTicket, password, email: locked.user.email });
      signIn({ ...result, user: { ...locked.user, ...result.user } }, { remember: locked.persistent });
      navigate(next, { replace: true });
    } catch (e) {
      setBusy(false);
      setPassword('');
      if (e.code === 'LOCKED') {
        setLockedUntil(e.meta && e.meta.lockedUntil ? e.meta.lockedUntil : Date.now() + RULES.loginLockMinutes * 60000);
        signOut();
      } else if (e.code === 'CHALLENGE_EXPIRED' || e.code === 'SESSION_REPLACED') {
        const reason = e.code === 'SESSION_REPLACED' ? 'replaced' : 'expired';
        signOut(reason);
        navigate(`/login?reason=${reason}&next=${encodeURIComponent(next)}`, { replace: true });
      } else {
        if (e.code === 'INVALID_CREDENTIALS') setAttemptsLeft((n) => Math.max(1, n - 1));
        setError(e.message);
      }
    }
  };

  const switchAccount = () => {
    signOut();
    navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
  };

  const name = locked ? locked.user.name : '';
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
        <BrandLogo size={96} />

        <LightSurface>
          <Paper
            component="form"
            noValidate
            onSubmit={unlock}
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
            {lockedUntil ? (
              <>
                <Typography component="h1" sx={{ fontSize: 21, fontWeight: 700 }}>
                  Account Temporarily Locked
                </Typography>
                <AlertBanner tone="locked" title="Too many incorrect passwords">
                  {lockSeconds > 0 ? (
                    <>
                      Sign in again with your password and emailed code in <b>{formatCountdown(lockSeconds)}</b>.
                    </>
                  ) : (
                    'You can sign in again now.'
                  )}
                </AlertBanner>
                <BusyButton
                  size="large"
                  disabled={lockSeconds > 0}
                  onClick={() => navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true })}
                >
                  Go to sign in
                </BusyButton>
              </>
            ) : (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Avatar sx={{ width: 48, height: 48, bgcolor: tokens.ink, color: tokens.onInk, fontWeight: 700 }}>
                    {initials(name)}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      component="h1"
                      sx={{ fontSize: 19, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.75 }}
                    >
                      <LockOutlinedIcon sx={{ fontSize: 19, color: tokens.goldDark }} /> Screen Locked
                    </Typography>
                    <Typography noWrap sx={{ fontSize: 13.5, color: tokens.textSecondary }}>
                      {name}
                    </Typography>
                  </Box>
                </Box>
                <Typography sx={{ fontSize: 13.5, lineHeight: 1.55, color: tokens.textSecondary }}>
                  You were away for {RULES.idleMinutes} minutes, so we locked the screen. Enter your password to
                  continue where you left off.
                </Typography>
                {error && (
                  <AlertBanner tone="error">
                    {error}
                    {attemptsLeft < RULES.maxLoginAttempts
                      ? ` ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left before the account is locked.`
                      : ''}
                  </AlertBanner>
                )}
                <input
                  type="email"
                  name="username"
                  autoComplete="username"
                  value={locked ? locked.user.email : ''}
                  readOnly
                  hidden
                />
                <PasswordField
                  id="unlock-password"
                  label="Password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  disabled={busy}
                  autoFocus
                />
                <BusyButton type="submit" size="large" busy={busy} sx={{ py: 1.3 }}>
                  Unlock
                </BusyButton>
                <Typography sx={{ textAlign: 'center', fontSize: 13, color: tokens.textSecondary }}>
                  Not {name.split(' ')[0] || 'you'}?{' '}
                  <Link
                    component="button"
                    type="button"
                    onClick={switchAccount}
                    sx={{ fontSize: 13, fontWeight: 600, color: tokens.goldDark, verticalAlign: 'baseline' }}
                  >
                    Sign in with another account
                  </Link>
                </Typography>
              </>
            )}
          </Paper>
        </LightSurface>
      </Box>
    </Box>
  );
}
