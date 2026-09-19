import { useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Collapse from '@mui/material/Collapse';
import Popover from '@mui/material/Popover';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { keyframes } from '@mui/material/styles';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import { availabilitySnapshot, dateUnavailableReason, daySchedule } from '../services/calendarService.js';
import { RULES } from '../services/config.js';
import { useStoreVersion } from '../hooks/useResource.js';
import { tokens } from '../theme/tokens.js';
import { formatDateLong, formatTime, parseISODate, todayISO } from '../utils/format.js';
import { FieldLabel } from './FormField.jsx';
import { MonthCalendar } from './MonthCalendar.jsx';
import { LightSurface } from './Surface.jsx';

// { from: '06:00', to: '12:00' } -> "6:00 am – 12:00 pm" (a single time when from and to match)
const timeRange = ({ from, to }) => (from === to ? formatTime(from) : `${formatTime(from)} – ${formatTime(to)}`);

// Small uppercase heading used inside the day schedule
const scheduleHeadingSx = { mt: 1, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: tokens.textMuted };

// Schedule content fades in (with a slight rise) each time a different date is shown
const scheduleFadeIn = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
`;

/**
 * Date input backed by the availability calendar: blocked, fully booked and
 * too-soon dates are greyed out and cannot be picked; days that already have an
 * event get a gold dot, and the chosen day shows its booked times and open start times.
 *   default: an input that opens the calendar in a popup; tapping a date shows its
 *            schedule and "Choose this date" confirms it.
 *   inline:  the calendar is always on the page (no "Select a date" input); tapping a
 *            date picks it straight away and shows its schedule underneath. Light surfaces only.
 * `mode="any"` lets the admin pick any date from today on (blocking dates,
 * rescheduling); the popup closes on the first tap and no schedule is shown.
 * The schedule slides open and closed, and its content fades in when the date changes
 * (both off when the device asks for reduced motion).
 */
export function DateField({ id, label, value, onChange, error, hint, required, mode = 'booking', placeholder = 'Select a date', dark = false, disabled = false, inline = false }) {
  const [anchor, setAnchor] = useState(null); // element the calendar popup opens under (null = closed)
  const [preview, setPreview] = useState(''); // date tapped in the popup whose booked times are shown (booking mode)
  const version = useStoreVersion(); // changes whenever stored data changes
  // Blocked/booked dates and event times; refreshed when data changes or the popup opens
  const snapshot = useMemo(() => availabilitySnapshot(), [version, anchor]); // eslint-disable-line react-hooks/exhaustive-deps
  const booking = mode === 'booking';

  // Month shown in the calendar: the selected date's month, or this month
  const initial = parseISODate(value || todayISO());
  const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() });

  // Open the popup on the selected (or current) month, previewing the selected date if there is one
  const open = (event) => {
    const base = parseISODate(value || todayISO());
    setView({ year: base.getFullYear(), month: base.getMonth() });
    setPreview(value || '');
    setAnchor(event.currentTarget);
  };

  // Save the date and close the popup
  const choose = (iso) => {
    onChange(iso);
    setAnchor(null);
  };

  // Tapping a day: inline saves it; the booking popup previews it; the admin popup saves and closes
  const tapDay = (iso) => {
    if (inline) onChange(iso);
    else if (booking) setPreview(iso);
    else choose(iso);
  };

  // Decide if each day can be picked. Admin mode ('any') only blocks past dates.
  // Open booking days with events get a dot and say how many events are booked.
  const getDay = (iso) => {
    if (!booking) {
      return iso < todayISO() ? { tone: 'disabled', label: 'Past date' } : { tone: 'open' };
    }
    const reason = dateUnavailableReason(iso, snapshot);
    if (reason) return { tone: 'disabled', label: reason };
    const count = snapshot.booked[iso] || 0;
    return count ? { tone: 'open', label: `Available · ${count} ${count === 1 ? 'event' : 'events'} already booked`, dots: count } : { tone: 'open', label: 'Available' };
  };

  // Date whose schedule is shown: the picked date inline, the tapped date in the popup
  const shown = inline ? value : preview;
  const schedule = booking && shown && !dateUnavailableReason(shown, snapshot) ? daySchedule(shown, snapshot) : null;
  // Popup only: booked times on the chosen date, repeated under the input once the popup closes
  const valueBooked = booking && !inline && value ? daySchedule(value, snapshot).booked : [];

  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)'); // device setting to cut animations
  // Last schedule shown, kept while the panel slides closed so its content doesn't vanish mid-animation
  const lastPanel = useRef({ date: '', schedule: null });
  if (schedule) lastPanel.current = { date: shown, schedule };
  const panel = lastPanel.current;

  const errorColor = dark ? '#fca5a5' : tokens.redPress;
  const mutedColor = dark ? tokens.textOnDarkMuted : tokens.textMuted;

  // Calendar, the shown date's schedule and the legend; used in the popup and inline
  const calendarBody = (
    <>
      <MonthCalendar size="sm" year={view.year} month={view.month} onMonthChange={(year, month) => setView({ year, month })} getDay={getDay} selected={inline || !booking ? value : preview} onSelect={tapDay} />

      {/* Schedule of the shown date: booked times, start times still open, then (popup only) the confirm button.
          Slides open/closed; the key replays the fade-in whenever a different date is shown. */}
      <Collapse in={Boolean(schedule)} timeout={reduceMotion ? 0 : 220} unmountOnExit>
        {panel.schedule && (
          <Box key={panel.date} sx={{ mt: 1.5, pt: 1.5, borderTop: `1px solid ${tokens.cardLightBorder}`, animation: reduceMotion ? 'none' : `${scheduleFadeIn} 200ms ease-out` }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: tokens.textPrimary }}>{formatDateLong(panel.date)}</Typography>
              {/* Inline optional fields can be emptied again */}
              {inline && !required && (
                <Button size="small" onClick={() => onChange('')} sx={{ minWidth: 0, px: 1, py: 0.25, fontSize: 12 }}>
                  Clear
                </Button>
              )}
            </Box>
            {panel.schedule.booked.length ? (
              <>
                <Typography sx={scheduleHeadingSx}>Already booked</Typography>
                <Box sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {panel.schedule.booked.map((slot, i) => (
                    <Box key={i} component="span" sx={{ px: 1, py: 0.25, borderRadius: 999, fontSize: 12, fontWeight: 600, color: '#b91c1c', backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                      {timeRange(slot)}
                    </Box>
                  ))}
                </Box>
                <Typography sx={scheduleHeadingSx}>You can start at</Typography>
                <Typography sx={{ mt: 0.25, fontSize: 12.5, fontWeight: 600, color: tokens.textPrimary }}>{panel.schedule.openStarts.map(timeRange).join(', ')}</Typography>
                <Typography sx={{ mt: 0.75, fontSize: 11.5, lineHeight: 1.5, color: tokens.textMuted }}>
                  We keep {RULES.eventBufferHours} hours free before and after each event for setup and travel.
                </Typography>
              </>
            ) : (
              <Typography sx={{ mt: 0.5, fontSize: 12.5, lineHeight: 1.5, color: tokens.textSecondary }}>
                No events booked yet. You can start any time from {formatTime(RULES.earliestStart)} to {formatTime(RULES.latestStart)}.
              </Typography>
            )}
            {!inline && (
              <Button fullWidth variant="contained" onClick={() => choose(preview)} sx={{ mt: 1.5 }}>
                Choose this date
              </Button>
            )}
          </Box>
        )}
      </Collapse>

      {booking && (
        <Typography sx={{ mt: 1.5, fontSize: 11.5, lineHeight: 1.5, color: tokens.textMuted }}>
          Tap a date to see the times already booked. A gold dot means that day has an event. Greyed-out dates are fully booked, blocked, or too soon to prepare for.
        </Typography>
      )}
    </>
  );

  // Inline: the calendar sits on the page inside a bordered box, no input and no popup
  if (inline) {
    return (
      <Box sx={{ minWidth: 0 }}>
        {label && (
          <FieldLabel htmlFor={id} required={required}>
            {label}
          </FieldLabel>
        )}
        <Box id={id} role="group" tabIndex={-1} aria-invalid={Boolean(error)} sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 1.5, backgroundColor: '#fff', border: `1px solid ${error ? errorColor : tokens.borderInput}`, outline: 'none', opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
          {calendarBody}
        </Box>
        {(error || hint) && <Typography sx={{ mt: 0.75, fontSize: 12, color: error ? errorColor : mutedColor }}>{error || hint}</Typography>}
      </Box>
    );
  }

  return (
    <Box sx={{ minWidth: 0 }}>
      {label &&
        (dark ? (
          <Typography component="label" htmlFor={id} sx={{ display: 'block', mb: 0.75, fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: tokens.textOnDarkMuted }}>
            {label}
          </Typography>
        ) : (
          <FieldLabel htmlFor={id} required={required}>
            {label}
          </FieldLabel>
        ))}
      {/* Looks like an input; clicking it opens the calendar popup */}
      <ButtonBase
        id={id}
        onClick={open}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-invalid={Boolean(error)}
        sx={{
          width: '100%',
          height: 40,
          px: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          borderRadius: 1.25,
          fontFamily: 'inherit',
          fontSize: 14,
          textAlign: 'left',
          color: value ? (dark ? tokens.textLight : tokens.textPrimary) : dark ? tokens.textOnDarkMuted : tokens.placeholder,
          backgroundColor: dark ? 'rgba(255, 255, 255, 0.04)' : '#fff',
          border: `1px solid ${error ? errorColor : dark ? 'rgba(197, 160, 89, 0.28)' : tokens.borderInput}`,
          '&:hover': { borderColor: dark ? 'rgba(197, 160, 89, 0.5)' : '#94a3b8' },
          '&.Mui-disabled': { backgroundColor: dark ? 'transparent' : tokens.surfaceSubtle, color: tokens.textMuted },
          '&:focus-visible': { outline: 'none', borderColor: dark ? tokens.gold : tokens.headerBg, boxShadow: dark ? 'none' : '0 0 0 3px rgba(15, 23, 42, 0.12)' }
        }}
      >
        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value ? formatDateLong(value) : placeholder}
        </Box>
        <CalendarMonthOutlinedIcon sx={{ fontSize: 19, color: mutedColor }} />
      </ButtonBase>
      {(error || hint) && <Typography sx={{ mt: 0.75, fontSize: 12, color: error ? errorColor : mutedColor }}>{error || hint}</Typography>}
      {/* Reminder of the times already taken on the chosen date, so the start time can avoid them */}
      {valueBooked.length > 0 && (
        <Typography sx={{ mt: 0.5, fontSize: 12, color: mutedColor }}>
          Already booked that day: {valueBooked.map(timeRange).join(', ')}
        </Typography>
      )}

      <LightSurface>
        <Popover
          open={Boolean(anchor)}
          anchorEl={anchor}
          onClose={() => setAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          slotProps={{ paper: { sx: { mt: 1, p: 2, width: 320, maxWidth: 'calc(100vw - 24px)', borderRadius: 2, border: `1px solid ${tokens.cardLightBorder}` } } }}
        >
          {calendarBody}
        </Popover>
      </LightSurface>
    </Box>
  );
}
