import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import {
  AppDialog,
  BusyButton,
  EquipmentPhoto,
  FormField,
  INVENTORY_CATEGORIES,
  PHOTO_ACCEPT,
  SelectField,
  inventoryApi,
  photoProblem,
  tokens
} from '@tm/shared';

export default function EditItemDialog({ item, onClose, onSaved }) {
  const [photo, setPhoto] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [values, setValues] = useState({
    name: '',
    category: '',
    total: '',
    lowStockAt: '',
    rentable: false,
    rentPrice: '',
    damageFee: '',
    notes: ''
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const id = item && item.id;

  useEffect(() => {
    if (item) {
      setPhoto(null);
      setRemovePhoto(false);
      setValues({
        name: item.name,
        category: item.category,
        total: String(item.total),
        lowStockAt: String(item.lowStockAt),
        rentable: Boolean(item.rentable),
        rentPrice: item.rentPrice ? String(item.rentPrice) : '',
        damageFee: item.damageFee ? String(item.damageFee) : '',
        notes: item.notes
      });
      setErrors({});
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
    setErrors({});
  };

  const save = async () => {
    setBusy(true);
    try {
      await inventoryApi.updateInventoryItem(
        id,
        {
          ...values,
          removePhoto,
          total: Number(values.total),
          lowStockAt: Number(values.lowStockAt),
          rentPrice: Number(values.rentPrice),
          damageFee: Number(values.damageFee) || 0
        },
        { photo }
      );
      onSaved();
    } catch (e) {
      setErrors({ [(e.meta && e.meta.field) || 'name']: e.message });
    } finally {
      setBusy(false);
    }
  };

  const minimum = item ? item.inUse + item.damaged : 0;
  return (
    <AppDialog
      open={Boolean(item)}
      onClose={onClose}
      busy={busy}
      maxWidth="sm"
      title={item ? `Edit ${item.code}` : ''}
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <BusyButton busy={busy} onClick={save}>
            Save changes
          </BusyButton>
        </>
      }
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        <Box sx={{ gridColumn: { sm: '1 / -1' } }}>
          <EquipmentPhoto item={item} file={photo} removePhoto={removePhoto} admin />
          <Typography sx={{ mt: 1, fontSize: 12.5, color: tokens.textSecondary }}>
            Show one item or one complete rental unit. This same photo appears in Equipment Rental after you save.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
            <Button component="label" variant="outlined" disabled={busy}>
              Change photo
              <input
                hidden
                type="file"
                accept={PHOTO_ACCEPT}
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  const problem = photoProblem(file);
                  if (problem) {
                    setErrors((v) => ({ ...v, photo: problem }));
                    return;
                  }
                  setPhoto(file);
                  setRemovePhoto(false);
                  setErrors({});
                }}
              />
            </Button>
            {photo && (
              <Button
                disabled={busy}
                onClick={() => {
                  setPhoto(null);
                  setErrors({});
                }}
              >
                Cancel new photo
              </Button>
            )}
            {item?.photoVersion && !removePhoto && (
              <Button
                disabled={busy}
                onClick={() => {
                  setPhoto(null);
                  setRemovePhoto(true);
                  setErrors({});
                }}
              >
                Use default photo
              </Button>
            )}
            {removePhoto && (
              <Button disabled={busy} onClick={() => setRemovePhoto(false)}>
                Keep current photo
              </Button>
            )}
          </Box>
          {errors.photo && (
            <Typography role="alert" sx={{ mt: 0.75, fontSize: 12, color: tokens.redPress }}>
              {errors.photo}
            </Typography>
          )}
          <Typography sx={{ mt: 0.75, fontSize: 11.5, color: tokens.textMuted }}>
            JPG, PNG or WebP · Up to 20 MB
          </Typography>
        </Box>
        <FormField
          id="edit-name"
          label="Item name"
          required
          value={values.name}
          onChange={set('name')}
          error={errors.name}
          inputProps={{ maxLength: 80 }}
          sx={{ gridColumn: { sm: '1 / -1' } }}
        />
        <SelectField
          id="edit-category"
          label="Category"
          required
          value={values.category}
          onChange={set('category')}
          options={INVENTORY_CATEGORIES}
          error={errors.category}
          sx={{ gridColumn: { sm: '1 / -1' } }}
        />
        <FormField
          id="edit-total"
          label="Total owned"
          required
          type="number"
          value={values.total}
          onChange={set('total')}
          error={errors.total}
          hint={minimum ? `At least ${minimum} (in use + damaged)` : undefined}
          inputProps={{ min: Math.max(1, minimum) }}
        />
        <FormField
          id="edit-low"
          label="Low-stock alert at"
          required
          type="number"
          value={values.lowStockAt}
          onChange={set('lowStockAt')}
          error={errors.lowStockAt}
          hint="Flagged when available is at or below this"
          inputProps={{ min: 0 }}
        />
        <FormControlLabel
          sx={{ gridColumn: { sm: '1 / -1' } }}
          control={<Switch checked={values.rentable} onChange={set('rentable')} />}
          label={<Typography sx={{ fontSize: 13.5 }}>Customers can rent this item</Typography>}
        />
        {values.rentable && (
          <>
            <FormField
              id="edit-rent"
              label="Rent price per piece"
              required
              type="number"
              value={values.rentPrice}
              onChange={set('rentPrice')}
              error={errors.rentPrice}
              hint="Applies to rentals booked from now on"
              InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
              inputProps={{ min: 1 }}
            />
            <FormField
              id="edit-fee"
              label="Damage fee per piece"
              type="number"
              value={values.damageFee}
              onChange={set('damageFee')}
              error={errors.damageFee}
              hint="Charged for each piece that comes back damaged or missing"
              InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
              inputProps={{ min: 0 }}
            />
          </>
        )}
        <FormField
          id="edit-notes"
          label="Notes"
          optional
          multiline
          minRows={2}
          value={values.notes}
          onChange={set('notes')}
          inputProps={{ maxLength: 300 }}
          placeholder="Supplier, storage place, care instructions…"
          sx={{ gridColumn: { sm: '1 / -1' } }}
        />
      </Box>
    </AppDialog>
  );
}
