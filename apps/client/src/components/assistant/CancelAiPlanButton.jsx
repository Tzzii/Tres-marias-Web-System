import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth.js';
import { assistantApi } from '../../lib/assistantApi.js';

export default function CancelAiPlanButton({ conversation, disabled, onChange, onBusyChange }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  const label =
    conversation.bookingDraft?.planningMode === 'custom' ? 'Cancel package plan' : 'Cancel guided reservation';

  async function cancel() {
    if (disabled || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    onBusyChange(true);
    const controller = new AbortController();
    request.current = controller;
    try {
      const fresh = await assistantApi.newReservation(user?.id, controller.signal);
      if (controller.signal.aborted) return;
      setOpen(false);
      onChange(fresh);
      const params = new URLSearchParams(location.search);
      params.delete('proposal');
      params.delete('question');
      navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.message);
    } finally {
      pending.current = false;
      if (!controller.signal.aborted) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  }

  if (!conversation.bookingDraft?.planningStarted || conversation.submittedRef) return null;
  return (
    <>
      <Button
        color="error"
        size="small"
        disabled={disabled || busy}
        onClick={() => {
          setError('');
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        aria-labelledby="cancel-ai-plan-title"
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle id="cancel-ai-plan-title">{label}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This ends your current AI planning session, including its conversation and package selection, and opens a
            fresh one. Your separately saved booking form, submitted reservations, and remaining AI allowance stay
            unchanged.
          </DialogContentText>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setOpen(false)}>
            Keep planning
          </Button>
          <Button color="error" variant="contained" disabled={busy} onClick={() => void cancel()}>
            {busy ? 'Cancelling…' : 'Yes, cancel plan'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
