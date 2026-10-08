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
import AuthLayout, { BookingIntentBanner, FormCard, useCardFlip } from '../../components/AuthLayout.jsx';
import { EmailCodeDialog } from '../../components/EmailCode.jsx';
import LegalText from '../../components/LegalText.jsx';
import { readIntent } from '../../lib/booking.js';

// Validation rule for each field. Each returns an error message, or '' when valid.
// First name, last name, email and mobile are required; middle name is optional (no rule).
const RULES = {
  firstName: (v) => required(v, 'First name'),
  lastName: (v) => required(v, 'Last name'),
  email: validateEmail,
  mobile: validateMobile,
  password: validatePassword,
  confirm: (v, all) => (!v ? 'Confirm your password.' : v !== all.password ? 'Passwords do not match.' : ''),
  agree: (v) => (v ? '' : 'Please agree to the Terms of Service and Privacy Policy.')
};

/**
 * 1d · Sign up. From the gate it continues to the reservation form; from the nav, the dashboard.
 * Two steps (Phase 12): the form, then the 6-digit code the server emails to the address typed. The
 * account is made, and the customer signed in, only once that code is entered, so every account's
 * email is proven.
 */
export default function SignupPage() {
  useDocumentTitle('Create an Account');
  const navigate = useNavigate();
  const notify = useNotify();
  const [params] = useSearchParams();
  const { isAuthenticated, signIn } = useAuth();
  // ?continue=booking means the visitor came from "Reserve this date"
  const continuingBooking = params.get('continue') === 'booking';
  const intent = continuingBooking ? readIntent() : null;
  // Where to go after signing up: the booking form or the dashboard
  const destination = continuingBooking ? '/portal/book' : '/portal';

  const [values, setValues] = useState({ firstName: '', middleName: '', lastName: '', email: '', mobile: '', password: '', confirm: '', agree: false });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false); // dialog with the full Terms of Service and Privacy Policy
  const [challenge, setChallenge] = useState(null); // the emailed-code step ({ challengeId, maskedEmail, … }), open while set
  // "Log in" flips the card over to the login page (keeps the booking the visitor started)
  const { flipping, flipTo } = useCardFlip();
  const loginPath = continuingBooking ? '/login?next=/portal/book' : '/login';
  // The minimum downpayment named in the terms. Loading the catalogue brings it up to date from the API
  // (remote/catalog.js); until it arrives (null) the terms leave the amount out.
  const catalog = useResource(() => catalogApi.getCatalog(), []);
  const minimum = catalog.data ? catalogApi.minDownpayment() : null;

  // Already signed in: skip this page
  if (isAuthenticated) return <Navigate to={destination} replace />;

  // Change handler for one field (the agree checkbox uses `checked` instead of `value`)
  const set = (field) => (event) => {
    const value = field === 'agree' ? event.target.checked : event.target.value;
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: '' }));
  };

  // Validate everything, then ask the server to check the form and email a code (no account yet)
  const submit = async (event) => {
    event.preventDefault();
    const found = collectErrors(values, RULES);
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length) {
      // Shake the form and put the cursor in the first field with an error
      setShake(true);
      const first = document.getElementById(`signup-${Object.keys(found)[0]}`);
      if (first) first.focus();
      return;
    }
    setBusy(true);
    try {
      // The tick is sent too: the server refuses a sign-up without it and records the terms version agreed to
      setChallenge(await authApi.startSignUp({ ...values, agreeTerms: values.agree }));
    } catch (error) {
      setShake(true);
      // e.g. "email already registered" is shown under the email field
      if (error.meta && error.meta.field) setErrors((e) => ({ ...e, [error.meta.field]: error.message }));
      else setFormError(error.message);
    } finally {
      setBusy(false);
    }
  };

  // The emailed code: the server makes the account and signs the customer in, then the page continues.
  // Someone else taking the email meanwhile sends the customer back to the form with the message under it.
  const confirmCode = async (code) => {
    try {
      const session = await authApi.confirmSignUp({ challengeId: challenge.challengeId, code });
      signIn(session);
      notify(`Welcome to Tres Marias, ${session.user.firstName}!`);
      navigate(destination, { replace: true });
    } catch (error) {
      if (error.code !== 'EMAIL_TAKEN') throw error;
      setChallenge(null);
      setErrors((e) => ({ ...e, email: error.message }));
    }
  };

  return (
    <AuthLayout headline="One account, every celebration you host." perks={['Reserve dates and follow each request live', 'See quotations, contracts and receipts in one place', 'Save drafts and finish your booking any time']}>
      <FormCard component="form" noValidate onSubmit={submit} shake={shake} flipping={flipping} onAnimationEnd={() => setShake(false)}>
        <Box>
          <Typography component="h1" sx={{ fontSize: 24, fontWeight: 700 }}>
            Sign Up
          </Typography>
          <Typography sx={{ mt: 0.5, fontSize: 13.5, color: tokens.textSecondary }}>Creating an account is free and takes about a minute.</Typography>
        </Box>

        <BookingIntentBanner intent={intent} />
        {formError && <AlertBanner tone="error">{formError}</AlertBanner>}

        {/* Name in separate parts: first and middle side by side (stacked on phones), last name below */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <FormField id="signup-firstName" label="First name" required autoComplete="given-name" value={values.firstName} onChange={set('firstName')} error={errors.firstName} disabled={busy} />
          <FormField id="signup-middleName" label="Middle name" optional autoComplete="additional-name" value={values.middleName} onChange={set('middleName')} disabled={busy} />
        </Box>
        <FormField id="signup-lastName" label="Last name" required autoComplete="family-name" value={values.lastName} onChange={set('lastName')} error={errors.lastName} disabled={busy} />
        <FormField id="signup-email" label="Email" required type="email" autoComplete="email" value={values.email} onChange={set('email')} error={errors.email} hint="We email a code to this address to confirm it is yours." disabled={busy} />
        <MobileField id="signup-mobile" label="Mobile number" required value={values.mobile} onChange={set('mobile')} error={errors.mobile} hint="We text you about event-day updates only." disabled={busy} />
        <PasswordField id="signup-password" label="Password" required autoComplete="new-password" value={values.password} onChange={set('password')} error={errors.password} hint="8 characters or more, with a number" disabled={busy} />
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
          <Link component={RouterLink} to={loginPath} onClick={flipTo(loginPath)} sx={{ fontWeight: 700, color: tokens.goldDark }}>
            Log in
          </Link>
        </Typography>
      </FormCard>

      {/* Step 2: the code emailed to the new address; Cancel goes back to the filled-in form */}
      <EmailCodeDialog
        challenge={challenge}
        title="Confirm Your Email"
        actionLabel="Create account"
        onVerify={confirmCode}
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
            // "I agree" in the dialog ticks the checkbox and closes the dialog
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
        {/* The full Terms of Service and Privacy Policy (legal/terms.js), the same text as the /terms and /privacy pages */}
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
    </AuthLayout>
  );
}
