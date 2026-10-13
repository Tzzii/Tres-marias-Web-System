import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { RAINBOW_COLORS, themeColorSchemes } from '../domain/themeColors.js';
import {
  MAX_MOTIF_COLORS,
  METALLICS,
  STYLING_NOTES_MAX,
  THEME_OTHER,
  THEME_OTHER_RANGE,
  THEME_UNDECIDED,
  hasColor,
  stylingEmpty,
  stylingToDiscuss,
  themeLabel,
  themesFor
} from '../domain/styling.js';
import { tokens } from '../theme/tokens.js';
import { AlertBanner } from './Feedback.jsx';
import { FormField } from './FormField.jsx';
import { Pill } from './Pill.jsx';
import { ReferencePhotoPicker, ReferencePhotoPreview } from './ReferencePhoto.jsx';

// Browsers normally omit background colors when printing.
const keepOnPrint = { printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' };

const swatchFill = (color) => {
  const metal = color.metallic && METALLICS.find((m) => m.name === color.name);
  return metal ? `linear-gradient(135deg, ${metal.hex}, ${metal.sheen} 50%, ${metal.hex})` : color.hex;
};

export function ColorSwatch({ color, size = 20, sx }) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        display: 'inline-block',
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: 1,
        border: `1px solid ${tokens.borderInput}`,
        background: swatchFill(color),
        ...keepOnPrint,
        ...sx
      }}
    />
  );
}

export function ColorMotifPicker({ id, colors, onChange, error }) {
  const [family, setFamily] = useState('');
  const [problem, setProblem] = useState('');
  const add = (color) => {
    if (colors.length >= MAX_MOTIF_COLORS)
      return setProblem(`You can pick up to ${MAX_MOTIF_COLORS} colors. Remove one first.`);
    if (hasColor(colors, color)) return setProblem('That color is already in your motif.');
    setProblem('');
    onChange([...colors, color]);
  };
  const renderSwatchButton = (color) => (
    <Button
      key={color.hex}
      size="small"
      variant="outlined"
      onClick={() => add(color)}
      startIcon={<ColorSwatch color={color} size={18} />}
      sx={{ textTransform: 'none' }}
    >
      {color.name}
    </Button>
  );
  const selectedFamily = RAINBOW_COLORS.find((colorFamily) => colorFamily.name === family);
  return (
    <Box id={id}>
      <Typography sx={{ mb: 1, fontSize: 13, color: tokens.textSecondary }}>
        Pick a ROYGBIV color to see its shades, then add the shade you want.
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {RAINBOW_COLORS.map((colorFamily) => (
          <Button
            key={colorFamily.name}
            variant={family === colorFamily.name ? 'contained' : 'outlined'}
            aria-pressed={family === colorFamily.name}
            aria-controls={`${id}-shades`}
            onClick={() => {
              setFamily(colorFamily.name);
              setProblem('');
            }}
            startIcon={<ColorSwatch color={colorFamily} size={18} />}
          >
            {colorFamily.name}
          </Button>
        ))}
      </Box>
      {selectedFamily && (
        <Box id={`${id}-shades`} sx={{ mt: 2 }}>
          <Typography sx={{ mb: 1, fontWeight: 700 }}>{selectedFamily.name} shades</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>{selectedFamily.shades.map(renderSwatchButton)}</Box>
        </Box>
      )}
      <Typography sx={{ mt: 2, mb: 1, fontWeight: 700 }}>Metallics</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {METALLICS.map((metallic) => renderSwatchButton({ hex: metallic.hex, name: metallic.name, metallic: true }))}
      </Box>
      {(problem || error) && (
        <Typography role="alert" sx={{ mt: 1, color: tokens.redPress }}>
          {problem || error}
        </Typography>
      )}
      <Typography sx={{ mt: 2, mb: 1, fontWeight: 700 }}>
        {colors.length} of {MAX_MOTIF_COLORS} colors · first is your main color
      </Typography>
      <Box
        component="ul"
        aria-label="Your color motif"
        sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 1 }}
      >
        {colors.map((color, index) => (
          <Box
            component="li"
            key={color.hex + color.name}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              border: `1px solid ${tokens.cardLightBorder}`,
              borderRadius: 1,
              pl: 1
            }}
          >
            <ColorSwatch color={color} />
            <Typography sx={{ fontSize: 13 }}>
              {color.name}
              {index === 0 ? ' (Main)' : ''}
            </Typography>
            <IconButton
              aria-label={`Remove ${color.name}`}
              onClick={() => {
                setProblem('');
                onChange(colors.filter((_, colorIndex) => colorIndex !== index));
              }}
            >
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function ThemeChip({ label, picked, dashed, onClick }) {
  return (
    <ButtonBase
      onClick={onClick}
      aria-pressed={picked}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1.5,
        py: 0.75,
        borderRadius: 999,
        fontFamily: 'inherit',
        fontSize: 13,
        fontWeight: picked ? 700 : 500,
        color: picked ? tokens.textPrimary : dashed ? tokens.textSecondary : tokens.textPrimary,
        border: picked ? `2px solid ${tokens.ink}` : `1px ${dashed ? 'dashed' : 'solid'} ${tokens.borderInput}`,
        m: picked ? 0 : '1px',
        backgroundColor: picked ? tokens.surfaceSubtle : tokens.cardLight,
        transition: 'border-color 0.15s ease',
        '&:hover': { borderColor: picked ? tokens.ink : tokens.placeholder },
        '@media (pointer: coarse)': { py: 1 }
      }}
    >
      {picked && <CheckRoundedIcon sx={{ fontSize: 16 }} />}
      {label}
    </ButtonBase>
  );
}

