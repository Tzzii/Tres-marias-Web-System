/**
 * The booking form's "Theme and Colors" section (added 2026-10-08): the themes a customer picks from,
 * the colour motif (up to five colours from the colour picker or the metallic buttons) and the design
 * details they write. Stored on the booking as `styling`:
 *
 *   { theme: 'Royal', themeOther: '', colors: [{ hex: '#9CAF88', name: 'Sage Green' },
 *     { hex: '#C9A13B', name: 'Gold', metallic: true }], notes: 'Ivory chair covers with sage ribbons…' }
 *
 * `theme` is a name from STYLING_THEMES, THEME_OTHER (the customer's own words are in `themeOther`),
 * THEME_UNDECIDED ("Not decided yet": the admin follows it up in the chat) or '' (nothing picked). The
 * first colour is the main one. A colour's name is never trusted from the page: cleanStyling() names it
 * again from its code (colorName), so the booking form, the server and the printouts always agree.
 * Equipment rentals have no styling (null), nor do bookings made before this section existed.
 *
 * Pure (no database, no React): the booking form, the admin's edit dialog and the API server
 * (apps/api/src/modules/reservations) use the same lists and the same checks.
 */

/** The theme chip that opens a text box for the customer's own theme. */
export const THEME_OTHER = 'Other';
/** The theme chip for a customer who hasn't decided yet; the admin sees "To Discuss". */
export const THEME_UNDECIDED = 'Not decided yet';
/** Most colours in one motif. */
export const MAX_MOTIF_COLORS = 5;
/** Shortest and longest theme typed under "Other". */
export const THEME_OTHER_RANGE = { min: 2, max: 60 };
/** Longest design details. */
export const STYLING_NOTES_MAX = 1000;

/**
 * Themes Filipino celebrations (handaan) are styled in, and the occasions (OCCASIONS in the shared
 * config) each one is popular for. The booking form lists the ones popular for the chosen occasion
 * first ("Popular for Debut"), then the rest; any theme can be picked for any occasion.
 */
export const STYLING_THEMES = [
  { name: 'Filipiniana', occasions: ['Wedding', 'Debut', 'Anniversary', 'Corporate', 'Reunion'] },
  { name: 'Barrio Fiesta', occasions: ['Birthday', 'Corporate', 'Reunion'] },
  { name: 'Rustic', occasions: ['Wedding', 'Anniversary'] },
  { name: 'Enchanted Garden', occasions: ['Wedding', 'Debut', 'Christening'] },
  { name: 'Classic Elegant', occasions: ['Wedding', 'Anniversary', 'Corporate'] },
  { name: 'Hollywood Red Carpet', occasions: ['Debut', 'Birthday'] },
  { name: 'Masquerade', occasions: ['Debut'] },
  { name: 'Princess and Fairy Tale', occasions: ['Debut', 'Birthday', 'Christening'] },
  { name: 'Royal', occasions: ['Wedding', 'Debut'] },
  { name: 'Boho', occasions: ['Wedding', 'Debut'] },
  { name: 'Hawaiian and Tropical', occasions: ['Birthday', 'Reunion'] },
  { name: 'Retro 70s to 90s', occasions: ['Birthday', 'Anniversary', 'Reunion'] },
  { name: 'Kiddie Character', occasions: ['Birthday'] },
  { name: 'Baby Angels and Clouds', occasions: ['Christening'] },
  { name: 'Golden Milestone', occasions: ['Birthday', 'Anniversary'] },
  { name: 'Modern Minimalist', occasions: ['Corporate', 'Graduation'] },
  { name: 'Graduation', occasions: ['Graduation'] },
  { name: 'Christmas', occasions: ['Corporate', 'Reunion'] }
];

const THEME_NAMES = STYLING_THEMES.map((theme) => theme.name);

/**
 * The theme names in the order the booking form shows them for an occasion: { popular, others }.
 * `popular` are the themes popular for that occasion, `others` the rest, each in STYLING_THEMES order.
 * With no occasion yet, or one no theme lists (e.g. 'Other'), every theme is in `others`.
 */
