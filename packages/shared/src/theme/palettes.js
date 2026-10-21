/**
 * The two colour schemes the portals can wear.
 *
 * - `lightPalette` (the default): the "Warm Ivory & Gold" look of the public
 *   website (apps/client/src/theme/siteTheme.js), so the portal matches the page
 *   customers browse before they sign in.
 * - `darkPalette`: the midnight and champagne shell, used only after someone presses the dark
 *   mode toggle in Settings.
 *
 * Both objects must hold exactly the same keys: theme/colorMode.js writes every
 * key onto <html> as a CSS custom property, and theme/tokens.js reads them back
 * as `var(--tm-...)`, so every `tokens.x` in an `sx` prop follows the mode.
 *
 * Only colours, gradients, textures and shadows live here. Sizes, fonts and
 * animation curves never change with the mode and stay literal in tokens.js.
 */

/** camelCase token name -> CSS custom property, e.g. bgBase -> --tm-bg-base, mood0 -> --tm-mood-0. */
export const cssVarName = (key) => `--tm-${key.replace(/[A-Z0-9]+/g, (part) => `-${part.toLowerCase()}`)}`;

/** Midnight & Champagne: blue-charcoal layers, ivory type and warm brand accents. */
export const darkPalette = {
  // A quiet midnight canvas, deeper navigation and lifted overlay surfaces.
  bgBase: '#111824',
  bgDeep: '#0c121c',
  bgPanel: '#222e3e',
  headerBg: '#151e2b',
  slate700: '#33445a',

  // Champagne is reserved for primary actions and small brand highlights.
  gold: '#d4b77d',
  goldLight: '#e5cfa3',
  goldDark: '#bfa168',
  goldText: '#e3c995',
  goldGlow: 'rgba(212, 183, 125, 0.16)',
  goldSubtle: 'rgba(212, 183, 125, 0.10)',
  goldChip: 'rgba(212, 183, 125, 0.15)',
  goldTint: 'rgba(212, 183, 125, 0.08)',
  goldWash: 'rgba(212, 183, 125, 0.045)',
  onGold: '#211c13',

  // Cards are lifted above the canvas; inset areas sit a step below them.
  cardLight: '#1b2533',
  cardLightBorder: '#344359',
  cardDark: '#1b2533',
  cardDarkBorder: '#344359',
  cardDarkBorderHover: '#7187a2',
  surfaceSubtle: '#151e2a',
  surfaceMuted: '#2a3748',
  borderInput: '#71839b',
  borderFocus: '#d4b77d',
  placeholder: '#9eafc4',
  divider: '#344359',
  dividerFaint: 'rgba(190, 208, 231, 0.08)',

  // Dusty blue supports secondary controls without competing with champagne.
  ink: '#adc7e2',
  inkHover: '#c6d9ec',
  onInk: '#162232',
  dangerOnInk: '#752735',

  shellHover: 'rgba(173, 199, 226, 0.075)',
  shellInset: 'rgba(173, 199, 226, 0.045)',
  shellBorder: 'rgba(173, 199, 226, 0.16)',
  shellScrim: 'rgba(21, 30, 43, 0.97)',
  sidebarBg: '#0c121c',
  sidebarBorder: '#28364a',
  sidebarText: '#b9c6d6',
  sidebarTextMuted: '#95a6bd',
  sidebarActiveText: '#ead3a7',
  sidebarActiveBg: '#293345',
  sidebarActiveHover: '#344158',
  sidebarHover: 'rgba(173, 199, 226, 0.075)',

  // Warm ivory headings with softer slate body text and readable small labels.
  textPrimary: '#f3f0e9',
  textSecondary: '#c3cedc',
  textMuted: '#a4b2c5',
  textLight: '#f3f0e9',
  textOnDarkSoft: '#c3cedc',
  textOnDarkMuted: '#a4b2c5',

  // Muted semantic colors stay distinguishable and readable on dark surfaces.
  green: '#86cbb0',
  amber: '#e2bc79',
  blue: '#9abfe5',
  red: '#e9a3ad',
  redPress: '#edb0b8',
  dangerSoft: '#efb5be',
  inputBg: '#131c28',
  onStatus: '#142130',
  successText: '#a1dec4',
  warningText: '#eace9f',
  infoText: '#b4d4f3',
  dangerText: '#f1bdc5',
  violetText: '#ccbce7',
  successBg: 'rgba(134, 203, 176, 0.10)',
  warningBg: 'rgba(226, 188, 121, 0.10)',
  infoBg: 'rgba(154, 191, 229, 0.10)',
  dangerBg: 'rgba(233, 163, 173, 0.10)',
  successBorder: 'rgba(134, 203, 176, 0.25)',
  warningBorder: 'rgba(226, 188, 121, 0.25)',
  infoBorder: 'rgba(154, 191, 229, 0.25)',
  dangerBorder: 'rgba(233, 163, 173, 0.25)',

  // A little atmosphere at the top, with calm, solid work surfaces beneath it.
  gradientPage:
    'radial-gradient(ellipse at 85% 0%, rgba(96, 134, 184, 0.10), transparent 48%), linear-gradient(165deg, #172131 0%, #111824 58%, #101722 100%)',
  gradientCentered: 'radial-gradient(ellipse at 50% 20%, rgba(173, 199, 226, 0.10), transparent 60%), #111824',
  gradientHero:
    'radial-gradient(ellipse at 15% 0%, rgba(212, 183, 125, 0.10), transparent 55%), linear-gradient(135deg, #243348, #1b283a 65%, #162131)',
  gradientCta: 'radial-gradient(ellipse at 50% 0%, rgba(212, 183, 125, 0.10), transparent 60%)',
  gradientFormPanel: 'radial-gradient(ellipse at 50% 0%, rgba(173, 199, 226, 0.07), transparent 60%)',
  gradientGoldRule: 'linear-gradient(90deg, transparent, #d4b77d, transparent)',
  gradientBar: 'linear-gradient(180deg, #cbb587 0%, #7c94b2 100%)',
  textureLinen:
    'repeating-linear-gradient(115deg, rgba(198, 217, 236, 0.012) 0px, rgba(198, 217, 236, 0.012) 1px, transparent 1px, transparent 9px)',
  mood0: 'linear-gradient(145deg, #35445a, #202d40)',
  mood1: 'linear-gradient(145deg, #493947, #2c2635)',
  mood2: 'linear-gradient(145deg, #2c4747, #1d3037)',
  mood3: 'linear-gradient(145deg, #494237, #302c28)',

  // Separation comes from a fine inner highlight and soft, short shadows.
  shadowCard: 'inset 0 1px 0 rgba(214, 228, 246, 0.055), 0 16px 36px -20px rgba(3, 8, 16, 0.65)',
  shadowDash: 'inset 0 1px 0 rgba(214, 228, 246, 0.045), 0 8px 22px -14px rgba(3, 8, 16, 0.6)',
  shadowDashHover: 'inset 0 1px 0 rgba(214, 228, 246, 0.07), 0 18px 36px -20px rgba(3, 8, 16, 0.75)',
  shadowPanel: '0 28px 70px -18px rgba(3, 8, 16, 0.75)',
  shadowTile: '0 14px 30px -16px rgba(3, 8, 16, 0.65)',
  shadowNavScrolled: '0 8px 24px -16px rgba(3, 8, 16, 0.65)',
  shadowMedallion: '0 24px 60px -18px rgba(3, 8, 16, 0.7), 0 0 0 1px rgba(212, 183, 125, 0.22)'
};

