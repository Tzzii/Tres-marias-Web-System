import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import InputAdornment from '@mui/material/InputAdornment';
import {
  BusyButton,
  CardTitle,
  DashCard,
  IntegerAmountField,
  SIX_HOUR_FEE_RANGE,
  catalogApi,
  sixHourFeeProblem
} from '@tm/shared';

export default function SixHourFeeCard({ current, onSaved }) {
  const [value, setValue] = useState(String(current));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(String(current)), [current]);
  const problem = sixHourFeeProblem(value);

  const save = async () => {
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await catalogApi.setSixHourFee(Number(value));
      setError('');
      await onSaved();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashCard sx={{ mb: 2.5 }}>
      <CardTitle subtitle="This charge applies to events lasting exactly 6 hours.">6-hour Event Charge</CardTitle>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <IntegerAmountField
          id="six-hour-fee"
          max={SIX_HOUR_FEE_RANGE.max}
          label="Default charge"
          autoComplete="off"
          value={value}
          onChange={(event) => {
            const next = event.target.value;
            setValue(next);
            setError('');
          }}
          error={error}
          InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
          sx={{ width: 280, maxWidth: '100%' }}
        />
        <BusyButton
          busy={busy}
          disabled={Boolean(problem) || Number(value) === current}
          onClick={save}
          sx={{ mt: 3, height: 40 }}
        >
          Save charge
        </BusyButton>
      </Box>
    </DashCard>
  );
}
