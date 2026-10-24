import { useState } from 'react';
import { Link as RouterLink, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import {
  AlertBanner,
  AppDialog,
  BusyButton,
  FormField,
  MobileField,
  PasswordChecklist,
  PasswordField,
  TERMS_UPDATED,
  authApi,
  catalogApi,
  collectErrors,
  privacyPolicy,
  required,
  termsOfService,
  tokens,
  useDocumentTitle,
  useNotify,
  useResource,
  validateEmail,
  validateMobile,
  validatePassword
} from '@tm/shared';
import { useAuth } from '../../auth.js';
import { BookingIntentBanner, FormCard } from '../../components/AuthLayout.jsx';
import { EmailCodeDialog } from '../../components/EmailCode.jsx';
import LegalText from '../../components/LegalText.jsx';
import { readIntent } from '../../lib/booking.js';

const RULES = {
  firstName: (v) => required(v, 'First name'),
  lastName: (v) => required(v, 'Last name'),
  email: validateEmail,
  mobile: validateMobile,
  password: validatePassword,
  confirm: (v, all) => (!v ? 'Confirm your password.' : v !== all.password ? 'Passwords do not match.' : ''),
  agree: (v) => (v ? '' : 'Please agree to the Terms of Service and Privacy Policy.')
};

export default function SignupPage() {
  useDocumentTitle('Create an Account');
  const navigate = useNavigate();
  const notify = useNotify();
  const [params] = useSearchParams();
  const { isAuthenticated, signIn } = useAuth();
  const continuingBooking = params.get('continue') === 'booking';
  const intent = continuingBooking ? readIntent() : null;
  const destination = continuingBooking ? '/portal/book' : '/portal';

  const [values, setValues] = useState({ firstName: '', middleName: '', lastName: '', email: '', mobile: '', password: '', confirm: '', agree: false });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const loginPath = continuingBooking ? '/login?next=/portal/book' : '/login';
  const catalog = useResource(() => catalogApi.getCatalog(), []);
  const minimum = catalog.data ? catalogApi.minDownpayment() : null;

  if (isAuthenticated) return <Navigate to={destination} replace />;

  const set = (field) => (event) => {
    const value = field === 'agree' ? event.target.checked : event.target.value;
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: '' }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const found = collectErrors(values, RULES);
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length) {
      setShake(true);
      const first = document.getElementById(`signup-${Object.keys(found)[0]}`);
      if (first) first.focus();
      return;
    }
    setBusy(true);
    try {
      setChallenge(await authApi.startSignUp({ ...values, agreeTerms: values.agree }));
    } catch (error) {
      setShake(true);
      if (error.meta && error.meta.field) setErrors((e) => ({ ...e, [error.meta.field]: error.message }));
      else setFormError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async (code) => {
    try {
      return await authApi.confirmSignUp({ challengeId: challenge.challengeId, code });
    } catch (error) {
      if (error.code !== 'EMAIL_TAKEN') throw error;
      setChallenge(null);
      setErrors((e) => ({ ...e, email: error.message }));
      return null;
    }
  };

  return (
    <>
      <FormCard component="form" autoComplete="off" noValidate onSubmit={submit} shake={shake} onAnimationEnd={() => setShake(false)}>
        <Box>
          <Typography component="h1" tabIndex={-1} sx={{ fontSize: 24, fontWeight: 700 }}>
            Sign Up
          </Typography>
          <Typography sx={{ mt: 0.5, fontSize: 13.5, color: tokens.textSecondary }}>Creating an account is free and takes about a minute.</Typography>
        </Box>

        <BookingIntentBanner intent={intent} />
        {formError && <AlertBanner tone="error">{formError}</AlertBanner>}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <FormField id="signup-firstName" label="First name" required autoComplete="off" value={values.firstName} onChange={set('firstName')} error={errors.firstName} disabled={busy} />
          <FormField id="signup-middleName" label="Middle name" optional autoComplete="off" value={values.middleName} onChange={set('middleName')} disabled={busy} />
        </Box>
        <FormField id="signup-lastName" label="Last name" required autoComplete="off" value={values.lastName} onChange={set('lastName')} error={errors.lastName} disabled={busy} />
        <FormField id="signup-email" label="Email" required type="email" autoComplete="off" value={values.email} onChange={set('email')} error={errors.email} hint="We email a code to this address to confirm it is yours." disabled={busy} />
        <MobileField id="signup-mobile" label="Mobile number" required autoComplete="off" value={values.mobile} onChange={set('mobile')} error={errors.mobile} hint="We text you about event-day updates only." disabled={busy} />
        <Box>
          <PasswordField id="signup-password" label="Password" required autoComplete="new-password" value={values.password} onChange={set('password')} error={errors.password} disabled={busy} />
          <PasswordChecklist value={values.password} />
        </Box>
        <PasswordField id="signup-confirm" label="Confirm password" required autoComplete="new-password" value={values.confirm} onChange={set('confirm')} error={errors.confirm} disabled={busy} />

        <Box>
          <FormControlLabel
            sx={{ alignItems: 'flex-start', mr: 0 }}
            control={<Checkbox id="signup-agree" size="small" checked={values.agree} onChange={set('agree')} inputProps={{ 'aria-label': 'I agree to the Terms of Service and Privacy Policy' }} sx={{ mt: -0.5 }} />}
            label={
              <Typography sx={{ fontSize: 13, lineHeight: 1.5 }}>
                I agree to the{' '}
                <Link component="button" type="button" onClick={() => setTermsOpen(true)} sx={{ fontSize: 13, fontWeight: 600, color: tokens.goldDark, verticalAlign: 'baseline' }}>
                  Terms of Service and Privacy Policy
                </Link>
              </Typography>
            }
          />
          {errors.agree && <FormHelperText error sx={{ mx: 0 }}>{errors.agree}</FormHelperText>}
        </Box>

        <BusyButton type="submit" size="large" busy={busy} sx={{ py: 1.3 }}>
          Create an account
        </BusyButton>

        <Typography sx={{ textAlign: 'center', fontSize: 13.5, color: tokens.textSecondary }}>
          Already have an account?{' '}
          <Link component={RouterLink} to={loginPath} sx={{ fontWeight: 700, color: tokens.goldDark }}>
            Log in
          </Link>
        </Typography>
      </FormCard>

      <EmailCodeDialog
        challenge={challenge}
        title="Confirm Your Email"
        actionLabel="Create account"
        onVerify={confirmCode}
        onVerified={(session) => {
          signIn(session);
          notify(`Welcome to Tres Marias, ${session.user.firstName}!`);
          navigate(destination, { replace: true });
        }}
        loadingLabel="Opening your account…"
        onResend={() => authApi.resendSignUpCode(challenge.challengeId)}
        onRestart={(message) => {
          setChallenge(null);
          setFormError(message);
        }}
        onClose={() => setChallenge(null)}
      />

      <AppDialog
        open={termsOpen}
        onClose={() => setTermsOpen(false)}
        title="Terms of Service and Privacy Policy"
        maxWidth="md"
        actions={
          <Button
            variant="contained"
            onClick={() => {
              setValues((v) => ({ ...v, agree: true }));
              setErrors((e) => ({ ...e, agree: '' }));
              setTermsOpen(false);
            }}
          >
            I agree
          </Button>
        }
      >
        <Typography sx={{ fontSize: 12.5, color: tokens.textMuted, mb: 2 }}>
          Last updated {TERMS_UPDATED}. You can also read them on their own pages:{' '}
          <Link component={RouterLink} to="/terms" target="_blank" rel="noopener" sx={{ fontWeight: 600, color: tokens.goldDark }}>Terms of Service</Link> and{' '}
          <Link component={RouterLink} to="/privacy" target="_blank" rel="noopener" sx={{ fontWeight: 600, color: tokens.goldDark }}>Privacy Policy</Link>.
        </Typography>
        <Typography component="h2" sx={{ fontSize: 17, fontWeight: 800, mb: 1.5 }}>Terms of Service</Typography>
        <LegalText sections={termsOfService({ minDownpayment: minimum })} compact />
        <Typography component="h2" sx={{ fontSize: 17, fontWeight: 800, mt: 4, mb: 1.5 }}>Privacy Policy</Typography>
        <LegalText sections={privacyPolicy()} compact />
      </AppDialog>
    </>
  );
}
