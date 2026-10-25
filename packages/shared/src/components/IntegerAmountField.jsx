import { FormField } from './FormField.jsx';

/** A bounded, nonnegative whole-peso input; empty text remains valid while editing. */
export function IntegerAmountField({ max, onChange, inputProps, ...props }) {
  const digits = String(max).length;
  return (
    <FormField
      {...props}
      onChange={(event) => {
        const next = event.target.value;
        if (/^\d*$/.test(next) && next.length <= digits && Number(next) <= max) onChange(event);
      }}
      inputProps={{ ...inputProps, inputMode: 'numeric', maxLength: digits, pattern: '[0-9]*' }}
    />
  );
}
