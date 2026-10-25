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
import {
  DateField,
  EndTimeField,
  OCCASIONS,
  RULES,
  TimeField,
  calendarApi,
  catalogApi,
  initialEndTime,
  useResource,
  formatDateLong,
  formatEventTime,
  shiftEndTime,
  validateGuests
} from '@tm/shared';
import { readIntent, saveIntent } from '../lib/booking.js';
import { site } from '../theme/siteTheme.js';
import { siteFieldSx, siteLabelSx } from './Marketing.jsx';

export default function BookingBar({ onAvailable }) {
  const saved = readIntent() || {};
  const [date, setDate] = useState(saved.date || '');
  const [startTime, setStartTime] = useState(saved.startTime || '');
  const [endTime, setEndTime] = useState(saved.endTime || initialEndTime(saved.startTime));
  const durationFee = useResource(() => catalogApi.getSixHourFee(), []);
  const [occasion, setOccasion] = useState(saved.occasion || '');
  const [guests, setGuests] = useState(saved.guests ? String(saved.guests) : '');
  const [errors, setErrors] = useState({});
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);

  const updateGuests = (raw) => {
    const digits = raw.replace(/\D/g, '');
    if (digits && Number(digits) > RULES.maxGuests) return;
    setGuests(digits);
    setErrors((er) => ({ ...er, guests: '' }));
  };

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
    <Paper
      elevation={0}
      sx={{
        p: { xs: 1.5, sm: 2.5, md: 3.5 },
        maxWidth: 1120,
        mx: 'auto',
        minWidth: 0,
        containerType: 'inline-size',
        containerName: 'availability-form',
        borderRadius: 3,
        backgroundColor: site.card,
        boxShadow: site.shadowPanel
      }}
    >
      <Box
        component="form"
        autoComplete="off"
        noValidate
        onSubmit={submit}
        sx={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          '@container availability-form (min-width: 720px)': {
            gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.1fr)'
          },
          '& > *': { minWidth: 0 },
          gap: { xs: 4, md: 5 },
          alignItems: 'start'
        }}
      >
        <Box>
          <Typography id="bar-date-label" sx={siteLabelSx}>
            Event date
          </Typography>
          <Box role="group" aria-labelledby="bar-date-label">
            <DateField
              inline
              id="bar-date"
              value={date}
              onChange={(v) => {
                setDate(v);
                setErrors((e) => ({ ...e, date: '' }));
                setResult(null);
              }}
              error={errors.date}
            />
          </Box>
        </Box>

        <Box sx={{ containerType: 'inline-size', containerName: 'booking-details' }}>
          <Typography
            component="h2"
            sx={{
              mb: 0.75,
              fontFamily: site.fontSerif,
              fontSize: { xs: 24, sm: 28 },
              fontWeight: 600,
              color: site.ink
            }}
          >
            Plan your event
          </Typography>
          <Typography sx={{ mb: 3, fontSize: 13, lineHeight: 1.7, color: site.inkSoft }}>
            Pick a date on the calendar, then add your event details to check availability.
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr)',
              '@container booking-details (min-width: 440px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
              '& > *': { minWidth: 0 },
              gap: 3
            }}
          >
            <Box>
              <Typography component="label" htmlFor="bar-time-hour" sx={siteLabelSx}>
                Start time
              </Typography>
              <TimeField
                id="bar-time"
                value={startTime}
                onChange={(v) => {
                  setStartTime(v);
                  setEndTime(endTime ? shiftEndTime(startTime, endTime, v) : initialEndTime(v));
                  setErrors((er) => ({ ...er, startTime: '' }));
                  setResult(null);
                }}
                min={RULES.earliestStart}
                max={RULES.latestStart}
                step={30}
                error={errors.startTime}
                sx={siteFieldSx}
              />
            </Box>

            <Box>
              <Typography component="label" htmlFor="bar-end-hour" sx={siteLabelSx}>
                End time
              </Typography>
              <EndTimeField
                id="bar-end"
                sixHourFee={durationFee.data?.sixHourFee ?? catalogApi.sixHourFee()}
                label=""
                startTime={startTime}
                value={endTime}
                onChange={(v) => {
                  setEndTime(v);
                  setErrors((er) => ({ ...er, endTime: '' }));
                  setResult(null);
                }}
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
                onChange={(e) => {
                  setOccasion(e.target.value);
                  setErrors((er) => ({ ...er, occasion: '' }));
                }}
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
                autoComplete="off"
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

            <Box sx={{ gridColumn: '1 / -1', pt: 0.5 }}>
              <Button
                type="submit"
                variant="contained"
                disabled={checking}
                fullWidth
                sx={{ height: 46, px: 3, borderRadius: 999, whiteSpace: 'nowrap' }}
              >
                {checking ? <CircularProgress size={18} sx={{ color: 'inherit' }} /> : 'Check availability'}
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>

      <Collapse in={Boolean(result)} unmountOnExit>
        {result && (
          <Box
            role="status"
            sx={{
              mt: 2.5,
              px: 2,
              py: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              borderRadius: 1.5,
              backgroundColor: result.available ? '#ecfdf5' : '#fef2f2',
              border: `1px solid ${result.available ? '#a7f3d0' : '#fecaca'}`
            }}
          >
            {result.available ? (
              <CheckCircleOutlineRoundedIcon sx={{ color: '#059669' }} />
            ) : result.failed ? (
              <ErrorOutlineRoundedIcon sx={{ color: '#dc2626' }} />
            ) : (
              <EventBusyOutlinedIcon sx={{ color: '#dc2626' }} />
            )}
            <Typography sx={{ fontSize: 13.5, color: result.available ? '#065f46' : '#991b1b' }}>
              {result.available ? (
                <>
                  <b>{formatDateLong(result.date)}</b>, <b>{formatEventTime(result)}</b>, is open. Pick a package above
                  to reserve it.
                </>
              ) : result.failed ? (
                result.message
              ) : result.timeConflict ? (
                <>
                  <b>{formatEventTime(result)}</b> on <b>{formatDateLong(result.date)}</b> is not available (
                  {result.reason.toLowerCase()}). Please try another time.
                </>
              ) : (
                <>
                  <b>{formatDateLong(result.date)}</b> is not available ({result.reason.toLowerCase()}).
                  {result.note ? ` Note from us: ${result.note}` : ''} Please try another date.
                </>
              )}
            </Typography>
          </Box>
        )}
      </Collapse>
    </Paper>
  );
}
