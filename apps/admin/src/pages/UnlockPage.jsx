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
  shakeSx,
  tokens,
  useCountdown,
  useDocumentTitle
} from '@tm/shared';
import { useAuth } from '../auth.js';

/**
 * The locked admin screen (after RULES.idleMinutes without activity, owner's rule 2026-10-03): the admin
 * types the password only, no emailed code, and goes back to the page they were on (?next=). The session's
 * token was already thrown away when it locked; the lock record keeps only the admin's name and the unlock
 * ticket (createAuth, lockOnIdle), and the server checks the ticket and the password (authApi.adminUnlock).
 * - Wrong passwords count as sign-in failures: the 5th locks the account for RULES.loginLockMinutes, the
 *   lock screen ends, and the admin signs in again at /login (with the code) once the lockout is over.
 * - When the sign-in session is over (the ticket ran out, or the password was changed elsewhere), the lock
 *   ends too and /login says the session has ended.
 * - "Not you? Sign in with another account" ends the lock right away.
 * With no lock (e.g. this address opened by hand), the page goes on to the dashboard or the sign-in.
 */
export default function UnlockPage() {
  useDocumentTitle('Screen locked', 'Tres Marias Admin');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isAuthenticated, locked, signIn, signOut } = useAuth();
  // Page to return to after unlocking (?next=...). safeNextPath blocks links to other websites.
  const next = safeNextPath(params.get('next'), '/dashboard');

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false); // plays the shake animation on a wrong password
  const [attemptsLeft, setAttemptsLeft] = useState(RULES.maxLoginAttempts);
  const [lockedUntil, setLockedUntil] = useState(null); // the account lockout after too many wrong passwords
  const lockSeconds = useCountdown(lockedUntil);

  // Already unlocked, or nothing to unlock: carry on to the page, or to the normal sign-in
  if (isAuthenticated) return <Navigate to={next} replace />;
  if (!locked && !lockedUntil) return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;

  // Check the password with the server; the answer is a new session (same end time as the old one)
  const unlock = async (event) => {
    event.preventDefault();
    if (!password) {
      setError('Enter your password.');
      setShake(true);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await authApi.adminUnlock({ ticket: locked.unlockTicket, password, email: locked.user.email });
      // Keep the sign-in time and device from the code sign-in (My account tells sessions apart by them)
      signIn({ ...result, user: { ...locked.user, ...result.user } }, { remember: locked.persistent });
      navigate(next, { replace: true });
    } catch (e) {
      setBusy(false);
      setPassword('');
      setShake(true);
      if (e.code === 'LOCKED') {
        // Too many wrong passwords: the lock screen ends; the full sign-in opens again after the lockout
        setLockedUntil(e.meta && e.meta.lockedUntil ? e.meta.lockedUntil : Date.now() + RULES.loginLockMinutes * 60000);
        signOut();
      } else if (e.code === 'CHALLENGE_EXPIRED') {
        signOut('expired');
        navigate(`/login?reason=expired&next=${encodeURIComponent(next)}`, { replace: true });
      } else {
        if (e.code === 'INVALID_CREDENTIALS') setAttemptsLeft((n) => Math.max(1, n - 1));
        setError(e.message);
      }
    }
  };

  // "Not you?": end the lock, so the next sign-in is the full one with the emailed code
  const switchAccount = () => {
    signOut();
    navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
  };

  const name = locked ? locked.user.name : '';
  return (
    <Box component="main" sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', px: 2, py: 5, backgroundImage: tokens.gradientCentered }}>
      <Box sx={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <BrandLogo size={96} />

        <LightSurface>
          <Paper
            component="form"
            noValidate
            onSubmit={unlock}
            onAnimationEnd={() => setShake(false)}
            elevation={0}
            sx={{ width: '100%', p: { xs: 3, sm: 3.5 }, display: 'flex', flexDirection: 'column', gap: 2, borderRadius: 2, boxShadow: tokens.shadowCard, ...shakeSx(shake) }}
          >
            {lockedUntil ? (
              <>
                <Typography component="h1" sx={{ fontSize: 21, fontWeight: 700 }}>
                  Account temporarily locked
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
                <BusyButton size="large" disabled={lockSeconds > 0} onClick={() => navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true })}>
                  Go to sign in
                </BusyButton>
              </>
            ) : (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Avatar sx={{ width: 48, height: 48, bgcolor: tokens.ink, color: tokens.gold, fontWeight: 700 }}>{initials(name)}</Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography component="h1" sx={{ fontSize: 19, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <LockOutlinedIcon sx={{ fontSize: 19, color: tokens.goldDark }} /> Screen locked
                    </Typography>
                    <Typography noWrap sx={{ fontSize: 13.5, color: tokens.textSecondary }}>{name}</Typography>
                  </Box>
                </Box>
                <Typography sx={{ fontSize: 13.5, lineHeight: 1.55, color: tokens.textSecondary }}>
                  You were away for {RULES.idleMinutes} minutes, so we locked the screen. Enter your password to continue where you left off. No code is needed.
                </Typography>
                {error && (
                  <AlertBanner tone="error">
                    {error}
                    {attemptsLeft < RULES.maxLoginAttempts ? ` ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left before the account is locked.` : ''}
                  </AlertBanner>
                )}
                {/* The username stays in the page for password managers, but can't be changed here */}
                <input type="email" name="username" autoComplete="username" value={locked ? locked.user.email : ''} readOnly hidden />
                <PasswordField id="unlock-password" label="Password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} disabled={busy} autoFocus />
                <BusyButton type="submit" size="large" busy={busy} sx={{ py: 1.3 }}>
                  Unlock
                </BusyButton>
                <Typography sx={{ textAlign: 'center', fontSize: 13, color: tokens.textSecondary }}>
                  Not {name.split(' ')[0] || 'you'}?{' '}
                  <Link component="button" type="button" onClick={switchAccount} sx={{ fontSize: 13, fontWeight: 600, color: tokens.goldDark, verticalAlign: 'baseline' }}>
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
