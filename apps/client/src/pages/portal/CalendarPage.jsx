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
  RULES,
  blockNote,
  calendarApi,
  daysFromToday,
  formatDateLong,
  formatEventTime,
  headcount,
  parseISODate,
  reservationApi,
  todayISO,
  tokens,
  useDocumentTitle,
  useResource
} from '@tm/shared';
import { useAuth } from '../../auth.js';

export default function CalendarPage() {
  useDocumentTitle('Calendar');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, error, reload } = useResource(async () => {
    const [reservations, availability] = await Promise.all([
      reservationApi.listReservations({ customerId: user.id }),
      calendarApi.getCalendar()
    ]);
    return { reservations: reservations.filter((r) => !['declined', 'cancelled'].includes(r.status)), availability };
  }, [user.id]);

  const now = parseISODate(todayISO());
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [mode, setMode] = useState('month');
  const [peek, setPeek] = useState('');

  const byDate = useMemo(() => {
    const map = {};
    (data ? data.reservations : []).forEach((r) => {
      (map[r.date] = map[r.date] || []).push(r);
    });
    return map;
  }, [data]);

  const getDay = (iso) => {
    const mine = byDate[iso];
    if (mine)
      return {
        tone: 'event',
        label: mine.map((r) => r.eventName).join(', '),
        badge: mine[0].eventName,
        dots: mine.length
      };
    const reason = calendarApi.dateUnavailableReason(iso, data.availability);
    const count = data.availability.booked[iso] || 0;
    if (!reason) {
      return count
        ? {
            tone: 'open',
            label: `Available · ${count} ${count === 1 ? 'event' : 'events'} already booked — start a reservation`,
            dots: count
          }
        : { tone: 'open', label: 'Available — start a reservation' };
    }
    if (daysFromToday(iso) < 0) return { tone: 'disabled', label: 'Past date', unselectable: true };
    if (reason.startsWith('Needs')) return { tone: 'disabled', label: reason, unselectable: true, peek: true };
    if (data.availability.blocked.some((b) => b.date === iso))
      return { tone: 'blocked', label: `Not available: ${reason}`, badge: reason, unselectable: true, peek: true };
    return { tone: 'full', label: reason, badge: reason, unselectable: true, peek: true };
  };

  const select = (iso, info = {}) => {
    if (info.peek) {
      setPeek(iso);
      return;
    }
    const mine = byDate[iso];
    if (mine) navigate(`/portal/reservations/${mine[0].ref}`);
    else navigate(`/portal/book?date=${iso}`);
  };

  const sorted = data ? data.reservations.slice().sort((a, b) => a.date.localeCompare(b.date)) : [];
  const upcoming = sorted.filter((r) => daysFromToday(r.date) >= 0);
  const past = sorted.filter((r) => daysFromToday(r.date) < 0).reverse();
  const peekReason = data && peek ? calendarApi.dateUnavailableReason(peek, data.availability) : '';
  const peekNote = peekReason ? blockNote(peek, data.availability) : '';
  const peekBlocked = Boolean(peekReason) && data.availability.blocked.some((b) => b.date === peek);

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="Tap one of your events to open it, an available date to start a reservation, or a closed date to see why it is closed."
      />
      <DashCard>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading ? (
          <ListSkeleton rows={6} height={64} />
        ) : mode === 'month' ? (
          <>
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
            {peekReason && (
              <Box
                role="status"
                sx={{
                  mt: 2,
                  p: 1.5,
                  borderRadius: 1.5,
                  backgroundColor: tokens.surfaceSubtle,
                  border: `1px solid ${tokens.cardLightBorder}`
                }}
              >
                <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{formatDateLong(peek)}</Typography>
                <Typography sx={{ mt: 0.25, fontSize: 13, lineHeight: 1.5, color: tokens.textSecondary }}>
                  {peekReason === 'Fully booked' && !peekBlocked
                    ? 'Fully booked. Please choose another date.'
                    : peekReason.startsWith('Needs')
                      ? `Too soon: we need ${RULES.leadDays} days' notice to prepare. Please choose a later date.`
                      : `Not available: ${peekReason}.`}
                </Typography>
                {peekNote && (
                  <Typography sx={{ mt: 0.5, fontSize: 13, lineHeight: 1.5 }}>Note from us: {peekNote}</Typography>
                )}
              </Box>
            )}
          </>
        ) : (
          <>
            <Box
              sx={{
                display: 'flex',
                flexWrap: { xs: 'wrap', sm: 'nowrap' },
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 1.5,
                mb: 2
              }}
            >
              <Typography sx={{ fontSize: 16, fontWeight: 700 }}>My Events</Typography>
              <Box sx={{ width: { xs: '100%', sm: 'auto' }, order: { xs: -1, sm: 0 } }}>
                <ModeToggle mode={mode} setMode={setMode} />
              </Box>
            </Box>
            {sorted.length === 0 ? (
              <EmptyState
                compact
                title="No events yet"
                description="Your reservations will appear here."
                action={
                  <Button variant="contained" onClick={() => navigate('/portal/book')}>
                    New reservation
                  </Button>
                }
              />
            ) : (
              [
                ['Upcoming', upcoming],
                ['Past', past]
              ].map(([label, list]) =>
                list.length ? (
                  <Box key={label} sx={{ mb: 3 }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: tokens.textMuted, mb: 1 }}>
                      {label}
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {list.map((r) => (
                        <ButtonBase
                          key={r.ref}
                          onClick={() => navigate(`/portal/reservations/${r.ref}`)}
                          sx={{
                            display: 'flex',
                            gap: 1.5,
                            alignItems: 'center',
                            p: 1.5,
                            textAlign: 'left',
                            fontFamily: 'inherit',
                            borderRadius: 1.5,
                            border: `1px solid ${tokens.cardLightBorder}`,
                            '&:hover': { borderColor: '#94a3b8' }
                          }}
                        >
                          <ThemeIcon occasion={r.occasion} size={52} />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography noWrap sx={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary }}>
                              {r.eventName}
                            </Typography>
                            <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                              {formatDateLong(r.date)} · {formatEventTime(r)} · {headcount(r)}
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

const toggleSx = {
  px: 1.75,
  textTransform: 'none',
  fontWeight: 600,
  flex: { xs: 1, sm: 'none' },
  minHeight: { xs: 40, sm: 0 }
};

function ModeToggle({ mode, setMode }) {
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={mode}
      onChange={(_, v) => v && setMode(v)}
      aria-label="Calendar view"
      sx={{ width: { xs: '100%', sm: 'auto' } }}
    >
      <ToggleButton value="month" sx={toggleSx}>
        Month
      </ToggleButton>
      <ToggleButton value="list" sx={toggleSx}>
        List
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
