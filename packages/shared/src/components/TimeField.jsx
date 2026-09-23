import { Fragment, useMemo } from 'react';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { tokens } from '../theme/tokens.js';
import { formatTime } from '../utils/format.js';
import { FieldLabel } from './FormField.jsx';

const pad = (n) => String(n).padStart(2, '0');
// Hour dropdown entries in counting order: 01, 02 … 12
const ALL_HOURS = Array.from({ length: 12 }, (_, i) => pad(i + 1));
const toMinutes = (clock) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

/** Every pickable time between min and max, in order, as { value: "HH:MM", hour, minute, meridiem }. */
function buildSlots(min, max, step) {
  const slots = [];
  for (let mins = toMinutes(min); mins <= toMinutes(max); mins += step) {
    const hour24 = Math.floor(mins / 60);
    slots.push({
      value: `${pad(hour24)}:${pad(mins % 60)}`,
      hour: pad(hour24 % 12 || 12),
      minute: pad(mins % 60),
      meridiem: hour24 < 12 ? 'AM' : 'PM'
    });
  }
  return slots;
}

/** Distinct values of one slot part, kept in chronological order. */
const uniq = (slots, part) => [...new Set(slots.map((s) => s[part]))];

/**
 * Time input built from three dropdowns (hour, minute, AM/PM) so nothing has to be
 * typed. `value` and `onChange` use 24-hour "HH:MM"; only times from `min` to `max`
 * every `step` minutes can be picked, so an out-of-hours time cannot be entered.
 * When min/max limit the day, the allowed range is shown under the field (unless there is an error or hint).
 */
export function TimeField({ id, label, required, optional, error, hint, value, onChange, min = '00:00', max = '23:30', step = 30, disabled = false, sx }) {
  const slots = useMemo(() => buildSlots(min, max, step), [min, max, step]);

  // The slot currently selected; parts are blank until the value matches a pickable time
  const current = slots.find((s) => s.value === value);
  const hour = current ? current.hour : '';
  const minute = current ? current.minute : '';
  const meridiem = current ? current.meridiem : '';

  // The hour and minute lists always show every option (hours 01 … 12, minutes every `step`) so none
  // looks missing; options outside min–max for the chosen AM/PM and hour are greyed out
  // (e.g. 12 AM to 5 AM before a 6 AM start).
  // While a part is still blank the next one lists the first option's times, so the field never gets stuck.
  const meridiems = uniq(slots, 'meridiem');
  const openHours = uniq(slots.filter((s) => s.meridiem === (meridiem || meridiems[0])), 'hour');
  const hours = ALL_HOURS.map((h) => ({ value: h, disabled: !openHours.includes(h) }));
  const openMinutes = uniq(slots.filter((s) => s.meridiem === (meridiem || meridiems[0]) && s.hour === (hour || openHours[0])), 'minute');
  const minutes = Array.from({ length: Math.ceil(60 / step) }, (_, i) => pad(i * step)).map((m) => ({ value: m, disabled: !openMinutes.includes(m) }));
  // Shown under the field when there is no error or hint, e.g. "Available from 6:00 am to 11:30 pm"
  const rangeHint = min !== '00:00' || max !== '23:30' ? `Available from ${formatTime(min)} to ${formatTime(max)}` : '';

  // Change one part and keep the rest; if that combination isn't pickable, fall back to the closest slot
  const pick = (patch) => {
    const want = { hour, minute, meridiem, ...patch };
    const match =
      slots.find((s) => s.meridiem === want.meridiem && s.hour === want.hour && s.minute === want.minute) ||
      slots.find((s) => s.meridiem === want.meridiem && s.hour === want.hour) ||
      slots.find((s) => s.meridiem === want.meridiem) ||
      slots[0];
    if (match) onChange(match.value);
  };

  const parts = [
    { key: 'hour', label: 'Hour', selected: hour, options: hours },
    { key: 'minute', label: 'Minutes', selected: minute, options: minutes },
    { key: 'meridiem', label: 'AM or PM', selected: meridiem, options: meridiems }
  ];

  return (
    <Box sx={{ minWidth: 0, ...sx }}>
      {label && (
        <FieldLabel htmlFor={`${id}-hour`} required={required} optional={optional}>
          {label}
        </FieldLabel>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {parts.map((part, i) => (
          <Fragment key={part.key}>
            {/* ":" between the hour and minute dropdowns, like a clock */}
            {i === 1 && <Box component="span" sx={{ fontSize: 15, fontWeight: 700, color: tokens.textMuted }}>:</Box>}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <TextField
                id={`${id}-${part.key}`}
                select
                fullWidth
                size="small"
                disabled={disabled}
                error={Boolean(error)}
                value={part.selected}
                onChange={(e) => pick({ [part.key]: e.target.value })}
                SelectProps={{ displayEmpty: true, SelectDisplayProps: { 'aria-label': `${label || 'Time'} — ${part.label}` } }}
              >
                {/* Placeholder row for a value that isn't a pickable time yet */}
                {!part.selected && (
                  <MenuItem value="" disabled>
                    <Box component="span" sx={{ color: tokens.placeholder }}>
                      {part.key === 'meridiem' ? 'AM' : '--'}
                    </Box>
                  </MenuItem>
                )}
                {/* Options are plain strings, or { value, disabled } for the hour and minute lists */}
                {part.options.map((option) => {
                  const { value: optionValue, disabled: off } = typeof option === 'string' ? { value: option, disabled: false } : option;
                  return (
                    <MenuItem key={optionValue} value={optionValue} disabled={off}>
                      {optionValue}
                    </MenuItem>
                  );
                })}
              </TextField>
            </Box>
          </Fragment>
        ))}
      </Box>
      {(error || hint || rangeHint) && (
        <Typography sx={{ mt: 0.75, fontSize: 12, color: error ? tokens.redPress : tokens.textMuted }}>{error || hint || rangeHint}</Typography>
      )}
    </Box>
  );
}
