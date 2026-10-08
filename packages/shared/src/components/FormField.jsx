import { forwardRef, useLayoutEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { tokens } from '../theme/tokens.js';
import { nationalMobile } from '../utils/format.js';

/**
 * Labelled inputs for light surfaces (design system: FormField). The label sits
 * above the input; hints and errors below. Use inside a DashCard, FormCard or
 * AppDialog so the light theme applies.
 */

/** Field label with a red * for required fields or "(optional)". */
export function FieldLabel({ htmlFor, children, required, optional }) {
  return (
    <Typography
      component="label"
      htmlFor={htmlFor}
      sx={{ display: 'block', mb: 0.75, fontSize: 13, fontWeight: 600, color: tokens.textPrimary }}
    >
      {children}
      {required && (
        <Box component="span" aria-hidden sx={{ color: tokens.red, ml: 0.25 }}>
          *
        </Box>
      )}
      {optional && (
        <Box component="span" sx={{ ml: 0.75, fontWeight: 500, color: tokens.textMuted }}>
          (optional)
        </Box>
      )}
    </Typography>
  );
}

/**
 * Label + text input. `error` turns the field red and shows the message; otherwise `hint` shows.
 * forwardRef lets pages focus the input directly.
 */
export const FormField = forwardRef(function FormField(
  { id, label, required, optional, error, hint, sx, children, select, ...props },
  ref
) {
  return (
    <Box sx={{ minWidth: 0, ...sx }}>
      {label && (
        <FieldLabel htmlFor={id} required={required} optional={optional}>
          {label}
        </FieldLabel>
      )}
      <TextField
        id={id}
        inputRef={ref}
        fullWidth
        size="small"
        select={select}
        error={Boolean(error)}
        helperText={error || hint || undefined}
        FormHelperTextProps={{ sx: { mx: 0, mt: 0.75, fontSize: 12, color: error ? undefined : tokens.textMuted } }}
        {...props}
      >
        {children}
      </TextField>
    </Box>
  );
});

/** Dropdown. `options` can be plain strings or { value, label } objects. */
export function SelectField({ options, placeholder, ...props }) {
  return (
    <FormField select {...props} SelectProps={{ displayEmpty: Boolean(placeholder), ...props.SelectProps }}>
      {placeholder && (
        <MenuItem value="" disabled>
          <Box component="span" sx={{ color: tokens.placeholder }}>
            {placeholder}
          </Box>
        </MenuItem>
      )}
      {options.map((option) => {
        const value = typeof option === 'string' ? option : option.value;
        const text = typeof option === 'string' ? option : option.label;
        return (
          <MenuItem key={value} value={value}>
            {text}
          </MenuItem>
        );
      })}
    </FormField>
  );
}

// Where the cursor sits in "917 123 4567" after the first `count` digits (the spaces come after the 3rd and 6th)
const mobileCaret = (count) => count + (count > 3 ? 1 : 0) + (count > 6 ? 1 : 0);

/**
 * Philippine mobile number input with a fixed "+63" in front. The person types the 10 digits after it and
 * the spaces appear as they type ("917 123 4567"); a pasted or autofilled "0917…", "+63 917…" or "63917…"
 * loses its prefix first (nationalMobile), and digits past the tenth are dropped. The cursor stays after
 * the digit it followed when a digit is typed or deleted in the middle.
 * `value` may be written any of those ways (e.g. the stored "09171234567"). `onChange` gets
 * { target: { value } } like a text box, with the number in its stored form: "0" + the digits
 * ("09171234567"), or '' when the box is empty, so validateMobile and the server read it as before.
 */
export const MobileField = forwardRef(function MobileField(
  { value, onChange, placeholder = '917 123 4567', autoComplete = 'tel', InputProps, ...props },
  ref
) {
  const input = useRef(null);
  const caret = useRef(null); // cursor position to restore after the next render, or null
  const digits = nationalMobile(value).slice(0, 10);

  // Put the cursor back where the person was typing; the reformatted value would otherwise send it to the end
  useLayoutEffect(() => {
    if (caret.current !== null && input.current && document.activeElement === input.current) {
      input.current.setSelectionRange(caret.current, caret.current);
    }
    caret.current = null;
  });

  // Keep the page's ref working (FormField forwards it to the input) alongside our own
  const setInput = (node) => {
    input.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };

  const handleChange = (e) => {
    const typed = e.target.value;
    const national = nationalMobile(typed);
    const next = national.slice(0, 10);
    // Digits before the cursor, less the prefix that was removed from the front
    const before = typed.slice(0, e.target.selectionStart ?? typed.length).replace(/\D/g, '').length;
    const removed = typed.replace(/\D/g, '').length - national.length;
    caret.current = mobileCaret(Math.min(next.length, Math.max(0, before - removed)));
    if (onChange) onChange({ target: { value: next ? `0${next}` : '' } });
  };

  return (
    <FormField
      ref={setInput}
      type="tel"
      autoComplete={autoComplete}
      placeholder={placeholder}
      value={[digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)].filter(Boolean).join(' ')}
      onChange={handleChange}
      InputProps={{ ...InputProps, startAdornment: <InputAdornment position="start">+63</InputAdornment> }}
      {...props}
    />
  );
});

/** Password input with an eye button to show or hide the text. */
export const PasswordField = forwardRef(function PasswordField(props, ref) {
  const [visible, setVisible] = useState(false); // true = show the password as plain text
  return (
    <FormField
      ref={ref}
      type={visible ? 'text' : 'password'}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton
              edge="end"
              size="small"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? 'Hide password' : 'Show password'}
              sx={{ color: tokens.textMuted }}
            >
              {visible ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
            </IconButton>
          </InputAdornment>
        )
      }}
      {...props}
    />
  );
});
