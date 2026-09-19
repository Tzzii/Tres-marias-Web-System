import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { tokens } from '../theme/tokens.js';
import { LightSurface } from './Surface.jsx';
import { FormField } from './FormField.jsx';

/**
 * Standard light dialog: title, optional description, body, action row.
 * Goes full-screen on phones when `fullScreenOnMobile` is set.
 */
export function AppDialog({ open, onClose, title, description, children, actions, maxWidth = 'sm', fullScreenOnMobile = false, busy = false }) {
  const isPhone = useMediaQuery('(max-width:599px)');
  return (
    <LightSurface>
      <Dialog
        open={open}
        // Can't be closed (Esc / clicking outside) while a request is running
        onClose={busy ? undefined : onClose}
        fullWidth
        maxWidth={maxWidth}
        fullScreen={fullScreenOnMobile && isPhone}
        aria-labelledby="app-dialog-title"
      >
        <Box sx={{ px: { xs: 2.5, sm: 3 }, pt: 2.5, pb: description ? 1 : 1.5, display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography id="app-dialog-title" component="h2" sx={{ fontSize: 18, fontWeight: 700, color: tokens.textPrimary }}>
              {title}
            </Typography>
            {description && <Typography sx={{ mt: 0.75, fontSize: 13.5, lineHeight: 1.6, color: tokens.textSecondary }}>{description}</Typography>}
          </Box>
          <IconButton onClick={onClose} disabled={busy} aria-label="Close" size="small" sx={{ mt: -0.5, mr: -1, color: tokens.textMuted }}>
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </Box>
        {children && <Box sx={{ px: { xs: 2.5, sm: 3 }, py: 1.5, overflowY: 'auto' }}>{children}</Box>}
        {actions && (
          <Box sx={{ px: { xs: 2.5, sm: 3 }, pt: 1.5, pb: 2.5, display: 'flex', gap: 1.25, justifyContent: 'flex-end', flexWrap: 'wrap' }}>{actions}</Box>
        )}
      </Dialog>
    </LightSurface>
  );
}

/** A primary action button that shows a spinner while its request runs. */
export function BusyButton({ busy, children, disabled, ...props }) {
  return (
    <Button variant="contained" disabled={busy || disabled} {...props}>
      {busy ? <CircularProgress size={18} sx={{ color: 'inherit' }} /> : children}
    </Button>
  );
}

/**
 * Confirmation dialog. With `reasonLabel`, a reason is required before confirming
 * (declines, cancellations, rejected payments).
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  reasonLabel,
  reasonPlaceholder,
  children
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Clear the reason and errors each time the dialog opens
  useEffect(() => {
    if (open) {
      setReason('');
      setError('');
      setBusy(false);
    }
  }, [open]);

  // Check the reason (if required), then run onConfirm. If it fails, show the error and stay open.
  const handleConfirm = async () => {
    if (reasonLabel && reason.trim().length < 5) {
      setError('Please give a short reason (at least 5 characters).');
      return;
    }
    setBusy(true);
    try {
      await onConfirm(reason.trim());
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      busy={busy}
      maxWidth="xs"
      actions={
        <>
          <Button onClick={onClose} disabled={busy} sx={{ color: tokens.textSecondary }}>
            {cancelLabel}
          </Button>
          <BusyButton busy={busy} color={tone === 'danger' ? 'error' : 'primary'} onClick={handleConfirm}>
            {confirmLabel}
          </BusyButton>
        </>
      }
    >
      {children}
      {reasonLabel && (
        <FormField
          id="confirm-reason"
          label={reasonLabel}
          required
          multiline
          minRows={3}
          value={reason}
          placeholder={reasonPlaceholder}
          onChange={(e) => {
            setReason(e.target.value);
            setError('');
          }}
          error={error}
        />
      )}
      {!reasonLabel && error && <Typography sx={{ color: tokens.redPress, fontSize: 13 }}>{error}</Typography>}
    </AppDialog>
  );
}
