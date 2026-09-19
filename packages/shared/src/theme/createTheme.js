import { createTheme } from '@mui/material/styles';
import { tokens } from './tokens.js';

/**
 * Two MUI themes that share one design language.
 *
 * - darkTheme: the navy shell (public site, portal chrome, sidebars). Gold is primary.
 * - lightTheme: the white work surfaces (DashCard, FormCard, dialogs, tables).
 *   Navy is primary and gold the accent, matching the design system's light cards.
 *
 * <Surface> (components/Surface.jsx) switches to lightTheme for everything inside
 * a white card, so inputs, menus, tables and dialogs always get correct contrast.
 */

// Settings both themes share: screen size breakpoints, corner radius, fonts
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

// Default styles for MUI components used by both themes
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

export const darkTheme = createTheme({
  ...shared,
  palette: {
    mode: 'dark',
    primary: { main: tokens.gold, light: tokens.goldLight, dark: tokens.goldDark, contrastText: tokens.onGold },
    secondary: { main: tokens.headerBg, light: tokens.slate700, dark: tokens.bgDeep, contrastText: '#fff' },
    background: { default: tokens.bgBase, paper: tokens.bgPanel },
    text: { primary: tokens.textLight, secondary: tokens.textOnDarkSoft, disabled: tokens.textOnDarkMuted },
    success: { main: tokens.green },
    warning: { main: tokens.amber },
    info: { main: tokens.blue },
    error: { main: tokens.red },
    divider: tokens.divider
  },
  components: {
    ...baseComponents,
    MuiMenu: {
      styleOverrides: { paper: { backgroundColor: tokens.headerBg, border: `1px solid ${tokens.cardDarkBorder}` } }
    },
    // Global page styles and the animations used across the site (shake on error, fade in, hero glow, pulse)
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
  }
});

export const lightTheme = createTheme({
  ...shared,
  palette: {
    mode: 'light',
    primary: { main: tokens.headerBg, light: tokens.slate700, dark: tokens.bgDeep, contrastText: '#fff' },
    secondary: { main: tokens.goldDark, light: tokens.gold, dark: '#7a5f28', contrastText: '#fff' },
    background: { default: tokens.surfaceSubtle, paper: tokens.cardLight },
    text: { primary: tokens.textPrimary, secondary: tokens.textSecondary, disabled: tokens.placeholder },
    success: { main: '#059669' },
    warning: { main: '#d97706' },
    info: { main: '#2563eb' },
    error: { main: tokens.redPress },
    divider: tokens.cardLightBorder
  },
  components: {
    ...baseComponents,
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: '#fff',
          '& .MuiOutlinedInput-notchedOutline': { borderColor: tokens.borderInput },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#94a3b8' },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: tokens.headerBg, borderWidth: 1.5 },
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
  }
});

/** Kept for callers that want a single theme factory. */
export const createTresMariasTheme = () => darkTheme;
