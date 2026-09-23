/**
 * Tres Marias design tokens, copied from the design system
 * (tokens/colors.css and tokens/typography.css).
 *
 * Every colour, gradient, texture and shadow is a `var(--tm-...)` reference, not
 * a fixed hex value, so the same `sx={{ color: tokens.textLight }}` follows the
 * portal's dark / light mode without any component having to know the mode.
 * The two sets of values live in theme/palettes.js; theme/colorMode.js writes
 * the chosen one onto <html>. The dark value is kept as the `var()` fallback, so
 * the design still holds if the mode was never applied.
 *
 * Sizes, fonts and animation curves are the same in both modes and stay literal.
 * MUI palettes cannot read `var()` (they measure contrast), so theme/createTheme.js
 * imports the raw values from palettes.js instead of the tokens below.
 */
import { cssVarName, darkPalette } from './palettes.js';

// bgBase -> 'var(--tm-bg-base, #0b0f19)'. Everything after the first comma is the fallback,
// so multi-part gradients and shadows survive unchanged.
const colorTokens = Object.fromEntries(Object.keys(darkPalette).map((key) => [key, `var(${cssVarName(key)}, ${darkPalette[key]})`]));

export const tokens = {
  // Colours, gradients, textures and shadows (see palettes.js for the values)
  ...colorTokens,

  // The four package card backgrounds as a list, picked by package.mood
  moods: [colorTokens.mood0, colorTokens.mood1, colorTokens.mood2, colorTokens.mood3],

  // Layout sizes in pixels
  sidebarWidth: 264, // wide enough for "Reservation & Calendar" plus its badge
  sidebarCollapsedWidth: 76,
  headerHeight: 70,
  containerMax: 1240,
  formMax: 440,

  // Animation curves and font
  easeStandard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  easeOutExpo: 'cubic-bezier(0.16, 1, 0.3, 1)',

  fontSans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
};

/** Style for the small label above a title or field, used in both portals. */
export const eyebrowSx = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: tokens.textMuted
};

/** Adds the shake animation when `active` is true (used on wrong login attempts). */
export const shakeSx = (active) => (active ? { animation: 'tmShake 0.45s ease' } : null);
