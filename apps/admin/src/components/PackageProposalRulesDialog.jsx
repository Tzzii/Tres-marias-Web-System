import { useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  FormControlLabel,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import {
  AppDialog,
  BusyButton,
  RULES,
  SERVICE_TYPES,
  budgetBookableAddons,
  catalogApi,
  isRentalPackage,
  packageProposalApi
} from '@tm/shared';
import { defaultPackageProposalRules, validatePackageProposalRules } from '@tm/shared/domain/packageProposal.js';
import { optionalSetupItem } from '@tm/shared/domain/packageSetup.js';

const blankRecipe = () => ({
  id: '',
  name: '',
  description: '',
  serviceTypes: [],
  minGuests: RULES.minGuests,
  maxGuests: RULES.maxGuests,
  components: [],
  optionalAddonIds: []
});
const number = (value) => (value === '' ? '' : Number(value));

export default function PackageProposalRulesDialog({ onClose, onSaved }) {
  const [rules, setRules] = useState(defaultPackageProposalRules),
    [catalog, setCatalog] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([packageProposalApi.getRules(), catalogApi.getCatalog()])
      .then(([result, current]) => {
        if (active) {
          setRules(result.rules || defaultPackageProposalRules());
          setCatalog(current);
        }
      })
      .catch((failure) => {
        if (active) setError(failure.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const sources =
    catalog?.packages?.filter((pkg) => pkg.visible !== false && !pkg.archived && !isRentalPackage(pkg)) || [];
  const addons = catalog ? budgetBookableAddons(catalog) : [];
  const change = (index, patch) => {
    setRules((old) => ({
      ...old,
      recipes: old.recipes.map((recipe, i) => (i === index ? { ...recipe, ...patch } : recipe))
    }));
    setError('');
  };
  const component = (recipeIndex, itemIndex, patch) =>
    change(recipeIndex, {
      components: rules.recipes[recipeIndex].components.map((item, i) =>
        i === itemIndex ? { ...item, ...patch } : item
      )
    });
  const reorder = (index, offset) =>
    setRules((old) => {
      const recipes = [...old.recipes];
      [recipes[index], recipes[index + offset]] = [recipes[index + offset], recipes[index]];
      return { ...old, recipes };
    });
  async function save() {
    const checked = validatePackageProposalRules(rules, catalog);
    if (checked.problem) {
      setError(checked.problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await packageProposalApi.saveRules(checked.rules);
      onSaved();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppDialog
      open
      onClose={onClose}
      busy={busy}
      maxWidth="md"
      title="Custom package recipes"
      description="Approve setup references for custom packages. For buffet pricing, the first applicable reference defines the standard setup included in the per-guest rate; its equipment adjustment rates take priority. New references stay unavailable until you enable these rules."
      actions={
        <>
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <BusyButton busy={busy} disabled={loading || !catalog} onClick={save}>
            Save recipes
          </BusyButton>
        </>
      }
    >
      {loading && <CircularProgress aria-label="Loading approved recipes" />}
      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
          {!catalog && <Button onClick={() => setAttempt((n) => n + 1)}>Retry</Button>}
        </Alert>
      )}
      {catalog && (
        <Box component="fieldset" disabled={busy || loading} sx={{ p: 0, m: 0, border: 0, minWidth: 0 }}>
          <Stack spacing={3}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={rules.enabled}
                  onChange={(e) => setRules((old) => ({ ...old, enabled: e.target.checked }))}
                />
              }
              label="Enable approved recipes in the customer package builder"
            />
            {!rules.enabled && (
              <Alert severity="info">
                Generation is disabled. Customers keep their answers and can browse existing packages. Saving recipes
                alone does not enable generation.
              </Alert>
            )}
            {!rules.recipes.length && (
              <Typography variant="body2">No recipes yet. Add each complete operational setup explicitly.</Typography>
            )}
            {rules.recipes.map((recipe, index) => (
              <Box key={index} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: { xs: 1.5, sm: 2 } }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ flex: 1 }}>
                    Recipe {index + 1}
                  </Typography>
                  <Button size="small" disabled={!index} onClick={() => reorder(index, -1)}>
                    Move up
                  </Button>
                  <Button size="small" disabled={index === rules.recipes.length - 1} onClick={() => reorder(index, 1)}>
                    Move down
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    onClick={() => setRules((old) => ({ ...old, recipes: old.recipes.filter((_, i) => i !== index) }))}
                  >
                    Remove recipe
                  </Button>
                </Stack>
                <Stack spacing={2}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField
                      label="Recipe ID"
                      value={recipe.id}
                      onChange={(e) => change(index, { id: e.target.value })}
                      helperText="Unique lowercase ID, e.g. garden-dining. Keep stable after use."
                      inputProps={{ maxLength: 32 }}
                      fullWidth
                    />
                    <TextField
                      label="Setup reference name"
                      value={recipe.name}
                      onChange={(e) => change(index, { name: e.target.value })}
                      inputProps={{ maxLength: 100 }}
                      fullWidth
                    />
                  </Stack>
                  <TextField
                    label="Description (optional)"
                    multiline
                    minRows={2}
                    value={recipe.description || ''}
                    onChange={(e) => change(index, { description: e.target.value })}
                    inputProps={{ maxLength: 1000 }}
                  />
                  <Box>
                    <Typography variant="subtitle2">Applicable services</Typography>
                    {SERVICE_TYPES.map((service) => (
                      <FormControlLabel
                        key={service}
                        label={service}
                        control={
                          <Checkbox
                            checked={recipe.serviceTypes.includes(service)}
                            onChange={(e) =>
                              change(index, {
                                serviceTypes: e.target.checked
                                  ? [...recipe.serviceTypes, service]
                                  : recipe.serviceTypes.filter((value) => value !== service)
                              })
                            }
                          />
                        }
                      />
                    ))}
                  </Box>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    {[
                      ['minGuests', 'Minimum guests'],
                      ['maxGuests', 'Maximum guests']
                    ].map(([key, label]) => (
                      <TextField
                        key={key}
                        label={label}
                        type="number"
                        value={recipe[key]}
                        onChange={(e) => change(index, { [key]: number(e.target.value) })}
                        inputProps={{ min: RULES.minGuests, max: RULES.maxGuests, step: 1 }}
                        fullWidth
                      />
                    ))}
                    {recipe.serviceTypes.includes('Catering only') && (
                      <TextField
                        label="Catering-only setup price (₱)"
                        type="number"
                        value={recipe.cateringSetupPrice ?? ''}
                        onChange={(e) => change(index, { cateringSetupPrice: number(e.target.value) })}
                        inputProps={{ min: 0, max: 10000000, step: 1 }}
                        helperText="Approved full setup price. Food is excluded."
                        fullWidth
                      />
                    )}
                  </Stack>
                  <Divider />
                  <Typography variant="subtitle2">Required setup components</Typography>
                  <Typography variant="caption">
                    Every component is mandatory. Choose a source package and its exact item. Per-guest rules round up
                    to a complete quantity. Recipe order controls fallback priority.
                  </Typography>
                  {recipe.components.map((item, itemIndex) => {
                    const source = sources.find((pkg) => pkg.id === item.packageId);
                    const missing = item.packageId && !source;
                    return (
                      <Stack spacing={1.5} key={itemIndex} sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
                        <TextField
                          select
                          label="Source package"
                          value={item.packageId || ''}
                          onChange={(e) =>
                            component(index, itemIndex, { packageId: e.target.value, itemIndex: -1, itemName: '' })
                          }
                          SelectProps={{ native: true }}
                          InputLabelProps={{ shrink: true }}
                          size="small"
                        >
                          <option value="">Choose an active visible package</option>
                          {missing && <option value={item.packageId}>Unavailable source · choose again</option>}
                          {sources.map((pkg) => (
                            <option value={pkg.id} key={pkg.id}>
                              {pkg.name}
                            </option>
                          ))}
                        </TextField>
                        <TextField
                          select
                          label="Exact setup item"
                          value={item.itemIndex ?? -1}
                          onChange={(e) => {
                            const itemIndexValue = Number(e.target.value);
                            component(index, itemIndex, {
                              itemIndex: itemIndexValue,
                              itemName: source?.items[itemIndexValue]?.name || ''
                            });
                          }}
                          SelectProps={{ native: true }}
                          InputLabelProps={{ shrink: true }}
                          size="small"
                        >
                          <option value={-1}>Choose a component</option>
                          {(source?.items || []).map((sourceItem, i) => (
                            <option value={i} key={i}>
                              {i + 1}. {sourceItem.name}
                            </option>
                          ))}
                        </TextField>
                        {source && item.itemIndex >= 0 && source.items[item.itemIndex]?.name !== item.itemName && (
                          <Alert severity="warning">
                            This source item changed. Select the intended item again to approve its current position and
                            name.
                          </Alert>
                        )}
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                          <TextField
                            select
                            label="Quantity rule"
                            value={item.mode}
                            onChange={(e) => {
                              const mode = e.target.value;
                              const next = { ...item, mode };
                              if (mode === 'perGuests') next.perGuests = next.perGuests || 1;
                              else delete next.perGuests;
                              change(index, {
                                components: recipe.components.map((existing, i) => (i === itemIndex ? next : existing))
                              });
                            }}
                            SelectProps={{ native: true }}
                            InputLabelProps={{ shrink: true }}
                            size="small"
                            fullWidth
                          >
                            <option value="fixed">Fixed quantity</option>
                            <option value="perGuests">Quantity per guests</option>
                          </TextField>
                          <TextField
                            label="Quantity"
                            type="number"
                            value={item.qty}
                            onChange={(e) => component(index, itemIndex, { qty: number(e.target.value) })}
                            inputProps={{ min: 1, step: 1 }}
                            size="small"
                            fullWidth
                          />
                          {item.mode === 'perGuests' && (
                            <TextField
                              label="For every N guests"
                              type="number"
                              value={item.perGuests ?? ''}
                              onChange={(e) => component(index, itemIndex, { perGuests: number(e.target.value) })}
                              inputProps={{ min: 1, step: 1 }}
                              size="small"
                              fullWidth
                            />
                          )}
                        </Stack>
                        <Button
                          size="small"
                          color="error"
                          sx={{ alignSelf: 'flex-start' }}
                          onClick={() =>
                            change(index, { components: recipe.components.filter((_, i) => i !== itemIndex) })
                          }
                        >
                          Remove component
                        </Button>
                        <FormControlLabel
                          label="Optional setup equipment (ask the customer)"
                          control={
                            <Checkbox
                              checked={optionalSetupItem(item)}
                              onChange={(e) => component(index, itemIndex, { optional: e.target.checked })}
                            />
                          }
                        />
                        <TextField
                          label="Approved adjustment price per piece (₱)"
                          type="number"
                          value={item.unitPrice ?? ''}
                          helperText="Used only for quantities added or removed from this reference. Leave blank when the team must quote the adjustment."
                          inputProps={{ min: 0, max: 10000000, step: 1 }}
                          size="small"
                          onChange={(e) => {
                            const next = { ...item };
                            if (e.target.value === '') delete next.unitPrice;
                            else next.unitPrice = Number(e.target.value);
                            change(index, {
                              components: recipe.components.map((existing, i) => (i === itemIndex ? next : existing))
                            });
                          }}
                        />
                      </Stack>
                    );
                  })}
                  <Button
                    variant="outlined"
                    disabled={recipe.components.length >= 40}
                    onClick={() =>
                      change(index, {
                        components: [
                          ...recipe.components,
                          { packageId: '', itemIndex: -1, itemName: '', mode: 'fixed', qty: 1 }
                        ]
                      })
                    }
                  >
                    Add required component
                  </Button>
                  <Autocomplete
                    multiple
                    options={addons}
                    getOptionLabel={(addon) => addon.name}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    value={recipe.optionalAddonIds.map(
                      (id) => addons.find((addon) => addon.id === id) || { id, name: `${id} (unavailable)` }
                    )}
                    onChange={(_, selected) => change(index, { optionalAddonIds: selected.map((addon) => addon.id) })}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Compatible optional services"
                        helperText="Only these services may accompany this setup. Adjustment permissions are managed separately under Budget rules."
                      />
                    )}
                  />
                </Stack>
              </Box>
            ))}
            <Button
              variant="outlined"
              disabled={rules.recipes.length >= 24}
              onClick={() => setRules((old) => ({ ...old, recipes: [...old.recipes, blankRecipe()] }))}
            >
              Add approved recipe
            </Button>
          </Stack>
        </Box>
      )}
    </AppDialog>
  );
}
