import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import { DateField, EndTimeField, OCCASIONS, RULES, TimeField, calendarApi, formatDateLong, formatEventTime, shiftEndTime, validateGuests } from '@tm/shared';
import { readIntent, saveIntent } from '../lib/booking.js';
import { site } from '../theme/siteTheme.js';
import { siteFieldSx, siteLabelSx } from './Marketing.jsx';

/**
 * Floating white availability card under the hero (1a). Checks the date against blocked
 * days and capacity, and the start and end time against other events that day (an event runs 2 to 6
 * hours), then saves the picks so they carry into the reservation. A blocked date shows the reason,
 * with our note when there is one.
 */
export default function BookingBar({ onAvailable }) {
  // Pre-fill with anything the visitor picked earlier
  const saved = readIntent() || {};
  const [date, setDate] = useState(saved.date || '');
  const [startTime, setStartTime] = useState(saved.startTime || '');
  const [endTime, setEndTime] = useState(saved.endTime || '');
  const [occasion, setOccasion] = useState(saved.occasion || '');
  const [guests, setGuests] = useState(saved.guests ? String(saved.guests) : '');
  const [errors, setErrors] = useState({});
  const [checking, setChecking] = useState(false); // true while checking the date
  const [result, setResult] = useState(null); // availability answer shown under the bar, or { failed, message } when the check could not run

  // Guest count is typed only (no up/down arrows): digits only, and never above the largest count the business serves
  const updateGuests = (raw) => {
    const digits = raw.replace(/\D/g, '');
    if (digits && Number(digits) > RULES.maxGuests) return; // typing past the cap is ignored
    setGuests(digits);
    setErrors((er) => ({ ...er, guests: '' }));
  };

  // Validate the five fields, then ask the calendar whether the date and the start-to-end time are free.
  // The check itself can fail (no connection, too many requests): its message is shown instead.
  const submit = async (event) => {
    event.preventDefault();
    const next = {};
    if (!date) next.date = 'Choose your event date.';
    if (!startTime) next.startTime = 'Choose a start time.';
    if (!endTime) next.endTime = 'Choose an end time.';
    if (!occasion) next.occasion = 'Choose the occasion.';
    const guestError = validateGuests(guests, RULES.minGuests, RULES.maxGuests);
    if (guestError) next.guests = guestError;
    setErrors(next);
    setResult(null);
    if (Object.keys(next).length) return;

    setChecking(true);
    try {
      const availability = await calendarApi.checkAvailability(date, startTime, endTime);
      setResult(availability);
      // Date and time are open: remember the picks for the reservation form and let the page react (e.g. scroll to packages)
      if (availability.available) {
        saveIntent({ date, startTime, endTime, occasion, guests: Number(guests) });
        if (onAvailable) onAvailable();
      }
    } catch (e) {
      setResult({ failed: true, message: e.message || 'Could not check this date. Please try again.' });
    } finally {
      setChecking(false);
    }
  };

  return (
    <Paper elevation={0} sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 3, backgroundColor: site.card, boxShadow: site.shadowPanel }}>
      {/* Wide screens (lg): two rows of three (date, start, end / occasion, guests, button); the start time
          holds three dropdowns, so its column is a little wider. Below lg the fields sit two per row. */}
      <Box component="form" noValidate onSubmit={submit} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1.1fr 1.15fr 1fr' }, gap: 2, alignItems: 'start' }}>
        {/* Own label (same style as the other three fields) above the shared date picker */}
        <Box>
          <Typography component="label" htmlFor="bar-date" sx={siteLabelSx}>
            Event date
          </Typography>
          <DateField id="bar-date" value={date} onChange={(v) => { setDate(v); setErrors((e) => ({ ...e, date: '' })); setResult(null); }} error={errors.date} />
        </Box>

        {/* Start time: the same hour : minute : AM/PM picker as the reservation form (30-minute steps only);
            checked against other events booked that day */}
        <Box>
          <Typography component="label" htmlFor="bar-time-hour" sx={siteLabelSx}>
            Start time
          </Typography>
          <TimeField
            id="bar-time"
            value={startTime}
            onChange={(v) => { setStartTime(v); if (endTime) setEndTime(shiftEndTime(startTime, endTime, v)); setErrors((er) => ({ ...er, startTime: '' })); setResult(null); }}
            min={RULES.earliestStart}
            max={RULES.latestStart}
            step={30}
            error={errors.startTime}
            sx={siteFieldSx}
          />
        </Box>

        {/* End time: the same hour : minute : AM/PM picker, offering only 2 to 6 hours after the start;
            the line under it says how long the event runs, and "next day" past midnight */}
        <Box>
          <Typography component="label" htmlFor="bar-end-hour" sx={siteLabelSx}>
            End time
          </Typography>
          <EndTimeField
            id="bar-end"
            label=""
            startTime={startTime}
            value={endTime}
            onChange={(v) => { setEndTime(v); setErrors((er) => ({ ...er, endTime: '' })); setResult(null); }}
            error={errors.endTime}
            sx={siteFieldSx}
          />
        </Box>

        <Box>
          <Typography component="label" htmlFor="bar-occasion" sx={siteLabelSx}>
            Occasion
          </Typography>
          <TextField
            id="bar-occasion"
            select
            fullWidth
            size="small"
            value={occasion}
            onChange={(e) => { setOccasion(e.target.value); setErrors((er) => ({ ...er, occasion: '' })); }}
            SelectProps={{ displayEmpty: true }}
            error={Boolean(errors.occasion)}
            helperText={errors.occasion}
            sx={siteFieldSx}
          >
            <MenuItem value="" disabled>
              Select an occasion
            </MenuItem>
            {OCCASIONS.map((o) => (
              <MenuItem key={o} value={o}>
                {o}
              </MenuItem>
            ))}
          </TextField>
        </Box>

        <Box>
          <Typography component="label" htmlFor="bar-guests" sx={siteLabelSx}>
            Guest count
          </Typography>
          <TextField
            id="bar-guests"
            fullWidth
            size="small"
            placeholder="e.g. 150"
            value={guests}
            onChange={(e) => updateGuests(e.target.value)}
            inputProps={{ inputMode: 'numeric', maxLength: String(RULES.maxGuests).length }}
            error={Boolean(errors.guests)}
            helperText={errors.guests}
            sx={siteFieldSx}
          />
        </Box>

        <Box sx={{ pt: { xs: 0, lg: 2.9 }, gridColumn: { sm: '1 / -1', lg: 'auto' } }}>
          <Button type="submit" variant="contained" disabled={checking} fullWidth sx={{ height: 40, px: 3, borderRadius: 999, whiteSpace: 'nowrap' }}>
            {checking ? <CircularProgress size={18} sx={{ color: 'inherit' }} /> : 'Check availability'}
          </Button>
        </Box>
      </Box>

      {/* Green "open" or red "not available" message that slides in after checking.
          Red has three cases: the whole date is unavailable, only the chosen time is taken, or the check itself failed. */}
      <Collapse in={Boolean(result)} unmountOnExit>
        {result && (
          <Box role="status" sx={{ mt: 2.5, px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: 1.5, backgroundColor: result.available ? '#ecfdf5' : '#fef2f2', border: `1px solid ${result.available ? '#a7f3d0' : '#fecaca'}` }}>
            {result.available ? <CheckCircleOutlineRoundedIcon sx={{ color: '#059669' }} /> : result.failed ? <ErrorOutlineRoundedIcon sx={{ color: '#dc2626' }} /> : <EventBusyOutlinedIcon sx={{ color: '#dc2626' }} />}
            <Typography sx={{ fontSize: 13.5, color: result.available ? '#065f46' : '#991b1b' }}>
              {result.available ? (
                <>
                  <b>{formatDateLong(result.date)}</b>, <b>{formatEventTime(result)}</b>, is open. Pick a package below to reserve it.
                </>
              ) : result.failed ? (
                result.message
              ) : result.timeConflict ? (
                <>
                  <b>{formatEventTime(result)}</b> on <b>{formatDateLong(result.date)}</b> is not available ({result.reason.toLowerCase()}). Please try another time.
                </>
              ) : (
                <>
                  <b>{formatDateLong(result.date)}</b> is not available ({result.reason.toLowerCase()}).{result.note ? ` Note from us: ${result.note}` : ''} Please try another date.
                </>
              )}
            </Typography>
          </Box>
        )}
      </Collapse>
    </Paper>
  );
}
