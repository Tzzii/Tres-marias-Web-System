import { ThemeProvider } from '@mui/material/styles';
import { useColorMode } from '../theme/colorMode.jsx';
import { darkTheme, warmTheme, surfaceThemeForMode } from '../theme/createTheme.js';

/**
 * The existing surface boundary follows the selected portal mode, including nested
 * forms, dialogs and menus. The name is kept for existing callers.
 */
export function LightSurface({ children }) {
  const { mode } = useColorMode();
  return <ThemeProvider theme={surfaceThemeForMode(mode)}>{children}</ThemeProvider>;
}

/** Everything inside renders with the evening theme, whichever mode the portal is in. */
export function DarkSurface({ children }) {
  return <ThemeProvider theme={darkTheme}>{children}</ThemeProvider>;
}

/** Printed documents retain their paper theme; pair with paperSurfaceSx on the document root. */
export function PaperSurface({ children }) {
  return <ThemeProvider theme={warmTheme}>{children}</ThemeProvider>;
}
