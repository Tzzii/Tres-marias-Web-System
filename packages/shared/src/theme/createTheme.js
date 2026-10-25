import { createTheme } from '@mui/material/styles';
import { darkPalette, lightPalette } from './palettes.js';
import { tokens } from './tokens.js';

/** Shared MUI themes: midnight evenings, warm ivory days, and the public site's paper surfaces. */

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

// Touch screens (phones and tablets). A mouse can hit a 30px button, a finger needs about 36px,
// so the small sizes grow only here and computers keep the compact desktop look.
const TOUCH = '@media (pointer: coarse)';

// Default styles for MUI components used by every theme
const baseComponents = {
  MuiButton: {
    defaultProps: { disableElevation: true },
    // Small buttons ("View all", "Open", Prev / Next) are 36px tall on touch screens
    styleOverrides: {
      root: {
        borderRadius: 10,
        minHeight: 40,
        transition: `background-color 0.2s ${tokens.easeStandard}, border-color 0.2s ${tokens.easeStandard}, box-shadow 0.2s ${tokens.easeStandard}`,
        [TOUCH]: { minHeight: 44 }
      },
      sizeSmall: { [TOUCH]: { minHeight: 44 } }
    }
  },
  // Small icon buttons (close X, show password, month arrows, copy) are 36px or more on touch screens.
  // A button that sets its own padding in `sx` keeps it, because `sx` is applied after these styles.
  MuiIconButton: {
    styleOverrides: { root: { [TOUCH]: { minWidth: 44, minHeight: 44 } }, sizeSmall: { [TOUCH]: { padding: 10 } } }
  },
  // Text links ("Forgot password?", "Sign up", breadcrumbs) get 6px more above and below on touch
  // screens, so they are about 32px tall to a finger. On a link inside a sentence this padding
  // does not move the text; a link drawn as a button grows by those 12px.
  MuiLink: { styleOverrides: { root: { [TOUCH]: { paddingTop: 6, paddingBottom: 6 } } } },
  MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
  MuiTooltip: {
    styleOverrides: {
      tooltip: {
        backgroundColor: tokens.headerBg,
        color: tokens.textLight,
        border: `1px solid ${tokens.cardDarkBorder}`,
        fontSize: 12
      }
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

// Inputs, tables, dialogs and tabs follow the active surface palette in both modes.
const lightComponents = {
  MuiOutlinedInput: {
    styleOverrides: {
      root: {
        backgroundColor: tokens.inputBg,
        color: tokens.textPrimary,
        '& .MuiOutlinedInput-notchedOutline': { borderColor: tokens.borderInput },
        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: tokens.placeholder },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: tokens.borderFocus, borderWidth: 1.5 },
        '&.Mui-disabled': { backgroundColor: tokens.surfaceSubtle }
      },
      input: {
        '&::placeholder': { color: tokens.placeholder, opacity: 1 },
        '&:-webkit-autofill': {
          WebkitBoxShadow: `0 0 0 100px ${tokens.inputBg} inset`,
          WebkitTextFillColor: tokens.textPrimary,
          caretColor: tokens.textPrimary
        }
      }
    }
  },
  MuiTableCell: {
    styleOverrides: {
      root: { borderColor: tokens.cardLightBorder, fontSize: 13.5 },
      // Column headings show as written, in Title Case ("Event Date"), not forced into capitals
      head: {
        fontSize: 12.5,
        fontWeight: 700,
        color: tokens.textMuted,
        backgroundColor: tokens.surfaceSubtle,
        whiteSpace: 'nowrap'
      }
    }
  },
  MuiDialog: {
    styleOverrides: {
      paper: {
        backgroundColor: tokens.cardLight,
        color: tokens.textPrimary,
        border: `1px solid ${tokens.cardLightBorder}`,
        borderRadius: 16,
        boxShadow: tokens.shadowCard,
        // A full-screen dialog (phones) has square corners, like a page
        '&.MuiDialog-paperFullScreen': { borderRadius: 0 },
        // Phones: 16px from the screen edges instead of MUI's 32px, so forms in a dialog get more room.
        // Full-screen dialogs keep no margin at all.
        '@media (max-width: 599.95px)': {
          '&:not(.MuiDialog-paperFullScreen)': { margin: 16, maxHeight: 'calc(100% - 32px)' },
          '&.MuiDialog-paperFullWidth:not(.MuiDialog-paperFullScreen)': {
            width: 'calc(100% - 32px)',
            maxWidth: 'calc(100% - 32px)'
          }
        }
      }
    }
  },
  MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 44 } } }
};

