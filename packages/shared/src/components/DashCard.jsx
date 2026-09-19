import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { eyebrowSx, tokens } from '../theme/tokens.js';
import { LightSurface } from './Surface.jsx';

/** The white work card every portal panel sits in (design system: DashCard). */
export function DashCard({ children, sx, component = 'section', ...rest }) {
  return (
    <LightSurface>
      <Paper
        component={component}
        elevation={0}
        {...rest}
        sx={{
          p: { xs: 2, sm: 2.5 },
          backgroundColor: tokens.cardLight,
          color: tokens.textPrimary,
          border: `1px solid ${tokens.cardLightBorder}`,
          borderRadius: 2,
          boxShadow: tokens.shadowDash,
          minWidth: 0,
          ...sx
        }}
      >
        {children}
      </Paper>
    </LightSurface>
  );
}

/** Card heading with optional subtitle and a right-side action (e.g. a button). */
export function CardTitle({ children, action, subtitle, sx }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, mb: 2, ...sx }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography component="h2" sx={{ fontSize: 15, fontWeight: 700, color: tokens.textPrimary }}>
          {children}
        </Typography>
        {subtitle && <Typography sx={{ mt: 0.25, fontSize: 12.5, color: tokens.textMuted }}>{subtitle}</Typography>}
      </Box>
      {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
    </Box>
  );
}

// Icon colour and background for each StatCard tone
const ICON_TONES = {
  gold: { color: tokens.goldDark, bg: 'rgba(197, 160, 89, 0.14)' },
  blue: { color: tokens.blue, bg: 'rgba(59, 130, 246, 0.12)' },
  green: { color: tokens.green, bg: 'rgba(16, 185, 129, 0.12)' },
  amber: { color: '#d97706', bg: 'rgba(245, 158, 11, 0.14)' },
  red: { color: tokens.red, bg: 'rgba(239, 68, 68, 0.12)' },
  violet: { color: '#7c3aed', bg: 'rgba(139, 92, 246, 0.12)' }
};

/** One summary metric. Pass `onClick` to make the whole card an entry point. */
export function StatCard({ icon: Icon, tone = 'gold', label, value, meta, onClick, loading = false }) {
  const palette = ICON_TONES[tone] || ICON_TONES.gold;
  const body = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%', textAlign: 'left' }}>
      <Box sx={{ width: 46, height: 46, flexShrink: 0, borderRadius: 1.5, display: 'grid', placeItems: 'center', color: palette.color, backgroundColor: palette.bg }}>
        <Icon sx={{ fontSize: 22 }} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={eyebrowSx}>{label}</Typography>
        <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1.25, color: loading ? tokens.placeholder : tokens.textPrimary }}>
          {loading ? '—' : value}
        </Typography>
        {meta && <Typography sx={{ fontSize: 11.5, color: tokens.textMuted }}>{meta}</Typography>}
      </Box>
    </Box>
  );

  return (
    <DashCard sx={{ p: 0, overflow: 'hidden', transition: 'box-shadow 0.25s ease, transform 0.25s ease', ...(onClick && { '&:hover': { boxShadow: tokens.shadowDashHover, transform: 'translateY(-2px)' } }) }}>
      {/* Clickable cards are wrapped in a button; others are a plain box */}
      {onClick ? (
        <ButtonBase onClick={onClick} sx={{ width: '100%', p: 2.25, display: 'block' }}>
          {body}
        </ButtonBase>
      ) : (
        <Box sx={{ p: 2.25 }}>{body}</Box>
      )}
    </DashCard>
  );
}

/** Label / value pairs inside detail cards. */
export function DetailRow({ label, children, sx }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2, py: 0.9, ...sx }}>
      <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>{label}</Typography>
      <Typography component="div" sx={{ fontSize: 13.5, fontWeight: 600, color: tokens.textPrimary, textAlign: 'right' }}>
        {children}
      </Typography>
    </Box>
  );
}

/** Small uppercase label above a value. */
export function Field({ label, children, sx }) {
  return (
    <Box sx={{ minWidth: 0, ...sx }}>
      <Typography sx={{ ...eyebrowSx, fontSize: 10.5 }}>{label}</Typography>
      <Typography component="div" sx={{ mt: 0.25, fontSize: 13.5, fontWeight: 600, color: tokens.textPrimary, overflowWrap: 'anywhere' }}>
        {children || '—'}
      </Typography>
    </Box>
  );
}
