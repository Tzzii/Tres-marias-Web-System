import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { tokens } from '@tm/shared';

/**
 * Underlined tabs on the dark page background that switch between the sections of one page
 * (e.g. Requests / All reservations / Calendar). Options: { value, label, badge? }.
 * On narrow screens the row can be swiped sideways, but no scrollbar is shown.
 */
export function SectionTabs({ options, value, onChange, ariaLabel }) {
  return (
    <Box
      role="tablist"
      aria-label={ariaLabel}
      sx={{
        display: 'flex',
        gap: 0.5,
        mb: 2.5,
        // Sideways swipe only; never scroll up/down
        overflowX: 'auto',
        overflowY: 'hidden',
        // Hide the scrollbar (Firefox, then Chrome/Edge/Safari)
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
        // Grey line under the tabs, drawn inside the row so the gold underline can sit on it without overflowing
        boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.12)'
      }}
    >
      {options.map((option) => {
        const active = option.value === value; // the selected tab is gold with an underline
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
              color: active ? tokens.goldLight : tokens.textOnDarkSoft,
              borderBottom: `2px solid ${active ? tokens.gold : 'transparent'}`,
              '&:hover': { color: tokens.goldLight }
            }}
          >
            {option.label}
            {/* Red count bubble, only when there is something waiting */}
            {option.badge > 0 && (
              <Box component="span" sx={{ ml: 0.75, px: 0.75, minWidth: 18, borderRadius: 999, fontSize: 11, fontWeight: 700, lineHeight: '18px', textAlign: 'center', backgroundColor: '#dc2626', color: '#fff' }}>
                {option.badge}
              </Box>
            )}
          </ButtonBase>
        );
      })}
    </Box>
  );
}

/** One line under the tabs: a short description of the section on the left, its buttons on the right. */
export function SectionBar({ text, actions }) {
  return (
    <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
      <Typography sx={{ fontSize: 13.5, color: tokens.textOnDarkSoft }}>{text}</Typography>
      {actions && <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>{actions}</Box>}
    </Box>
  );
}