export const darkTheme = createTheme({
  ...shared,
  palette: {
    mode: 'dark',
    primary: {
      main: darkPalette.gold,
      light: darkPalette.goldLight,
      dark: darkPalette.goldDark,
      contrastText: darkPalette.onGold
    },
    secondary: {
      main: darkPalette.ink,
      light: darkPalette.inkHover,
      dark: '#8aa9ca',
      contrastText: darkPalette.onInk
    },
    background: { default: darkPalette.bgBase, paper: darkPalette.bgPanel },
    text: {
      primary: darkPalette.textLight,
      secondary: darkPalette.textOnDarkSoft,
      disabled: darkPalette.textOnDarkMuted
    },
    success: { main: darkPalette.green },
    warning: { main: darkPalette.amber },
    info: { main: darkPalette.blue },
    error: { main: darkPalette.red },
    divider: darkPalette.divider
  },
  components: {
    ...baseComponents,
    ...lightComponents,
    ...cssBaseline,
    MuiButton: {
      ...baseComponents.MuiButton,
      styleOverrides: {
        ...baseComponents.MuiButton.styleOverrides,
        outlined: {
          borderColor: tokens.borderInput,
          '&:hover': { borderColor: tokens.gold, backgroundColor: tokens.shellHover }
        },
        containedPrimary: {
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
          '&:hover': { backgroundColor: tokens.goldLight }
        }
      }
    },
    MuiTableRow: {
      styleOverrides: {
        root: { '&.MuiTableRow-hover:hover': { backgroundColor: tokens.shellHover } }
      }
    },
    MuiTableCell: {
      styleOverrides: {
        ...lightComponents.MuiTableCell.styleOverrides,
        head: {
          ...lightComponents.MuiTableCell.styleOverrides.head,
          color: tokens.textSecondary,
          borderColor: tokens.cardLightBorder,
          backgroundColor: tokens.surfaceSubtle
        }
      }
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          ...lightComponents.MuiDialog.styleOverrides.paper,
          backgroundColor: tokens.bgPanel,
          boxShadow: tokens.shadowPanel
        }
      }
    },
    MuiBackdrop: { styleOverrides: { root: { backgroundColor: 'rgba(4, 9, 17, 0.74)', backdropFilter: 'blur(4px)' } } },
    MuiSkeleton: { styleOverrides: { root: { backgroundColor: tokens.shellHover } } },
    MuiLinearProgress: {
      styleOverrides: {
        root: { backgroundColor: tokens.surfaceMuted },
        bar: { borderRadius: 999 }
      }
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          '&.Mui-selected': { backgroundColor: tokens.goldSubtle },
          '&.Mui-selected:hover': { backgroundColor: tokens.goldChip }
        }
      }
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: tokens.bgPanel,
          border: `1px solid ${tokens.cardDarkBorder}`,
          boxShadow: tokens.shadowPanel
        }
      }
    }
  }
});

export const lightTheme = createTheme({
  ...shared,
  palette: {
    mode: 'light',
    primary: {
      main: '#0f172a',
      light: '#1e293b',
      dark: '#080c14',
      contrastText: '#fff'
    },
    secondary: { main: lightPalette.goldDark, light: lightPalette.gold, dark: '#7a5f28', contrastText: '#fff' },
    background: { default: lightPalette.surfaceSubtle, paper: lightPalette.cardLight },
    text: {
      primary: lightPalette.textPrimary,
      secondary: lightPalette.textSecondary,
      disabled: lightPalette.placeholder
    },
    success: { main: '#059669' },
    warning: { main: '#d97706' },
    info: { main: '#2563eb' },
    error: { main: lightPalette.redPress },
    divider: lightPalette.cardLightBorder
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
    primary: {
      main: lightPalette.textPrimary,
      light: '#4a423c',
      dark: lightPalette.goldText,
      contrastText: lightPalette.bgBase
    },
    secondary: {
      main: lightPalette.gold,
      light: lightPalette.goldLight,
      dark: lightPalette.goldText,
      contrastText: lightPalette.textPrimary
    },
    background: { default: lightPalette.bgBase, paper: lightPalette.cardLight },
    text: {
      primary: lightPalette.textPrimary,
      secondary: lightPalette.textSecondary,
      disabled: lightPalette.placeholder
    },
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
      styleOverrides: {
        paper: {
          backgroundColor: tokens.cardLight,
          border: `1px solid ${tokens.divider}`,
          boxShadow: tokens.shadowDash
        }
      }
    }
  }
});

// Keep separate cached themes so opting out never mutates the customer portal's themes.
const staticThemes = new WeakMap();

/** Theme for this mode; `animate=false` also stops MUI's JS-driven scrolling and transition timers. */
export const themeForMode = (mode, animate = true) => {
  const theme = mode === 'light' ? warmTheme : darkTheme;
  if (animate) return theme;
  if (!staticThemes.has(theme)) {
    staticThemes.set(
      theme,
      createTheme(theme, {
        transitions: {
          create: () => 'none',
          duration: Object.fromEntries(Object.keys(theme.transitions.duration).map((key) => [key, 0])),
          getAutoHeightDuration: () => 0
        },
        components: {
          MuiButtonBase: { defaultProps: { disableRipple: true } },
          MuiSkeleton: { defaultProps: { animation: false } }
        }
      })
    );
  }
  return staticThemes.get(theme);
};

/** Cards, forms and dialogs use the same mode as the portal shell. */
export const surfaceThemeForMode = themeForMode;
