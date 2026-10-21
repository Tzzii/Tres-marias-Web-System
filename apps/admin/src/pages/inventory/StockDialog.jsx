import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { changeStockValues, stockQuantityLimit } from '../../lib/inventoryStock.js';
import {
  AlertBanner,
  AppDialog,
  BusyButton,
  Field,
  FormField,
  SelectField,
  formatDate,
  inventoryApi,
  tokens
} from '@tm/shared';

const NO_EVENT = inventoryApi.NO_EVENT;

const ACTIONS = {
  checkout: {
    title: 'Check Out',
    description: 'Take available pieces out for an event. They count as In use until returned.',
    button: 'Check out'
  },
  return: {
    title: 'Return',
    description: 'Record pieces coming back. Damaged pieces go to Damaged instead of Available.',
    button: 'Record return'
  },
  damage: {
    title: 'Report Damage',
    description: 'Move available pieces to Damaged so they are not checked out.',
    button: 'Report damage'
  },
  repair: {
    title: 'Mark Repaired',
    description: 'Move repaired pieces from Damaged back to Available.',
    button: 'Mark repaired'
  },
  dispose: {
    title: 'Dispose of Damaged',
    description: 'Remove damaged pieces that cannot be repaired. The total goes down.',
    button: 'Dispose'
  }
};

export default function StockDialog({ action, item, events, onClose, onDone }) {
  const [values, setValues] = useState({ ref: NO_EVENT, qty: '', damagedQty: '0', note: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const open = Boolean(action && item);
  const id = item && item.id;

  useEffect(() => {
    if (!open) return;
    const firstOut = item.out[0];
    setValues({
      ref: action === 'return' && firstOut ? firstOut.ref : NO_EVENT,
      qty: action === 'return' && firstOut ? String(firstOut.qty) : action === 'repair' ? String(item.damaged) : '',
      damagedQty: '0',
      note: ''
    });
    setErrors({});
  }, [open, action, id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return <AppDialog open={false} onClose={onClose} title="" />;

  const outAt = (ref) => (item.out.find((o) => o.ref === ref) || { qty: 0 }).qty;

  const maxFor = (field, v) => stockQuantityLimit(action, item, v, field);

  const set = (field) => (e) => {
    const value = e.target.value;
    setValues((v) => changeStockValues(v, field, value, action, item));
    setErrors({});
  };

  const outAtRef = outAt(values.ref);
  const needsNote = action === 'damage' || action === 'dispose';

  const submit = async () => {
    setBusy(true);
    try {
      await inventoryApi.moveInventoryStock(item.id, action, {
        ref: values.ref,
        qty: Number(values.qty),
        damagedQty: Number(values.damagedQty) || 0,
        note: values.note
      });
      const qty = Number(values.qty) + (action === 'return' ? Number(values.damagedQty) || 0 : 0);
      onDone(`${ACTIONS[action].title}: ${qty} ${item.name}.`);
    } catch (e) {
      setErrors({ [(e.meta && e.meta.field) || 'qty']: e.message });
    } finally {
      setBusy(false);
    }
  };

  const placeLabel = (o) =>
    o.ref === NO_EVENT
      ? `No event linked · ${o.qty} out`
      : `${o.eventName || o.ref} · ${formatDate(o.eventDate)} · ${o.qty} out`;

  return (
    <AppDialog
      open
      onClose={onClose}
      busy={busy}
      maxWidth="xs"
      title={`${ACTIONS[action].title} · ${item.name}`}
      description={ACTIONS[action].description}
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <BusyButton busy={busy} color={action === 'dispose' ? 'error' : 'primary'} onClick={submit}>
            {ACTIONS[action].button}
          </BusyButton>
        </>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 1,
            p: 1.25,
            borderRadius: 1.5,
            backgroundColor: tokens.surfaceSubtle
          }}
        >
          <Field label="Available">{String(item.available)}</Field>
          <Field label="In use">{String(item.inUse)}</Field>
          <Field label="Damaged">{String(item.damaged)}</Field>
        </Box>

        {action === 'checkout' && (
          <SelectField
            id="stock-event"
            label="For event"
            value={values.ref}
            onChange={set('ref')}
            error={errors.ref}
            options={[
              { value: NO_EVENT, label: 'No event (e.g. lending, off-site use)' },
              ...events.map((e) => ({
                value: e.ref,
                label: `${formatDate(e.date)} · ${e.eventName} · ${e.rental ? 'equipment rental' : `${e.guests} pax`}`
              }))
            ]}
            hint="Approved, downpayment-paid and confirmed reservations"
          />
        )}
        {action === 'return' && (
          <SelectField
            id="stock-from"
            label="Returned from"
            value={values.ref}
            onChange={set('ref')}
            error={errors.ref}
            options={item.out.map((o) => ({ value: o.ref, label: placeLabel(o) }))}
          />
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: action === 'return' ? '1fr 1fr' : '1fr', gap: 1.5 }}>
          <FormField
            id="stock-qty"
            label={action === 'return' ? 'Good condition' : 'Quantity'}
            required
            type="number"
            value={values.qty}
            onChange={set('qty')}
            error={errors.qty}
            autoFocus
            inputProps={{ min: action === 'return' ? 0 : 1, max: maxFor('qty', values) }}
            hint={
              action === 'checkout' || action === 'damage'
                ? `${item.available} available`
                : action === 'return'
                  ? `${outAtRef} out there`
                  : `${item.damaged} damaged`
            }
          />
          {action === 'return' && (
            <FormField
              id="stock-damaged"
              label="Came back damaged"
              type="number"
              value={values.damagedQty}
              onChange={set('damagedQty')}
              inputProps={{ min: 0, max: maxFor('damagedQty', values) }}
            />
          )}
        </Box>

        <FormField
          id="stock-note"
          label={needsNote ? 'Reason' : 'Note'}
          required={needsNote}
          optional={!needsNote}
          multiline
          minRows={2}
          value={values.note}
          onChange={set('note')}
          error={errors.note}
          inputProps={{ maxLength: 200 }}
          placeholder={
            action === 'damage'
              ? 'e.g. 3 legs cracked during unloading'
              : action === 'dispose'
                ? 'e.g. Beyond repair'
                : ''
          }
        />
        {action === 'checkout' && values.ref !== NO_EVENT && (
          <AlertBanner tone="info">This check-out is also added to the reservation's audit trail.</AlertBanner>
        )}
      </Box>
    </AppDialog>
  );
}
