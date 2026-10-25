import { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import InputAdornment from '@mui/material/InputAdornment';
import Typography from '@mui/material/Typography';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import {
  AlertBanner,
  BusyButton,
  CardTitle,
  DashCard,
  DetailRow,
  FormField,
  IntegerAmountField,
  SIX_HOUR_FEE_RANGE,
  ITEM_COUNT_MAX,
  RENTAL,
  computeQuote,
  durationChargeFor,
  reservationSixHourFee,
  sixHourFeeProblem,
  extraGuestsFor,
  formatDateTime,
  includesFood,
  isRental,
  itemsToConfirm,
  otherChargeItemsFor,
  peso,
  tokens,
  usesGuestRule
} from '@tm/shared';
import { useAuth } from '../../auth.js';
import { useQuotationDraft } from '../../hooks/useQuotationDraft.js';

export default function QuotationCard({ r, closed, onSend }) {
  const { user } = useAuth();
  const nextOtherChargeId = useRef(0);
  const newOtherCharge = () => ({
    id: `new-${nextOtherChargeId.current++}`,
    amount: '',
    label: ''
  });
  const rental = isRental(r.serviceType);
  const delivered = rental && r.fulfilment === 'delivery';
  const sixHours = durationChargeFor({ ...r, sixHourFee: 1 }) > 0;
  const extraGuests = rental ? 0 : extraGuestsFor(r.package, r.guests);
  const confirmItems = rental ? [] : itemsToConfirm(r.package, r.guests);
  const initial = () => {
    const q = r.quotation;
    const otherLines = otherChargeItemsFor(q);
    const amount = (value) => (q && value ? String(value) : '');
    const startPrice = (id) => {
      const booked = r.estimate && r.estimate.addonPrices && r.estimate.addonPrices[id];
      const addon = r.addons.find((a) => a.id === id);
      const price = booked || (addon && addon.price);
      return price ? String(price) : '';
    };
    return {
      sixHourFee: String(reservationSixHourFee(r)),
      addonPrices: Object.fromEntries(
        r.addonIds.map((id) => [id, q ? amount(q.addonPrices && q.addonPrices[id]) : startPrice(id)])
      ),
      extraGuestsCharge: q && q.extraGuests ? String(q.extraGuestsCharge || 0) : '',
      itemCounts: Object.fromEntries(
        confirmItems.map((item) => [
          item.name,
          q && q.itemCounts && q.itemCounts[item.name] ? String(q.itemCounts[item.name]) : ''
        ])
      ),
      deliveryFee: String(q && q.fulfilment === 'delivery' ? q.deliveryFee : RENTAL.deliveryFee),
      otherChargeItems: (otherLines.length ? otherLines : [{ amount: '', label: '' }]).map((line, index) => ({
        id: `saved-${index}`,
        amount: String(line.amount),
        label: line.label
      })),
      discount: amount(q && q.discount),
      note: q ? q.note : ''
    };
  };
  const { values, setValues, draftSaved, clearDraft } = useQuotationDraft({
    adminId: user.id,
    reservation: r,
    closed,
    initial
  });
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const setAddonPrice = (id) => (e) =>
    setValues((v) => ({ ...v, addonPrices: { ...v.addonPrices, [id]: e.target.value } }));
  const setItemCount = (name) => (e) =>
    setValues((v) => ({ ...v, itemCounts: { ...v.itemCounts, [name]: e.target.value } }));
  const itemCount = (name) => (values.itemCounts || {})[name] ?? '';
  const setOtherCharge = (id, key) => (e) => {
    const value = e.target.value;
    setValues((v) => ({
      ...v,
      otherChargeItems: v.otherChargeItems.map((line) => (line.id === id ? { ...line, [key]: value } : line))
    }));
  };
  const removeOtherCharge = (id) =>
    setValues((v) => ({
      ...v,
      otherChargeItems:
        v.otherChargeItems.length === 1 ? [newOtherCharge()] : v.otherChargeItems.filter((line) => line.id !== id)
    }));

  const preview = computeQuote({
    pkg: r.package,
    serviceType: r.serviceType,
    guests: r.guests,
    pricePerPlate: r.pricePerPlate,
    startTime: r.startTime,
    endTime: r.endTime,
    sixHourFee: values.sixHourFee,
    rentalItems: rental ? r.rentalItems : [],
    deliveryFee: delivered ? values.deliveryFee : 0,
    damageCharges: rental ? r.damageCharges || [] : [],
    addonIds: r.addonIds,
    addonQty: r.addonQty,
    addonPrices: values.addonPrices,
    extraGuestsCharge: values.extraGuestsCharge,
    otherChargeItems: values.otherChargeItems,
    discount: values.discount
  });
  const addonLabel = (a) => (a.hasQuantity ? `${a.name} × ${(r.addonQty || {})[a.id] || 1}` : a.name);
  const invalid = (value) => value !== '' && (Number.isNaN(Number(value)) || Number(value) < 0);
  const amountError = (value) => (invalid(value) ? 'Enter a valid amount.' : '');
  const otherAmountError = (value) =>
    value !== '' && (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 10000000)
      ? 'Enter an amount in whole pesos, from 0 to 10,000,000.'
      : '';
  const anyInvalid =
    [
      values.discount,
      ...(delivered ? [values.deliveryFee] : []),
      ...(extraGuests ? [values.extraGuestsCharge] : []),
      ...Object.values(values.addonPrices)
    ].some(invalid) ||
    values.otherChargeItems.some((line) => otherAmountError(line.amount)) ||
    Boolean(sixHourFeeProblem(values.sixHourFee));
  const countError = (value) =>
    value !== '' && !(Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= ITEM_COUNT_MAX)
      ? `Enter a whole number from 1 to ${ITEM_COUNT_MAX.toLocaleString('en-PH')}.`
      : '';
  const gross =
    preview.packageTotal +
    preview.extraGuestsCharge +
    preview.food +
    preview.durationCharge +
    preview.rental +
    preview.deliveryFee +
    preview.damage +
    preview.addons +
    preview.otherCharges;
  const discountError =
    amountError(values.discount) || (preview.discount > gross ? 'Discount is larger than the total.' : '');
  const paidAbove = Math.max(0, r.paid - preview.net);
  const missingPrice = r.addonIds.some((id) => !Number(values.addonPrices[id]));
  const missingExtra =
    extraGuests > 0 &&
    (values.extraGuestsCharge === '' ||
      confirmItems.some((item) => itemCount(item.name) === '' || countError(itemCount(item.name))));
  const toSend = (v) => ({
    sixHourFee: Number(v.sixHourFee),
    addonPrices: Object.fromEntries(Object.entries(v.addonPrices).map(([id, price]) => [id, Number(price) || 0])),
    ...(extraGuests
      ? {
          extraGuestsCharge: Number(v.extraGuestsCharge) || 0,
          itemCounts: Object.fromEntries(
            confirmItems.map((item) => [item.name, Number((v.itemCounts || {})[item.name] ?? '')])
          )
        }
      : {}),
    deliveryFee: Number(v.deliveryFee) || 0,
    otherChargeItems: otherChargeItemsFor({ otherChargeItems: v.otherChargeItems }),
    discount: Number(v.discount) || 0,
    note: v.note
  });
  const changed =
    !r.quotation || r.quotationStale || JSON.stringify(toSend(values)) !== JSON.stringify(toSend(initial()));
  const peso0 = { startAdornment: <InputAdornment position="start">₱</InputAdornment> };

  return (
    <DashCard id="quotation-card">
      <CardTitle subtitle={r.quotation ? `Last sent ${formatDateTime(r.quotation.sentAt)}` : 'Not sent yet'}>
        Quotation
      </CardTitle>
      {!closed && draftSaved && (
        <Typography role="status" sx={{ mb: 1.5, fontSize: 12, color: tokens.textMuted }}>
          Draft saved on this tab. Send the quotation when it is ready.
        </Typography>
      )}
      {r.quotationStale && !closed && (
        <AlertBanner tone="warning" sx={{ mb: 2 }} title="The customer's quotation is out of date">
          {r.quotationStaleReason} Re-send it so the customer has the correct total.
        </AlertBanner>
      )}
      {rental ? (
        <>
          {preview.rentalItems.map((line) => (
            <DetailRow key={line.itemId} label={`${line.name} · ${line.qty} × ${peso(line.price)}`}>
              {peso(line.total)}
            </DetailRow>
          ))}
          {!delivered && <DetailRow label="Pick up">Free</DetailRow>}
          {closed && delivered && <DetailRow label="Delivery">{peso(preview.deliveryFee)}</DetailRow>}
          {preview.damageCharges.map((line) => (
            <DetailRow
              key={`damage-${line.itemId}`}
              label={`Damaged or missing · ${line.name} · ${line.qty} × ${peso(line.fee)}`}
            >
              {peso(line.total)}
            </DetailRow>
          ))}
        </>
      ) : (
        <>
          <DetailRow label={`Package · ${r.packageName} (${r.package.guests} guests)`}>
            {peso(preview.packageTotal)}
          </DetailRow>
          {includesFood(r.serviceType) ? (
            <DetailRow label={`Buffet · ${preview.plates} × ${peso(preview.pricePerPlate)}`}>
              {peso(preview.food)}
            </DetailRow>
          ) : (
            <DetailRow label="Food">Catering only</DetailRow>
          )}
        </>
      )}
      {closed ? (
        <>
          {preview.durationCharge > 0 && (
            <DetailRow label="6-hour event charge">{peso(preview.durationCharge)}</DetailRow>
          )}
          {usesGuestRule(r) && preview.extraGuests > 0 && (
            <DetailRow label={`Extra ${preview.extraGuests} guests (equipment)`}>
              {peso(preview.extraGuestsCharge)}
            </DetailRow>
          )}
          {usesGuestRule(r) && confirmItems.length > 0 && (
            <DetailRow label="Items confirmed">
              {confirmItems.map((item) => `${itemCount(item.name) || '?'} ${item.name}`).join(', ')}
            </DetailRow>
          )}
          {r.addons.map((a) => (
            <DetailRow key={a.id} label={addonLabel(a)}>
              {peso(preview.addonTotals[a.id])}
            </DetailRow>
          ))}
          {preview.otherChargeItems
            .filter((line) => line.amount > 0)
            .map((line, index) => (
              <DetailRow key={`other-${index}`} label={line.label || 'Other charges'}>
                {peso(line.amount)}
              </DetailRow>
            ))}
          <DetailRow label="Discount">— {peso(preview.discount)}</DetailRow>
        </>
      ) : (
        <Box sx={{ my: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {sixHours && (
            <IntegerAmountField
              id="q-six-hour-fee"
              max={SIX_HOUR_FEE_RANGE.max}
              label="6-hour event charge"
              required
              autoComplete="off"
              value={values.sixHourFee}
              onChange={(event) => {
                const next = event.target.value;
                setValues((v) => ({ ...v, sixHourFee: next }));
              }}
              error={sixHourFeeProblem(values.sixHourFee)}
              hint="Applies only to this 6-hour event. Whole pesos, ₱0–₱50,000, up to 5 digits."
              InputProps={peso0}
            />
          )}
          {delivered && (
            <FormField
              id="q-delivery"
              label="Delivery fee"
              required
              type="number"
              value={values.deliveryFee}
              onChange={set('deliveryFee')}
              error={amountError(values.deliveryFee)}
              hint={`Standard ${peso(RENTAL.deliveryFee)}. Set more for a large order.`}
              InputProps={peso0}
              inputProps={{ min: 0, step: 50 }}
            />
          )}
          {extraGuests > 0 && (
            <>
              <FormField
                id="q-extra-guests"
                label={`Extra ${extraGuests} guests (equipment)`}
                required
                type="number"
                value={values.extraGuestsCharge}
                onChange={set('extraGuestsCharge')}
                error={amountError(values.extraGuestsCharge)}
                hint={`${r.guests} guests on a package for ${r.package.guests}. Plates, glasses, cutlery, chairs and tables grow by themselves; enter 0 to waive the charge.`}
                InputProps={peso0}
                inputProps={{ min: 0, step: 500 }}
              />
              {confirmItems.length > 0 && (
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 700 }}>Items to confirm for {r.guests} guests</Typography>
                  <Typography sx={{ mb: 1, fontSize: 12, color: tokens.textMuted }}>
                    How many of each for this event. The customer sees these instead of "to confirm".
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                    {confirmItems.map((item) => (
                      <FormField
                        key={item.name}
                        id={`q-count-${item.name}`}
                        label={item.name}
                        required
                        type="number"
                        value={itemCount(item.name)}
                        onChange={setItemCount(item.name)}
                        error={countError(itemCount(item.name))}
                        hint={`Package: ${item.defaultQty} for ${r.package.guests} guests`}
                        inputProps={{ min: 1, step: 1 }}
                      />
                    ))}
                  </Box>
                </Box>
              )}
            </>
          )}
          {r.addons.map((a) => (
            <FormField
              key={a.id}
              id={`q-addon-${a.id}`}
              label={addonLabel(a)}
              required
              type="number"
              value={values.addonPrices[a.id] ?? ''}
              onChange={setAddonPrice(a.id)}
              error={amountError(values.addonPrices[a.id] ?? '')}
              hint={
                a.hasQuantity
                  ? `Price of one · ${(r.addonQty || {})[a.id] || 1} = ${peso(preview.addonTotals[a.id])}`
                  : undefined
              }
              InputProps={peso0}
              inputProps={{ min: 0, step: 500 }}
            />
          ))}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {values.otherChargeItems.map((line, index) => (
              <Box key={line.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                <Box
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    gap: 1
                  }}
                >
                  <FormField
                    id={`q-other-${line.id}`}
                    label={index === 0 ? 'Other charges' : `Other charge ${index + 1}`}
                    optional
                    type="number"
                    value={line.amount}
                    onChange={setOtherCharge(line.id, 'amount')}
                    error={otherAmountError(line.amount)}
                    InputProps={peso0}
                    inputProps={{ min: 0, max: 10000000, step: 1 }}
                  />
                  <FormField
                    id={`q-other-label-${line.id}`}
                    label="What for"
                    optional
                    value={line.label}
                    onChange={setOtherCharge(line.id, 'label')}
                    placeholder="e.g. Extra waiter or special equipment"
                    inputProps={{ maxLength: 60, 'aria-label': `What for other charge ${index + 1}` }}
                  />
                </Box>
                <IconButton
                  aria-label={`Remove other charge ${index + 1}`}
                  onClick={() => removeOtherCharge(line.id)}
                  sx={{ mt: 3.25, color: tokens.textMuted }}
                >
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
            <Button
              startIcon={<AddRoundedIcon />}
              onClick={() =>
                setValues((v) => ({
                  ...v,
                  otherChargeItems: [...v.otherChargeItems, newOtherCharge()]
                }))
              }
              sx={{ alignSelf: 'flex-start' }}
            >
              Add other charge
            </Button>
          </Box>
          <FormField
            id="q-discount"
            label="Discount"
            optional
            type="number"
            value={values.discount}
            onChange={set('discount')}
            error={discountError}
            InputProps={peso0}
            inputProps={{ min: 0, step: 500 }}
          />
        </Box>
      )}
      <Divider sx={{ my: 1 }} />
      <DetailRow label={<b>Net total</b>}>
        <Box component="span" sx={{ fontSize: 18, fontWeight: 800 }}>
          {peso(preview.net)}
        </Box>
      </DetailRow>
      {!closed && (
        <>
          {changed && paidAbove > 0 && (
            <AlertBanner tone="info" sx={{ mt: 1 }} title={`${peso(paidAbove)} was paid above this total`}>
              The customer has paid {peso(r.paid)}. Once sent, the difference shows under Refund to be returned, and the
              customer is told in their chat.
            </AlertBanner>
          )}
          <FormField
            id="q-note"
            label="Note to the customer"
            optional
            multiline
            minRows={2}
            value={values.note}
            onChange={set('note')}
            inputProps={{ maxLength: 300 }}
            sx={{ mt: 1 }}
          />
          {missingPrice && (
            <Typography sx={{ mt: 1, fontSize: 12.5, color: tokens.textMuted }}>
              Enter a price for each additional charge to send the quotation.
            </Typography>
          )}
          {missingExtra && (
            <Typography sx={{ mt: 1, fontSize: 12.5, color: tokens.textMuted }}>
              Enter the price for the extra guests and the count of each item to confirm to send the quotation.
            </Typography>
          )}
          {!changed && (
            <Typography sx={{ mt: 1, fontSize: 12.5, color: tokens.textMuted }}>
              Nothing has changed since the last quotation. Re-sending it sends the same quotation to the customer
              again.
            </Typography>
          )}
          <BusyButton
            fullWidth
            busy={busy}
            disabled={anyInvalid || Boolean(discountError) || missingPrice || missingExtra}
            onClick={async () => {
              setBusy(true);
              try {
                if (await onSend(toSend(values))) clearDraft();
              } finally {
                setBusy(false);
              }
            }}
            sx={{ mt: 2 }}
          >
            {r.quotation ? 'Save and re-send quotation' : 'Save and send quotation'}
          </BusyButton>
        </>
      )}
    </DashCard>
  );
}
