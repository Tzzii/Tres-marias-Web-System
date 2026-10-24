import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import {
  AlertBanner,
  AppDialog,
  BusyButton,
  FormField,
  PasswordChecklist,
  PasswordField,
  RULES,
  authApi,
  maskEmail,
  tokens,
  validateEmail,
  validatePassword
} from '@tm/shared';
import { CodeEntry, useCodeEntry } from './EmailCode.jsx';

export default function PasswordResetDialog({ open, onClose, initialEmail = '', accountEmail = '', onDone }) {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState(accountEmail || initialEmail);
  const entry = useCodeEntry();
  const { begin } = entry;
  const [values, setValues] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [requestBusy, setBusy] = useState(false);
  const busy = requestBusy || entry.animating;

  useEffect(() => {
    if (open) {
      setStep('email');
      setEmail(accountEmail || initialEmail);
      begin(null);
      setValues({ password: '', confirm: '' });
      setErrors({});
      setFormError('');
    }
  }, [open, initialEmail, accountEmail, begin]);

  const restart = (message) => {
    setStep('email');
    begin(null);
    setFormError(message);
  };

  const proceed = async () => {
    const message = validateEmail(email);
    if (message) {
      setErrors({ email: message });
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      begin(await authApi.startPasswordReset({ email }));
      setStep('code');
    } catch (error) {
      if (!accountEmail && error.meta && error.meta.field) setErrors({ [error.meta.field]: error.message });
      else setFormError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value = entry.code) => {
    if (busy || entry.locked || !entry.challenge) return;
    if (value.length !== RULES.codeLength) {
      setFormError(`Enter all ${RULES.codeLength} digits.`);
      return;
    }
    if (!entry.startVerification()) return;
    setBusy(true);
    setFormError('');
    try {
      await authApi.verifyPasswordResetCode({ challengeId: entry.challenge.challengeId, code: value });
      entry.succeed(() => setStep('password'));
    } catch (error) {
      if (error.code === 'CHALLENGE_EXPIRED') restart(error.message);
      else {
        setFormError(entry.wrong(error));
      }
    } finally {
      entry.endVerification();
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setFormError('');
    try {
      entry.resent(await authApi.resendPasswordResetCode(entry.challenge.challengeId));
    } catch (error) {
      if (error.code === 'CHALLENGE_EXPIRED') restart(error.message);
      else setFormError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const found = {};
    const passwordError = validatePassword(values.password);
    if (passwordError) found.password = passwordError;
    if (!values.confirm) found.confirm = 'Confirm your password.';
    else if (values.confirm !== values.password) found.confirm = 'Passwords do not match.';
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const result = await authApi.completePasswordReset({
        challengeId: entry.challenge.challengeId,
        password: values.password
      });
      onDone(result);
    } catch (error) {
      if (error.code === 'CHALLENGE_EXPIRED') restart(error.message);
      else if (error.meta && error.meta.field) setErrors({ [error.meta.field]: error.message });
      else setFormError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const STEPS = {
    email: {
      title: 'Reset Your Password',
      description: accountEmail
        ? ''
        : 'Enter the email you used to sign up. We will email you a code to choose a new password.',
      action: accountEmail ? 'Send code' : 'Proceed',
      onClick: proceed
    },
    code: { title: 'Enter the Code', description: '', action: 'Verify', onClick: () => verify() },
    password: {
      title: 'Create a New Password',
      description:
        'Use 8 characters or more, with a lowercase and an uppercase letter, a number and a special character.',
      action: 'Save password',
      onClick: save
    }
  };
  const current = STEPS[step];

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      busy={busy}
      maxWidth="xs"
      title={current.title}
      description={current.description || undefined}
      actions={
        <>
          <Button onClick={onClose} disabled={busy} sx={{ color: tokens.textSecondary }}>
            Cancel
          </Button>
          <BusyButton
            busy={requestBusy && entry.codeState !== 'success'}
            onClick={current.onClick}
            disabled={busy || (step === 'code' && (entry.locked || entry.code.length !== RULES.codeLength))}
          >
            {step === 'code' && entry.codeState === 'success' ? 'Code verified' : current.action}
          </BusyButton>
        </>
      }
    >
      <Box
        component="form"
        noValidate
        onSubmit={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && step !== 'code' && e.target.tagName === 'INPUT') {
            e.preventDefault();
            current.onClick();
          }
        }}
        sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
      >
        {formError && !entry.locked && <AlertBanner tone="error">{formError}</AlertBanner>}

        {step === 'email' && accountEmail && (
          <Typography sx={{ fontSize: 13.5, lineHeight: 1.6, color: tokens.textSecondary }}>
            We will email a {RULES.codeLength}-digit code to <b>{maskEmail(accountEmail)}</b>, the email of your
            account. Enter it on the next step, then choose a new password. You stay signed in on this device.
          </Typography>
        )}
        {step === 'email' && !accountEmail && (
          <FormField
            id="forgot-email"
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrors({});
            }}
            error={errors.email}
            disabled={busy}
            autoFocus
          />
        )}

        {step === 'code' && entry.challenge && (
          <CodeEntry
            entry={entry}
            busy={busy}
            onComplete={(value) => verify(value)}
            onResend={resend}
            onType={() => setFormError('')}
            loadingLabel="Preparing the next step…"
          >
            {!accountEmail && (
              <Link
                component="button"
                type="button"
                onClick={() => restart('')}
                disabled={busy}
                sx={{ alignSelf: 'flex-start', fontSize: 12.5, color: tokens.textSecondary }}
              >
                Use a different email
              </Link>
            )}
          </CodeEntry>
        )}

        {step === 'password' && (
          <>
            <Box>
              <PasswordField
                id="reset-password"
                label="New password"
                required
                autoComplete="new-password"
                value={values.password}
                onChange={(e) => {
                  setValues((v) => ({ ...v, password: e.target.value }));
                  setErrors((er) => ({ ...er, password: '' }));
                }}
                error={errors.password}
                disabled={busy}
                autoFocus
              />
              <PasswordChecklist value={values.password} />
            </Box>
            <PasswordField
              id="reset-confirm"
              label="Confirm new password"
              required
              autoComplete="new-password"
              value={values.confirm}
              onChange={(e) => {
                setValues((v) => ({ ...v, confirm: e.target.value }));
                setErrors((er) => ({ ...er, confirm: '' }));
              }}
              error={errors.confirm}
              disabled={busy}
            />
          </>
        )}
      </Box>
    </AppDialog>
  );
}
