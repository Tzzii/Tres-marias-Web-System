import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { tokens } from '@tm/shared';

export function SectionTabs({ options, value, onChange, ariaLabel }) {
  return (
    <Box
      role="tablist"
      aria-label={ariaLabel}
      sx={{
        display: 'flex',
        gap: 0.5,
        mb: 2.5,
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
        boxShadow: `inset 0 -1px 0 ${tokens.shellBorder}`
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <ButtonBase
            key={option.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            sx={{
              flexShrink: 0,
              px: 1.75,
              py: 1.25,
              fontSize: 14,
              fontWeight: active ? 700 : 500,
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
              color: active ? tokens.goldText : tokens.textOnDarkSoft,
              borderBottom: `2px solid ${active ? tokens.gold : 'transparent'}`,
              '&:hover': { color: tokens.goldText }
            }}
          >
            {option.label}
            {option.badge > 0 && (
              <Box
                component="span"
                sx={{
                  ml: 0.75,
                  px: 0.75,
                  minWidth: 18,
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  lineHeight: '18px',
                  textAlign: 'center',
                  backgroundColor: '#dc2626',
                  color: '#fff'
                }}
              >
                {option.badge}
              </Box>
            )}
          </ButtonBase>
        );
      })}
    </Box>
  );
}

export function SectionBar({ text, actions }) {
  return (
    <Box
      sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}
    >
      <Typography sx={{ fontSize: 13.5, color: tokens.textOnDarkSoft }}>{text}</Typography>
      {actions && <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>{actions}</Box>}
    </Box>
  );
}
