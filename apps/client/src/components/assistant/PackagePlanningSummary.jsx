import { Box, Chip, LinearProgress, Stack, Typography } from '@mui/material';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import { peso, tokens } from '@tm/shared';
import { buildCelebrationSummary } from '../../lib/assistantSummary.js';

export default function PackagePlanningSummary({ conversation }) {
  const {
    rows,
    completedCount,
    totalCount,
    statusLabel,
    eventName,
    venueLabel,
    colorsLabel,
    budgetNotes,
    selected,
    knownEstimateTotal,
    hasPendingCharges
  } = buildCelebrationSummary(conversation);

  const progress = Math.round((completedCount / totalCount) * 100);

  return (
    <Box
      data-assistant-summary
      sx={{
        p: { xs: 2.25, xl: 2.75 },
        display: 'flex',
        flexDirection: 'column',
        gap: 2
      }}
    >
      <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
          <Typography
            variant="overline"
            sx={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: tokens.goldText,
              lineHeight: 1.4
            }}
          >
            Saved in this conversation
          </Typography>
          <Chip
            size="small"
            icon={<AutoAwesomeOutlinedIcon sx={{ fontSize: '13px !important' }} />}
            label={statusLabel}
            sx={{
              height: 22,
              fontSize: 11,
              fontWeight: 600,
              bgcolor: completedCount > 0 ? 'rgba(197, 160, 89, 0.16)' : 'action.hover',
              color: completedCount > 0 ? tokens.goldText : 'text.secondary',
              border: '1px solid',
              borderColor: completedCount > 0 ? 'rgba(197, 160, 89, 0.35)' : 'divider'
            }}
          />
        </Stack>

        <Typography variant="h6" sx={{ fontSize: 19, fontWeight: 700, lineHeight: 1.3 }}>
          Your celebration
        </Typography>
        {eventName && (
          <Typography variant="body2" sx={{ mt: 0.25, fontWeight: 600, color: 'text.secondary' }}>
            {eventName}
          </Typography>
        )}

        <Box sx={{ mt: 1.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
              Planning progress
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 700, color: tokens.goldText }}>
              {completedCount} of {totalCount} details
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={progress}
            aria-label="Celebration planning progress"
            sx={{
              height: 6,
              borderRadius: 999,
              bgcolor: 'action.hover',
              '& .MuiLinearProgress-bar': {
                borderRadius: 999,
                bgcolor: tokens.gold
              }
            }}
          />
        </Box>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          borderTop: 1,
          borderColor: 'divider'
        }}
      >
        {rows.map(({ label, value, filled }) => (
          <Box
            key={label}
            sx={{
              py: 1.15,
              borderBottom: 1,
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 1.5
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, pt: 0.15 }}>
              {filled ? (
                <CheckCircleRoundedIcon sx={{ fontSize: 15, color: tokens.gold, flexShrink: 0 }} />
              ) : (
                <RadioButtonUncheckedRoundedIcon sx={{ fontSize: 15, color: 'text.disabled', flexShrink: 0 }} />
              )}
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 13, fontWeight: 500 }}>
                {label}
              </Typography>
            </Stack>
            <Typography
              variant="body2"
              sx={{
                fontSize: 14,
                fontWeight: filled ? 600 : 400,
                color: filled ? 'text.primary' : 'text.secondary',
                textAlign: 'right',
                overflowWrap: 'anywhere'
              }}
            >
              {value}
            </Typography>
          </Box>
        ))}
      </Box>

      {(venueLabel || colorsLabel) && (
        <Stack spacing={0.75} sx={{ px: 1.5, py: 1.25, borderRadius: 2, bgcolor: 'action.hover' }}>
          {venueLabel && (
            <Stack direction="row" spacing={1} alignItems="center">
              <PlaceOutlinedIcon sx={{ fontSize: 15, color: tokens.goldText, flexShrink: 0 }} />
              <Typography variant="caption" sx={{ fontSize: 13, fontWeight: 500, overflowWrap: 'anywhere' }}>
                {venueLabel}
              </Typography>
            </Stack>
          )}
          {colorsLabel && (
            <Stack direction="row" spacing={1} alignItems="center">
              <PaletteOutlinedIcon sx={{ fontSize: 15, color: tokens.goldText, flexShrink: 0 }} />
              <Typography variant="caption" sx={{ fontSize: 13, fontWeight: 500, overflowWrap: 'anywhere' }}>
                Motif: {colorsLabel}
              </Typography>
            </Stack>
          )}
        </Stack>
      )}

      {budgetNotes && (
        <Box sx={{ px: 1.5, py: 1.25, borderRadius: 2, border: 1, borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25, fontWeight: 600 }}>
            Priority notes
          </Typography>
          <Typography
            variant="body2"
            sx={{ fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
          >
            {budgetNotes}
          </Typography>
        </Box>
      )}

      {knownEstimateTotal !== null && (
        <Box
          sx={{
            p: 1.5,
            borderRadius: 2.5,
            bgcolor: 'rgba(197, 160, 89, 0.12)',
            border: '1px solid rgba(197, 160, 89, 0.35)'
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 700, color: tokens.goldText, display: 'block' }}>
            {selected
              ? `Reviewed ${selected.estimate.budgetStatus === 'incomplete' ? 'known subtotal' : 'estimate'}`
              : 'Estimated known subtotal'}
          </Typography>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: 16, mt: 0.25 }}>
            {peso(knownEstimateTotal)}
            {hasPendingCharges ? ' + pending charges' : ''}
          </Typography>
        </Box>
      )}

      <Typography variant="caption" component="p" color="text.secondary" sx={{ lineHeight: 1.8, fontSize: 13 }}>
        Each guided answer is saved when you continue. You can also type or use the microphone below. Final services and
        availability require team review.
      </Typography>
    </Box>
  );
}
