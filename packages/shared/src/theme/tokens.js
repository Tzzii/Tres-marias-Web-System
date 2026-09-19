/**
 * Tres Marias design tokens, mirrored from the design system
 * (tokens/colors.css and tokens/typography.css). The same values are exposed as
 * CSS custom properties in theme/global.css for plain-CSS use.
 */
export const tokens = {
  // Dark backgrounds
  bgBase: '#0b0f19',
  bgDeep: '#080c14',
  bgPanel: '#0f1626',
  headerBg: '#0f172a',
  slate700: '#1e293b',

  // Brand gold and its lighter/darker/transparent versions
  gold: '#c5a059',
  goldLight: '#dfba73',
  goldDark: '#9d7c38',
  goldGlow: 'rgba(197, 160, 89, 0.3)',
  goldSubtle: 'rgba(197, 160, 89, 0.12)',
  goldChip: 'rgba(197, 160, 89, 0.14)',
  goldTint: 'rgba(197, 160, 89, 0.1)',
  goldWash: 'rgba(197, 160, 89, 0.08)',
  onGold: '#0b0f19',

  // Cards, surfaces and input borders
  cardLight: '#ffffff',
  cardLightBorder: '#e2e8f0',
  cardDark: '#101828',
  cardDarkBorder: 'rgba(197, 160, 89, 0.18)',
  cardDarkBorderHover: 'rgba(197, 160, 89, 0.55)',
  surfaceSubtle: '#f8fafc',
  surfaceMuted: '#f1f5f9',
  borderInput: '#cbd5e1',
  placeholder: '#94a3b8',

  divider: 'rgba(197, 160, 89, 0.22)',
  dividerFaint: 'rgba(255, 255, 255, 0.06)',

  // Text colours (textPrimary/Secondary/Muted on white, textLight/OnDark* on navy)
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#64748b',
  textLight: '#f8fafc',
  textOnDarkSoft: '#b6c0d0',
  textOnDarkMuted: '#7d8798',

  // Status colours
  green: '#10b981',
  amber: '#f59e0b',
  blue: '#3b82f6',
  red: '#ef4444',
  redPress: '#dc2626',

  // Layout sizes in pixels
  sidebarWidth: 264, // wide enough for "Reservation & Calendar" plus its badge
  sidebarCollapsedWidth: 76,
  headerHeight: 70,
  containerMax: 1240,
  formMax: 440,

  // Background gradients and textures
  gradientPage:
    'radial-gradient(circle at 65% 15%, rgba(212, 175, 55, 0.08) 0%, transparent 50%), ' +
    'radial-gradient(circle at 50% 20%, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.98) 55%, #080c14 100%)',
  gradientCentered:
    'radial-gradient(circle at 50% 45%, rgba(212, 175, 55, 0.08) 0%, transparent 60%), ' +
    'radial-gradient(circle at 50% 38%, rgba(30, 41, 59, 0.85) 0%, rgba(15, 23, 42, 0.98) 55%, #080c14 100%)',
  gradientHero:
    'radial-gradient(ellipse at 20% 20%, rgba(197, 160, 89, 0.16) 0%, transparent 55%), ' +
    'radial-gradient(ellipse at 82% 70%, rgba(120, 53, 76, 0.28) 0%, transparent 58%), ' +
    'linear-gradient(160deg, #131b2c 0%, #0b0f19 45%, #080c14 100%)',
  gradientCta: 'radial-gradient(ellipse at 50% 0%, rgba(197, 160, 89, 0.12) 0%, transparent 60%)',
  gradientFormPanel: 'radial-gradient(circle at 50% 0%, rgba(197, 160, 89, 0.07) 0%, transparent 55%)',
  gradientGoldRule: 'linear-gradient(90deg, transparent, #c5a059, transparent)',
  textureLinen:
    'repeating-linear-gradient(115deg, rgba(255, 255, 255, 0.018) 0px, rgba(255, 255, 255, 0.018) 1px, transparent 1px, transparent 9px)',

  // Four package card backgrounds, picked by package.mood
  moods: [
    'linear-gradient(150deg, #1b2536 0%, #0f1626 100%)',
    'linear-gradient(150deg, #2a1f2b 0%, #130d18 100%)',
    'linear-gradient(150deg, #14202b 0%, #0b141c 100%)',
    'linear-gradient(150deg, #241d16 0%, #14100b 100%)'
  ],

  // Shadows
  shadowCard:
    '0 25px 50px -12px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.08), 0 0 35px rgba(197, 160, 89, 0.06)',
  shadowDash: '0 4px 20px -2px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.08)',
  shadowDashHover: '0 10px 25px -4px rgba(0, 0, 0, 0.35)',
  shadowPanel: '0 30px 60px -25px rgba(0, 0, 0, 0.9)',
  shadowTile: '0 18px 40px -18px rgba(0, 0, 0, 0.8)',
  shadowNavScrolled: '0 10px 30px -18px rgba(0, 0, 0, 0.95)',
  shadowMedallion:
    '0 30px 70px -15px rgba(0, 0, 0, 0.75), 0 0 45px rgba(197, 160, 89, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.15)',

  // Animation curves and font
  easeStandard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  easeOutExpo: 'cubic-bezier(0.16, 1, 0.3, 1)',

  fontSans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
};

/** Eyebrow / field-label style used across both portals. */
export const eyebrowSx = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: tokens.textMuted
};

/** Adds the shake animation when `active` is true (used on wrong login attempts). */
export const shakeSx = (active) => (active ? { animation: 'tmShake 0.45s ease' } : null);
