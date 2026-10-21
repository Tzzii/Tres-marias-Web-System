import { useEffect, useId, useState } from 'react';
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
export function AppDialog({
  open,
  onClose,
  title,
  description,
  children,
  actions,
  maxWidth = 'sm',
  fullScreenOnMobile = false,
  busy = false,
  protectChanges = true
}) {
  const isPhone = useMediaQuery('(max-width:599px)');
  const titleId = useId();
  const discardId = useId();
  const [changed, setChanged] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  useEffect(() => {
    setChanged(false);
    setDiscardOpen(false);
  }, [open]);
  useEffect(() => {
    if (!open || !changed || !protectChanges) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [open, changed, protectChanges]);
  const close = () => {
    if (busy) return;
    if (changed && protectChanges) setDiscardOpen(true);
    else onClose?.();
  };
  return (
    <LightSurface>
      <Dialog
        open={open}
        // Can't be closed (Esc / clicking outside) while a request is running
        onClose={busy ? undefined : close}
        fullWidth
        maxWidth={maxWidth}
        fullScreen={fullScreenOnMobile && isPhone}
        aria-labelledby={titleId}
      >
        <Box
          sx={{
            px: { xs: 1.5, sm: 3 },
            pt: 2.5,
            pb: description ? 1 : 1.5,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 2
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography id={titleId} component="h2" sx={{ fontSize: 18, fontWeight: 700, color: tokens.textPrimary }}>
              {title}
            </Typography>
            {description && (
              <Typography sx={{ mt: 0.75, fontSize: 13.5, lineHeight: 1.6, color: tokens.textSecondary }}>
                {description}
              </Typography>
            )}
          </Box>
          <IconButton
            onClick={close}
            disabled={busy}
            aria-label="Close"
            size="small"
            sx={{ mt: -0.5, mr: -1, color: tokens.textMuted }}
          >
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </Box>
        {children && (
          <Box
            onChangeCapture={() => setChanged(true)}
            sx={{
              px: { xs: 1.5, sm: 3 },
              py: 1.5,
              minWidth: 0,
              overflowY: 'auto',
              overflowWrap: 'anywhere',
              overscrollBehavior: 'contain'
            }}
          >
            {children}
          </Box>
        )}
        {actions && (
          <Box
            sx={{
              px: { xs: 1.5, sm: 3 },
              pt: 1.5,
              pb: 2.5,
              display: 'flex',
              gap: 1.25,
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
              '& > button': { maxWidth: '100%', '@media (max-width: 399px)': { flex: '1 1 100%' } }
            }}
          >
            {actions}
          </Box>
        )}
      </Dialog>
      <Dialog
        open={open && discardOpen}
        onClose={() => setDiscardOpen(false)}
        aria-labelledby={discardId}
        maxWidth="xs"
        fullWidth
      >
        <Box sx={{ p: 3 }}>
          <Typography id={discardId} component="h2" sx={{ fontSize: 18, fontWeight: 600 }}>
            Discard your changes?
          </Typography>
          <Typography sx={{ mt: 1, fontSize: 13, color: tokens.textSecondary }}>
            Your edits in this window have not been saved.
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 3 }}>
            <Button onClick={() => setDiscardOpen(false)}>Keep editing</Button>
            <Button
              color="error"
              onClick={() => {
                setChanged(false);
                setDiscardOpen(false);
                onClose?.();
              }}
            >
              Discard changes
            </Button>
          </Box>
        </Box>
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
