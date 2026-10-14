import { createTheme } from '@mui/material/styles';
import { lightPalette, lightTheme } from '@tm/shared';

export const siteContainerSx = { maxWidth: 'none', px: { xs: 2, sm: 3, lg: 4 } };

export const site = {
  ivory: '#fbf7f0',
  sand: '#f3eadb',
  card: '#ffffff',
  border: '#e8dcc6',
  borderHover: 'rgba(197, 160, 89, 0.7)',

  ink: '#2b2622',
  inkSoft: '#5e554d',
  inkMuted: '#8a8078',

  gold: lightPalette.gold,
  goldLight: lightPalette.goldLight,
  goldText: '#8a6a2f',
  goldTint: 'rgba(197, 160, 89, 0.12)',

  espresso: '#1f1a17',
  espressoDeep: '#171311',
  onEspresso: '#f5efe6',
  onEspressoSoft: '#cfc4b6',
  onEspressoMuted: '#9c9186',
  espressoBorder: 'rgba(197, 160, 89, 0.22)',

  fontSerif: '"Playfair Display", Georgia, "Times New Roman", serif',
  fontSans: '"Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',

  shadowCard: '0 1px 2px rgba(60, 42, 20, 0.04), 0 18px 40px -24px rgba(60, 42, 20, 0.28)',
  shadowCardHover: '0 1px 2px rgba(60, 42, 20, 0.05), 0 28px 50px -22px rgba(60, 42, 20, 0.38)',
  shadowPanel: '0 30px 60px -30px rgba(60, 42, 20, 0.35), 0 0 0 1px rgba(197, 160, 89, 0.18)',

  gradientHero:
    'radial-gradient(ellipse at 18% 18%, rgba(197, 160, 89, 0.22) 0%, transparent 55%), ' +
    'radial-gradient(ellipse at 85% 75%, rgba(176, 96, 96, 0.10) 0%, transparent 55%), ' +
    'linear-gradient(180deg, #f4ead9 0%, #fbf7f0 100%)',
  gradientCta: 'radial-gradient(ellipse at 50% 0%, rgba(197, 160, 89, 0.22) 0%, transparent 65%)',
  textureLinen:
    'repeating-linear-gradient(115deg, rgba(120, 90, 40, 0.035) 0px, rgba(120, 90, 40, 0.035) 1px, transparent 1px, transparent 9px)',

  moods: [
    'linear-gradient(150deg, #f7efe2 0%, #eadcc4 100%)',
    'linear-gradient(150deg, #f8ebe7 0%, #ecd6d0 100%)',
    'linear-gradient(150deg, #eef1e8 0%, #dbe2d2 100%)',
    'linear-gradient(150deg, #f6ecd9 0%, #e7d4b1 100%)'
  ]
};

export const siteTheme = createTheme(lightTheme, {
  palette: {
    primary: { main: site.ink, light: '#4a423c', dark: site.goldText, contrastText: site.ivory },
    secondary: { main: site.gold, light: site.goldLight, dark: site.goldText, contrastText: site.ink },
    background: { default: site.ivory, paper: site.card },
    text: { primary: site.ink, secondary: site.inkSoft, disabled: site.inkMuted },
    divider: site.border
  },
  typography: {
    fontFamily: site.fontSans,
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: '0.2px' }
  },
  components: {
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-notchedOutline': { borderColor: site.border },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: site.borderHover },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: site.gold, borderWidth: 1.5 }
        }
      }
    },
    MuiMenu: { styleOverrides: { paper: { border: `1px solid ${site.border}`, boxShadow: site.shadowCard } } },
    MuiTooltip: {
      styleOverrides: { tooltip: { backgroundColor: site.espresso, color: site.onEspresso, border: 'none' } }
    }
  }
});