const Heading = ({ children, hint, sx }) => (
  <Typography component="h3" sx={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary, ...sx }}>
    {children}
    {hint && (
      <Box component="span" sx={{ ml: 0.75, fontSize: 12.5, fontWeight: 500, color: tokens.textSecondary }}>
        {hint}
      </Box>
    )}
  </Typography>
);

export function StylingFields({
  idPrefix,
  value,
  onChange,
  occasion,
  errors = {},
  forCustomer = false,
  referencePhoto,
  onReferencePhotoChange,
  onPhotoBusyChange,
  children
}) {
  const { popular, others } = themesFor(occasion);
  const otherBox = useRef(null);
  const justPickedOther = useRef(false);
  const recommendedSchemes = themeColorSchemes(value.theme);

  useEffect(() => {
    if (value.theme === THEME_OTHER && justPickedOther.current && otherBox.current) otherBox.current.focus();
    justPickedOther.current = false;
  }, [value.theme]);

  const pickTheme = (name) => {
    const theme = value.theme === name ? '' : name;
    justPickedOther.current = theme === THEME_OTHER;
    onChange({ theme, themeOther: theme === THEME_OTHER ? value.themeOther : '' });
  };
  const chips = (names) =>
    names.map((name) => (
      <ThemeChip key={name} label={name} picked={value.theme === name} onClick={() => pickTheme(name)} />
    ));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box>
        <Heading sx={{ mb: 1 }}>Theme</Heading>
        {popular.length > 0 && (
          <>
            <Typography sx={{ mb: 0.75, fontSize: 12, fontWeight: 600, color: tokens.textMuted }}>
              Popular for {occasion}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>{chips(popular)}</Box>
            <Typography sx={{ mb: 0.75, fontSize: 12, fontWeight: 600, color: tokens.textMuted }}>
              More Themes
            </Typography>
          </>
        )}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {chips(others)}
          <ThemeChip
            label={THEME_OTHER}
            dashed
            picked={value.theme === THEME_OTHER}
            onClick={() => pickTheme(THEME_OTHER)}
          />
          <ThemeChip
            label={THEME_UNDECIDED}
            dashed
            picked={value.theme === THEME_UNDECIDED}
            onClick={() => pickTheme(THEME_UNDECIDED)}
          />
        </Box>
        {recommendedSchemes.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography sx={{ mb: 1, fontWeight: 700, fontSize: 14 }}>
              Recommended color schemes for {value.theme}
            </Typography>
            <Typography sx={{ mb: 1, fontSize: 12.5, color: tokens.textSecondary }}>
              Choose a scheme to apply it to your motif. You can adjust its colors below.
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {recommendedSchemes.map((scheme) => (
                <Button
                  key={scheme.label}
                  variant="outlined"
                  onClick={() => onChange({ colors: scheme.colors })}
                  sx={{ justifyContent: 'flex-start', gap: 1, flexWrap: 'wrap', textTransform: 'none' }}
                >
                  {scheme.colors.map((c) => (
                    <ColorSwatch key={c.hex} color={c} />
                  ))}
                  {scheme.label}
                </Button>
              ))}
            </Box>
          </Box>
        )}
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
          <Typography sx={{ mt: 1, fontSize: 12.5, color: tokens.textSecondary }}>
            That's fine. We'll talk about the look in your messages once we send your quotation.
          </Typography>
        )}
      </Box>

      <Box>
        <Heading hint={`Optional. Up to ${MAX_MOTIF_COLORS} colors, your main color first.`} sx={{ mb: 1 }}>
          Color Motif
        </Heading>
        <ColorMotifPicker
          id={`${idPrefix}-color`}
          colors={value.colors}
          onChange={(colors) => onChange({ colors })}
          error={errors['styling.colors']}
        />
        {forCustomer && (
          <Typography sx={{ mt: 1.25, fontSize: 12, lineHeight: 1.55, color: tokens.textMuted }}>
            We match your colors as closely as we can with our linens. A shade we don't have may need to be sourced and
            can be added to your quotation.
          </Typography>
        )}
      </Box>

      {forCustomer && onReferencePhotoChange && (
        <ReferencePhotoPicker
          id={`${idPrefix}-referencePhoto`}
          value={referencePhoto}
          onChange={onReferencePhotoChange}
          onBusyChange={onPhotoBusyChange}
          error={errors['styling.referencePhoto']}
        />
      )}

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
        <AlertBanner tone="info">
          This doesn't change your price. Your package's tablecloths, chair covers and buffet backdrop follow your
          colors. Decorations like balloons or stage styling are booked under Additional Charges.
        </AlertBanner>
      )}
    </Box>
  );
}

