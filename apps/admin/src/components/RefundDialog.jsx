import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import {
  AlertBanner,
  AppDialog,
  BusyButton,
  DateField,
  FormField,
  REFUND_METHODS,
  SelectField,
  paymentApi,
  peso,
  referenceProblem,
  todayISO
} from '@tm/shared';

const METHOD_OPTIONS = Object.entries(REFUND_METHODS).map(([value, label]) => ({ value, label }));

export const refundRecordedText = (refund) =>
  refund.amount > 0
    ? `Refund of ${peso(refund.amount)} recorded. The customer was told in their chat.`
    : 'Recorded that nothing is returned. The customer was told in their chat.';

export default function RefundDialog({ open, onClose, booking, onRecorded }) {
  const due = booking ? booking.refundDue : 0;
  const overpayment = Boolean(booking) && !['cancelled', 'declined'].includes(booking.status);
  const [values, setValues] = useState({ amount: '', method: 'gcash', referenceNo: '', sentOn: '', reason: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues({ amount: String(due), method: 'gcash', referenceNo: '', sentOn: todayISO(), reason: '' });
    setErrors({});
    setFormError('');
  }, [open, due]);

  const set = (key) => (e) => {
    const value = e && e.target ? e.target.value : e;
    setValues((v) => ({ ...v, [key]: key === 'amount' ? String(value).replace(/\D/g, '').slice(0, 9) : value }));
    setErrors((er) => ({ ...er, [key]: '' }));
  };

  const typed = values.amount !== '';
  const amount = Number(values.amount) || 0;
  const keeps = !overpayment && typed && amount < due;
  const nothingSent = typed && amount === 0;
  const cash = values.method === 'cash';

  const check = () => {
    const found = {};
    if (!typed || amount > due)
      found.amount = `Enter a whole amount from ${peso(overpayment ? 1 : 0)} to ${peso(due)}.`;
    else if (overpayment && amount !== due) found.amount = `Return the whole overpayment of ${peso(due)}.`;
    if (keeps && values.reason.trim().length < 5)
      found.reason = `Tell the customer why ${nothingSent ? '' : 'part of '}the payment is kept (at least 5 characters).`;
    if (!nothingSent) {
      if (!cash && !values.referenceNo.trim()) found.referenceNo = 'Enter the reference number of the refund.';
      else if (!cash && referenceProblem(values.referenceNo.trim()))
        found.referenceNo = referenceProblem(values.referenceNo.trim());
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
      title="Record Refund"
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
          hint={
            overpayment
              ? 'The whole overpayment is returned.'
              : `${peso(due)} is due. Return less (₱0 keeps all of it) only with a reason.`
          }
          InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
          inputProps={{ inputMode: 'numeric' }}
        />
        {keeps && (
          <FormField
            id="refund-reason"
            label={
              nothingSent
                ? 'Why the payment is kept (shown to the customer)'
                : 'Why part of the payment is kept (shown to the customer)'
            }
            multiline
            minRows={2}
            value={values.reason}
            onChange={set('reason')}
            error={errors.reason}
            hint={`${peso(due - amount)} is kept.`}
            inputProps={{ maxLength: 500 }}
          />
        )}
        {!nothingSent && (
          <>
            <SelectField
              id="refund-method"
              label="Sent by"
              value={values.method}
              onChange={set('method')}
              options={METHOD_OPTIONS}
              error={errors.method}
            />
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
            <DateField
              id="refund-sent-on"
              label="Date sent"
              mode="past"
              value={values.sentOn}
              onChange={set('sentOn')}
              error={errors.sentOn}
            />
          </>
        )}
      </Box>
    </AppDialog>
  );
}
