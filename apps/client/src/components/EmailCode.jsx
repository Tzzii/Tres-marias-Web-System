import { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import { AlertBanner, AppDialog, BusyButton, OtpInput, RULES, formatCountdown, shakeSx, tokens, useCountdown } from '@tm/shared';

/**
 * The emailed-code step of the customer site (Phase 12: every customer code goes by email, never by SMS).
 * Three flows use it: Sign up (the account is made only after the code), Forgot password (Log in page and
 * My profile) and the password change in My profile. The server keeps the request, counts the wrong
 * codes and pauses code entry after too many; these pieces only show it.
 *   useCodeEntry()   the step's state: the request, the typed code, tries left, the pause, the resend timer
 *   CodeEntry        what the step shows: where the code went, the boxes, "Resend code", tries left
 *   EmailCodeDialog  the whole step in a dialog, for sign-up and the password change
 */

/**
 * State for one code step. `challenge` is the server's request ({ challengeId, maskedEmail, expiresAt,
 * resendAt }); begin(challenge) starts with a new one (empty boxes, every try back), resent(times) takes
 * a resend's new times, type(value) follows the boxes, and wrong(error) shows a refused code (red,
 * emptied boxes, the tries the server says are left, or the pause) and returns the message for the
 * error banner ('' while the pause banner says it). When the pause ends, every try is back.
 */
export function useCodeEntry() {
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState('idle'); // idle / error / success colour of the boxes
  const [attemptsLeft, setAttemptsLeft] = useState(RULES.maxCodeAttempts);
  const [lockedUntil, setLockedUntil] = useState(null); // code entry paused until this time
  const resendSeconds = useCountdown(challenge ? challenge.resendAt : null);
  const lockSeconds = useCountdown(lockedUntil);
  const locked = Boolean(lockedUntil && lockSeconds > 0);

  // The pause is over: every try is back
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

  return { challenge, code, codeState, setCodeState, attemptsLeft, locked, lockSeconds, resendSeconds, begin, resent, type, wrong };
}

/**
 * What a code step shows (`entry` is useCodeEntry()): the address the code went to, the pause banner,
 * the code boxes (checked as soon as the last digit is typed: onComplete), "Resend code" once the
 * resend timer runs out, and the tries left. `onType` runs on every change in the boxes (e.g. to clear
 * an error banner). `children` go under it (e.g. "Use a different email").
 */
export function CodeEntry({ entry, busy, onComplete, onResend, onType, children }) {
  return (
    <>
      <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
        <MarkEmailReadOutlinedIcon sx={{ color: tokens.goldDark, mt: '2px' }} />
        <Typography sx={{ fontSize: 13.5, lineHeight: 1.55, color: tokens.textSecondary }}>
          We emailed a {RULES.codeLength}-digit code to <b>{entry.challenge.maskedEmail}</b>. It expires in {RULES.codeValidMinutes} minutes. If it is not in your inbox, check the spam folder.
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
          <Typography sx={{ fontSize: 12.5, color: tokens.textMuted }}>Resend code in {formatCountdown(entry.resendSeconds)}</Typography>
        ) : (
          <Link component="button" type="button" onClick={onResend} disabled={busy} sx={{ fontSize: 12.5, fontWeight: 700, color: tokens.goldDark }}>
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

/**
 * The emailed-code step in a dialog, open while `challenge` (the start step's answer) is set. The parent
 * calls the API: onVerify(code) saves and moves on (it resolves; a refusal rejects with the ApiError),
 * onResend() asks for a new code and resolves with { expiresAt, resendAt }, onRestart(message) runs when
 * the request can no longer be used (it expired: the parent closes the dialog and says why), and
 * onClose() is Cancel. A wrong code shakes the dialog, empties the boxes and says how many tries are left.
 */
export function EmailCodeDialog({ challenge, title, description, actionLabel = 'Verify', onVerify, onResend, onRestart, onClose }) {
  const entry = useCodeEntry();
  const { begin } = entry;
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [shake, setShake] = useState(false);

  // A new request from the parent: start the step over
  useEffect(() => {
    if (challenge) {
      begin(challenge);
      setFormError('');
    }
  }, [challenge, begin]);

  // Check the code (all digits typed); on success the parent moves on
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

  // Ask for a new code (once the resend timer has run out)
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
          <BusyButton busy={busy} onClick={() => verify()} disabled={entry.locked || entry.code.length !== RULES.codeLength}>
            {actionLabel}
          </BusyButton>
        </>
      }
    >
      <Box onAnimationEnd={() => setShake(false)} sx={{ display: 'flex', flexDirection: 'column', gap: 2, ...shakeSx(shake) }}>
        {formError && !entry.locked && <AlertBanner tone="error">{formError}</AlertBanner>}
        {entry.challenge && <CodeEntry entry={entry} busy={busy} onComplete={(value) => verify(value)} onResend={resend} onType={() => setFormError('')} />}
      </Box>
    </AppDialog>
  );
}
