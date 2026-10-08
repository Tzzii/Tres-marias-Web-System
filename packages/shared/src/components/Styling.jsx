import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import {
  MAX_MOTIF_COLORS,
  METALLICS,
  STYLING_NOTES_MAX,
  THEME_OTHER,
  THEME_OTHER_RANGE,
  THEME_UNDECIDED,
  colorName,
  hasColor,
  hexToRgb,
  hsvToRgb,
  readHex,
  rgbToHex,
  rgbToHsv,
  stylingEmpty,
  stylingToDiscuss,
  themeLabel,
  themesFor
} from '../domain/styling.js';
import { tokens } from '../theme/tokens.js';
import { AlertBanner } from './Feedback.jsx';
import { FormField } from './FormField.jsx';
import { Pill } from './Pill.jsx';

/**
 * The "Theme and Colors" parts (domain/styling.js has the lists and the rules):
 *   StylingFields     the theme chips (with "Other" and its text box), the colour motif and the design
 *                     details: the booking form's section 4 and the admin's Edit Theme and Colors dialog
 *   ColorMotifPicker  the colour picker: a shade area and a hue bar, the colour code, the metallic
 *                     buttons and the colours picked so far (up to MAX_MOTIF_COLORS, the first is the main one)
 *   StylingSummary    what was chosen, read only: the reservation pages (customer and admin) and the printouts
 *   ColorSwatch       one colour's small square, also printed (print-color-adjust keeps it on paper)
 */

// Colours stay on paper: browsers leave out background colours when printing unless told otherwise
const keepOnPrint = { printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' };

// A metallic's swatch blends its colour with its sheen, so Gold reads as gold and not as mustard
const swatchFill = (color) => {
  const metal = color.metallic && METALLICS.find((m) => m.name === color.name);
  return metal ? `linear-gradient(135deg, ${metal.hex}, ${metal.sheen} 50%, ${metal.hex})` : color.hex;
};

/** One colour's square; `size` in pixels. Decorative: the colour's name is always written next to it. */
export function ColorSwatch({ color, size = 20, sx }) {
  return <Box component="span" aria-hidden sx={{ display: 'inline-block', flexShrink: 0, width: size, height: size, borderRadius: 1, border: `1px solid ${tokens.borderInput}`, background: swatchFill(color), ...keepOnPrint, ...sx }} />;
}

// Where a pointer is inside an element, each from 0 to 1
const pointerSpot = (event, element) => {
  const box = element.getBoundingClientRect();
  const clamp = (n) => Math.min(1, Math.max(0, n));
  return [clamp((event.clientX - box.left) / box.width), clamp((event.clientY - box.top) / box.height)];
};

// Mouse, touch and pen dragging on an element: `onSpot([x, y])` on the press and on every move until it is let go
const dragHandlers = (onSpot) => ({
  onPointerDown: (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    onSpot(pointerSpot(event, event.currentTarget));
  },
  onPointerMove: (event) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) onSpot(pointerSpot(event, event.currentTarget));
  }
});

// The round marker on the shade area and the hue bar
const markerSx = { position: 'absolute', width: 16, height: 16, borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.45)', transform: 'translate(-50%, -50%)', pointerEvents: 'none' };

/**
 * The colour picker. The customer drags in the shade area (left to right: pale to strong; top to bottom:
 * light to dark) and along the hue bar, or types a colour code from Pinterest or Canva, sees
 * "Looks like: Sage Green", and adds it; Gold, Silver, Rose Gold and Copper are buttons of their own.
 * Both the area and the bar also move with the arrow keys. `colors` are the motif's colours so far
 * ([{ hex, name, metallic? }]), `onChange(next)` gets the new list; a colour is removed with its ×.
 * `error` is the server's or the form's message about the colours.
 */
