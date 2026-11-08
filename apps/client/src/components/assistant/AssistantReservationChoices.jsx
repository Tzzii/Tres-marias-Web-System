import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { PackagePhoto } from '@tm/shared';
import { ColorMotifPicker, ColorSwatch } from '@tm/shared/components/Styling.jsx';
import { themesFor, THEME_OTHER, THEME_UNDECIDED } from '@tm/shared/domain/styling.js';
import { themeColorSchemes } from '@tm/shared/domain/themeColors.js';
import { DISH_CATEGORIES, RENTAL } from '@tm/shared/services/config.js';
import { bookableAddons } from '@tm/shared/domain/catalog.js';
import { menuCount } from '@tm/shared/domain/menu.js';

export const reservationPeso = (n) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(n || 0);

export function ReservationPackages({ catalog, value, onChange, disabled }) {
  const packages = (catalog.packages || []).filter((p) => p.kind !== 'rental' && p.visible !== false && !p.archived);
  return (
    <Stack spacing={2}>
      {!packages.length && <Typography>No packages are currently published. Please contact the team.</Typography>}
      {packages.map((pkg) => (
        <Box key={pkg.id} className={`tm-assistant-package-choice${value === pkg.slug ? ' is-selected' : ''}`}>
          <PackagePhoto pkg={pkg} height={140} thumbnail />
          <Box sx={{ p: 1.5 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{pkg.name}</Typography>
            <Typography sx={{ fontSize: 12, my: 0.75, whiteSpace: 'pre-line' }}>{pkg.description}</Typography>
            {pkg.items?.length > 0 && (
              <Box component="ul" sx={{ m: 0, pl: 2, mb: 1, fontSize: 12 }}>
                {pkg.items.map((item, i) => (
                  <li key={item.id || i}>
                    {item.name}
                    {item.qty ? ` × ${item.qty}` : ''}
                  </li>
                ))}
              </Box>
            )}
            <Typography sx={{ fontSize: 11, color: 'text.secondary', mb: 1 }}>
              A current estimate is shown when you review your selections.
            </Typography>
            <Button
              type="button"
              size="small"
              variant={value === pkg.slug ? 'contained' : 'outlined'}
              disabled={disabled}
              aria-pressed={value === pkg.slug}
              onClick={() => onChange(pkg.slug)}
            >
              Choose {pkg.name}
            </Button>
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

export function ReservationThemes({ value, occasion, onChange }) {
  const { popular, others } = themesFor(occasion);
  const buttons = (themes) =>
    themes.map((theme) => (
      <Button
        key={theme}
        type="button"
        variant={value.theme === theme ? 'contained' : 'outlined'}
        aria-pressed={value.theme === theme}
        onClick={() => onChange({ ...value, theme, themeOther: theme === THEME_OTHER ? value.themeOther || '' : '' })}
        sx={{ textTransform: 'none', fontSize: 12 }}
      >
        {theme}
      </Button>
    ));
  return (
    <Stack spacing={1.5} role="group" aria-label="Event themes">
      {popular.length > 0 && (
        <>
          <Typography sx={{ fontSize: 12, fontWeight: 600 }}>Recommended themes for {occasion}</Typography>
          <Box className="tm-assistant-choice-grid" role="group" aria-label={`Recommended themes for ${occasion}`}>
            {buttons(popular)}
          </Box>
          <Typography sx={{ fontSize: 12 }}>More themes — you can still choose a different style.</Typography>
        </>
      )}
      <Box className="tm-assistant-choice-grid" role="group" aria-label="More themes">
        {buttons(others)}
      </Box>
      <Box className="tm-assistant-choice-grid" role="group" aria-label="Other theme options">
        {buttons([THEME_OTHER, THEME_UNDECIDED])}
      </Box>
      {value.theme === THEME_OTHER && (
        <TextField
          label="Your theme"
          value={value.themeOther || ''}
          onChange={(e) => onChange({ ...value, themeOther: e.target.value })}
          inputProps={{ maxLength: 60 }}
          fullWidth
          size="small"
        />
      )}
    </Stack>
  );
}

export function ReservationColors({ value, occasion, onChange }) {
  const themeSchemes = themeColorSchemes(value.theme);
  const occasionSchemes = themesFor(occasion).popular.flatMap((theme) =>
    themeColorSchemes(theme)
      .slice(0, 1)
      .map((scheme) => ({ ...scheme, theme }))
  );
  const schemes = themeSchemes.length ? themeSchemes : occasionSchemes;
  const source = themeSchemes.length ? value.theme : occasion;
  return (
    <Stack spacing={1.5}>
      {schemes.length > 0 && (
        <>
          <Typography sx={{ fontSize: 12, fontWeight: 600 }}>Recommended color schemes for {source}</Typography>
          {schemes.map((scheme) => (
            <Button
              key={`${scheme.theme || value.theme}:${scheme.label}`}
              type="button"
              variant="outlined"
              onClick={() =>
                onChange({
                  ...value,
                  ...(scheme.theme ? { theme: scheme.theme, themeOther: '' } : {}),
                  colors: scheme.colors
                })
              }
              sx={{ justifyContent: 'flex-start', gap: 1, flexWrap: 'wrap', textTransform: 'none', fontSize: 12 }}
            >
              {scheme.colors.map((color) => (
                <ColorSwatch key={color.hex} color={color} size={22} />
              ))}
              {scheme.theme ? `${scheme.theme} — ${scheme.label}` : scheme.label}
            </Button>
          ))}
        </>
      )}
      {schemes.length > 0 && (
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
          {themeSchemes.length
            ? 'These palettes match your selected theme. Choose one to replace your current colors, or customize below.'
            : `These palettes come from themes recommended for ${occasion}. Choosing one applies its theme and colors.`}
        </Typography>
      )}
      <ColorMotifPicker
        id="assistant-color-motif"
        colors={value.colors || []}
        onChange={(colors) => onChange({ ...value, colors })}
      />
      <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
        Choose 2–5 colors, or leave the motif undecided. Exact shades and special designs are subject to the team's
        review.
      </Typography>
    </Stack>
  );
}

export function ReservationMenu({ value, catalog, onChange, buffet, dessert }) {
  return (
    <Stack spacing={2}>
      {buffet && (
        <>
          <Chip size="small" label={`${menuCount(value)} / 4 dishes chosen`} sx={{ alignSelf: 'flex-start' }} />
          {DISH_CATEGORIES.map(({ key, label }) => (
            <Autocomplete
              key={key}
              multiple
              freeSolo
              options={(catalog.dishes || [])
                .filter((d) => !d.archived && (d.category === key || d.category === label))
                .map((d) => d.name)}
              value={value[key] || []}
              onChange={(_, choices) => onChange({ ...value, [key]: choices })}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={label}
                  helperText="Choose up to two; custom dishes need admin review."
                  size="small"
                />
              )}
            />
          ))}
          <TextField
            label="Juice preference"
            value={value.juice || ''}
            onChange={(e) => onChange({ ...value, juice: e.target.value })}
            inputProps={{ maxLength: 120 }}
            size="small"
          />
        </>
      )}
      {dessert && (
        <TextField
          label="Dessert request"
          value={value.dessert?.name || ''}
          onChange={(e) =>
            onChange({
              ...value,
              dessert: { ...value.dessert, name: e.target.value, description: value.dessert?.description || '' }
            })
          }
          inputProps={{ maxLength: 120 }}
          size="small"
        />
      )}
    </Stack>
  );
}

export function ReservationAddons({ value, catalog, onChange }) {
  const addons = bookableAddons(catalog.addons || []).filter((a) => !a.archived);
  const selected = value.addonIds || [];
  const choose = (addon, checked) => {
    const ids = checked
      ? [
          ...selected.filter(
            (id) => !addon.isPackage || !addons.some((a) => a.id === id && a.isPackage && a.parentId === addon.parentId)
          ),
          addon.id
        ]
      : selected.filter((id) => id !== addon.id);
    const qty = Object.fromEntries(ids.map((id) => [id, value.addonQty?.[id] || 1]));
    onChange({ addonIds: [...new Set(ids)], addonQty: qty });
  };
  return (
    <Stack spacing={1.5}>
      <Button
        type="button"
        size="small"
        variant="outlined"
        aria-pressed={!selected.length}
        onClick={() => onChange({ addonIds: [], addonQty: {} })}
      >
        No additional services
      </Button>
      {addons.map((addon) => (
        <Box key={addon.id} className="tm-assistant-item-choice">
          <FormControlLabel
            control={
              <Checkbox checked={selected.includes(addon.id)} onChange={(e) => choose(addon, e.target.checked)} />
            }
            label={
              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{addon.name}</Typography>
                <Typography sx={{ fontSize: 12 }}>
                  {addon.price == null
                    ? 'To be quoted'
                    : `${reservationPeso(addon.price)}${addon.hasQuantity ? ' each' : ''}`}
                </Typography>
              </Box>
            }
          />
          {addon.description && <Typography sx={{ fontSize: 11, ml: 4 }}>{addon.description}</Typography>}
          {selected.includes(addon.id) && addon.hasQuantity && (
            <TextField
              label={`Quantity for ${addon.name}`}
              type="number"
              value={value.addonQty?.[addon.id] ?? ''}
              onChange={(e) =>
                onChange({ addonIds: selected, addonQty: { ...value.addonQty, [addon.id]: Number(e.target.value) } })
              }
              inputProps={{ min: 1, max: 99, step: 1 }}
              size="small"
              fullWidth
              sx={{ mt: 1 }}
            />
          )}
        </Box>
      ))}
    </Stack>
  );
}

export function ReservationRentals({ value, catalog, onChange }) {
  return (
    <Stack spacing={1.5}>
      {(catalog.rentals || [])
        .filter((r) => !r.archived)
        .map((item) => (
          <Box key={item.id} className="tm-assistant-item-choice">
            <FormControlLabel
              control={
                <Checkbox
                  checked={Boolean(value[item.id])}
                  onChange={(e) => {
                    const next = { ...value };
                    if (e.target.checked) next[item.id] = 1;
                    else delete next[item.id];
                    onChange(next);
                  }}
                />
              }
              label={
                <Typography sx={{ fontSize: 13 }}>
                  {item.name} · {item.price == null ? 'To be quoted' : `${reservationPeso(item.price)} each`}
                </Typography>
              }
            />
            {Object.hasOwn(value, item.id) && (
              <TextField
                label={`Quantity for ${item.name}`}
                type="number"
                value={value[item.id]}
                onChange={(e) => onChange({ ...value, [item.id]: Number(e.target.value) })}
                inputProps={{ min: 1, max: RENTAL.maxQty, step: 1 }}
                size="small"
                fullWidth
              />
            )}
          </Box>
        ))}
      <Typography sx={{ fontSize: 11 }}>Equipment stock is checked again when you send the request.</Typography>
    </Stack>
  );
}
