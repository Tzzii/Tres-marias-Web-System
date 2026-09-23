import { createTheme } from '@mui/material/styles';
import { darkPalette, lightPalette } from './palettes.js';
import { tokens } from './tokens.js';

/**
 * Three MUI themes that share one design language.
 *
 * - darkTheme:  the navy shell of dark mode (portal frame, sidebars, sign-in screens). Gold is primary.
 * - lightTheme: the white work surfaces inside that navy shell (DashCard, dialogs, tables).
 *               Navy is primary and gold the accent.
 * - warmTheme:  light mode, in the public website's "Warm Ivory & Gold" palette. It covers both the
 *               shell and the cards, because in light mode they are one continuous light surface.
 *
 * Pick a theme with themeForMode() for the shell and surfaceThemeForMode() for a white card;
 * <Surface> (components/Surface.jsx) already does the second for you.
 *
 * Component styles below are written with `tokens.x`, i.e. `var(--tm-...)`, so they follow the mode
 * on their own. Palettes cannot: MUI measures contrast on these values, so they use the raw colours
 * from palettes.js.
 */

// Settings all themes share: screen size breakpoints, corner radius, fonts.
// The font never changes with the mode, only the colours do.
const shared = {
  breakpoints: { values: { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 } },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: tokens.fontSans,
    button: { textTransform: 'none', fontWeight: 700, letterSpacing: '0.15px' },
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h3: { fontWeight: 700 },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 }
  }
};

// Default styles for MUI components used by every theme
const baseComponents = {
  MuiButton: {
    defaultProps: { disableElevation: true },
    styleOverrides: { root: { borderRadius: 10, transition: `all 0.2s ${tokens.easeStandard}` } }
  },
  MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
  MuiTooltip: {
    styleOverrides: {
      tooltip: { backgroundColor: tokens.headerBg, color: tokens.textLight, border: `1px solid ${tokens.cardDarkBorder}`, fontSize: 12 }
    }
  },
  MuiChip: { styleOverrides: { root: { fontWeight: 600 } } }
};

// Global page styles and the animations used across the site (shake on error, fade in, hero glow, pulse).
// Only the theme wrapping <CssBaseline> in main.jsx applies these, so every shell theme needs them.
const cssBaseline = {
  MuiCssBaseline: {
    styleOverrides: {
      '*': { boxSizing: 'border-box' },
      html: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
      body: { backgroundColor: tokens.bgBase, overflowX: 'hidden' },
      '@keyframes tmShake': {
        '0%, 100%': { transform: 'translateX(0)' },
        '20%, 60%': { transform: 'translateX(-7px)' },
        '40%, 80%': { transform: 'translateX(7px)' }
      },
      '@keyframes tmFadeUp': {
        from: { opacity: 0, transform: 'translateY(14px)' },
        to: { opacity: 1, transform: 'translateY(0)' }
      },
      '@keyframes tmHeroDrift': {
        '0%': { transform: 'translate3d(-6%, -3%, 0) scale(1)' },
        '100%': { transform: 'translate3d(6%, 4%, 0) scale(1.12)' }
      },
      '@keyframes tmPulse': {
        '0%, 100%': { opacity: 1 },
        '50%': { opacity: 0.45 }
      }
    }
  }
};

// Inputs, tables, dialogs and tabs as they look on a light surface. Shared by lightTheme
// (white cards inside the navy shell) and warmTheme (the whole of light mode).
const lightComponents = {
  MuiOutlinedInput: {
    styleOverrides: {
      root: {
        backgroundColor: tokens.cardLight,
        '& .MuiOutlinedInput-notchedOutline': { borderColor: tokens.borderInput },
        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: tokens.placeholder },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: tokens.borderFocus, borderWidth: 1.5 },
        '&.Mui-disabled': { backgroundColor: tokens.surfaceSubtle }
      },
      input: { '&::placeholder': { color: tokens.placeholder, opacity: 1 } }
    }
  },
  MuiTableCell: {
    styleOverrides: {
      root: { borderColor: tokens.cardLightBorder, fontSize: 13.5 },
      head: {
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        color: tokens.textMuted,
        backgroundColor: tokens.surfaceSubtle,
        whiteSpace: 'nowrap'
      }
    }
  },
  MuiDialog: {
    styleOverrides: { paper: { borderRadius: 16, boxShadow: tokens.shadowCard } }
  },
  MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 44 } } }
};