export function ColorMotifPicker({ id, colors, onChange, error }) {
  // Hue 0-360, saturation and value 0-1; it starts on a soft sage, a colour many motifs use
  const [hsv, setHsv] = useState(() => rgbToHsv(hexToRgb('#9CAF88')));
  const [code, setCode] = useState('#9CAF88'); // the colour code box, as typed
  const [problem, setProblem] = useState(''); // "up to 5" or "already in your motif"
  const [hue, saturation, value] = hsv;
  // The colour now chosen: the code as typed when it is a full code, else the picker's
  const current = readHex(code) || rgbToHex(hsvToRgb(hue, saturation, value));
  const full = colors.length >= MAX_MOTIF_COLORS;

  // Move the picker and write its colour into the code box
  const pick = (next) => {
    setHsv(next);
    setCode(rgbToHex(hsvToRgb(...next)));
    setProblem('');
  };
  const typeCode = (raw) => {
    setCode(raw.slice(0, 7));
    setProblem('');
    const hex = readHex(raw);
    if (hex) setHsv(rgbToHsv(hexToRgb(hex)));
  };

  // Add a colour unless the motif is full or already has it
  const add = (color) => {
    if (full) return setProblem(`You can pick up to ${MAX_MOTIF_COLORS} colors. Remove one first.`);
    if (hasColor(colors, color)) return setProblem('That color is already in your motif.');
    setProblem('');
    onChange([...colors, color]);
    return undefined;
  };
  const remove = (index) => {
    setProblem('');
    onChange(colors.filter((_, i) => i !== index));
  };

  // Arrow keys: the shade area moves saturation (left, right) and brightness (up, down); the bar moves the hue
  const areaKeys = (event) => {
    const step = { ArrowLeft: [-0.03, 0], ArrowRight: [0.03, 0], ArrowUp: [0, 0.03], ArrowDown: [0, -0.03] }[event.key];
    if (!step) return;
    event.preventDefault();
    const clamp = (n) => Math.min(1, Math.max(0, n));
    pick([hue, clamp(saturation + step[0]), clamp(value + step[1])]);
  };
  const hueKeys = (event) => {
    const step = { ArrowLeft: -5, ArrowRight: 5, ArrowDown: -5, ArrowUp: 5 }[event.key];
    if (!step) return;
    event.preventDefault();
    pick([(hue + step + 360) % 360, saturation, value]);
  };

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1.2fr) minmax(0, 1fr)' }, gap: 2 }}>
      <Box sx={{ minWidth: 0 }}>
        {/* The shade area: the hue at full strength, washed white to the left and darkened to the bottom.
            touch-action: none keeps the page from scrolling while a finger drags in it. */}
        <Box
          role="slider"
          tabIndex={0}
          aria-label="Color shade"
          aria-valuetext={`${Math.round(saturation * 100)}% strength, ${Math.round(value * 100)}% brightness`}
          onKeyDown={areaKeys}
          {...dragHandlers(([x, y]) => pick([hue, x, 1 - y]))}
          sx={{ position: 'relative', height: { xs: 150, sm: 170 }, borderRadius: 1.5, cursor: 'crosshair', touchAction: 'none', backgroundColor: `hsl(${hue}, 100%, 50%)`, backgroundImage: 'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)', outline: 'none', '&:focus-visible': { boxShadow: `0 0 0 3px ${tokens.borderFocus}` } }}
        >
          <Box sx={{ ...markerSx, left: `${saturation * 100}%`, top: `${(1 - value) * 100}%`, backgroundColor: current }} />
        </Box>
        {/* The hue bar: every colour, left to right */}
        <Box
          role="slider"
          tabIndex={0}
          aria-label="Color"
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(hue)}
          onKeyDown={hueKeys}
          {...dragHandlers(([x]) => pick([Math.min(359.9, x * 360), saturation, value]))}
          sx={{ position: 'relative', mt: 1.25, height: 20, borderRadius: 1.5, cursor: 'pointer', touchAction: 'none', background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)', outline: 'none', '&:focus-visible': { boxShadow: `0 0 0 3px ${tokens.borderFocus}` } }}
        >
          <Box sx={{ ...markerSx, left: `${(hue / 360) * 100}%`, top: '50%', backgroundColor: `hsl(${hue}, 100%, 50%)` }} />
        </Box>
        {/* Metallics, which the picker can't show */}
        <Typography sx={{ mt: 1.5, mb: 0.75, fontSize: 12, fontWeight: 600, color: tokens.textMuted }}>Metallics</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {METALLICS.map((metal) => (
            <Button key={metal.name} size="small" variant="outlined" onClick={() => add({ hex: metal.hex, name: metal.name, metallic: true })} startIcon={<ColorSwatch color={{ ...metal, metallic: true }} size={14} sx={{ borderRadius: '50%' }} />} sx={{ borderRadius: 999, textTransform: 'none', fontSize: 12.5 }}>
              {metal.name}
            </Button>
          ))}
        </Box>
      </Box>

      <Box sx={{ minWidth: 0 }}>
        {/* The colour now chosen, its name and its code */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
          <ColorSwatch color={{ hex: current }} size={48} sx={{ borderRadius: 1.5 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: tokens.textPrimary }}>Looks like: {colorName(current)}</Typography>
            <TextField
              id={`${id}-code`}
              size="small"
              value={code}
              onChange={(e) => typeCode(e.target.value)}
              onBlur={() => !readHex(code) && setCode(current)}
              inputProps={{ 'aria-label': 'Color code', maxLength: 7, autoComplete: 'off', spellCheck: false }}
              sx={{ mt: 0.5, width: 116, '& input': { fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: 13, py: 0.6 } }}
            />
          </Box>
        </Box>
        <Button fullWidth variant="outlined" startIcon={<AddRoundedIcon />} onClick={() => add({ hex: current, name: colorName(current) })} sx={{ textTransform: 'none' }}>
          Add this color
        </Button>
        {(problem || error) && (
          <Typography role="alert" sx={{ mt: 0.75, fontSize: 12.5, fontWeight: 600, color: tokens.redPress }}>
            {problem || error}
          </Typography>
        )}

        {/* The motif so far: the first is the main colour */}
        <Typography sx={{ mt: 1.5, mb: 0.75, fontSize: 12, fontWeight: 600, color: tokens.textMuted }}>
          {colors.length} of {MAX_MOTIF_COLORS} colors{colors.length ? ' · the first is your main color' : ''}
        </Typography>
        <Box component="ul" aria-label="Your color motif" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {colors.map((color, index) => (
            <Box component="li" key={`${color.name}-${color.hex}`} sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 1, pr: 0.5, py: 0.5, borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}`, backgroundColor: tokens.cardLight }}>
              <ColorSwatch color={color} size={22} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: tokens.textPrimary, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  {color.name}
                  {index === 0 && <Pill label="Main" dot={false} size="sm" bg="rgba(197,160,89,0.18)" fg="#8a6a2b" />}
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: tokens.textMuted, fontFamily: color.metallic ? undefined : 'ui-monospace, SFMono-Regular, Consolas, monospace' }}>{color.metallic ? 'Metallic' : color.hex}</Typography>
              </Box>
              <IconButton size="small" aria-label={`Remove ${color.name}`} onClick={() => remove(index)} sx={{ color: tokens.textMuted }}>
                <CloseRoundedIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

// One theme chip; `picked` shows a tick and a dark border
function ThemeChip({ label, picked, dashed, onClick }) {
  return (
    <ButtonBase
      onClick={onClick}
      aria-pressed={picked}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 0.75, borderRadius: 999, fontFamily: 'inherit', fontSize: 13, fontWeight: picked ? 700 : 500, color: picked ? tokens.textPrimary : dashed ? tokens.textSecondary : tokens.textPrimary, border: picked ? `2px solid ${tokens.ink}` : `1px ${dashed ? 'dashed' : 'solid'} ${tokens.borderInput}`, m: picked ? 0 : '1px', backgroundColor: picked ? tokens.surfaceSubtle : tokens.cardLight, transition: 'border-color 0.15s ease', '&:hover': { borderColor: picked ? tokens.ink : tokens.placeholder }, '@media (pointer: coarse)': { py: 1 } }}
    >
      {picked && <CheckRoundedIcon sx={{ fontSize: 16 }} />}
      {label}
    </ButtonBase>
  );
}

// A small heading inside the section ("Theme", "Color Motif", "Popular for Debut")
const Heading = ({ children, hint, sx }) => (
  <Typography component="h3" sx={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary, ...sx }}>
    {children}
    {hint && <Box component="span" sx={{ ml: 0.75, fontSize: 12.5, fontWeight: 500, color: tokens.textSecondary }}>{hint}</Box>}
  </Typography>
);

/**
 * The theme, colour motif and design details. `value` is the styling as the form keeps it
 * ({ theme, themeOther, colors, notes }), `onChange(patch)` gets the fields that changed. `occasion` (from
 * the Event Details) puts the themes popular for it first. `errors` are the form's messages by field
 * ('styling.themeOther', 'styling.colors', 'styling.notes'). `forCustomer` adds the booking form's notes
 * on how colours are matched and what is charged; the admin's dialog leaves them out. `children` go under
 * the design details (the booking form's reminder about decorations that are additional charges).
 */
export function StylingFields({ idPrefix, value, onChange, occasion, errors = {}, forCustomer = false, children }) {
  const { popular, others } = themesFor(occasion);
  const otherBox = useRef(null);
  const justPickedOther = useRef(false); // focus the "Other" box only when the chip was just pressed, never on load

  useEffect(() => {
    if (value.theme === THEME_OTHER && justPickedOther.current && otherBox.current) otherBox.current.focus();
    justPickedOther.current = false;
  }, [value.theme]);

  // Pressing the picked chip again un-picks it; the typed theme is kept while "Other" is picked only
  const pickTheme = (name) => {
    const theme = value.theme === name ? '' : name;
    justPickedOther.current = theme === THEME_OTHER;
    onChange({ theme, themeOther: theme === THEME_OTHER ? value.themeOther : '' });
  };
  const chips = (names) => names.map((name) => <ThemeChip key={name} label={name} picked={value.theme === name} onClick={() => pickTheme(name)} />);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box>
        <Heading sx={{ mb: 1 }}>Theme</Heading>
        {popular.length > 0 && (
          <>
            <Typography sx={{ mb: 0.75, fontSize: 12, fontWeight: 600, color: tokens.textMuted }}>Popular for {occasion}</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>{chips(popular)}</Box>
            <Typography sx={{ mb: 0.75, fontSize: 12, fontWeight: 600, color: tokens.textMuted }}>More Themes</Typography>
          </>
        )}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {chips(others)}
          <ThemeChip label={THEME_OTHER} dashed picked={value.theme === THEME_OTHER} onClick={() => pickTheme(THEME_OTHER)} />
          <ThemeChip label={THEME_UNDECIDED} dashed picked={value.theme === THEME_UNDECIDED} onClick={() => pickTheme(THEME_UNDECIDED)} />
        </Box>
        {/* Their own theme when it is not in the list */}
        {value.theme === THEME_OTHER && (
          <FormField
            ref={otherBox}
            id={`${idPrefix}-themeOther`}
            label="Your theme"
            required
            value={value.themeOther}
            onChange={(e) => onChange({ themeOther: e.target.value })}
            error={errors['styling.themeOther']}
            placeholder="e.g. Paris, Under the Sea, K-pop"
            inputProps={{ maxLength: THEME_OTHER_RANGE.max }}
            sx={{ mt: 1.5, maxWidth: 420 }}
          />
        )}
        {forCustomer && value.theme === THEME_UNDECIDED && (
          <Typography sx={{ mt: 1, fontSize: 12.5, color: tokens.textSecondary }}>That's fine. We'll talk about the look in your messages once we send your quotation.</Typography>
        )}
      </Box>

      <Box>
        <Heading hint={`Optional. Up to ${MAX_MOTIF_COLORS} colors, your main color first.`} sx={{ mb: 1 }}>
          Color Motif
        </Heading>
        <ColorMotifPicker id={`${idPrefix}-color`} colors={value.colors} onChange={(colors) => onChange({ colors })} error={errors['styling.colors']} />
        {forCustomer && (
          <Typography sx={{ mt: 1.25, fontSize: 12, lineHeight: 1.55, color: tokens.textMuted }}>
            We match your colors as closely as we can with our linens. A shade we don't have may need to be sourced and can be added to your quotation.
          </Typography>
        )}
      </Box>

      <Box>
        <FormField
          id={`${idPrefix}-notes`}
          label="Design details"
          optional
          multiline
          minRows={3}
          value={value.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          error={errors['styling.notes']}
          placeholder="Ivory chair covers with sage ribbons, gold table runners, a name backdrop for the celebrant…"
          hint="The look you have in mind: linens, flowers, backdrop, table setup."
          inputProps={{ maxLength: STYLING_NOTES_MAX }}
        />
        {children}
      </Box>

      {forCustomer && (
        <AlertBanner tone="info">This doesn't change your price. Your package's tablecloths, chair covers and buffet backdrop follow your colors. Decorations like balloons or stage styling are booked under Additional Charges.</AlertBanner>
      )}
    </Box>
  );
}

/**
 * What a booking's theme and colours are, read only. `styling` is the booking's (null when it has none).
 * `forAdmin` shows "Not given" for a booking without any and a "To Discuss" tag when the customer hasn't
 * decided (stylingToDiscuss); the customer's page hides the whole card instead when there is nothing.
 * `compact` is the one-paragraph form the printouts use.
 */
export function StylingSummary({ styling, forAdmin = false, compact = false }) {
  if (stylingEmpty(styling)) {
    return <Typography sx={{ fontSize: 13.5, color: tokens.textSecondary }}>{forAdmin ? 'Not given. The customer booked before this section existed, or left it blank.' : 'Not given.'}</Typography>;
  }
  const theme = themeLabel(styling);
  const colors = styling.colors || [];
  const toDiscuss = forAdmin && stylingToDiscuss(styling);

  if (compact) {
    return (
      <Box>
        <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>Theme: {theme || 'Not given'}</Typography>
        {colors.length > 0 && (
          <Box sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 1.25 }}>
            {colors.map((color) => (
              <Box key={`${color.name}-${color.hex}`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <ColorSwatch color={color} size={12} />
                <Typography component="span" sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                  {color.name}
                  {color.metallic ? '' : ` ${color.hex}`}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
        {styling.notes && <Typography sx={{ mt: 0.5, fontSize: 12.5, color: tokens.textSecondary, whiteSpace: 'pre-line' }}>Design: {styling.notes}</Typography>}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: tokens.textMuted }}>Theme</Typography>
          <Typography sx={{ mt: 0.25, fontSize: 13.5, fontWeight: 600, color: tokens.textPrimary, overflowWrap: 'anywhere' }}>{theme || 'Not given'}</Typography>
        </Box>
        {toDiscuss && <Pill label="To Discuss" size="sm" bg="rgba(245, 158, 11, 0.12)" fg="#b45309" sx={{ ml: 'auto' }} />}
      </Box>
      <Box>
        <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: tokens.textMuted }}>Color Motif</Typography>
        {colors.length ? (
          <Box sx={{ mt: 0.75, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {colors.map((color, index) => (
              <Box key={`${color.name}-${color.hex}`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, pl: 0.75, pr: 1.25, py: 0.5, borderRadius: 999, border: `1px solid ${tokens.cardLightBorder}` }}>
                <ColorSwatch color={color} size={18} sx={{ borderRadius: '50%' }} />
                <Box>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: tokens.textPrimary, lineHeight: 1.3 }}>
                    {color.name}
                    {index === 0 && colors.length > 1 ? ' · Main' : ''}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: tokens.textMuted, lineHeight: 1.3, fontFamily: color.metallic ? undefined : 'ui-monospace, SFMono-Regular, Consolas, monospace' }}>{color.metallic ? 'Metallic' : color.hex}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        ) : (
          <Typography sx={{ mt: 0.25, fontSize: 13.5, fontWeight: 600, color: tokens.textPrimary }}>Not given</Typography>
        )}
      </Box>
      {styling.notes && (
        <Box>
          <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: tokens.textMuted }}>Design Details</Typography>
          <Typography sx={{ mt: 0.25, fontSize: 13.5, color: tokens.textPrimary, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{styling.notes}</Typography>
        </Box>
      )}
    </Box>
  );
}
