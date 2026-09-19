import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LockClockOutlinedIcon from '@mui/icons-material/LockClockOutlined';
import { tokens } from '../theme/tokens.js';

/** Inline banner (design system: AlertBanner) for light surfaces. */
const ALERT = {
  error: { bg: '#fef2f2', border: '#fecaca', fg: '#b91c1c', icon: ErrorOutlineRoundedIcon },
  info: { bg: '#eff6ff', border: '#bfdbfe', fg: '#1d4ed8', icon: InfoOutlinedIcon },
  success: { bg: '#ecfdf5', border: '#a7f3d0', fg: '#047857', icon: CheckCircleOutlineRoundedIcon },
  locked: { bg: '#fffbeb', border: '#fde68a', fg: '#92400e', icon: LockClockOutlinedIcon }
};

/** Coloured message box. tone: error / info / success / locked. */
export function AlertBanner({ tone = 'info', title, children, action, sx }) {
  const a = ALERT[tone];
  const Icon = a.icon;
  return (
    // role="alert" makes screen readers announce errors right away
    <Box
      role={tone === 'error' || tone === 'locked' ? 'alert' : 'status'}
      sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', px: 1.75, py: 1.4, borderRadius: 1.5, backgroundColor: a.bg, border: `1px solid ${a.border}`, color: a.fg, ...sx }}
    >
      <Icon sx={{ fontSize: 19, mt: '1px', flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {title && <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{title}</Typography>}
        {children && <Typography component="div" sx={{ fontSize: 12.75, lineHeight: 1.55, mt: title ? 0.25 : 0 }}>{children}</Typography>}
      </Box>
      {action && <Box sx={{ flexShrink: 0, alignSelf: 'center' }}>{action}</Box>}
    </Box>
  );
}

/** Centered empty state with the neutral-expression illustration. */
export function EmptyState({ title, description, action, icon: Icon, compact = false, sx }) {
  return (
    <Box sx={{ textAlign: 'center', py: compact ? 3 : 5, px: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, ...sx }}>
      <Box sx={{ width: compact ? 60 : 76, height: compact ? 60 : 76, borderRadius: '50%', display: 'grid', placeItems: 'center', backgroundColor: tokens.surfaceMuted, border: `1px solid ${tokens.cardLightBorder}`, mb: 1 }}>
        {Icon ? (
          <Icon sx={{ fontSize: compact ? 28 : 34, color: tokens.textMuted }} />
        ) : (
          <Box component="img" src="/images/icons/neutral-expression.svg" alt="" sx={{ width: compact ? 34 : 44, height: compact ? 34 : 44, opacity: 0.7 }} />
        )}
      </Box>
      <Typography sx={{ fontSize: compact ? 14.5 : 16, fontWeight: 700, color: tokens.textPrimary }}>{title}</Typography>
      {description && <Typography sx={{ maxWidth: 420, fontSize: 13, lineHeight: 1.6, color: tokens.textSecondary }}>{description}</Typography>}
      {action && <Box sx={{ mt: 1.5 }}>{action}</Box>}
    </Box>
  );
}

/** Error message for a failed load. "Try again" is hidden for NOT_FOUND, since retrying won't help. */
export function ErrorState({ error, onRetry, sx }) {
  return (
    <EmptyState
      icon={ErrorOutlineRoundedIcon}
      title={error && error.code === 'NOT_FOUND' ? 'Not found' : 'Something went wrong'}
      description={(error && error.message) || 'We could not load this page. Please try again.'}
      action={onRetry && error?.code !== 'NOT_FOUND' ? <Button variant="outlined" onClick={onRetry}>Try again</Button> : null}
      sx={sx}
    />
  );
}

/** Centered gold loading circle. */
export function Spinner({ label = 'Loading', sx }) {
  return (
    <Box role="status" aria-label={label} sx={{ py: 6, display: 'grid', placeItems: 'center', ...sx }}>
      <CircularProgress size={30} sx={{ color: tokens.gold }} />
    </Box>
  );
}

/** Placeholder rows while a list loads. */
export function ListSkeleton({ rows = 4, height = 44 }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} variant="rounded" height={height} sx={{ bgcolor: tokens.surfaceMuted }} />
      ))}
    </Box>
  );
}
