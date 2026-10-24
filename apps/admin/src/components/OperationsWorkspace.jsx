import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ArrowOutwardRoundedIcon from '@mui/icons-material/ArrowOutwardRounded';
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import ViewListRoundedIcon from '@mui/icons-material/ViewListRounded';
import { DashCard, tokens } from '@tm/shared';

const tones = {
  gold: { text: tokens.goldText, bg: tokens.goldTint },
  green: { text: tokens.successText, bg: tokens.successBg },
  blue: { text: tokens.infoText, bg: tokens.infoBg },
  amber: { text: tokens.warningText, bg: tokens.warningBg },
  red: { text: tokens.dangerText, bg: tokens.dangerBg }
};

export function OperationsHeader({ title, description, icon: Icon, section, actions }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 1.25, color: tokens.textMuted }}>
        <Icon sx={{ fontSize: 16 }} />
        <Typography sx={{ fontSize: 11.5, fontWeight: 600 }}>Operations</Typography>
        <Box component="span" sx={{ opacity: 0.5, mx: 0.25 }}>
          /
        </Box>
        <Typography sx={{ fontSize: 11.5, color: tokens.goldText, fontWeight: 600 }}>{section}</Typography>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: 25, sm: 30 },
              fontWeight: 700,
              letterSpacing: '-1px',
              color: tokens.textPrimary,
              lineHeight: 1.25
            }}
          >
            {title}
          </Typography>
          <Typography sx={{ mt: 0.75, fontSize: 13, color: tokens.textSecondary, maxWidth: 650, lineHeight: 1.7 }}>
            {description}
          </Typography>
        </Box>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            '& .MuiButton-root': { borderRadius: '10px', px: 2, minHeight: 42 }
          }}
        >
          {actions}
        </Box>
      </Box>
    </Box>
  );
}

export function OperationsOverview({ metrics, loading }) {
  return (
    <DashCard aria-label="Overview" sx={{ p: 0, mb: 2.5, overflow: 'hidden', borderRadius: '18px' }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }
        }}
      >
        {metrics.map(({ label, value, unit, meta, icon: Icon, tone = 'gold', onClick, active, progress }, index) => {
          const featured = index === 0;
          const palette = tones[tone];
          return (
            <ButtonBase
              key={label}
              onClick={onClick}
              aria-pressed={Boolean(active)}
              sx={{
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                justifyContent: 'flex-start',
                textAlign: 'left',
                p: { xs: 2, sm: 2.5 },
                backgroundColor: featured ? '#2b302b' : active ? tokens.goldWash : tokens.cardLight,
                color: featured ? '#fff9ed' : tokens.textPrimary,
                borderRight: `1px solid ${featured ? 'transparent' : tokens.cardLightBorder}`,
                borderBottom: { xs: `1px solid ${tokens.cardLightBorder}`, lg: 0 },
                '&:last-child': { borderRight: 0 },
                '&:hover': { backgroundColor: featured ? '#343d33' : tokens.surfaceSubtle },
                '&:focus-visible': { outline: `3px solid ${tokens.gold}`, outlineOffset: '-4px' },
                '&:hover .overview-arrow': { opacity: 1 }
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Icon sx={{ fontSize: 19, color: featured ? '#e0c38d' : palette.text }} />
                  <Typography
                    sx={{ fontSize: 11.5, fontWeight: 600, color: featured ? '#e3daca' : tokens.textSecondary }}
                  >
                    {label}
                  </Typography>
                </Box>
                <ArrowOutwardRoundedIcon className="overview-arrow" sx={{ fontSize: 15, opacity: 0.4 }} />
              </Box>
              {loading ? (
                <Skeleton width="65%" height={43} sx={{ bgcolor: featured ? 'rgba(255,255,255,0.12)' : undefined }} />
              ) : (
                <Typography
                  sx={{
                    fontSize: { xs: 28, sm: 34 },
                    fontWeight: 600,
                    letterSpacing: '-1.5px',
                    lineHeight: 1.2,
                    fontVariantNumeric: 'tabular-nums'
                  }}
                >
                  {typeof value === 'number' ? value.toLocaleString('en-PH') : value}
                  {unit && (
                    <Box
                      component="span"
                      sx={{ ml: 0.65, fontSize: 12, fontWeight: 400, letterSpacing: 0, opacity: 0.65 }}
                    >
                      {unit}
                    </Box>
                  )}
                </Typography>
              )}
              <Typography
                sx={{ fontSize: 11, mt: 0.75, color: featured ? '#cbc6b9' : tokens.textMuted, lineHeight: 1.6 }}
              >
                {loading ? 'Loading overview…' : meta}
              </Typography>
              {progress !== undefined && (
                <Box
                  sx={{ mt: 1.5, height: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.14)', overflow: 'hidden' }}
                >
                  <Box
                    sx={{
                      height: '100%',
                      width: `${Math.max(0, Math.min(100, progress))}%`,
                      bgcolor: '#dfc18a',
                      borderRadius: 4
                    }}
                  />
                </Box>
              )}
            </ButtonBase>
          );
        })}
      </Box>
    </DashCard>
  );
}

export function OperationsFilters({ options, value, onChange, label }) {
  return (
    <Box
      role="group"
      aria-label={label}
      sx={{
        display: 'flex',
        gap: 0.5,
        overflowX: 'auto',
        py: 1.5,
        scrollbarWidth: 'thin',
        borderBottom: `1px solid ${tokens.cardLightBorder}`
      }}
    >
      {options.map(({ value: key, label: text, count, warning }) => (
        <ButtonBase
          key={key}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          sx={{
            flexShrink: 0,
            minHeight: { xs: 40, md: 34 },
            py: 0.8,
            px: 1.25,
            gap: 0.75,
            borderRadius: '8px',
            color: value === key ? tokens.goldText : tokens.textSecondary,
            bgcolor: value === key ? tokens.goldTint : 'transparent',
            fontSize: 11.5,
            fontWeight: value === key ? 700 : 500,
            '&:hover': { bgcolor: tokens.surfaceSubtle },
            '&:focus-visible': { outline: `2px solid ${tokens.gold}`, outlineOffset: -2 }
          }}
        >
          {text}
          {count !== undefined && (
            <Box
              component="span"
              sx={{
                px: 0.65,
                minWidth: 20,
                borderRadius: '5px',
                lineHeight: '20px',
                fontSize: 10,
                bgcolor: warning && count > 0 ? tokens.warningBg : tokens.surfaceMuted,
                color: warning && count > 0 ? tokens.warningText : tokens.textSecondary
              }}
            >
              {count}
            </Box>
          )}
        </ButtonBase>
      ))}
    </Box>
  );
}

export function ViewSwitcher({ value, onChange, label }) {
  return (
    <Box
      role="group"
      aria-label={label}
      sx={{
        display: 'inline-flex',
        flexShrink: 0,
        p: 0.4,
        gap: 0.25,
        border: `1px solid ${tokens.cardLightBorder}`,
        borderRadius: '9px',
        bgcolor: tokens.surfaceSubtle
      }}
    >
      {[
        ['table', ViewListRoundedIcon, 'Table view'],
        ['grid', GridViewRoundedIcon, 'Grid view']
      ].map(([key, Icon, title]) => (
        <Tooltip key={key} title={title}>
          <ButtonBase
            aria-label={title}
            aria-pressed={value === key}
            onClick={() => onChange(key)}
            sx={{
              p: 0.65,
              minWidth: 32,
              minHeight: 32,
              borderRadius: '6px',
              color: value === key ? tokens.goldText : tokens.textMuted,
              bgcolor: value === key ? tokens.cardLight : 'transparent',
              boxShadow: value === key ? tokens.shadowDash : 'none',
              '&:focus-visible': { outline: `2px solid ${tokens.gold}` }
            }}
          >
            <Icon sx={{ fontSize: 19 }} />
          </ButtonBase>
        </Tooltip>
      ))}
    </Box>
  );
}

export function RecordIdentity({ name, description, icon: Icon }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
      <Box
        sx={{
          width: 38,
          height: 38,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          borderRadius: '11px',
          color: tokens.goldText,
          bgcolor: tokens.goldWash
        }}
      >
        {Icon ? (
          <Icon sx={{ fontSize: 19 }} />
        ) : (
          <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{name?.charAt(0)?.toUpperCase()}</Typography>
        )}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.6 }}>{name}</Typography>
        <Typography sx={{ mt: 0.2, fontSize: 11, color: tokens.textMuted, overflowWrap: 'anywhere', lineHeight: 1.6 }}>
          {description}
        </Typography>
      </Box>
    </Box>
  );
}