export function themesFor(occasion) {
  const popular = STYLING_THEMES.filter((theme) => theme.occasions.includes(occasion)).map((theme) => theme.name);
  return { popular, others: THEME_NAMES.filter((name) => !popular.includes(name)) };
}

/**
 * Names for the colour picker's "Looks like: …" and for every printout, as people name a motif's colours,
 * each with a typical shade. colorName() picks the nearest one, so the name is a close match and the
 * code (#9CAF88) is the exact colour.
 */
const COLOR_NAMES = [
  ['White', '#FFFFFF'],
  ['Ivory', '#FFFFF0'],
  ['Cream', '#F5EBD3'],
  ['Beige', '#E3D3B4'],
  ['Nude', '#E3BC9A'],
  ['Champagne', '#F1DDB4'],
  ['Blush Pink', '#F2C4C6'],
  ['Baby Pink', '#F8BBD0'],
  ['Dusty Rose', '#C99A9E'],
  ['Mauve', '#B784A7'],
  ['Fuchsia', '#E0218A'],
  ['Red', '#D32F2F'],
  ['Maroon', '#800000'],
  ['Burgundy', '#7B1E2B'],
  ['Coral', '#FF7F61'],
  ['Peach', '#FFCBA4'],
  ['Orange', '#F57C00'],
  ['Terracotta', '#C8603F'],
  ['Mustard', '#D9A400'],
  ['Yellow', '#FFE135'],
  ['Sage Green', '#9CAF88'],
  ['Mint', '#A8E6CF'],
  ['Olive', '#708238'],
  ['Emerald', '#1F8A5B'],
  ['Forest Green', '#2E5E3A'],
  ['Teal', '#00808A'],
  ['Tiffany Blue', '#81D8D0'],
  ['Baby Blue', '#A7C7E7'],
  ['Dusty Blue', '#7A93AC'],
  ['Royal Blue', '#2A52BE'],
  ['Navy Blue', '#1F2F57'],
  ['Lavender', '#C7B7E3'],
  ['Lilac', '#C8A2C8'],
  ['Purple', '#6A3D9A'],
  ['Plum', '#5E2750'],
  ['Brown', '#7B5134'],
  ['Gray', '#9E9E9E'],
  ['Charcoal', '#3B3F45'],
  ['Black', '#111111']
];

/**
 * The metallic colours, which a flat colour picker can't show (its "gold" looks mustard): each is one
 * button on the form. `hex` is the colour saved and printed, `sheen` the lighter shade the swatch blends in.
 */
export const METALLICS = [
  { name: 'Gold', hex: '#C9A13B', sheen: '#F3DE8A' },
  { name: 'Silver', hex: '#A8A9AD', sheen: '#E8E8EA' },
  { name: 'Rose Gold', hex: '#B76E79', sheen: '#F0C3BF' },
  { name: 'Copper', hex: '#B06A3B', sheen: '#E8A97E' }
];

const HEX = /^#[0-9A-F]{6}$/;

/** A colour code as typed or sent, upper case with its "#" ("9caf88" -> "#9CAF88"), or '' when it isn't one. */
export function readHex(value) {
  if (typeof value !== 'string') return '';
  const code = value.trim().toUpperCase();
  const withHash = code.startsWith('#') ? code : `#${code}`;
  return HEX.test(withHash) ? withHash : '';
}