/**
 * The warm ivory scheme, copying the public website's colours so the portal in
 * light mode reads as the same brand: ivory and sand backgrounds, white cards,
 * warm charcoal ink for text and gold as the accent.
 */
export const lightPalette = {
  // Shell backgrounds: ivory page and sidebar, a hair lighter header, white panels
  bgBase: '#fbf7f0',
  bgDeep: '#f3eadb',
  bgPanel: '#ffffff',
  headerBg: '#fdfbf6',
  slate700: '#f3eadb',

  // Same gold; `goldText` drops to the darker gold the website uses for gold words on ivory
  gold: '#c5a059',
  goldLight: '#dfba73',
  goldDark: '#9d7c38',
  goldText: '#8a6a2f',
  goldGlow: 'rgba(197, 160, 89, 0.35)',
  goldSubtle: 'rgba(197, 160, 89, 0.12)',
  goldChip: 'rgba(197, 160, 89, 0.14)',
  goldTint: 'rgba(197, 160, 89, 0.1)',
  goldWash: 'rgba(197, 160, 89, 0.08)',
  onGold: '#2b2622',

  // Cards stay white; every border and muted surface turns warm
  cardLight: '#ffffff',
  cardLightBorder: '#e8dcc6',
  cardDark: '#ffffff',
  cardDarkBorder: '#e8dcc6',
  cardDarkBorderHover: 'rgba(197, 160, 89, 0.7)',
  surfaceSubtle: '#fbf7f0',
  surfaceMuted: '#f3eadb',
  borderInput: '#e0d3ba',
  borderFocus: '#c5a059',
  placeholder: '#a89c8e',

  divider: '#e8dcc6',
  dividerFaint: 'rgba(60, 42, 20, 0.1)',

  ink: '#2b2622',
  inkHover: '#4a423c',
  onInk: '#fbf7f0',
  dangerOnInk: '#fca5a5',

  shellHover: 'rgba(197, 160, 89, 0.12)',
  shellInset: 'rgba(197, 160, 89, 0.08)',
  shellBorder: 'rgba(197, 160, 89, 0.28)',
  shellScrim: 'rgba(251, 247, 240, 0.97)',

  // Portal sidebar: "Espresso", the same warm charcoal as the dark buttons, with cream text and gold for the active link
  sidebarBg: '#2b2622',
  sidebarBorder: 'rgba(255, 255, 255, 0.06)',
  sidebarText: '#d9cfc3',
  sidebarTextMuted: '#a39888',
  sidebarActiveText: '#dfba73',
  sidebarActiveBg: 'rgba(197, 160, 89, 0.18)',
  sidebarActiveHover: 'rgba(197, 160, 89, 0.26)',
  sidebarHover: 'rgba(255, 255, 255, 0.06)',

  // Ink on ivory, in the same three weights as the navy scheme
  textPrimary: '#2b2622',
  textSecondary: '#5e554d',
  textMuted: '#8a8078',
  textLight: '#2b2622',
  textOnDarkSoft: '#5e554d',
  textOnDarkMuted: '#8a8078',

  green: '#10b981',
  amber: '#f59e0b',
  blue: '#3b82f6',
  red: '#ef4444',
  redPress: '#dc2626',
  dangerSoft: '#b91c1c',

  inputBg: '#ffffff',
  onStatus: '#ffffff',
  successText: '#047857',
  warningText: '#92400e',
  infoText: '#1d4ed8',
  dangerText: '#b91c1c',
  violetText: '#6d28d9',
  successBg: '#ecfdf5',
  warningBg: '#fffbeb',
  infoBg: '#eff6ff',
  dangerBg: '#fef2f2',
  successBorder: '#a7f3d0',
  warningBorder: '#fde68a',
  infoBorder: '#bfdbfe',
  dangerBorder: '#fecaca',

  gradientPage:
    'radial-gradient(circle at 65% 15%, rgba(197, 160, 89, 0.16) 0%, transparent 50%), ' +
    'radial-gradient(circle at 50% 20%, rgba(243, 234, 219, 0.9) 0%, rgba(251, 247, 240, 0.98) 55%, #fbf7f0 100%)',
  gradientCentered:
    'radial-gradient(circle at 50% 45%, rgba(197, 160, 89, 0.16) 0%, transparent 60%), ' +
    'radial-gradient(circle at 50% 38%, rgba(243, 234, 219, 0.85) 0%, rgba(251, 247, 240, 0.98) 55%, #fbf7f0 100%)',
  gradientHero:
    'radial-gradient(ellipse at 18% 18%, rgba(197, 160, 89, 0.22) 0%, transparent 55%), ' +
    'radial-gradient(ellipse at 85% 75%, rgba(176, 96, 96, 0.1) 0%, transparent 55%), ' +
    'linear-gradient(180deg, #f4ead9 0%, #fbf7f0 100%)',
  gradientCta: 'radial-gradient(ellipse at 50% 0%, rgba(197, 160, 89, 0.22) 0%, transparent 65%)',
  gradientFormPanel: 'radial-gradient(circle at 50% 0%, rgba(197, 160, 89, 0.12) 0%, transparent 55%)',
  gradientGoldRule: 'linear-gradient(90deg, transparent, #c5a059, transparent)',
  gradientBar: 'linear-gradient(180deg, #4a423c 0%, #2b2622 100%)',
  textureLinen:
    'repeating-linear-gradient(115deg, rgba(120, 90, 40, 0.035) 0px, rgba(120, 90, 40, 0.035) 1px, transparent 1px, transparent 9px)',

  // The website's four light washes: cream, blush, sage, wheat
  mood0: 'linear-gradient(150deg, #f7efe2 0%, #eadcc4 100%)',
  mood1: 'linear-gradient(150deg, #f8ebe7 0%, #ecd6d0 100%)',
  mood2: 'linear-gradient(150deg, #eef1e8 0%, #dbe2d2 100%)',
  mood3: 'linear-gradient(150deg, #f6ecd9 0%, #e7d4b1 100%)',

  // Soft, warm-tinted shadows instead of the navy scheme's heavy black ones
  shadowCard:
    '0 1px 2px rgba(60, 42, 20, 0.05), 0 25px 50px -20px rgba(60, 42, 20, 0.3), 0 0 0 1px rgba(197, 160, 89, 0.16)',
  shadowDash: '0 1px 2px rgba(60, 42, 20, 0.04), 0 12px 28px -18px rgba(60, 42, 20, 0.28)',
  shadowDashHover: '0 1px 2px rgba(60, 42, 20, 0.05), 0 22px 40px -20px rgba(60, 42, 20, 0.35)',
  shadowPanel: '0 30px 60px -30px rgba(60, 42, 20, 0.35), 0 0 0 1px rgba(197, 160, 89, 0.18)',
  shadowTile: '0 18px 40px -22px rgba(60, 42, 20, 0.35)',
  shadowNavScrolled: '0 10px 30px -22px rgba(60, 42, 20, 0.45)',
  shadowMedallion:
    '0 30px 70px -20px rgba(60, 42, 20, 0.35), 0 0 45px rgba(197, 160, 89, 0.35), 0 0 0 1px rgba(197, 160, 89, 0.25)'
};

/** The two schemes by mode name, for colorMode.js. */
export const PALETTES = { dark: darkPalette, light: lightPalette };
