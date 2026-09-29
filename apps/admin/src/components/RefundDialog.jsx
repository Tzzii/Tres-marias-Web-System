import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import { AlertBanner, AppDialog, BusyButton, DateField, FormField, REFUND_METHODS, SelectField, paymentApi, peso, todayISO } from '@tm/shared';

// The ways a refund can be sent, for the dropdown
const METHOD_OPTIONS = Object.entries(REFUND_METHODS).map(([value, label]) => ({ value, label }));

/** The notice shown once a refund is recorded (a refund of ₱0 means everything paid was kept). */
export const refundRecordedText = (refund) =>
  refund.amount > 0 ? `Refund of ${peso(refund.amount)} recorded. The customer was told in their chat.` : 'Recorded that nothing is returned. The customer was told in their chat.';

/**
 * Dialog to record money returned to a customer, after it was sent outside the system (GCash, bank
 * transfer or cash). Used on the reservation page and in the Payments tab's "Refunds to send".
 * `booking` is { ref, eventName, customerName, status, refundDue }: on a cancelled or declined booking
 * it returns what was paid (a lower amount, even ₱0 when everything is kept, needs a reason the customer
 * sees; the rest is kept, and ₱0 asks for no method, reference or date because nothing was sent); on any
 * other booking it returns an overpayment, always the whole of it. The amount starts at what is due,
 * the method at GCash, and the date sent at today. The same rules are checked again by recordRefund
 * (paymentService.js); `onRecorded(refund)` runs after it is saved.
 */
export default function RefundDialog({ open, onClose, booking, onRecorded }) {
  const due = booking ? booking.refundDue : 0;
  const overpayment = Boolean(booking) && !['cancelled', 'declined'].includes(booking.status);
  const [values, setValues] = useState({ amount: '', method: 'gcash', referenceNo: '', sentOn: '', reason: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  // Start again each time the dialog opens: the whole amount due, GCash, sent today
  useEffect(() => {
    if (!open) return;
    setValues({ amount: String(due), method: 'gcash', referenceNo: '', sentOn: todayISO(), reason: '' });
    setErrors({});
    setFormError('');
  }, [open, due]);

  // Change one value and clear its error (accepts an input event or a plain value from the date picker)
  const set = (key) => (e) => {
    const value = e && e.target ? e.target.value : e;
    setValues((v) => ({ ...v, [key]: key === 'amount' ? String(value).replace(/\D/g, '').slice(0, 9) : value }));
    setErrors((er) => ({ ...er, [key]: '' }));
  };

  const typed = values.amount !== '';
  const amount = Number(values.amount) || 0;
  // Less than what is due: part (or at ₱0 all) of the payment is kept, so the customer is told why
  const keeps = !overpayment && typed && amount < due;
  // ₱0 returned: nothing was sent, so there is no method, reference or date to record
  const nothingSent = typed && amount === 0;
  const cash = values.method === 'cash';

  // The same checks as recordRefund, so most mistakes show before anything is sent
  const check = () => {
    const found = {};
    if (!typed || amount > due) found.amount = `Enter a whole amount from ${peso(overpayment ? 1 : 0)} to ${peso(due)}.`;
    else if (overpayment && amount !== due) found.amount = `Return the whole overpayment of ${peso(due)}.`;
    if (keeps && values.reason.trim().length < 5) found.reason = `Tell the customer why ${nothingSent ? '' : 'part of '}the payment is kept (at least 5 characters).`;
    if (!nothingSent) {
      if (!cash && !values.referenceNo.trim()) found.referenceNo = 'Enter the reference number of the refund.';
      else if (!cash && !/^[A-Za-z0-9 -]{6,30}$/.test(values.referenceNo.trim())) found.referenceNo = 'Use 6–30 letters, numbers, spaces or dashes.';
      if (!values.sentOn) found.sentOn = 'Enter the date the refund was sent.';
      else if (values.sentOn > todayISO()) found.sentOn = 'The date sent cannot be later than today.';
    }
    return found;
  };

  const submit = async () => {
    const found = check();
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const refund = await paymentApi.recordRefund(booking.ref, {
        amount,
        method: values.method,
        referenceNo: cash ? '' : values.referenceNo.trim(),
        sentOn: values.sentOn,
        reason: keeps ? values.reason.trim() : ''
      });
      onRecorded(refund);
    } catch (e) {
      if (e.meta && e.meta.field) setErrors((er) => ({ ...er, [e.meta.field]: e.message }));
      else setFormError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      busy={busy}
      maxWidth="xs"
      title="Record refund"
      description={
        booking
          ? `${booking.eventName} · ${booking.customerName}. Record it once the money is sent: the customer sees it in their chat and payment history.`
          : ''
      }
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <BusyButton busy={busy} onClick={submit}>
            Record refund
          </BusyButton>
        </>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {formError && <AlertBanner tone="error">{formError}</AlertBanner>}
        <FormField
          id="refund-amount"
          label="Amount returned"
          value={values.amount}
          onChange={set('amount')}
          disabled={overpayment}
          error={errors.amount}
          hint={overpayment ? 'The whole overpayment is returned.' : `${peso(due)} is due. Return less (₱0 keeps all of it) only with a reason.`}
          InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
          inputProps={{ inputMode: 'numeric' }}
        />
        {keeps && (
          <FormField
            id="refund-reason"
            label={nothingSent ? 'Why the payment is kept (shown to the customer)' : 'Why part of the payment is kept (shown to the customer)'}
            multiline
            minRows={2}
            value={values.reason}
            onChange={set('reason')}
            error={errors.reason}
            hint={`${peso(due - amount)} is kept.`}
            inputProps={{ maxLength: 500 }}
          />
        )}
        {/* How and when the money went back; nothing to fill in when nothing is returned */}
        {!nothingSent && (
          <>
            <SelectField id="refund-method" label="Sent by" value={values.method} onChange={set('method')} options={METHOD_OPTIONS} error={errors.method} />
            {/* Cash has no reference number */}
            {!cash && (
              <FormField
                id="refund-reference"
                label="Reference number"
                value={values.referenceNo}
                onChange={set('referenceNo')}
                error={errors.referenceNo}
                placeholder={values.method === 'gcash' ? 'e.g. 5021 884 3317' : 'e.g. BPI-20260926-0042'}
                inputProps={{ maxLength: 30 }}
              />
            )}
            <DateField id="refund-sent-on" label="Date sent" mode="past" value={values.sentOn} onChange={set('sentOn')} error={errors.sentOn} />
          </>
        )}
      </Box>
    </AppDialog>
  );
}
