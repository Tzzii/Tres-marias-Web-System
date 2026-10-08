import Box from '@mui/material/Box';
import { qrState } from '../domain/payment.js';
import { BALANCE_STATE, FEEDBACK_STATUS, PAYMENT_STATUS, QR_STATUS, STATUS, feedbackState } from '../utils/status.js';

/** A rounded status label. Colours come from the status maps in utils/status.js. */
export function Pill({ label, bg, fg, dot = true, size = 'md', sx }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: size === 'sm' ? 1 : 1.25,
        py: size === 'sm' ? 0.25 : 0.5,
        borderRadius: 999,
        fontSize: size === 'sm' ? 10.5 : 11.5,
        fontWeight: 700,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        color: fg,
        backgroundColor: bg,
        ...sx
      }}
    >
      {dot && <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'currentColor', flexShrink: 0 }} />}
      {label}
    </Box>
  );
}

/** Reservation status chip (falls back to grey for an unknown status). */
export function StatusChip({ status, size, sx }) {
  const s = STATUS[status] || { label: status, bg: '#f1f5f9', fg: '#334155' };
  return <Pill label={s.label} bg={s.bg} fg={s.fg} size={size} sx={sx} />;
}

/** Payment status chip: awaiting / verified / rejected. */
export function PaymentStatusChip({ status, size }) {
  const s = PAYMENT_STATUS[status];
  return <Pill label={s.label} bg={s.bg} fg={s.fg} size={size} />;
}

/**
 * QR Ph code chip: Waiting for payment / Checking payment / Paid / Expired · not charged / Failed · not
 * charged (qrState from the QR's status and `at`, the time now unless given). Waiting turns into Checking
 * only when the page renders again, which useQrWatch does when the QR's time runs out.
 */
export function QrStatusChip({ qr, at, size }) {
  const s = QR_STATUS[qrState(qr, at)] || { label: qr.status, bg: '#f1f5f9', fg: '#334155' };
  return <Pill label={s.label} bg={s.bg} fg={s.fg} size={size} />;
}

/** Balance chip: unpaid / partial / full / overdue. */
export function BalanceChip({ state, size }) {
  const s = BALANCE_STATE[state];
  return <Pill label={s.label} bg={s.bg} fg={s.fg} size={size} />;
}

/** Feedback chip: featured / published / not published / flagged / archived. */
export function FeedbackStatusChip({ feedback, size }) {
  const s = FEEDBACK_STATUS[feedbackState(feedback)];
  return <Pill label={s.label} bg={s.bg} fg={s.fg} size={size} />;
}
