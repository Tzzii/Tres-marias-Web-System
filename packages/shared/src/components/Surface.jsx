import { ThemeProvider } from '@mui/material/styles';
import { useColorMode } from '../theme/colorMode.jsx';
import { surfaceThemeForMode } from '../theme/createTheme.js';

/**
 * The existing surface boundary follows the selected portal mode, including nested
 * forms, dialogs and menus. The name is kept for existing callers.
 */
export function LightSurface({ children }) {
  const { mode, animate } = useColorMode();
  return <ThemeProvider theme={surfaceThemeForMode(mode, animate)}>{children}</ThemeProvider>;
}

/** Everything inside renders with the evening theme, whichever mode the portal is in. */
export function DarkSurface({ children }) {
  const { animate } = useColorMode();
  return <ThemeProvider theme={surfaceThemeForMode('dark', animate)}>{children}</ThemeProvider>;
}

/** Printed documents retain their paper theme; pair with paperSurfaceSx on the document root. */
export function PaperSurface({ children }) {
  const { animate } = useColorMode();
  return <ThemeProvider theme={surfaceThemeForMode('light', animate)}>{children}</ThemeProvider>;
}
