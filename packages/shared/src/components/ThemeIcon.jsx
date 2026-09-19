import Box from '@mui/material/Box';
import { tokens } from '../theme/tokens.js';

/** Occasion → event theme illustration (design system: event theme icons). */
const ICONS = {
  wedding: 'wedding',
  birthday: 'birthday',
  debut: 'debut',
  anniversary: 'anniversary',
  christening: 'christening',
  corporate: 'corporate',
  graduation: 'congratulatory',
  reunion: 'party',
  other: 'event-default'
};

// Image path for an occasion; unknown occasions use the default event icon
export const themeIconSrc = (occasion) => `/images/icons/${ICONS[String(occasion || '').toLowerCase()] || 'event-default'}.svg`;

/** Square tile showing the occasion's icon. */
export function ThemeIcon({ occasion, size = 72, sx }) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        borderRadius: 1.5,
        backgroundColor: tokens.surfaceSubtle,
        border: `1.5px dashed ${tokens.cardLightBorder}`,
        ...sx
      }}
    >
      <Box component="img" src={themeIconSrc(occasion)} alt={`${occasion || 'Event'} theme`} sx={{ width: size * 0.58, height: size * 0.58, objectFit: 'contain' }} />
    </Box>
  );
}
