import { ThemeProvider } from '@mui/material/styles';
import { darkTheme, lightTheme } from '../theme/createTheme.js';

/** Everything inside renders with the light theme (white cards, dialogs, forms). */
export function LightSurface({ children }) {
  return <ThemeProvider theme={lightTheme}>{children}</ThemeProvider>;
}

/** Everything inside renders with the dark navy theme. */
export function DarkSurface({ children }) {
  return <ThemeProvider theme={darkTheme}>{children}</ThemeProvider>;
}
