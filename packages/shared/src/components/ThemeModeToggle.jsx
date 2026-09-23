import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import { useColorMode } from '../theme/colorMode.jsx';
import { tokens } from '../theme/tokens.js';

// The two icons sit on top of each other in one grid cell and trade places:
// the one coming in turns upright and grows, the one leaving turns away and shrinks.
const iconSx = {
  gridArea: '1 / 1',
  fontSize: 20,
  transition: `transform 0.45s ${tokens.easeOutExpo}, opacity 0.25s ease`
};

/**
 * The dark / light switch in the portal top bar (both portals, via PortalShell).
 *
 * It shows the mode it will switch to: a sun while the navy shell is on, a moon
 * while the warm ivory one is. Clicking passes the middle of the button to
 * toggleMode, which opens the new theme out of that point as a circle
 * (theme/colorMode.jsx). The choice is saved per browser by ColorModeProvider.
 */
export function ThemeModeToggle({ sx }) {
  const { isLight, toggleMode } = useColorMode();
  const label = isLight ? 'Switch to dark mode' : 'Switch to light mode';

  // The circle opens from the centre of the button, in window coordinates
  const handleClick = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    toggleMode({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
  };

  return (
    <Tooltip title={label}>
      <IconButton
        onClick={handleClick}
        aria-label={label}
        aria-pressed={isLight}
        sx={{ color: tokens.textOnDarkSoft, transition: `color 0.2s ${tokens.easeStandard}`, '&:hover': { color: tokens.gold, backgroundColor: tokens.shellHover }, ...sx }}
      >
        <Box sx={{ display: 'grid', placeItems: 'center', width: 20, height: 20 }}>
          <LightModeRoundedIcon sx={{ ...iconSx, opacity: isLight ? 0 : 1, transform: isLight ? 'rotate(90deg) scale(0.3)' : 'none' }} />
          <DarkModeRoundedIcon sx={{ ...iconSx, opacity: isLight ? 1 : 0, transform: isLight ? 'none' : 'rotate(-90deg) scale(0.3)' }} />
        </Box>
      </IconButton>
    </Tooltip>
  );
}
