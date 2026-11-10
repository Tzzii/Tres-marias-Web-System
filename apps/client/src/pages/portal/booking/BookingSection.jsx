import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import { DashCard, tokens } from '@tm/shared';

export default function Section({
  id,
  index,
  title,
  subtitle,
  error,
  done = false,
  active = false,
  optional = false,
  children
}) {
  return (
    <DashCard
      component="section"
      id={`sec-${id}`}
      aria-labelledby={`sec-${id}-title`}
      sx={{
        display: active ? undefined : 'none',
        scrollMarginTop: `${tokens.headerHeight + 68}px`,
        p: { xs: 2, sm: 2.5, md: 3 },
        borderRadius: 2.5,
        position: 'relative',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        borderTop: `3px solid ${
          error ? tokens.red : done ? tokens.green : active ? tokens.gold : tokens.cardLightBorder
        }`,
        ...(error && { borderColor: tokens.red })
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 1.5,
          pb: 1.75,
          mb: 2.25,
          borderBottom: `1px solid ${tokens.dividerFaint}`
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.35, minWidth: 0, flex: '1 1 220px' }}>
          <Box
            aria-hidden="true"
            sx={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              flexShrink: 0,
              mt: 0.1,
              display: 'grid',
              placeItems: 'center',
              fontWeight: 700,
              fontSize: 12.5,
              color: error ? tokens.dangerText : done ? tokens.successText : active ? tokens.onGold : tokens.goldText,
              backgroundColor: error
                ? tokens.dangerBg
                : done
                  ? tokens.successBg
                  : active
                    ? tokens.gold
                    : tokens.goldSubtle,
              border: `1px solid ${
                error
                  ? tokens.dangerBorder
                  : done
                    ? tokens.successBorder
                    : active
                      ? tokens.goldDark
                      : tokens.shellBorder
              }`
            }}
          >
            {error ? (
              <ErrorOutlineRoundedIcon sx={{ fontSize: 16 }} />
            ) : done ? (
              <CheckCircleRoundedIcon sx={{ fontSize: 16 }} />
            ) : (
              index
            )}
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              id={`sec-${id}-title`}
              component="h2"
              sx={{
                fontSize: { xs: 15, sm: 16 },
                fontWeight: 700,
                lineHeight: 1.3,
                color: tokens.textPrimary
              }}
            >
              {index} · {title}
            </Typography>
            {subtitle && (
              <Typography
                sx={{ mt: 0.35, fontSize: 12.5, lineHeight: 1.55, color: tokens.textSecondary, maxWidth: '68ch' }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
        </Box>

        {(optional || done || error) && (
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.4,
              px: 1.1,
              py: 0.3,
              borderRadius: 999,
              fontSize: 11.5,
              fontWeight: 600,
              color: error ? tokens.dangerText : done ? tokens.successText : tokens.textSecondary,
              backgroundColor: error ? tokens.dangerBg : done ? tokens.successBg : tokens.surfaceMuted,
              border: `1px solid ${error ? tokens.dangerBorder : done ? tokens.successBorder : tokens.cardLightBorder}`
            }}
          >
            {done && !error && <CheckCircleRoundedIcon sx={{ fontSize: 13 }} />}
            {error ? 'Needs attention' : done ? 'Completed' : 'Optional'}
          </Box>
        )}
      </Box>

      {error && (
        <Box
          role="alert"
          sx={{
            mb: 2,
            px: 1.5,
            py: 1,
            borderRadius: 1.5,
            backgroundColor: tokens.dangerBg,
            border: `1px solid ${tokens.dangerBorder}`,
            display: 'flex',
            alignItems: 'center',
            gap: 1
          }}
        >
          <ErrorOutlineRoundedIcon sx={{ fontSize: 17, color: tokens.redPress, flexShrink: 0 }} />
          <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: tokens.redPress }}>{error}</Typography>
        </Box>
      )}

      {children}
    </DashCard>
  );
}
