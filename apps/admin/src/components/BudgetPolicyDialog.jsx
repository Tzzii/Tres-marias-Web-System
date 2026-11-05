import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import {
  AlertBanner,
  AppDialog,
  BusyButton,
  FormField,
  SelectField,
  budgetBookableAddons,
  disabledBudgetPolicy,
  isBudgetFoodAddon,
  readBudgetPolicy,
  catalogApi
} from '@tm/shared';

export default function BudgetPolicyDialog({ charge, catalog, onClose, onSaved }) {
  const offered = budgetBookableAddons(catalog);
  const choices = offered.filter((a) => a.id === charge.id || a.parentId === charge.id);
  const [selectedId, setSelectedId] = useState(choices[0]?.id || '');
  const selected = choices.find((a) => a.id === selectedId);
  const [values, setValues] = useState(selected?.budgetPolicy || disabledBudgetPolicy());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const select = (id) => {
    setSelectedId(id);
    setValues(offered.find((a) => a.id === id)?.budgetPolicy || disabledBudgetPolicy());
    setError('');
  };
  const options = offered.filter((a) => a.id !== selectedId && !isBudgetFoodAddon(a));
  const save = async () => {
    const checked = readBudgetPolicy(values, selected, catalog);
    if (checked.problem) return setError(checked.problem);
    setBusy(true);
    try {
      await catalogApi.saveBudgetPolicy(selectedId, checked.policy);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AppDialog
      open
      onClose={onClose}
      busy={busy}
      maxWidth="sm"
      title="Budget adjustment rules"
      description="Set explicit permissions for optional Additional Charges. Missing permissions keep a service protected."
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <BusyButton busy={busy} onClick={save} disabled={!selected || isBudgetFoodAddon(selected)}>
            Save rules
          </BusyButton>
        </>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {error && <AlertBanner tone="error">{error}</AlertBanner>}
        {choices.length > 1 && (
          <SelectField
            id="budget-policy-service"
            label="Service or option"
            value={selectedId}
            onChange={(e) => select(e.target.value)}
            options={choices.map((a) => ({ value: a.id, label: a.name }))}
          />
        )}
        {isBudgetFoodAddon(selected) ? (
          <AlertBanner tone="info">
            Food is excluded from budget adjustments. Its normal booking controls remain available.
          </AlertBanner>
        ) : (
          <>
            <FormControlLabel
              control={
                <Checkbox
                  checked={values.allowRemove}
                  onChange={(e) => setValues({ ...values, allowRemove: e.target.checked })}
                />
              }
              label="Allow recommending removal of this optional service"
            />
            {selected?.hasQuantity && (
              <FormField
                id="budget-policy-minimum"
                label="Minimum quantity when selected"
                optional
                value={values.minQty ?? ''}
                onChange={(e) =>
                  setValues({ ...values, minQty: e.target.value === '' ? null : Number(e.target.value) })
                }
                type="number"
                inputProps={{ min: 1, max: 99, step: 1 }}
                hint="Blank disables quantity reductions. Enter a business-approved minimum from 1 to 99."
              />
            )}
            {['replacementIds', 'requires'].map((field) => (
              <Autocomplete
                key={field}
                multiple
                options={options}
                getOptionLabel={(a) => a.name}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                value={values[field].map(
                  (id) => offered.find((a) => a.id === id) || { id, name: `${id} (unavailable)` }
                )}
                onChange={(_, items) => setValues({ ...values, [field]: items.map((a) => a.id) })}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={field === 'replacementIds' ? 'Approved replacement options' : 'Requires these services'}
                    helperText={
                      field === 'replacementIds'
                        ? 'Approve only operationally valid alternatives. Price or size names do not establish capacity.'
                        : 'These services must also be selected while this service is selected.'
                    }
                  />
                )}
              />
            ))}
          </>
        )}
      </Box>
    </AppDialog>
  );
}
