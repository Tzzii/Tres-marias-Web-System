import { forwardRef, useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { tokens } from '../theme/tokens.js';

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
