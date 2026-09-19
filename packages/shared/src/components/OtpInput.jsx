import { useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import { shakeSx, tokens } from '../theme/tokens.js';

/**
 * Segmented one-time-code input (design system: OtpInput). Supports continuous
 * typing (the cursor moves to the next box by itself), backspace navigation,
 * arrow keys and pasting the whole code.
 * `state` is 'idle' | 'error' | 'success' and colours the boxes.
 */
export function OtpInput({ length = 6, value, onChange, onComplete, disabled, state = 'idle', shake = false, onShakeEnd, autoFocus = true }) {
  const refs = useRef([]); // one ref per box, to move the cursor between boxes
  // Latest code, updated right away when a digit is entered. The `value` prop only
  // updates after React re-renders, which is too late for the focus handler that
  // runs when the cursor jumps to the next box.
  const valueRef = useRef(value);
  valueRef.current = value;
  // Split the code string into one digit per box, e.g. "48" -> ['4','8','','','','']
  const toDigits = (code) => Array.from({ length }, (_, i) => code[i] || '');
  const digits = toDigits(value);

  // Send the new code to the parent and remember it immediately (see valueRef)
  const emit = (code) => {
    valueRef.current = code;
    onChange(code);
  };

  // Put the cursor in the first box when it appears
  useEffect(() => {
    if (autoFocus && refs.current[0]) refs.current[0].focus();
  }, [autoFocus]);

  // After a wrong code clears the boxes, return focus to the first one
  useEffect(() => {
    if (value === '' && !disabled && refs.current[0] && document.activeElement !== refs.current[0]) {
      refs.current[0].focus();
    }
  }, [value, disabled]);

  // Put one digit in a box, move the cursor to the next box, and call onComplete once all boxes are filled
  const enterDigit = (index, digit) => {
    const next = toDigits(valueRef.current);
    next[index] = digit;
    const joined = next.join('').slice(0, length);
    emit(joined);
    if (index < length - 1) refs.current[index + 1]?.focus();
    if (joined.length === length && onComplete) onComplete(joined);
  };

  // Fallback for input that doesn't come through handleKeyDown: pasting, browser autofill,
  // and phone keyboards that don't report which key was pressed. Keeps digits only.
  const handleChange = (index, raw) => {
    const clean = raw.replace(/\D/g, '');
    if (!clean) return;
    // More than one digit means the code was pasted or autofilled: fill the boxes from here on
    if (clean.length > 1) {
      const pasted = (valueRef.current.slice(0, index) + clean).slice(0, length);
      emit(pasted);
      refs.current[Math.min(pasted.length, length - 1)]?.focus();
      if (pasted.length === length && onComplete) onComplete(pasted);
      return;
    }
    enterDigit(index, clean);
  };

  // Keyboard: a digit key fills this box and moves on (replacing any digit already there);
  // Backspace clears this box and every box after it (or the previous box if this one is empty);
  // arrow keys move between boxes.
  // The code is one string filled left to right, so it can't have a gap in the middle: clearing only
  // box 2 of "123456" would slide the later digits left ("13456"). Clearing from box 2 on ("1") keeps
  // every digit that stays in its own box.
  const handleKeyDown = (index, event) => {
    if (/^\d$/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); // we set the digit ourselves, so the browser doesn't also type it
      enterDigit(index, event.key);
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      const code = valueRef.current;
      if (code[index]) {
        emit(code.slice(0, index));
      } else if (index > 0) {
        emit(code.slice(0, index - 1));
        refs.current[index - 1]?.focus();
      }
    } else if (event.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
    else if (event.key === 'ArrowRight' && index < length - 1) refs.current[index + 1]?.focus();
  };

  // Red boxes for a wrong code, green for correct, grey otherwise
  const border = state === 'error' ? tokens.red : state === 'success' ? tokens.green : tokens.borderInput;
  const ring = state === 'error' ? '0 0 0 3px rgba(239, 68, 68, 0.15)' : state === 'success' ? '0 0 0 3px rgba(16, 185, 129, 0.18)' : 'none';

  return (
    <Box
      role="group"
      aria-label="Verification code"
      onAnimationEnd={onShakeEnd}
      sx={{ display: 'grid', gridTemplateColumns: `repeat(${length}, 1fr)`, gap: { xs: 0.75, sm: 1.25 }, ...shakeSx(shake) }}
    >
      {digits.map((digit, index) => (
        <Box
          key={index}
          component="input"
          ref={(el) => {
            refs.current[index] = el;
          }}
          value={digit}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          aria-label={`Digit ${index + 1}`}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onFocus={(e) => {
            // Codes fill left to right: focusing past the first empty box jumps back to it.
            // Uses valueRef (not `value`) so the box we just moved to after typing isn't treated as "past" it.
            const filled = valueRef.current.length;
            if (index > filled && refs.current[filled]) refs.current[filled].focus();
            else e.target.select();
          }}
          sx={{
            width: '100%',
            minWidth: 0,
            height: { xs: 50, sm: 56 },
            textAlign: 'center',
            fontSize: 22,
            fontWeight: 700,
            color: tokens.textPrimary,
            backgroundColor: disabled ? tokens.surfaceSubtle : '#fff',
            border: `1.5px solid ${digit && state === 'idle' ? tokens.headerBg : border}`,
            borderRadius: 1.5,
            outline: 'none',
            boxShadow: ring,
            transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
            '&:focus': { borderColor: state === 'idle' ? tokens.headerBg : border, boxShadow: state === 'idle' ? '0 0 0 3px rgba(15, 23, 42, 0.12)' : ring }
          }}
        />
      ))}
    </Box>
  );
}
