import { useState } from 'react';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import {
  AlertBanner,
  AppDialog,
  BusyButton,
  TERMS_UPDATED,
  TERMS_VERSION,
  authApi,
  catalogApi,
  privacyPolicy,
  termsOfService,
  tokens
} from '@tm/shared';
import LegalText from './LegalText.jsx';

export default function TermsUpdateDialog({ open, onClose, onAccepted, firstTime = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const minDownpayment = catalogApi.minDownpayment ? catalogApi.minDownpayment() : null;

  const accept = async () => {
    setBusy(true);
    setError('');
    try {
      onAccepted(await authApi.acceptTerms(TERMS_VERSION));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      busy={busy}
      maxWidth="md"
      title={
        firstTime
          ? 'Please Review Our Terms of Service and Privacy Policy'
          : 'We Updated Our Terms of Service and Privacy Policy'
      }
      description={`Last updated ${TERMS_UPDATED}. Please read them and tick "I agree" to keep using your account. Bookings you already made keep the terms they were made under.`}
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Remind me later
          </Button>
          <BusyButton busy={busy} onClick={accept}>
            I agree
          </BusyButton>
        </>
      }
    >
      {error && (
        <AlertBanner tone="error" sx={{ mb: 2 }}>
          {error}
        </AlertBanner>
      )}
      <Typography sx={{ fontSize: 12.5, color: tokens.textMuted, mb: 2 }}>
        You can also read them on their own pages:{' '}
        <Link href="/terms" target="_blank" rel="noopener" sx={{ fontWeight: 600, color: tokens.goldDark }}>
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link href="/privacy" target="_blank" rel="noopener" sx={{ fontWeight: 600, color: tokens.goldDark }}>
          Privacy Policy
        </Link>
        .
      </Typography>
      <Typography component="h2" sx={{ fontSize: 17, fontWeight: 800, mb: 1.5 }}>
        Terms of Service
      </Typography>
      <LegalText sections={termsOfService({ minDownpayment })} compact />
      <Typography component="h2" sx={{ fontSize: 17, fontWeight: 800, mt: 4, mb: 1.5 }}>
        Privacy Policy
      </Typography>
      <LegalText sections={privacyPolicy()} compact />
    </AppDialog>
  );
}