/** "#9CAF88" -> [156, 175, 136] */
export const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** [156, 175, 136] -> "#9CAF88" */
export const rgbToHex = (rgb) => `#${rgb.map((part) => Math.round(part).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** Hue 0-360, saturation and value 0-1 (the colour picker's area and bar) -> [r, g, b] 0-255. */
export function hsvToRgb(h, s, v) {
  const channel = (n) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(Math.min(k, 4 - k, 1), 0)) * 255);
  };
  return [channel(5), channel(3), channel(1)];
}

/** [r, g, b] 0-255 -> [hue 0-360, saturation 0-1, value 0-1], to move the picker to a typed code. */
export function rgbToHsv([r, g, b]) {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const spread = max - min;
  let hue = 0;
  if (spread) {
    if (max === red) hue = ((green - blue) / spread) % 6;
    else if (max === green) hue = (blue - red) / spread + 2;
    else hue = (red - green) / spread + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return [hue, max ? spread / max : 0, max];
}

// [r, g, b] -> CIE Lab, where the distance between two colours is close to how different people see them
function toLab(rgb) {
  const [r, g, b] = rgb.map((part) => {
    const c = part / 255;
    return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
  });
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const NAMED_LAB = COLOR_NAMES.map(([name, hex]) => [name, toLab(hexToRgb(hex))]);

/** The nearest name in COLOR_NAMES for a colour code, e.g. "#9DB08A" -> "Sage Green". */
export function colorName(hex) {
  const lab = toLab(hexToRgb(hex));
  let best = NAMED_LAB[0][0];
  let bestDistance = Infinity;
  NAMED_LAB.forEach(([name, [l, a, b]]) => {
    const distance = (l - lab[0]) ** 2 + (a - lab[1]) ** 2 + (b - lab[2]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = name;
    }
  });
  return best;
}

/** True when a motif already has this colour: the same metallic, or the same code. */
export const hasColor = (colors, color) => colors.some((c) => (color.metallic ? c.metallic && c.name === color.name : !c.metallic && c.hex === color.hex));

/**
 * The colours that go well with each main colour, hand-picked the way event stylists pair them (a colour
 * wheel alone gives odd shades): the key is a name from COLOR_NAMES or METALLICS, and so is every match,
 * best first. Added 2026-10-10 for the colour picker's "Goes well with …" row.
 */
const COLOR_MATCHES = {
  White: ['Gold', 'Sage Green', 'Blush Pink', 'Navy Blue', 'Silver'],
  Ivory: ['Gold', 'Champagne', 'Sage Green', 'Dusty Rose', 'Burgundy'],
  Cream: ['Gold', 'Sage Green', 'Terracotta', 'Dusty Blue', 'Brown'],
  Beige: ['White', 'Sage Green', 'Terracotta', 'Brown', 'Gold'],
  Nude: ['Ivory', 'Blush Pink', 'Rose Gold', 'Sage Green', 'Champagne'],
  Champagne: ['Ivory', 'Blush Pink', 'Gold', 'Dusty Rose', 'Sage Green'],
  'Blush Pink': ['Ivory', 'Gold', 'Sage Green', 'Dusty Rose', 'Champagne'],
  'Baby Pink': ['White', 'Baby Blue', 'Lavender', 'Silver', 'Mint'],
  'Dusty Rose': ['Ivory', 'Mauve', 'Sage Green', 'Rose Gold', 'Burgundy'],
  Mauve: ['Dusty Rose', 'Ivory', 'Plum', 'Sage Green', 'Silver'],
  Fuchsia: ['White', 'Gold', 'Purple', 'Baby Pink', 'Teal'],
  Red: ['White', 'Gold', 'Black', 'Ivory', 'Forest Green'],
  Maroon: ['Gold', 'Ivory', 'Blush Pink', 'Navy Blue', 'Champagne'],
  Burgundy: ['Ivory', 'Gold', 'Blush Pink', 'Navy Blue', 'Forest Green'],
  Coral: ['White', 'Peach', 'Teal', 'Gold', 'Mint'],
  Peach: ['Ivory', 'Coral', 'Sage Green', 'Gold', 'Dusty Blue'],
  Orange: ['White', 'Teal', 'Gold', 'Brown', 'Navy Blue'],
  Terracotta: ['Cream', 'Sage Green', 'Mustard', 'Dusty Rose', 'Copper'],
  Mustard: ['Navy Blue', 'White', 'Terracotta', 'Olive', 'Gray'],
  Yellow: ['White', 'Gray', 'Baby Blue', 'Mint', 'Navy Blue'],
  'Sage Green': ['Ivory', 'Dusty Rose', 'Champagne', 'Gold', 'Olive'],
  Mint: ['White', 'Baby Pink', 'Peach', 'Gold', 'Gray'],
  Olive: ['Cream', 'Terracotta', 'Mustard', 'Gold', 'Brown'],
  Emerald: ['Gold', 'Ivory', 'Champagne', 'Black', 'Blush Pink'],
  'Forest Green': ['Ivory', 'Gold', 'Burgundy', 'Cream', 'Copper'],
  Teal: ['White', 'Gold', 'Coral', 'Navy Blue', 'Mustard'],
  'Tiffany Blue': ['White', 'Silver', 'Blush Pink', 'Gold', 'Navy Blue'],
  'Baby Blue': ['White', 'Silver', 'Navy Blue', 'Baby Pink', 'Champagne'],
  'Dusty Blue': ['Ivory', 'Navy Blue', 'Blush Pink', 'Silver', 'Champagne'],
  'Royal Blue': ['White', 'Gold', 'Silver', 'Baby Blue', 'Yellow'],
  'Navy Blue': ['White', 'Gold', 'Blush Pink', 'Burgundy', 'Silver'],
  Lavender: ['White', 'Lilac', 'Silver', 'Sage Green', 'Plum'],
  Lilac: ['Ivory', 'Lavender', 'Sage Green', 'Silver', 'Mauve'],
  Purple: ['Gold', 'White', 'Lavender', 'Silver', 'Fuchsia'],
  Plum: ['Gold', 'Blush Pink', 'Ivory', 'Mauve', 'Forest Green'],
  Brown: ['Cream', 'Beige', 'Sage Green', 'Terracotta', 'Gold'],
  Gray: ['White', 'Blush Pink', 'Navy Blue', 'Silver', 'Yellow'],
  Charcoal: ['White', 'Gold', 'Blush Pink', 'Dusty Blue', 'Silver'],
  Black: ['White', 'Gold', 'Red', 'Silver', 'Ivory'],
  Gold: ['White', 'Ivory', 'Black', 'Navy Blue', 'Burgundy'],
  Silver: ['White', 'Navy Blue', 'Baby Blue', 'Lavender', 'Black'],
  'Rose Gold': ['Ivory', 'Blush Pink', 'Champagne', 'Gray', 'Dusty Rose'],
  Copper: ['Cream', 'Forest Green', 'Terracotta', 'Navy Blue', 'Brown']
};

// A name from COLOR_NAMES or METALLICS as a motif colour ({ hex, name } or { hex, name, metallic: true })
function namedColor(name) {
  const metal = METALLICS.find((m) => m.name === name);
  if (metal) return { hex: metal.hex, name: metal.name, metallic: true };
  const named = COLOR_NAMES.find(([n]) => n === name);
  return named ? { hex: named[1], name: named[0] } : null;
}

/**
 * The colours suggested under the motif once it has a main colour (the first): those that go well with
 * it (COLOR_MATCHES, by the main colour's name), best first, leaving out the names the motif already has
 * (a picked "#9DB08A" is Sage Green too, so Sage Green is not offered again). [] when the motif is empty.
 * Each is a motif colour, ready to add.
 */
export function matchingColors(colors) {
  const main = colors && colors[0];
  if (!main) return [];
  return (COLOR_MATCHES[main.name] || []).map(namedColor).filter((color) => color && !colors.some((c) => c.name === color.name));
}

/** The way a theme reads on the pages and printouts: the customer's own words for "Other", else the chip's name. */
export const themeLabel = (styling) => (!styling ? '' : styling.theme === THEME_OTHER ? styling.themeOther : styling.theme);

/** True when the booking has nothing in its styling (no theme, colour or details), e.g. a booking made before 2026-10-08. */
export const stylingEmpty = (styling) => !styling || (!styling.theme && !(styling.colors || []).length && !styling.notes);

/** True when the customer chose "Not decided yet", or gave no theme and no colour: the admin follows it up ("To Discuss"). */
export const stylingToDiscuss = (styling) => !styling || styling.theme === THEME_UNDECIDED || (!styling.theme && !(styling.colors || []).length);

// Text from the page, trimmed; anything that is not text is ''. A lone half of an emoji becomes "�",
// because MySQL refuses it inside a JSON column (the same rule as the reservations service's clean()).
const text = (value) => (typeof value === 'string' ? (value.toWellFormed ? value.toWellFormed() : value).trim() : '');

/**
 * What the booking form or the admin's dialog sent, in the stored shape, or null when it says nothing
 * at all. Unknown keys are dropped; a theme that is not in the list, THEME_OTHER or THEME_UNDECIDED
 * becomes ''; `themeOther` is kept only for THEME_OTHER; a colour keeps its code and gets its name from
 * colorName() (a metallic keeps its own code and name, whatever was sent); a colour that is not a code or
 * a known metallic, or is there twice, is dropped. Lengths and the number of colours are not cut here:
 * stylingProblem() refuses them, so nothing typed is lost without a message.
 */
export function cleanStyling(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const picked = text(value.theme);
  const theme = THEME_NAMES.includes(picked) || picked === THEME_OTHER || picked === THEME_UNDECIDED ? picked : '';
  const colors = [];
  (Array.isArray(value.colors) ? value.colors : []).forEach((color) => {
    if (!color || typeof color !== 'object') return;
    const metal = color.metallic ? METALLICS.find((m) => m.name === color.name) : null;
    const hex = metal ? metal.hex : readHex(color.hex);
    if (!hex) return;
    const next = metal ? { hex, name: metal.name, metallic: true } : { hex, name: colorName(hex) };
    if (!hasColor(colors, next)) colors.push(next);
  });
  const styling = { theme, themeOther: theme === THEME_OTHER ? text(value.themeOther) : '', colors, notes: text(value.notes) };
  return stylingEmpty(styling) ? null : styling;
}

/**
 * The first thing wrong with a cleaned styling (cleanStyling), or null: { field, message }, the field
 * being where the booking form shows it ('styling.themeOther', 'styling.colors', 'styling.notes').
 */
export function stylingProblem(styling) {
  if (!styling) return null;
  if (styling.theme === THEME_OTHER) {
    const { min, max } = THEME_OTHER_RANGE;
    if (styling.themeOther.length < min) return { field: 'styling.themeOther', message: 'Type your theme (at least 2 characters), or pick one above.' };
    if (styling.themeOther.length > max) return { field: 'styling.themeOther', message: `Keep your theme to ${max} characters.` };
  }
  if (styling.colors.length > MAX_MOTIF_COLORS) return { field: 'styling.colors', message: `Pick up to ${MAX_MOTIF_COLORS} colors.` };
  if (styling.notes.length > STYLING_NOTES_MAX) return { field: 'styling.notes', message: `Keep the design details to ${STYLING_NOTES_MAX.toLocaleString('en-PH')} characters.` };
  return null;
}

/**
 * Decorations that are additional charges, and the words that mean them in the design details (English
 * or Filipino). The booking form uses them for a gentle reminder; the ids are the seed's add-on ids, and a
 * charge the catalogue no longer has is skipped.
 */
const DECOR_WORDS = [
  ['add-balloons', ['balloon', 'balloons', 'lobo']],
  ['add-stage', ['stage', 'entablado']],
  ['add-tent', ['tent', 'tents', 'tolda']],
  ['add-sounds-lights', ['sound', 'sounds', 'speaker', 'speakers', 'lights', 'lighting', 'ilaw']],
  ['add-photographer', ['photographer', 'photography', 'videographer', 'video', 'photos']],
  ['add-host', ['host', 'emcee']],
  ['add-clown', ['clown', 'payaso', 'magician']]
];

/**
 * The additional charges the design details mention but the booking doesn't have, so the form can say
 * "You mentioned balloons…": [{ addonId, name, word }], in DECOR_WORDS order. `charges` are the
 * catalogue's additional charges ({ id, name }), `bookedIds` the charges ticked on the form. Whole words
 * only, any case ("Balloons" counts, "balloonist" does not).
 */
export function decorReminders(notes, charges, bookedIds) {
  const words = new Set(String(notes || '').toLowerCase().match(/[a-z]+/g) || []);
  return DECOR_WORDS.flatMap(([addonId, list]) => {
    const charge = charges.find((c) => c.id === addonId);
    const word = list.find((w) => words.has(w));
    return charge && word && !bookedIds.includes(addonId) ? [{ addonId, name: charge.name, word }] : [];
  });
}
