import { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import {
  AlertBanner,
  AppDialog,
  BusyButton,
  OtpInput,
  RULES,
  formatCountdown,
  shakeSx,
  tokens,
  useCountdown
} from '@tm/shared';


export function useCodeEntry() {
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState('idle');
  const [attemptsLeft, setAttemptsLeft] = useState(RULES.maxCodeAttempts);
  const [lockedUntil, setLockedUntil] = useState(null);
  const resendSeconds = useCountdown(challenge ? challenge.resendAt : null);
  const lockSeconds = useCountdown(lockedUntil);
  const locked = Boolean(lockedUntil && lockSeconds > 0);

  useEffect(() => {
    if (lockedUntil && lockSeconds === 0) {
      setLockedUntil(null);
      setAttemptsLeft(RULES.maxCodeAttempts);
    }
  }, [lockSeconds, lockedUntil]);

  const begin = useCallback((next) => {
    setChallenge(next);
    setCode('');
    setCodeState('idle');
    setAttemptsLeft(RULES.maxCodeAttempts);
    setLockedUntil(null);
  }, []);

  const resent = useCallback((times) => {
    setChallenge((current) => (current ? { ...current, ...times } : current));
    setCode('');
    setCodeState('idle');
  }, []);

  const type = useCallback((value) => {
    setCode(value);
    setCodeState('idle');
  }, []);

  const wrong = useCallback((error) => {
    setCodeState('error');
    setCode('');
    if (error.code === 'INVALID_CODE') {
      const left = error.meta.remaining;
      setAttemptsLeft(left);
      return `That code is incorrect. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`;
    }
    if (error.code === 'LOCKED') {
      setLockedUntil(error.meta.lockedUntil);
      setAttemptsLeft(0);
      return '';
    }
    return error.message;
  }, []);

  return {
    challenge,
    code,
    codeState,
    setCodeState,
    attemptsLeft,
    locked,
    lockSeconds,
    resendSeconds,
    begin,
    resent,
    type,
    wrong
  };
}

export function CodeEntry({ entry, busy, onComplete, onResend, onType, children }) {
  return (
    <>
      <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
        <MarkEmailReadOutlinedIcon sx={{ color: tokens.goldDark, mt: '2px' }} />
        <Typography sx={{ fontSize: 13.5, lineHeight: 1.55, color: tokens.textSecondary }}>
          We emailed a {RULES.codeLength}-digit code to <b>{entry.challenge.maskedEmail}</b>. It expires in{' '}
          {RULES.codeValidMinutes} minutes. If it is not in your inbox, check the spam folder.
        </Typography>
      </Box>
      {entry.locked && (
        <AlertBanner tone="locked" title="Code entry paused">
          Too many incorrect codes. Try again in <b>{formatCountdown(entry.lockSeconds)}</b>.
        </AlertBanner>
      )}
      <OtpInput
        length={RULES.codeLength}
        value={entry.code}
        onChange={(value) => {
          entry.type(value);
          if (onType) onType(value);
        }}
        onComplete={onComplete}
        disabled={busy || entry.locked}
        state={entry.codeState}
      />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {entry.resendSeconds > 0 ? (
          <Typography sx={{ fontSize: 12.5, color: tokens.textMuted }}>
            Resend code in {formatCountdown(entry.resendSeconds)}
          </Typography>
        ) : (
          <Link
            component="button"
            type="button"
            onClick={onResend}
            disabled={busy}
            sx={{ fontSize: 12.5, fontWeight: 700, color: tokens.goldDark }}
          >
            Resend code
          </Link>
        )}
        <Typography sx={{ fontSize: 12.5, color: entry.attemptsLeft <= 2 ? tokens.redPress : tokens.textMuted }}>
          {entry.attemptsLeft} of {RULES.maxCodeAttempts} attempts left
        </Typography>
      </Box>
      {children}
    </>
  );
}

export function EmailCodeDialog({
  challenge,
  title,
  description,
  actionLabel = 'Verify',
  onVerify,
  onResend,
  onRestart,
  onClose
}) {
  const entry = useCodeEntry();
  const { begin } = entry;
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (challenge) {
      begin(challenge);
      setFormError('');
    }
  }, [challenge, begin]);

  const verify = async (value = entry.code) => {
    if (value.length !== RULES.codeLength) {
      setFormError(`Enter all ${RULES.codeLength} digits.`);
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await onVerify(value);
      entry.setCodeState('success');
    } catch (error) {
      if (error.code === 'CHALLENGE_EXPIRED') onRestart(error.message);
      else {
        setShake(true);
        setFormError(entry.wrong(error));
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setFormError('');
    try {
      entry.resent(await onResend());
    } catch (error) {
      if (error.code === 'CHALLENGE_EXPIRED') onRestart(error.message);
      else setFormError(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppDialog
      open={Boolean(challenge)}
      onClose={onClose}
      busy={busy}
      maxWidth="xs"
      title={title}
      description={description}
      actions={
        <>
          <Button onClick={onClose} disabled={busy} sx={{ color: tokens.textSecondary }}>
            Cancel
          </Button>
          <BusyButton
            busy={busy}
            onClick={() => verify()}
            disabled={entry.locked || entry.code.length !== RULES.codeLength}
          >
            {actionLabel}
          </BusyButton>
        </>
      }
    >
      <Box
        onAnimationEnd={() => setShake(false)}
        sx={{ display: 'flex', flexDirection: 'column', gap: 2, ...shakeSx(shake) }}
      >
        {formError && !entry.locked && <AlertBanner tone="error">{formError}</AlertBanner>}
        {entry.challenge && (
          <CodeEntry
            entry={entry}
            busy={busy}
            onComplete={(value) => verify(value)}
            onResend={resend}
            onType={() => setFormError('')}
          />
        )}
      </Box>
    </AppDialog>
  );
}
