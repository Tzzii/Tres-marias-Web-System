import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { tokens } from '../theme/tokens.js';

/** Horizontal filter chips with optional counts. Scrolls sideways on phones; chips are 36px tall on touch screens. */
export function FilterTabs({ options, value, onChange, ariaLabel = 'Filter' }) {
  return (
    <Box role="tablist" aria-label={ariaLabel} className="tm-scroll" sx={{ display: 'flex', gap: 0.75, overflowX: 'auto', pb: 0.5, mx: -0.25, px: 0.25 }}>
      {options.map((option) => {
        const active = option.value === value; // the selected tab is dark
        return (
          <ButtonBase
            key={option.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            sx={{
              flexShrink: 0,
              px: 1.5,
              py: 0.75,
              borderRadius: 999,
              fontSize: 12.5,
              fontWeight: 600,
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
              color: active ? tokens.onInk : tokens.textSecondary,
              backgroundColor: active ? tokens.ink : tokens.surfaceMuted,
              border: `1px solid ${active ? tokens.ink : tokens.cardLightBorder}`,
              transition: 'all 0.18s ease',
              '&:hover': { backgroundColor: active ? tokens.inkHover : tokens.cardLightBorder },
              // Taller chips for fingers
              '@media (pointer: coarse)': { py: 1 }
            }}
          >
            {option.label}
            {/* Count bubble (hidden while loading, when count is undefined) */}
            {option.count !== undefined && (
              <Box component="span" sx={{ ml: 0.75, px: 0.75, borderRadius: 999, fontSize: 11, fontWeight: 700, backgroundColor: active ? 'rgba(255,255,255,0.18)' : tokens.cardLight, color: active ? tokens.onInk : tokens.textMuted }}>
                {option.count}
              </Box>
            )}
          </ButtonBase>
        );
      })}
    </Box>
  );
}

/** Search input for light surfaces, with a clear button. */
export function SearchField({ value, onChange, placeholder = 'Search', sx, id = 'search' }) {
  return (
    <TextField
      id={id}
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputProps={{ 'aria-label': placeholder, autoComplete: 'off' }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchRoundedIcon sx={{ fontSize: 19, color: tokens.textMuted }} />
          </InputAdornment>
        ),
        // Show the X (clear) button only when there is text
        endAdornment: value ? (
          <InputAdornment position="end">
            <IconButton size="small" onClick={() => onChange('')} aria-label="Clear search" edge="end">
              <CloseRoundedIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </InputAdornment>
        ) : null
      }}
      sx={{ minWidth: { xs: '100%', sm: 260 }, ...sx }}
    />
  );
}
