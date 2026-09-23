/**
 * The two colour schemes the portals can wear.
 *
 * - `darkPalette`: the navy shell that both portals have always used.
 * - `lightPalette`: the "Warm Ivory & Gold" look of the public website
 *   (apps/client/src/theme/siteTheme.js), so switching to light mode makes the
 *   portal match the page customers browse before they sign in.
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

/** The navy scheme (default). */
export const darkPalette = {
  // Shell backgrounds
  bgBase: '#0b0f19',
  bgDeep: '#080c14',
  bgPanel: '#0f1626',
  headerBg: '#0f172a',
  slate700: '#1e293b',

  // Brand gold and its lighter/darker/transparent versions.
  // `goldText` is gold used as text on the shell; it has to stay readable in both modes.
  gold: '#c5a059',
  goldLight: '#dfba73',
  goldDark: '#9d7c38',
  goldText: '#dfba73',
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
  borderFocus: '#0f172a', // the outline a focused input gets on a white card
  placeholder: '#94a3b8',

  divider: 'rgba(197, 160, 89, 0.22)',
  dividerFaint: 'rgba(255, 255, 255, 0.06)',

  // The strong dark fill on white cards: selected chips and tiles, chat bubbles,
  // the send button, dark submit buttons. It stays dark in both modes
  // (navy in the navy scheme, warm charcoal in the ivory one).
  ink: '#0f172a',
  inkHover: '#1e293b',
  onInk: '#ffffff',
  dangerOnInk: '#fca5a5', // a danger action sitting on that dark fill, e.g. "Decline selected"

  // See-through layers painted on the shell: hover wash, inset fields (the search
  // box, section chips), hairline borders and the bar behind sticky navigation.
  shellHover: 'rgba(255, 255, 255, 0.05)',
  shellInset: 'rgba(255, 255, 255, 0.06)',
  shellBorder: 'rgba(255, 255, 255, 0.09)',
  shellScrim: 'rgba(15, 23, 42, 0.97)',

  // Portal sidebar (and the phone drawer): a shade darker than the page so it reads as its own column.
  // It is dark in both modes, so its text, hover and Log out colours are light in both.
  sidebarBg: '#070a12',
  sidebarBorder: 'rgba(255, 255, 255, 0.06)',
  sidebarText: '#b6c0d0',
  sidebarTextMuted: '#7d8798',
  sidebarActiveText: '#dfba73',
  sidebarActiveBg: 'rgba(197, 160, 89, 0.16)',
  sidebarActiveHover: 'rgba(197, 160, 89, 0.22)',
  sidebarHover: 'rgba(255, 255, 255, 0.06)',
  sidebarDanger: '#fca5a5',
  sidebarDangerBg: 'rgba(239, 68, 68, 0.12)',
  sidebarDangerHover: 'rgba(239, 68, 68, 0.2)',

  // Text colours. textPrimary/Secondary/Muted sit on white cards;
  // textLight/textOnDark* sit on the shell and turn to ink in light mode.
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#64748b',
  textLight: '#f8fafc',
  textOnDarkSoft: '#b6c0d0',
  textOnDarkMuted: '#7d8798',

  // Status colours (same in both modes: they always sit on white cards)
  green: '#10b981',
  amber: '#f59e0b',
  blue: '#3b82f6',
  red: '#ef4444',
  redPress: '#dc2626',
  dangerSoft: '#fca5a5', // "Log out" and error text on the shell

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
  gradientBar: 'linear-gradient(180deg, #334155 0%, #1e293b 100%)', // chart bars that are not the highlighted one
  textureLinen:
    'repeating-linear-gradient(115deg, rgba(255, 255, 255, 0.018) 0px, rgba(255, 255, 255, 0.018) 1px, transparent 1px, transparent 9px)',

  // Four package card backgrounds, picked by package.mood
  mood0: 'linear-gradient(150deg, #1b2536 0%, #0f1626 100%)',
  mood1: 'linear-gradient(150deg, #2a1f2b 0%, #130d18 100%)',
  mood2: 'linear-gradient(150deg, #14202b 0%, #0b141c 100%)',
  mood3: 'linear-gradient(150deg, #241d16 0%, #14100b 100%)',

  // Shadows
  shadowCard:
    '0 25px 50px -12px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.08), 0 0 35px rgba(197, 160, 89, 0.06)',
  shadowDash: '0 4px 20px -2px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.08)',
  shadowDashHover: '0 10px 25px -4px rgba(0, 0, 0, 0.35)',
  shadowPanel: '0 30px 60px -25px rgba(0, 0, 0, 0.9)',
  shadowTile: '0 18px 40px -18px rgba(0, 0, 0, 0.8)',
  shadowNavScrolled: '0 10px 30px -18px rgba(0, 0, 0, 0.95)',
  shadowMedallion:
    '0 30px 70px -15px rgba(0, 0, 0, 0.75), 0 0 45px rgba(197, 160, 89, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.15)'
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
  sidebarDanger: '#fca5a5',
  sidebarDangerBg: 'rgba(239, 68, 68, 0.14)',
  sidebarDangerHover: 'rgba(239, 68, 68, 0.22)',

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
