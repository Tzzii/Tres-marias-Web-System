import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import {
  DashCard,
  EmptyState,
  ErrorState,
  ListSkeleton,
  MonthCalendar,
  PageHeader,
  StatusChip,
  ThemeIcon,
  calendarApi,
  daysFromToday,
  formatDateLong,
  formatTime,
  headcount,
  parseISODate,
  reservationApi,
  todayISO,
  tokens,
  useDocumentTitle,
  useResource
} from '@tm/shared';
import { useAuth } from '../../auth.js';

/** 1j · Calendar: the customer's own events against open and fully booked dates. */
export default function CalendarPage() {
  useDocumentTitle('Calendar');
  const navigate = useNavigate();
  const { user } = useAuth();
  // Load the customer's active reservations (not declined/cancelled) and the booking calendar
  const { data, loading, error, reload } = useResource(async () => {
    const [reservations, availability] = await Promise.all([reservationApi.listReservations({ customerId: user.id }), calendarApi.getCalendar()]);
    return { reservations: reservations.filter((r) => !['declined', 'cancelled'].includes(r.status)), availability };
  }, [user.id]);

  const now = parseISODate(todayISO());
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() }); // month shown
  const [mode, setMode] = useState('month'); // 'month' calendar or 'list' view

  // Group the customer's reservations by date
  const byDate = useMemo(() => {
    const map = {};
    (data ? data.reservations : []).forEach((r) => {
      (map[r.date] = map[r.date] || []).push(r);
    });
    return map;
  }, [data]);

  // Decide how each calendar day looks, using the same rules and marks as the booking date picker:
  // my event > open > past date > too soon to book ("Needs...") > blocked by the admin > fully booked.
  // Days with other customers' events get gold dots (never their names).
  const getDay = (iso) => {
    const mine = byDate[iso];
    if (mine) return { tone: 'event', label: mine.map((r) => r.eventName).join(', '), badge: mine[0].eventName, dots: mine.length };
    const reason = calendarApi.dateUnavailableReason(iso, data.availability);
    const count = data.availability.booked[iso] || 0; // events already holding the date
    if (!reason) {
      return count
        ? { tone: 'open', label: `Available · ${count} ${count === 1 ? 'event' : 'events'} already booked — start a reservation`, dots: count }
        : { tone: 'open', label: 'Available — start a reservation' };
    }
    if (daysFromToday(iso) < 0) return { tone: 'disabled', label: 'Past date', unselectable: true };
    if (reason.startsWith('Needs')) return { tone: 'disabled', label: reason, unselectable: true };
    if (data.availability.blocked.some((b) => b.date === iso)) return { tone: 'blocked', label: reason, badge: reason, unselectable: true };
    return { tone: 'full', label: reason, badge: reason, unselectable: true };
  };

  // Clicking a day: open my event on that date, or start a reservation for that date
  const select = (iso) => {
    const mine = byDate[iso];
    if (mine) navigate(`/portal/reservations/${mine[0].ref}`);
    else navigate(`/portal/book?date=${iso}`);
  };

  // For list view: events by date, split into upcoming (soonest first) and past (most recent first)
  const sorted = data ? data.reservations.slice().sort((a, b) => a.date.localeCompare(b.date)) : [];
  const upcoming = sorted.filter((r) => daysFromToday(r.date) >= 0);
  const past = sorted.filter((r) => daysFromToday(r.date) < 0).reverse();

  return (
    <>
      <PageHeader title="Calendar" subtitle="Tap one of your events to open it, or an available date to start a reservation." />
      <DashCard>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading ? (
          <ListSkeleton rows={6} height={64} />
        ) : mode === 'month' ? (
          <MonthCalendar
            year={view.year}
            month={view.month}
            onMonthChange={(year, month) => setView({ year, month })}
            getDay={getDay}
            onSelect={select}
            headerAction={<ModeToggle mode={mode} setMode={setMode} />}
            legend={[
              { tone: 'event', label: 'My event' },
              { tone: 'full', label: 'Fully booked date' },
              { tone: 'blocked', label: 'Blocked' },
              { tone: 'open', label: 'Available (gold dots: events already booked)' }
            ]}
          />
        ) : (
          <>
            {/* Same place for the switch as in the month view: its own full-width row on top on phones */}
            <Box sx={{ display: 'flex', flexWrap: { xs: 'wrap', sm: 'nowrap' }, justifyContent: 'space-between', alignItems: 'center', gap: 1.5, mb: 2 }}>
              <Typography sx={{ fontSize: 16, fontWeight: 700 }}>My events</Typography>
              <Box sx={{ width: { xs: '100%', sm: 'auto' }, order: { xs: -1, sm: 0 } }}>
                <ModeToggle mode={mode} setMode={setMode} />
              </Box>
            </Box>
            {sorted.length === 0 ? (
              <EmptyState compact title="No events yet" description="Your reservations will appear here." action={<Button variant="contained" onClick={() => navigate('/portal/book')}>New reservation</Button>} />
            ) : (
              [['Upcoming', upcoming], ['Past', past]].map(([label, list]) =>
                list.length ? (
                  <Box key={label} sx={{ mb: 3 }}>
                    <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: tokens.textMuted, mb: 1 }}>{label}</Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {list.map((r) => (
                        <ButtonBase key={r.ref} onClick={() => navigate(`/portal/reservations/${r.ref}`)} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', p: 1.5, textAlign: 'left', fontFamily: 'inherit', borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}`, '&:hover': { borderColor: '#94a3b8' } }}>
                          <ThemeIcon occasion={r.occasion} size={52} />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography noWrap sx={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary }}>{r.eventName}</Typography>
                            <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                              {formatDateLong(r.date)} · {formatTime(r.startTime)} · {headcount(r)}
                            </Typography>
                          </Box>
                          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                            <StatusChip status={r.status} size="sm" />
                          </Box>
                          <ChevronRightRoundedIcon sx={{ color: tokens.textMuted }} />
                        </ButtonBase>
                      ))}
                    </Box>
                  </Box>
                ) : null
              )
            )}
          </>
        )}
      </DashCard>
    </>
  );
}

// Switch buttons: on phones each takes half the row and is 40px tall for fingers
const toggleSx = { px: 1.75, textTransform: 'none', fontWeight: 600, flex: { xs: 1, sm: 'none' }, minHeight: { xs: 40, sm: 0 } };

/**
 * Month / List switch. `v && setMode(v)` ignores clicks that would unselect both buttons.
 * Full width on phones, where it sits on its own row above the calendar or the list.
 */
function ModeToggle({ mode, setMode }) {
  return (
    <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, v) => v && setMode(v)} aria-label="Calendar view" sx={{ width: { xs: '100%', sm: 'auto' } }}>
      <ToggleButton value="month" sx={toggleSx}>
        Month
      </ToggleButton>
      <ToggleButton value="list" sx={toggleSx}>
        List
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
