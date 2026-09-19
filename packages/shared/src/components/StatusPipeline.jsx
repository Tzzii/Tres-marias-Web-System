import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { tokens } from '../theme/tokens.js';
import { PIPELINE, STATUS, pipelineIndex } from '../utils/status.js';

/**
 * The five-step status strip shown on both portals. Horizontal from `md` up,
 * stacked vertically on phones. Declined / cancelled reservations show where the
 * pipeline stopped.
 */
export function StatusPipeline({ status, compact = false }) {
  const stopped = status === 'declined' || status === 'cancelled';
  const current = stopped ? 0 : pipelineIndex(status); // index of the current step

  return (
    <Box>
      <Box
        component="ol"
        aria-label="Reservation status"
        sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          display: 'flex',
          flexDirection: { xs: compact ? 'row' : 'column', md: 'row' },
          gap: { xs: compact ? 0.5 : 1.25, md: 0.5 }
        }}
      >
        {PIPELINE.map((step, index) => {
          const done = !stopped && index < current; // steps already passed (green tick)
          const active = !stopped && index === current; // the current step (highlighted)
          const isLast = index === PIPELINE.length - 1;
          // Done steps are green; the active step uses its status colour; future steps are grey
          const color = done || (active && step === 'completed') ? tokens.green : active ? STATUS[step].color : tokens.placeholder;
          return (
            <Box
              component="li"
              key={step}
              aria-current={active ? 'step' : undefined}
              sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}
            >
              <Box
                sx={{
                  width: 26,
                  height: 26,
                  flexShrink: 0,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  color: done || active ? '#fff' : tokens.textMuted,
                  backgroundColor: done || active ? color : tokens.surfaceMuted,
                  border: `2px solid ${done || active ? color : tokens.cardLightBorder}`,
                  boxShadow: active ? `0 0 0 4px ${STATUS[step].bg}` : 'none'
                }}
              >
                {done || (active && step === 'completed') ? <CheckRoundedIcon sx={{ fontSize: 15 }} /> : index + 1}
              </Box>
              <Typography
                sx={{
                  display: compact ? { xs: active ? 'block' : 'none', md: 'block' } : 'block',
                  fontSize: 12.5,
                  fontWeight: active ? 700 : 600,
                  color: done || active ? tokens.textPrimary : tokens.textMuted,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {STATUS[step].label}
              </Typography>
              {/* Connecting line to the next step */}
              {!isLast && (
                <Box
                  aria-hidden
                  sx={{
                    display: { xs: compact ? 'block' : 'none', md: 'block' },
                    flex: 1,
                    minWidth: 12,
                    height: 2,
                    borderRadius: 1,
                    backgroundColor: done ? tokens.green : tokens.cardLightBorder
                  }}
                />
              )}
            </Box>
          );
        })}
      </Box>

      {stopped && (
        <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1, color: STATUS[status].fg, fontSize: 13, fontWeight: 600 }}>
          <CloseRoundedIcon sx={{ fontSize: 17 }} />
          This reservation was {STATUS[status].label.toLowerCase()}.
        </Box>
      )}
    </Box>
  );
}
