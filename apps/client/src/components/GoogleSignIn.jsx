import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import {
  AlertBanner,
  AppDialog,
  BusyButton,
  FormField,
  MobileField,
  PasswordField,
  TERMS_VERSION,
  authApi,
  tokens,
  validateMobile
} from '@tm/shared';
import { loadGoogleIdentity } from '../lib/googleIdentity.js';
import { EmailCodeDialog } from './EmailCode.jsx';
import SignupCaptcha from './SignupCaptcha.jsx';

const clientId = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();

export default function GoogleSignIn(props) {
  return clientId ? <GoogleSignInFlow {...props} /> : null;
}

function GoogleSignInFlow({ onSignedIn, onBusyChange, remember = false, disabled = false }) {
  const button = useRef(null);
  const active = useRef(false);
  const working = useRef(false);
  const dialogOpen = useRef(false);
  const setupRetries = useRef(0);
  const latest = useRef({ onSignedIn, onBusyChange, remember, disabled });
  latest.current = { onSignedIn, onBusyChange, remember, disabled };
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const [flow, setFlow] = useState(null);
  const [profile, setProfile] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    mobile: '',
    agreeTerms: false
  });
  const [password, setPassword] = useState('');
  const [emailChallenge, setEmailChallenge] = useState(null);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  dialogOpen.current = Boolean(flow || emailChallenge);

  const close = () => {
    setFlow(null);
    setPending(null);
    setPassword('');
    setError('');
    setEmailChallenge(null);
  };

  const exchange = async (values) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    latest.current.onBusyChange?.(true);
    setError('');
    try {
      const result = await authApi.customerGoogleLogin({ ...values, remember: latest.current.remember });
      if (!active.current) return;
      if (result.token && result.user) {
        close();
        latest.current.onSignedIn(result, { remember: latest.current.remember });
      } else if (result.status === 'profile_required') {
        setProfile({
          firstName: result.profile.firstName || '',
          middleName: '',
          lastName: result.profile.lastName || '',
          mobile: '',
          agreeTerms: false
        });
        setFlow({ kind: 'profile', email: result.profile.email });
      } else if (result.status === 'link_required') {
        setFlow({ kind: 'link', email: result.email });
      } else if (result.status === 'email_required' || result.status === 'code_required') {
        setFlow(null);
        setPending(null);
        setEmailChallenge({ ...result, remember: latest.current.remember });
      } else throw new Error('Google sign-in could not be completed. Please try again.');
    } catch (err) {
      if (!active.current) return;
      if (values.profile) {
        setCaptchaToken('');
        setCaptchaReset((count) => count + 1);
      }
      setError(err.message);
      if ((err.code === 'INVALID_CREDENTIALS' && !err.meta?.field) || err.code === 'INVALID_STATE') {
        setPending(null);
        setFlow(null);
        setReload((n) => n + 1);
      }
    } finally {
      working.current = false;
      if (active.current) {
        setBusy(false);
        setPassword('');
        latest.current.onBusyChange?.(false);
      }
    }
  };

  useEffect(() => {
    active.current = true;
    let cancelled = false;
    let observer;
    let readyTimer;
    let retryTimer;
    let refreshTimer;
    let refreshAt = Infinity;
    let renderedWidth;
    const refresh = () => {
      if (cancelled) return;
      clearTimeout(refreshTimer);
      if (working.current || dialogOpen.current) {
        refreshTimer = setTimeout(refresh, 30000);
        return;
      }
      setReload((n) => n + 1);
    };
    const resume = () => {
      if (Date.now() >= refreshAt) refresh();
    };
    const failed = () => {
      if (cancelled) return;
      setLoadError(true);
      setLoading(false);
      // Recover a transient setup failure after returning from an ended session.
      // Retry only once; a persistent outage keeps the email/password fallback.
      if (setupRetries.current < 1) {
        setupRetries.current++;
        retryTimer = setTimeout(refresh, 1000);
      }
    };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    setLoading(true);
    setLoadError(false);
    Promise.all([authApi.getGoogleSignInConfig(), loadGoogleIdentity()])
      .then(([config, sdk]) => {
        if (cancelled) return;
        if (config.clientId !== clientId || !config.challenge || !config.nonce)
          throw new Error('Google sign-in is unavailable.');
        // Server challenges last ten minutes. Renew early, including after a
        // suspended tab resumes, without interrupting an account/code dialog.
        refreshAt = Date.now() + 9 * 60000;
        refreshTimer = setTimeout(refresh, 9 * 60000);
        sdk.initialize({
          client_id: clientId,
          nonce: config.nonce,
          auto_select: false,
          callback: (response) => {
            if (cancelled || working.current || dialogOpen.current || latest.current.disabled || !response.credential)
              return;
            if (Date.now() >= refreshAt) {
              setError('Your Google sign-in request expired. Please choose your Google account again.');
              refresh();
              return;
            }
            const values = { credential: response.credential, challenge: config.challenge };
            setPending(values);
            exchange(values);
          }
        });
        const render = () => {
          if (!button.current || cancelled) return;
          const width = Math.min(400, Math.floor(button.current.clientWidth || 280));
          if (width === renderedWidth) return;
          renderedWidth = width;
          clearTimeout(readyTimer);
          setLoading(true);
          button.current.replaceChildren();
          sdk.renderButton(button.current, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'continue_with',
            locale: 'en',
            shape: 'rectangular',
            width
          });
          // The SDK returns before its iframe is ready. Keep its initial markup
          // hidden so downloading Google's styles cannot flash oversized content.
          const frame = button.current.querySelector('iframe');
          if (frame) {
            frame.addEventListener(
              'load',
              () => {
                if (cancelled || !button.current?.contains(frame)) return;
                clearTimeout(readyTimer);
                setLoading(false);
              },
              { once: true }
            );
            readyTimer = setTimeout(failed, 15000);
          } else setLoading(false);
        };
        render();
        observer = new ResizeObserver(render);
        observer.observe(button.current);
      })
      .catch(failed);
    return () => {
      cancelled = true;
      active.current = false;
      observer?.disconnect();
      clearTimeout(readyTimer);
      clearTimeout(retryTimer);
      clearTimeout(refreshTimer);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [reload]);

  const submit = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (flow?.kind === 'link') {
      if (!password) {
        setError('Enter your existing Tres Marias password.');
        return;
      }
      exchange({ ...pending, password });
    } else {
      const problem = !profile.firstName.trim()
        ? 'First name is required.'
        : !profile.lastName.trim()
          ? 'Last name is required.'
          : validateMobile(profile.mobile) ||
            (!profile.agreeTerms ? 'Please agree to the Terms of Service and Privacy Policy.' : '');
      if (problem) {
        setError(problem);
        return;
      }
      if (!captchaToken) {
        setError('Please complete the security check.');
        return;
      }
      exchange({ ...pending, profile: { ...profile, termsVersion: TERMS_VERSION }, captchaToken });
    }
  };
  const change = (field) => (event) => {
    setProfile((current) => ({
      ...current,
      [field]: field === 'agreeTerms' ? event.target.checked : event.target.value
    }));
    setError('');
  };

  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Divider sx={{ color: tokens.textMuted, fontSize: 12 }}>or</Divider>
        {loadError && (
          <AlertBanner tone="info">
            Google sign-in is unavailable. You can use email and password.
            <Button type="button" size="small" onClick={() => setReload((n) => n + 1)}>
              Try again
            </Button>
          </AlertBanner>
        )}
        <Box sx={{ position: 'relative', height: 44, display: loadError ? 'none' : 'block' }}>
          {loading && (
            <Typography
              role="status"
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                fontSize: 13,
                color: tokens.textSecondary
              }}
            >
              Loading Google sign-in…
            </Typography>
          )}
          <Box
            ref={button}
            aria-label="Continue with Google"
            aria-disabled={disabled || busy}
            sx={{
              width: '100%',
              height: 44,
              overflow: 'hidden',
              visibility: loading ? 'hidden' : 'visible',
              pointerEvents: disabled || busy ? 'none' : 'auto',
              opacity: disabled || busy ? 0.55 : 1,
              '& > div': { display: 'flex', justifyContent: 'center' }
            }}
          />
        </Box>
        {error && !flow && <AlertBanner tone="error">{error}</AlertBanner>}
      </Box>

      <AppDialog
        open={Boolean(flow)}
        onClose={close}
        busy={busy}
        maxWidth="xs"
        fullScreenOnMobile
        title={flow?.kind === 'link' ? 'Connect your existing account' : 'Complete your account'}
        description={
          flow?.kind === 'link'
            ? 'Confirm your Tres Marias password to connect Google, then enter the code we email you to sign in.'
            : 'Add your contact details, then enter the code we email you to finish signing up with Google.'
        }
        actions={
          <>
            <Button type="button" disabled={busy} onClick={close}>
              Cancel
            </Button>
            <BusyButton type="submit" form="google-account-form" busy={busy}>
              {flow?.kind === 'link' ? 'Connect and sign in' : 'Create account'}
            </BusyButton>
          </>
        }
      >
        <Box
          id="google-account-form"
          component="form"
          noValidate
          onSubmit={submit}
          sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          <Typography sx={{ fontSize: 13, overflowWrap: 'anywhere' }}>{flow?.email}</Typography>
          {error && <AlertBanner tone="error">{error}</AlertBanner>}
          {flow?.kind === 'link' ? (
            <>
              <PasswordField
                id="google-link-password"
                label="Existing account password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError('');
                }}
                disabled={busy}
              />
              <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                Forgot your password? Close this dialog and use “Forgot password?” on the login page before connecting
                Google.
              </Typography>
            </>
          ) : (
            <>
              <FormField
                id="google-first-name"
                label="First name"
                required
                autoFocus
                value={profile.firstName}
                onChange={change('firstName')}
                disabled={busy}
                inputProps={{ maxLength: 60 }}
              />
              <FormField
                id="google-middle-name"
                label="Middle name"
                optional
                value={profile.middleName}
                onChange={change('middleName')}
                disabled={busy}
                inputProps={{ maxLength: 60 }}
              />
              <FormField
                id="google-last-name"
                label="Last name"
                required
                value={profile.lastName}
                onChange={change('lastName')}
                disabled={busy}
                inputProps={{ maxLength: 60 }}
              />
              <MobileField
                id="google-mobile"
                label="Mobile number"
                required
                value={profile.mobile}
                onChange={change('mobile')}
                disabled={busy}
              />
              <SignupCaptcha onChange={setCaptchaToken} resetCount={captchaReset} />
              <FormControlLabel
                control={
                  <Checkbox
                    id="google-agree"
                    checked={profile.agreeTerms}
                    onChange={change('agreeTerms')}
                    disabled={busy}
                  />
                }
                label={
                  <Typography sx={{ fontSize: 13 }}>
                    I agree to the{' '}
                    <Link href="/terms" target="_blank" rel="noopener">
                      Terms of Service
                    </Link>{' '}
                    and{' '}
                    <Link href="/privacy" target="_blank" rel="noopener">
                      Privacy Policy
                    </Link>
                    .
                  </Typography>
                }
              />
            </>
          )}
        </Box>
      </AppDialog>

      <EmailCodeDialog
        challenge={emailChallenge}
        title={emailChallenge?.status === 'code_required' ? 'Verify Your Sign-In' : 'Confirm Your Email'}
        actionLabel={emailChallenge?.status === 'code_required' ? 'Verify and sign in' : 'Create account'}
        loadingLabel="Opening your account…"
        onVerify={(code) =>
          emailChallenge.status === 'code_required'
            ? authApi.verifyGoogleSignInCode({ challengeId: emailChallenge.challengeId, code })
            : authApi.confirmSignUp({
                challengeId: emailChallenge.challengeId,
                code,
                remember: emailChallenge.remember
              })
        }
        onVerified={(session) => {
          setEmailChallenge(null);
          latest.current.onSignedIn(session, { remember: emailChallenge.remember });
        }}
        onResend={() =>
          emailChallenge.status === 'code_required'
            ? authApi.resendGoogleSignInCode(emailChallenge.challengeId)
            : authApi.resendSignUpCode(emailChallenge.challengeId)
        }
        onRestart={(message) => {
          close();
          setError(message);
        }}
        onClose={close}
      />
    </>
  );
}
