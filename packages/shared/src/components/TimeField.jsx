import { Fragment, useMemo } from 'react';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { endTimeOptions } from '../domain/availability.js';
import { RULES } from '../services/config.js';
import { tokens } from '../theme/tokens.js';
import { formatTime } from '../utils/format.js';
import { FieldLabel } from './FormField.jsx';

const pad = (n) => String(n).padStart(2, '0');
// Hour dropdown entries in counting order: 01, 02 … 12
const ALL_HOURS = Array.from({ length: 12 }, (_, i) => pad(i + 1));
const toMinutes = (clock) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

/** One pickable time as the three dropdowns show it: "18:30" -> { value: '18:30', hour: '06', minute: '30', meridiem: 'PM' }. */
const toSlot = (value) => {
  const hour24 = Number(value.slice(0, 2));
  return { value, hour: pad(hour24 % 12 || 12), minute: value.slice(3, 5), meridiem: hour24 < 12 ? 'AM' : 'PM' };
};

/** Every pickable time between min and max, in order, as { value: "HH:MM", hour, minute, meridiem }. */
function buildSlots(min, max, step) {
  const slots = [];
  for (let mins = toMinutes(min); mins <= toMinutes(max); mins += step) {
    slots.push(toSlot(`${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`));
  }
  return slots;
}

/** Distinct values of one slot part, kept in chronological order. */
const uniq = (slots, part) => [...new Set(slots.map((s) => s[part]))];

/**
 * The hour : minute : AM/PM dropdowns behind TimeField and EndTimeField. `slots` are the pickable times in
 * order ({ value: "HH:MM", hour, minute, meridiem }); `value` and `onChange` use 24-hour "HH:MM", and only
 * a slot can be picked. The hour and minute lists always show every option (hours 01 … 12, minutes every
 * `step`) so none looks missing; the ones that are not a slot are greyed out.
 *
 * `hourPicksMeridiem` is for a short list of times that crosses noon or midnight (the end-time list): each
 * hour then belongs to one AM/PM only, so every listed hour is offered whatever AM/PM shows, and picking
 * one switches the AM/PM to it (12 after 8 am to 11:30 am picks 12:00 pm). Without it, the hours offered
 * are those of the AM/PM shown (e.g. 12 AM to 5 AM greyed out before a 6 AM start).
 * `below` is the line under the field (an error is shown in red).
 */
function ClockSelect({ id, label, required, optional, error, below, slots, step, value, onChange, disabled, hourPicksMeridiem, sx }) {
  // The slot currently selected; parts are blank until the value matches a pickable time
  const current = slots.find((s) => s.value === value);
  const hour = current ? current.hour : '';
  const minute = current ? current.minute : '';
  const meridiem = current ? current.meridiem : '';

  // While a part is still blank the next one lists the first option's times, so the field never gets stuck
  const meridiems = uniq(slots, 'meridiem');
  const shownMeridiem = meridiem || meridiems[0];
  const openHours = uniq(hourPicksMeridiem ? slots : slots.filter((s) => s.meridiem === shownMeridiem), 'hour');
  const hours = ALL_HOURS.map((h) => ({ value: h, disabled: !openHours.includes(h) }));
  const shownHour = hour || openHours[0];
  const openMinutes = uniq(slots.filter((s) => (hourPicksMeridiem || s.meridiem === shownMeridiem) && s.hour === shownHour), 'minute');
  const minutes = Array.from({ length: Math.ceil(60 / step) }, (_, i) => pad(i * step)).map((m) => ({ value: m, disabled: !openMinutes.includes(m) }));

  // Change one part and keep the rest; if that combination isn't pickable, fall back to the closest slot.
  // With hourPicksMeridiem a new hour is looked up in either AM or PM, so its own AM/PM comes with it.
  const pick = (patch) => {
    const want = { hour, minute, meridiem, ...patch };
    const sameHalf = (s) => (hourPicksMeridiem && patch.hour) || s.meridiem === want.meridiem;
    const match =
      slots.find((s) => sameHalf(s) && s.hour === want.hour && s.minute === want.minute) ||
      slots.find((s) => sameHalf(s) && s.hour === want.hour) ||
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
      {(error || below) && <Typography sx={{ mt: 0.75, fontSize: 12, color: error ? tokens.redPress : tokens.textMuted }}>{error || below}</Typography>}
    </Box>
  );
}

