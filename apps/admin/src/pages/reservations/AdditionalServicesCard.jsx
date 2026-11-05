import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import {
  AppDialog,
  AlertBanner,
  BusyButton,
  CardTitle,
  DashCard,
  FormField,
  ErrorState,
  catalogApi,
  reservationApi,
  useResource,
  tokens,
  peso,
  budgetBookableAddons,
  isBudgetFoodAddon
} from '@tm/shared';

function SelectionEditor({ r, onClose, onSaved }) {
  const catalog = useResource(() => catalogApi.getCatalog(), []);
  const [selection, setSelection] = useState({
    addonIds: [...r.addonIds],
    addonQty: Object.fromEntries(r.addonIds.map((id) => [id, r.addonQty[id] || 1]))
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const offered = catalog.data ? budgetBookableAddons(catalog.data) : [];
  const rows = [...offered, ...r.addons.filter((a) => !offered.some((b) => a.id === b.id))];
  return (
    <AppDialog
      open
      busy={busy}
      title="Edit working additional services"
      onClose={onClose}
      actions={
        <>
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <BusyButton
            busy={busy}
            disabled={catalog.loading || Boolean(catalog.error)}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await reservationApi.updateAddons(r.ref, selection);
                onSaved();
                onClose();
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save services
          </BusyButton>
        </>
      }
    >
      <Typography sx={{ mb: 2, fontSize: 13 }}>
        This changes the working request. The customer's submitted budget snapshot stays saved. Send a revised quotation
        after changing a previously quoted selection.
      </Typography>
      {catalog.error && <ErrorState error={catalog.error} onRetry={catalog.reload} />}
      {catalog.loading && <Typography role="status">Loading service options…</Typography>}
      {error && (
        <AlertBanner tone="error" sx={{ mb: 2 }}>
          {error}
        </AlertBanner>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {rows.map((a) => {
          const selected = selection.addonIds.includes(a.id);
          const food = isBudgetFoodAddon(a);
          return (
            <Box key={a.id} sx={{ p: 1.25, border: `1px solid ${tokens.cardLightBorder}`, borderRadius: 1.5 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    disabled={busy || food}
                    checked={selected}
                    onChange={(e) =>
                      setSelection((old) => ({
                        addonIds: e.target.checked ? [...old.addonIds, a.id] : old.addonIds.filter((id) => id !== a.id),
                        addonQty: e.target.checked
                          ? { ...old.addonQty, [a.id]: 1 }
                          : Object.fromEntries(Object.entries(old.addonQty).filter(([id]) => id !== a.id))
                      }))
                    }
                  />
                }
                label={a.name}
              />
              <Typography sx={{ fontSize: 12, color: tokens.textSecondary }}>
                {a.description} · {typeof a.price === 'number' ? peso(a.price) : 'To be quoted'}
                {food ? ' · Food selection preserved' : ''}
              </Typography>
              {selected && a.hasQuantity && (
                <FormField
                  id={`working-quantity-${a.id}`}
                  label={`Quantity for ${a.name}`}
                  value={selection.addonQty[a.id]}
                  type="number"
                  disabled={busy || food}
                  inputProps={{ min: 1, max: 99, step: 1 }}
                  onChange={(e) =>
                    setSelection((old) => ({
                      ...old,
                      addonQty: { ...old.addonQty, [a.id]: e.target.value === '' ? '' : Number(e.target.value) }
                    }))
                  }
                />
              )}
            </Box>
          );
        })}
      </Box>
    </AppDialog>
  );
}
export default function AdditionalServicesCard({ r, onSaved }) {
  const [open, setOpen] = useState(false);
  return (
    <DashCard id="working-services-card">
      <CardTitle
        subtitle="Current working selection used for the next quotation"
        action={
          r.status === 'pending' && (
            <Button variant="outlined" onClick={() => setOpen(true)}>
              Edit additional services
            </Button>
          )
        }
      >
        Working Additional Services
      </CardTitle>
      <Typography sx={{ fontSize: 13 }}>
        {r.addons.length
          ? r.addons.map((a) => `${a.name} × ${r.addonQty[a.id] || 1}`).join(', ')
          : 'No additional services'}
      </Typography>
      {open && <SelectionEditor r={r} onClose={() => setOpen(false)} onSaved={onSaved} />}
    </DashCard>
  );
}
