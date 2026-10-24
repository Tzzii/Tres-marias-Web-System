import { useCallback, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import {
  AlertBanner,
  AppDialog,
  BusyButton,
  CodeVerification,
  RULES,
  formatCountdown,
  tokens,
  useCountdown
} from '@tm/shared';

export function useCodeEntry() {
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState('idle');
  const [attemptsLeft, setAttemptsLeft] = useState(RULES.maxCodeAttempts);
  const [lockedUntil, setLockedUntil] = useState(null);
  const pending = useRef(false);
  const completion = useRef(null);
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
    pending.current = false;
    completion.current = null;
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
    if (error.code === 'INVALID_CODE') {
      pending.current = 'error';
      setCodeState('error');
      const left = error.meta.remaining;
      setAttemptsLeft(left);
      return `That code is incorrect. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`;
    }
    if (error.code === 'LOCKED') {
      pending.current = 'error';
      setCodeState('error');
      setLockedUntil(error.meta.lockedUntil);
      setAttemptsLeft(0);
      return '';
    }
    return error.message;
  }, []);

  const startVerification = useCallback(() => {
    if (pending.current) return false;
    pending.current = 'request';
    return true;
  }, []);

  const endVerification = useCallback(() => {
    if (pending.current === 'request') pending.current = false;
  }, []);

  const succeed = useCallback((onComplete) => {
    pending.current = 'success';
    completion.current = onComplete;
    setCodeState('success');
  }, []);

  const finishSuccess = useCallback(() => {
    const onComplete = completion.current;
    completion.current = null;
    pending.current = false;
    setCodeState('idle');
    setCode('');
    onComplete?.();
  }, []);

  const finishError = useCallback(() => {
    pending.current = false;
    setCode('');
    setCodeState('idle');
  }, []);

  return {
    challenge,
    code,
    codeState,
    animating: codeState === 'success' || codeState === 'error',
    startVerification,
    endVerification,
    succeed,
    finishSuccess,
    finishError,
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

export function CodeEntry({ entry, busy, onComplete, onResend, onType, loadingLabel = 'Finishing up…', children }) {
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
      <CodeVerification
        length={RULES.codeLength}
        value={entry.code}
        onChange={(value) => {
          entry.type(value);
          if (onType) onType(value);
        }}
        onComplete={onComplete}
        disabled={busy || entry.animating || entry.locked}
        state={entry.codeState}
        onSuccessComplete={entry.finishSuccess}
        onErrorComplete={entry.finishError}
        loadingLabel={loadingLabel}
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
            disabled={busy || entry.animating}
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
  onVerified,
  loadingLabel,
  onResend,
  onRestart,
  onClose
}) {
  const entry = useCodeEntry();
  const { begin } = entry;
  const [requestBusy, setBusy] = useState(false);
  const busy = requestBusy || entry.animating;
  const [formError, setFormError] = useState('');

  useEffect(() => {
    begin(challenge);
    setFormError('');
  }, [challenge, begin]);

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
      const result = await onVerify(value);
      if (result !== null) entry.succeed(() => onVerified?.(result));
    } catch (error) {
      if (error.code === 'CHALLENGE_EXPIRED') onRestart(error.message);
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
            busy={requestBusy && entry.codeState !== 'success'}
            onClick={() => verify()}
            disabled={busy || entry.locked || entry.code.length !== RULES.codeLength}
          >
            {entry.codeState === 'success' ? 'Code verified' : actionLabel}
          </BusyButton>
        </>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {formError && !entry.locked && <AlertBanner tone="error">{formError}</AlertBanner>}
        {entry.challenge && (
          <CodeEntry
            entry={entry}
            busy={busy}
            onComplete={(value) => verify(value)}
            onResend={resend}
            onType={() => setFormError('')}
            loadingLabel={loadingLabel}
          />
        )}
      </Box>
    </AppDialog>
  );
}