export const darkTheme = createTheme({
  ...shared,
  palette: {
    mode: 'dark',
    primary: { main: darkPalette.gold, light: darkPalette.goldLight, dark: darkPalette.goldDark, contrastText: darkPalette.onGold },
    secondary: { main: darkPalette.headerBg, light: darkPalette.slate700, dark: darkPalette.bgDeep, contrastText: '#fff' },
    background: { default: darkPalette.bgBase, paper: darkPalette.bgPanel },
    text: { primary: darkPalette.textLight, secondary: darkPalette.textOnDarkSoft, disabled: darkPalette.textOnDarkMuted },
    success: { main: darkPalette.green },
    warning: { main: darkPalette.amber },
    info: { main: darkPalette.blue },
    error: { main: darkPalette.red },
    divider: darkPalette.divider
  },
  components: {
    ...baseComponents,
    ...cssBaseline,
    MuiMenu: {
      styleOverrides: { paper: { backgroundColor: tokens.headerBg, border: `1px solid ${tokens.cardDarkBorder}` } }
    }
  }
});

export const lightTheme = createTheme({
  ...shared,
  palette: {
    mode: 'light',
    primary: { main: darkPalette.headerBg, light: darkPalette.slate700, dark: darkPalette.bgDeep, contrastText: '#fff' },
    secondary: { main: darkPalette.goldDark, light: darkPalette.gold, dark: '#7a5f28', contrastText: '#fff' },
    background: { default: darkPalette.surfaceSubtle, paper: darkPalette.cardLight },
    text: { primary: darkPalette.textPrimary, secondary: darkPalette.textSecondary, disabled: darkPalette.placeholder },
    success: { main: '#059669' },
    warning: { main: '#d97706' },
    info: { main: '#2563eb' },
    error: { main: darkPalette.redPress },
    divider: darkPalette.cardLightBorder
  },
  components: { ...baseComponents, ...lightComponents }
});

/**
 * Light mode: the public website's palette applied to the whole portal.
 * Warm charcoal is primary (buttons turn gold-brown on hover) and gold is the accent,
 * exactly as on the pages customers browse before signing in.
 */
export const warmTheme = createTheme({
  ...shared,
  palette: {
    mode: 'light',
    primary: { main: lightPalette.textPrimary, light: '#4a423c', dark: lightPalette.goldText, contrastText: lightPalette.bgBase },
    secondary: { main: lightPalette.gold, light: lightPalette.goldLight, dark: lightPalette.goldText, contrastText: lightPalette.textPrimary },
    background: { default: lightPalette.bgBase, paper: lightPalette.cardLight },
    text: { primary: lightPalette.textPrimary, secondary: lightPalette.textSecondary, disabled: lightPalette.placeholder },
    success: { main: '#059669' },
    warning: { main: '#d97706' },
    info: { main: '#2563eb' },
    error: { main: lightPalette.redPress },
    divider: lightPalette.divider
  },
  components: {
    ...baseComponents,
    ...lightComponents,
    ...cssBaseline,
    MuiMenu: {
      styleOverrides: { paper: { backgroundColor: tokens.cardLight, border: `1px solid ${tokens.divider}`, boxShadow: tokens.shadowDash } }
    }
  }
});

/** Theme for the app shell (top bar, sidebar, page background) in this mode. */
export const themeForMode = (mode) => (mode === 'light' ? warmTheme : darkTheme);

/** Theme for a white work surface (DashCard, dialogs, tables) in this mode. */
export const surfaceThemeForMode = (mode) => (mode === 'light' ? warmTheme : lightTheme);

/** Kept for callers that want a single theme factory. */
export const createTresMariasTheme = () => darkTheme;
