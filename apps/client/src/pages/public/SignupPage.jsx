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
  BUSINESS,
  BusyButton,
  FormField,
  PasswordField,
  authApi,
  collectErrors,
  required,
  tokens,
  useDocumentTitle,
  useNotify,
  validateEmail,
  validateMobile,
  validatePassword
} from '@tm/shared';
import { useAuth } from '../../auth.js';
import AuthLayout, { BookingIntentBanner, FormCard } from '../../components/AuthLayout.jsx';
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
  agree: (v) => (v ? '' : 'Please agree to the terms and privacy notice.')
};

/** 1d · Sign up. From the gate it continues to the reservation form; from the nav, the dashboard. */
export default function SignupPage() {
  useDocumentTitle('Create an account');
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
  const [termsOpen, setTermsOpen] = useState(false); // terms dialog open

  // Already signed in: skip this page
  if (isAuthenticated) return <Navigate to={destination} replace />;

  // Change handler for one field (the agree checkbox uses `checked` instead of `value`)
  const set = (field) => (event) => {
    const value = field === 'agree' ? event.target.checked : event.target.value;
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: '' }));
  };

  // Validate everything, create the account, sign in, and continue
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
      const result = await authApi.customerRegister(values);
      signIn(result);
      notify(`Welcome to Tres Marias, ${result.user.firstName}!`);
      navigate(destination, { replace: true });
    } catch (error) {
      setBusy(false);
      setShake(true);
      // e.g. "email already registered" is shown under the email field
      if (error.meta && error.meta.field) setErrors((e) => ({ ...e, [error.meta.field]: error.message }));
      else setFormError(error.message);
    }
  };

  return (
    <AuthLayout headline="One account, every celebration you host." perks={['Reserve dates and follow each request live', 'See quotations, contracts and receipts in one place', 'Save drafts and finish your booking any time']}>
      <FormCard component="form" noValidate onSubmit={submit} shake={shake} onAnimationEnd={() => setShake(false)}>
        <Box>
          <Typography component="h1" sx={{ fontSize: 24, fontWeight: 700 }}>
            Sign up
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
        <FormField id="signup-email" label="Email" required type="email" autoComplete="email" value={values.email} onChange={set('email')} error={errors.email} disabled={busy} />
        <FormField id="signup-mobile" label="Mobile number" required type="tel" autoComplete="tel" placeholder="0917 123 4567" value={values.mobile} onChange={set('mobile')} error={errors.mobile} hint="We text you about event-day updates only." disabled={busy} />
        <PasswordField id="signup-password" label="Password" required autoComplete="new-password" value={values.password} onChange={set('password')} error={errors.password} hint="8 characters or more, with a number" disabled={busy} />
        <PasswordField id="signup-confirm" label="Confirm password" required autoComplete="new-password" value={values.confirm} onChange={set('confirm')} error={errors.confirm} disabled={busy} />

        <Box>
          <FormControlLabel
            sx={{ alignItems: 'flex-start', mr: 0 }}
            control={<Checkbox id="signup-agree" size="small" checked={values.agree} onChange={set('agree')} inputProps={{ 'aria-label': 'I agree to the terms and privacy notice' }} sx={{ mt: -0.5 }} />}
            label={
              <Typography sx={{ fontSize: 13, lineHeight: 1.5 }}>
                I agree to the{' '}
                <Link component="button" type="button" onClick={() => setTermsOpen(true)} sx={{ fontSize: 13, fontWeight: 600, color: tokens.goldDark, verticalAlign: 'baseline' }}>
                  terms and privacy notice
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
          <Link component={RouterLink} to={continuingBooking ? '/login?next=/portal/book' : '/login'} sx={{ fontWeight: 700, color: tokens.goldDark }}>
            Log in
          </Link>
        </Typography>
      </FormCard>

      <AppDialog
        open={termsOpen}
        onClose={() => setTermsOpen(false)}
        title="Terms and privacy notice"
        maxWidth="sm"
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
        <Box sx={{ fontSize: 13.5, lineHeight: 1.7, color: tokens.textSecondary, '& h3': { fontSize: 14, color: tokens.textPrimary, mt: 2, mb: 0.5 } }}>
          <h3>Your account</h3>
          <p>Your account lets you request reservations, receive quotations, make payments and message our team. Keep your password private; you are responsible for activity on your account.</p>
          <h3>Reservations and payments</h3>
          <p>A submitted reservation is a request, not a confirmed booking. Your date is secured once the reservation is approved and the 50% downpayment is verified. Cancellation terms are stated in your contract.</p>
          <h3>Privacy</h3>
          <p>
            We collect your name, email and mobile number to manage your reservations and contact you about your events, in line with the Data Privacy Act of 2012 (RA 10173). We never sell your information. To access or delete your data, email {BUSINESS.email}.
          </p>
        </Box>
      </AppDialog>
    </AuthLayout>
  );
}