/**
 * Time input built from three dropdowns (hour, minute, AM/PM) so nothing has to be
 * typed. `value` and `onChange` use 24-hour "HH:MM"; only times from `min` to `max`
 * every `step` minutes can be picked, so an out-of-hours time cannot be entered.
 * When min/max limit the day, the allowed range is shown under the field (unless there is an error or hint).
 */
export function TimeField({ id, label, required, optional, error, hint, value, onChange, min = '00:00', max = '23:30', step = 30, disabled = false, sx }) {
  const slots = useMemo(() => buildSlots(min, max, step), [min, max, step]);
  // Shown under the field when there is no error or hint, e.g. "Available from 6:00 am to 11:30 pm"
  const rangeHint = min !== '00:00' || max !== '23:30' ? `Available from ${formatTime(min)} to ${formatTime(max)}` : '';
  return <ClockSelect id={id} label={label} required={required} optional={optional} error={error} below={hint || rangeHint} slots={slots} step={step} value={value} onChange={onChange} disabled={disabled} sx={sx} />;
}

// 4.5 -> "4½ hours", 2 -> "2 hours"
const hoursText = (hours) => `${Math.floor(hours)}${hours % 1 ? '½' : ''} hours`;

// "12:00 am" -> "12:00 am (next day)" for an end time after midnight
const endText = (option) => `${formatTime(option.value)}${option.nextDay ? ' (next day)' : ''}`;

/**
 * End-time picker that goes with a start time: the same hour : minute : AM/PM dropdowns as TimeField (the
 * owner's request, 2026-10-09), offering only the times RULES.minEventHours to RULES.maxEventHours after
 * `startTime` (2 to 6 hours, every 30 minutes); the rest are greyed out. A 6:00 am start offers 8:00 am to
 * 12:00 pm, and a 10:00 pm start 12:00 am to 4:00 am the next day. Picking an hour also picks its AM/PM.
 * `value` and `onChange` use 24-hour "HH:MM"; without a start time the field is disabled and asks for one.
 *
 * The line under it says what was picked, e.g. "6:00 am – 12:00 pm · 6 hours" or "10:00 pm – 2:00 am
 * (next day) · 4 hours"; before a pick it shows `hint` (or the 2-to-6-hours rule) and the range to choose
 * from. A saved end time that no longer fits the start (e.g. an old booking) is named there instead of
 * showing blank dropdowns without a word.
 */
export function EndTimeField({ id, label = 'End time', required, error, hint, startTime, value, onChange, disabled = false, sx }) {
  const options = useMemo(() => endTimeOptions(startTime), [startTime]);
  const slots = useMemo(() => options.map((o) => toSlot(o.value)), [options]);
  const picked = options.find((o) => o.value === value);
  const first = options[0];
  const last = options[options.length - 1];

  let below;
  if (!startTime) below = 'Choose the start time first';
  else if (picked) below = `${formatTime(startTime)} – ${endText(picked)} · ${hoursText(picked.hours)}`;
  else if (value) below = `Saved end time ${formatTime(value)} no longer fits the start time. Choose ${endText(first)} to ${endText(last)}.`;
  else below = `${hint || `Events run ${RULES.minEventHours} to ${RULES.maxEventHours} hours.`} Choose ${endText(first)} to ${endText(last)}.`;

  return (
    <ClockSelect
      id={id}
      label={label}
      required={required}
      error={error}
      below={below}
      slots={slots}
      step={30}
      value={value || ''}
      onChange={onChange}
      disabled={disabled || !startTime}
      hourPicksMeridiem
      sx={sx}
    />
  );
}
