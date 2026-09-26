import { useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Collapse from '@mui/material/Collapse';
import Grow from '@mui/material/Grow';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import Typography from '@mui/material/Typography';
import FocusTrap from '@mui/material/Unstable_TrapFocus';
import useMediaQuery from '@mui/material/useMediaQuery';
import { keyframes } from '@mui/material/styles';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import { availabilitySnapshot, dateUnavailableReason, daySchedule } from '../services/facade/calendar.js';
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

// Where the popup sits: 8px under the input and never flipped above it (it would jump when the schedule
// opens and makes it taller), kept 12px inside the left and right edges of the screen. Defined once here
// because the popup rebuilds its positioning whenever this list changes.
const POPUP_MODIFIERS = [
  { name: 'offset', options: { offset: [0, 8] } },
  { name: 'flip', enabled: false },
  { name: 'preventOverflow', options: { padding: 12 } }
];

/**
 * Date input backed by the availability calendar: blocked, fully booked and
 * too-soon dates are greyed out and cannot be picked; days that already have an
 * event get a gold dot, and the chosen day shows its booked times and open start times.
 *   default: an input that opens the calendar in a popup; tapping a date shows its
 *            schedule and "Choose this date" confirms it. The popup is not modal: the page
 *            keeps scrolling while it is open (the popup moves with the input), and a tap
 *            outside it, Escape, or tapping the input again closes it.
 *   inline:  the calendar is always on the page (no "Select a date" input); tapping a
 *            date picks it straight away and shows its schedule underneath. Light surfaces only.
 * `mode="any"` lets the admin pick any date from today on (blocking dates,
 * rescheduling); the popup closes on the first tap and no schedule is shown.
 * `rental` is for an equipment rental: it takes no event slot, so only too-soon and blocked
 * dates are greyed out. The gold dots and the booked event times still show, the same as
 * every other customer calendar, but a rental has no start times to choose around them.
 * When the calendar runs on the API, the availability map arrives a moment after the page opens:
 * until then no booking day can be picked and the note under the calendar says "Loading available dates…".
 * The schedule slides open and closed, and its content fades in when the date changes
 * (both off when the device asks for reduced motion).
 */
export function DateField({ id, label, value, onChange, error, hint, required, mode = 'booking', placeholder = 'Select a date', dark = false, disabled = false, inline = false, rental = false }) {
  const [anchor, setAnchor] = useState(null); // element the calendar popup opens under (null = closed)
  const [inDialog, setInDialog] = useState(false); // true when the input sits inside a dialog, so the popup must show above it
  const [preview, setPreview] = useState(''); // date tapped in the popup whose booked times are shown (booking mode)
  const buttonRef = useRef(null); // the input-looking button, so the focus can go back to it
  const paperRef = useRef(null); // the popup card, which takes the focus when it opens
  const version = useStoreVersion(); // changes whenever the data changes (browser store or API)
  const booking = mode === 'booking';
  // Blocked/booked dates and event times (booking mode only: the admin's 'any' mode never reads them);
  // read again when data changes or the popup opens
  const snapshot = useMemo(() => (booking ? availabilitySnapshot() : null), [version, anchor, booking]); // eslint-disable-line react-hooks/exhaustive-deps
  // On the API, the map has not arrived yet: no day can be picked until it does (never true on the browser store)
  const loadingDates = booking && Boolean(snapshot.loading);

  // Month shown in the calendar: the selected date's month, or this month
  const initial = parseISODate(value || todayISO());
  const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() });

  // Open the popup on the selected (or current) month, previewing the selected date if there is one
  const open = (event) => {
    const base = parseISODate(value || todayISO());
    setView({ year: base.getFullYear(), month: base.getMonth() });
    setPreview(value || '');
    setInDialog(Boolean(event.currentTarget.closest('.MuiModal-root')));
    setAnchor(event.currentTarget);
  };

  // Close the popup. After Escape or "Choose this date" the focus goes back to the input;
  // after a tap outside it stays wherever the visitor tapped.
  const close = (returnFocus = false) => {
    setAnchor(null);
    if (returnFocus && buttonRef.current) buttonRef.current.focus();
  };

  // Save the date and close the popup
  const choose = (iso) => {
    onChange(iso);
    close(true);
  };

  // Tapping a day: inline saves it; the booking popup previews it; the admin popup saves and closes
  const tapDay = (iso) => {
    if (inline) onChange(iso);
    else if (booking) setPreview(iso);
    else choose(iso);
  };

  // Decide if each day can be picked. Admin mode ('any') only blocks past dates.
  // Open booking days with events get a dot and say how many events are booked (rentals too, so every
  // customer calendar marks the same days). While the map is loading, no booking day can be picked.
  const getDay = (iso) => {
    if (!booking) {
      return iso < todayISO() ? { tone: 'disabled', label: 'Past date' } : { tone: 'open' };
    }
    if (loadingDates) return { tone: 'disabled', label: 'Loading available dates…' };
    const reason = dateUnavailableReason(iso, snapshot, { rental });
    if (reason) return { tone: 'disabled', label: reason };
    const count = snapshot.booked[iso] || 0;
    return count ? { tone: 'open', label: `Available · ${count} ${count === 1 ? 'event' : 'events'} already booked`, dots: count } : { tone: 'open', label: 'Available' };
  };

  // Date whose schedule is shown: the picked date inline, the tapped date in the popup (none while the map is loading)
  const shown = inline ? value : preview;
  const schedule = booking && !loadingDates && shown && !dateUnavailableReason(shown, snapshot, { rental }) ? daySchedule(shown, snapshot) : null;
  // Popup only: booked times on the chosen date, repeated under the input once the popup closes
  const valueBooked = booking && !inline && value ? daySchedule(value, snapshot).booked : [];

  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)'); // device setting to cut animations
  // Last schedule shown, kept while the panel slides closed so its content doesn't vanish mid-animation
  const lastPanel = useRef({ date: '', schedule: null });
  if (schedule) lastPanel.current = { date: shown, schedule };
  const panel = lastPanel.current;
  // True when a new event could start at any time that day. False can also mean a late event the day
  // before or an early one the day after takes part of the day, even with no event on the day itself.
  const wholeDayOpen = Boolean(panel.schedule) && panel.schedule.openStarts.length === 1 && panel.schedule.openStarts[0].from === RULES.earliestStart && panel.schedule.openStarts[0].to === '23:59';

  const errorColor = dark ? tokens.dangerSoft : tokens.redPress;
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
            {/* Events already holding the date (same list on every customer calendar) */}
            {panel.schedule.booked.length > 0 && (
              <>
                <Typography sx={scheduleHeadingSx}>Already booked</Typography>
                <Box sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {panel.schedule.booked.map((slot, i) => (
                    <Box key={i} component="span" sx={{ px: 1, py: 0.25, borderRadius: 999, fontSize: 12, fontWeight: 600, color: '#b91c1c', backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                      {timeRange(slot)}
                    </Box>
                  ))}
                </Box>
              </>
            )}
            {rental ? (
              // A rental never waits for a free slot, so it has no start times to list
              <Typography sx={{ mt: 0.75, fontSize: 12.5, lineHeight: 1.5, color: tokens.textSecondary }}>
                {panel.schedule.booked.length ? 'A rental does not need a free event slot, so you can still pick up the items or have them delivered at any time that day.' : 'No events booked yet. You can pick up the items or have them delivered at any time that day.'}
              </Typography>
            ) : wholeDayOpen ? (
              <Typography sx={{ mt: 0.5, fontSize: 12.5, lineHeight: 1.5, color: tokens.textSecondary }}>
                No events booked yet. We cater 24 hours a day, so you can start at any time.
              </Typography>
            ) : (
              // Some start times are taken: by events on this date, or by a late/early event on the day next to it
              <>
                <Typography sx={scheduleHeadingSx}>You can start at</Typography>
                <Typography sx={{ mt: 0.25, fontSize: 12.5, fontWeight: 600, color: tokens.textPrimary }}>{panel.schedule.openStarts.map(timeRange).join(', ')}</Typography>
                <Typography sx={{ mt: 0.75, fontSize: 11.5, lineHeight: 1.5, color: tokens.textMuted }}>
                  {!panel.schedule.booked.length && 'An event late the day before or early the day after takes up part of this day. '}
                  We keep {RULES.eventBufferHours} hours before each event for setup and {RULES.eventBufferHours} hours after it for tear-down.
                </Typography>
              </>
            )}
            {!inline && (
              <Button fullWidth variant="contained" onClick={() => choose(preview)} sx={{ mt: 1.5 }}>
                Choose this date
              </Button>
            )}
          </Box>
        )}
      </Collapse>

      {/* A rental can still take a day that is full for events, so its greyed-out days are only blocked or too soon.
          While the map is loading (API only), this line says so instead. */}
      {booking && (
        <Typography role={loadingDates ? 'status' : undefined} sx={{ mt: 1.5, fontSize: 11.5, lineHeight: 1.5, color: tokens.textMuted }}>
          {loadingDates
            ? 'Loading available dates…'
            : rental
              ? 'Tap a date to see the times already booked. A gold dot means that day has an event. Greyed-out dates are blocked or too soon to prepare for.'
              : 'Tap a date to see the times already booked. A gold dot means that day has an event. Greyed-out dates are fully booked, blocked, or too soon to prepare for.'}
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
      {/* Looks like an input; clicking it opens the calendar popup, clicking it again closes it */}
      <ButtonBase
        id={id}
        ref={buttonRef}
        onClick={(event) => (anchor ? close() : open(event))}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchor)}
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
          backgroundColor: dark ? tokens.shellInset : tokens.cardLight,
          border: `1px solid ${error ? errorColor : dark ? 'rgba(197, 160, 89, 0.28)' : tokens.borderInput}`,
          '&:hover': { borderColor: dark ? 'rgba(197, 160, 89, 0.5)' : tokens.placeholder },
          '&.Mui-disabled': { backgroundColor: dark ? 'transparent' : tokens.surfaceSubtle, color: tokens.textMuted },
          '&:focus-visible': { outline: 'none', borderColor: dark ? tokens.gold : tokens.borderFocus, boxShadow: dark ? 'none' : '0 0 0 3px rgba(15, 23, 42, 0.12)' }
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

      {/* The calendar popup. It is a Popper, not a Popover: a Popover is modal and locks the page's scrolling
          while it is open, so a calendar taller than the screen (the schedule makes it grow) could hide
          "Choose this date" with no way to scroll to it. The Popper leaves the page scrollable and follows the input.
          Layer: under the sticky site/portal headers like the rest of the page, or above the dialog the input is in.
          Keyboard: the focus moves into the popup when it opens, Tab stays inside it, Escape closes it. */}
      <LightSurface>
        <Popper
          open={Boolean(anchor)}
          anchorEl={anchor}
          placement="bottom-start"
          transition
          modifiers={POPUP_MODIFIERS}
          role="dialog"
          aria-label={label ? `${label}: choose a date` : 'Choose a date'}
          sx={(theme) => ({ zIndex: inDialog ? theme.zIndex.modal : theme.zIndex.appBar - 1 })}
        >
          {({ TransitionProps }) => (
            // Tab and Shift+Tab loop inside the popup; a tap outside may still take the focus away (no enforced focus)
            <FocusTrap open={Boolean(anchor)} disableAutoFocus disableRestoreFocus disableEnforceFocus>
              <Grow {...TransitionProps} timeout={reduceMotion ? 0 : 'auto'} style={{ transformOrigin: 'left top' }} onEntering={() => paperRef.current && paperRef.current.focus({ preventScroll: true })}>
                <Paper
                  ref={paperRef}
                  tabIndex={-1}
                  elevation={8}
                  // Escape closes only the popup (stopPropagation keeps a dialog around it open)
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.stopPropagation();
                      close(true);
                    }
                  }}
                  sx={{ width: 320, maxWidth: 'calc(100vw - 24px)', borderRadius: 2, border: `1px solid ${tokens.cardLightBorder}`, outline: 'none' }}
                >
                  {/* A tap anywhere outside the popup closes it, except on the input (its own click toggles the popup) */}
                  <ClickAwayListener onClickAway={(event) => { if (!buttonRef.current || !buttonRef.current.contains(event.target)) close(); }}>
                    <Box sx={{ p: 2 }}>{calendarBody}</Box>
                  </ClickAwayListener>
                </Paper>
              </Grow>
            </FocusTrap>
          )}
        </Popper>
      </LightSurface>
    </Box>
  );
}
