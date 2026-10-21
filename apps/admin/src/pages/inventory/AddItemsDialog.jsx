import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import useMediaQuery from '@mui/material/useMediaQuery';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { AppDialog, BusyButton, FormField, INVENTORY_CATEGORIES, SelectField, inventoryApi, tokens } from '@tm/shared';

const blankRow = () => ({ name: '', category: '', total: '', lowStockAt: '', rentPrice: '', damageFee: '' });

export default function AddItemsDialog({ open, onClose, onSaved }) {
  const isPhone = useMediaQuery('(max-width:599px)');
  const [rows, setRows] = useState([blankRow()]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setRows([blankRow()]);
      setError(null);
    }
  }, [open]);

  const set = (index, field) => (e) => {
    setRows((r) => r.map((row, i) => (i === index ? { ...row, [field]: e.target.value } : row)));
    setError(null);
  };
  const errorFor = (index, field) =>
    error && error.row === index && error.field === field ? error.message : undefined;

  const save = async () => {
    const items = rows.map((row) => {
      const total = Number(row.total);
      const rentable = row.rentPrice !== '';
      return {
        name: row.name,
        category: row.category,
        total,
        lowStockAt: row.lowStockAt === '' ? Math.floor(total * 0.1) : Number(row.lowStockAt),
        rentable,
        rentPrice: rentable ? Number(row.rentPrice) : 0,
        damageFee: rentable ? Number(row.damageFee) || 0 : 0
      };
    });
    setBusy(true);
    try {
      onSaved(await inventoryApi.addInventoryItems(items));
    } catch (e) {
      setError({
        row: e.meta && e.meta.row !== undefined ? e.meta.row : 0,
        field: (e.meta && e.meta.field) || 'name',
        message: e.message
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      busy={busy}
      maxWidth="md"
      fullScreenOnMobile
      title="Add Item(s)"
      description="New items start fully available with no damage. Leave the alert level blank to use 10% of the quantity, and the rent price blank for items customers can't rent."
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <BusyButton busy={busy} onClick={save}>
            {rows.length === 1 ? 'Add item' : `Add ${rows.length} items`}
          </BusyButton>
        </>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {rows.map((row, index) => (
          <Box
            key={index}
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', sm: '2fr 1.4fr 0.9fr 0.9fr 0.9fr 0.9fr auto' },
              gap: 1,
              alignItems: 'start',
              pb: { xs: 1.5, sm: 0 },
              borderBottom: { xs: `1px solid ${tokens.cardLightBorder}`, sm: 0 }
            }}
          >
            <FormField
              id={`add-name-${index}`}
              label={isPhone || index === 0 ? 'Item name' : undefined}
              required={isPhone || index === 0}
              value={row.name}
              onChange={set(index, 'name')}
              error={errorFor(index, 'name')}
              inputProps={{ 'aria-label': 'Item name', maxLength: 80 }}
              sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}
            />
            <SelectField
              id={`add-cat-${index}`}
              label={isPhone || index === 0 ? 'Category' : undefined}
              required={isPhone || index === 0}
              placeholder="Choose"
              value={row.category}
              onChange={set(index, 'category')}
              options={INVENTORY_CATEGORIES}
              error={errorFor(index, 'category')}
              sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}
            />
            <FormField
              id={`add-total-${index}`}
              label={isPhone || index === 0 ? 'Quantity' : undefined}
              required={isPhone || index === 0}
              type="number"
              value={row.total}
              onChange={set(index, 'total')}
              error={errorFor(index, 'total')}
              inputProps={{ min: 1, 'aria-label': 'Quantity' }}
            />
            <FormField
              id={`add-low-${index}`}
              label={isPhone || index === 0 ? 'Alert at' : undefined}
              type="number"
              value={row.lowStockAt}
              onChange={set(index, 'lowStockAt')}
              error={errorFor(index, 'lowStockAt')}
              inputProps={{ min: 0, 'aria-label': 'Low-stock alert level' }}
            />
            <FormField
              id={`add-rent-${index}`}
              label={isPhone || index === 0 ? 'Rent ₱' : undefined}
              type="number"
              value={row.rentPrice}
              onChange={set(index, 'rentPrice')}
              error={errorFor(index, 'rentPrice')}
              inputProps={{ min: 1, 'aria-label': 'Rent price per piece' }}
            />
            <FormField
              id={`add-fee-${index}`}
              label={isPhone || index === 0 ? 'Damage ₱' : undefined}
              type="number"
              value={row.damageFee}
              onChange={set(index, 'damageFee')}
              error={errorFor(index, 'damageFee')}
              disabled={row.rentPrice === ''}
              inputProps={{ min: 0, 'aria-label': 'Damage fee per piece' }}
            />
            <IconButton
              aria-label="Remove row"
              disabled={rows.length === 1 || busy}
              onClick={() => {
                setRows((r) => r.filter((_, i) => i !== index));
                setError(null);
              }}
              sx={{ mt: { sm: index === 0 ? 3.25 : 0 }, justifySelf: { xs: 'start', sm: 'center' } }}
            >
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
        <Button
          startIcon={<AddRoundedIcon />}
          disabled={rows.length >= 20 || busy}
          onClick={() => setRows((r) => [...r, blankRow()])}
          sx={{ alignSelf: 'flex-start' }}
        >
          Add another row
        </Button>
      </Box>
    </AppDialog>
  );
}
