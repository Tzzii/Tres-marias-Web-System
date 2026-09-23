import { ThemeProvider } from '@mui/material/styles';
import { useColorMode } from '../theme/colorMode.jsx';
import { darkTheme, surfaceThemeForMode } from '../theme/createTheme.js';

/**
 * Everything inside renders with the light work-surface theme (white cards, dialogs, forms).
 * In dark mode that is the navy-primary light theme; in light mode it is the warm ivory theme,
 * so the cards match the public website.
 */
export function LightSurface({ children }) {
  const { mode } = useColorMode();
  return <ThemeProvider theme={surfaceThemeForMode(mode)}>{children}</ThemeProvider>;
}

/** Everything inside renders with the dark navy theme, whichever mode the portal is in. */
export function DarkSurface({ children }) {
  return <ThemeProvider theme={darkTheme}>{children}</ThemeProvider>;
}