export function StylingSummary({
  styling,
  forAdmin = false,
  compact = false,
  referencePhoto = styling?.referencePhoto,
  reservationRef
}) {
  if (stylingEmpty(styling) && !referencePhoto) {
    return (
      <Typography sx={{ fontSize: 13.5, color: tokens.textSecondary }}>
        {forAdmin ? 'Not given. The customer booked before this section existed, or left it blank.' : 'Not given.'}
      </Typography>
    );
  }
  const theme = themeLabel(styling);
  const colors = styling?.colors || [];
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
        {styling?.notes && (
          <Typography sx={{ mt: 0.5, fontSize: 12.5, color: tokens.textSecondary, whiteSpace: 'pre-line' }}>
            Design: {styling.notes}
          </Typography>
        )}
        <ReferencePhotoPreview photo={referencePhoto} compact />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: tokens.textMuted }}>Theme</Typography>
          <Typography
            sx={{ mt: 0.25, fontSize: 13.5, fontWeight: 600, color: tokens.textPrimary, overflowWrap: 'anywhere' }}
          >
            {theme || 'Not given'}
          </Typography>
        </Box>
        {toDiscuss && (
          <Pill label="To Discuss" size="sm" bg="rgba(245, 158, 11, 0.12)" fg="#b45309" sx={{ ml: 'auto' }} />
        )}
      </Box>
      <Box>
        <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: tokens.textMuted }}>Color Motif</Typography>
        {colors.length ? (
          <Box sx={{ mt: 0.75, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {colors.map((color, index) => (
              <Box
                key={`${color.name}-${color.hex}`}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.75,
                  pl: 0.75,
                  pr: 1.25,
                  py: 0.5,
                  borderRadius: 999,
                  border: `1px solid ${tokens.cardLightBorder}`
                }}
              >
                <ColorSwatch color={color} size={18} sx={{ borderRadius: '50%' }} />
                <Box>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: tokens.textPrimary, lineHeight: 1.3 }}>
                    {color.name}
                    {index === 0 && colors.length > 1 ? ' · Main' : ''}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 11,
                      color: tokens.textMuted,
                      lineHeight: 1.3,
                      fontFamily: color.metallic ? undefined : 'ui-monospace, SFMono-Regular, Consolas, monospace'
                    }}
                  >
                    {color.metallic ? 'Metallic' : color.hex}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        ) : (
          <Typography sx={{ mt: 0.25, fontSize: 13.5, fontWeight: 600, color: tokens.textPrimary }}>
            Not given
          </Typography>
        )}
      </Box>
      <ReferencePhotoPreview photo={referencePhoto} reservationRef={reservationRef} forAdmin={forAdmin} />
      {styling?.notes && (
        <Box>
          <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: tokens.textMuted }}>Design Details</Typography>
          <Typography
            sx={{
              mt: 0.25,
              fontSize: 13.5,
              color: tokens.textPrimary,
              whiteSpace: 'pre-line',
              overflowWrap: 'anywhere'
            }}
          >
            {styling.notes}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
