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
  PasswordField,
  RULES,
  authApi,
  maskEmail,
  shakeSx,
  tokens,
  validateEmail,
  validatePassword
} from '@tm/shared';
import { CodeEntry, useCodeEntry } from './EmailCode.jsx';

/**
 * Forgot password, in one dialog (Phase 12: the code goes by email, never by SMS):
 * 1. the email → checked (format, then that an account uses it) → the server emails a 6-digit code
 * 2. the emailed code → Verify
 * 3. the new password (same rules as sign-up) and its confirmation → Save
 * Two places open it:
 * - the Log in page ("Forgot password?"): the visitor types the email (`initialEmail` fills it in);
 * - My profile ("Forgot your current password?"): `accountEmail` is the signed-in customer's address,
 *   so step 1 only says where the code will go. The server then renews this session's token, so the
 *   customer stays signed in here while every other session ends.
 * `onDone({ email })` runs after the password is saved.
 */
export default function PasswordResetDialog({ open, onClose, initialEmail = '', accountEmail = '', onDone }) {
  const [step, setStep] = useState('email'); // 'email' | 'code' | 'password'
  const [email, setEmail] = useState(accountEmail || initialEmail);
  const entry = useCodeEntry();
  const { begin } = entry;
  const [values, setValues] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({}); // per-field messages
  const [formError, setFormError] = useState(''); // banner message
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  // Start over each time the dialog opens, with the email typed on the log-in form (or the account's)
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

  // Back to step 1 with a message, e.g. when the request expired
  const restart = (message) => {
    setStep('email');
    begin(null);
    setFormError(message);
  };

  // Step 1: check the email format, then ask the server; it checks the account and emails the code
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

  // Step 2: check the emailed code; on success move on to the new password
  const verify = async (value = entry.code) => {
    if (value.length !== RULES.codeLength) {
      setFormError(`Enter all ${RULES.codeLength} digits.`);
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await authApi.verifyPasswordResetCode({ challengeId: entry.challenge.challengeId, code: value });
      entry.setCodeState('success');
      setStep('password');
    } catch (error) {
      if (error.code === 'CHALLENGE_EXPIRED') restart(error.message);
      else {
        setShake(true);
        setFormError(entry.wrong(error));
      }
    } finally {
      setBusy(false);
    }
  };

  // Email a new code (allowed once the resend timer ends). Asking too soon or too often only shows the
  // message; an expired request starts the reset again.
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

  // Step 3: check the new password and its confirmation, then save it
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
      const result = await authApi.completePasswordReset({ challengeId: entry.challenge.challengeId, password: values.password });
      onDone(result);
    } catch (error) {
      if (error.code === 'CHALLENGE_EXPIRED') restart(error.message);
      else if (error.meta && error.meta.field) setErrors({ [error.meta.field]: error.message });
      else setFormError(error.message);
    } finally {
      setBusy(false);
    }
  };

  // Title, line under it and main button for each step
  const STEPS = {
    email: {
      title: 'Reset your password',
      description: accountEmail ? '' : 'Enter the email you used to sign up. We will email you a code to choose a new password.',
      action: accountEmail ? 'Send code' : 'Proceed',
      onClick: proceed
    },
    code: { title: 'Enter the code', description: '', action: 'Verify', onClick: () => verify() },
    password: { title: 'Create a new password', description: 'Use 8 characters or more, with at least one number.', action: 'Save password', onClick: save }
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
          <Button onClick={onClose} sx={{ color: tokens.textSecondary }}>
            Cancel
          </Button>
          <BusyButton busy={busy} onClick={current.onClick} disabled={step === 'code' && (entry.locked || entry.code.length !== RULES.codeLength)}>
            {current.action}
          </BusyButton>
        </>
      }
    >
      {/* Enter in a text field submits the current step (the code boxes check themselves when full) */}
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
        onAnimationEnd={() => setShake(false)}
        sx={{ display: 'flex', flexDirection: 'column', gap: 2, ...shakeSx(shake) }}
      >
        {formError && !entry.locked && <AlertBanner tone="error">{formError}</AlertBanner>}

        {step === 'email' && accountEmail && (
          <Typography sx={{ fontSize: 13.5, lineHeight: 1.6, color: tokens.textSecondary }}>
            We will email a {RULES.codeLength}-digit code to <b>{maskEmail(accountEmail)}</b>, the email of your account. Enter it on the next step, then choose a new password. You stay signed in on this device.
          </Typography>
        )}
        {step === 'email' && !accountEmail && (
          <FormField id="forgot-email" label="Email" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setErrors({}); }} error={errors.email} disabled={busy} autoFocus />
        )}

        {step === 'code' && entry.challenge && (
          <CodeEntry entry={entry} busy={busy} onComplete={(value) => verify(value)} onResend={resend} onType={() => setFormError('')}>
            {!accountEmail && (
              <Link component="button" type="button" onClick={() => restart('')} disabled={busy} sx={{ alignSelf: 'flex-start', fontSize: 12.5, color: tokens.textSecondary }}>
                Use a different email
              </Link>
            )}
          </CodeEntry>
        )}

        {step === 'password' && (
          <>
            <PasswordField id="reset-password" label="New password" required autoComplete="new-password" value={values.password} onChange={(e) => { setValues((v) => ({ ...v, password: e.target.value })); setErrors((er) => ({ ...er, password: '' })); }} error={errors.password} disabled={busy} autoFocus />
            <PasswordField id="reset-confirm" label="Confirm new password" required autoComplete="new-password" value={values.confirm} onChange={(e) => { setValues((v) => ({ ...v, confirm: e.target.value })); setErrors((er) => ({ ...er, confirm: '' })); }} error={errors.confirm} disabled={busy} />
          </>
        )}
      </Box>
    </AppDialog>
  );
}