export function StockMeter({ available, total, stock = 'ok' }) {
  const color = stock === 'out' ? tokens.dangerText : stock === 'low' ? tokens.warningText : tokens.successText;
  return (
    <Box sx={{ minWidth: 65 }}>
      <Typography sx={{ fontSize: 13, color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {available}
        <Box component="span" sx={{ fontSize: 10, color: tokens.textMuted, fontWeight: 400 }}>
          {' '}
          / {total}
        </Box>
      </Typography>
      <Box sx={{ mt: 0.6, height: 4, bgcolor: tokens.surfaceMuted, borderRadius: 8, overflow: 'hidden' }}>
        <Box
          sx={{
            height: '100%',
            width: `${total > 0 ? Math.max(0, Math.min(100, (available / total) * 100)) : 0}%`,
            bgcolor: color,
            borderRadius: 8
          }}
        />
      </Box>
      {stock !== 'ok' && (
        <Typography sx={{ mt: 0.4, fontSize: 9.5, color }}>{stock === 'out' ? 'Out of stock' : 'Low stock'}</Typography>
      )}
    </Box>
  );
}

export const operationsPanelSx = {
  borderRadius: '18px',
  p: { xs: 1.75, sm: 2.5 },
  '& .MuiTableContainer-root': { borderRadius: '10px', mt: 0.5 },
  '& .MuiTableCell-head': {
    bgcolor: tokens.surfaceSubtle,
    color: tokens.textSecondary,
    fontSize: 10.5,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    py: 1.2,
    borderBottom: `1px solid ${tokens.cardLightBorder}`
  },
  '& .MuiTableCell-body': { fontSize: 12, borderBottom: `1px solid ${tokens.dividerFaint}`, py: 1.6 },
  '& .MuiTableRow-root:hover .MuiTableCell-body': { bgcolor: tokens.goldWash },
  '& .MuiIconButton-root': { borderRadius: '8px' },
  '& .MuiOutlinedInput-root': { borderRadius: '9px', fontSize: 12 },
  '& .MuiButton-root': { borderRadius: '9px', fontSize: 11.5 }
};

export function OperationsPanelHeading({ title, description, count, actions }) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 1.5,
        pb: 1.5
      }}
    >
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography component="h2" sx={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.3px' }}>
            {title}
          </Typography>
          {count !== undefined && (
            <Box
              component="span"
              sx={{
                px: 0.8,
                py: 0.15,
                fontSize: 10,
                fontWeight: 600,
                color: tokens.goldText,
                bgcolor: tokens.goldTint,
                borderRadius: '6px'
              }}
            >
              {count}
            </Box>
          )}
        </Box>
        <Typography sx={{ mt: 0.4, fontSize: 11.5, color: tokens.textMuted }}>{description}</Typography>
      </Box>
      {actions}
    </Box>
  );
}
