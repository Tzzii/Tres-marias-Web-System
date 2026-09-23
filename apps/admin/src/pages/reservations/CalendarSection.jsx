import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import {
  BLOCK_REASONS,
  BusyButton,
  CardTitle,
  ConfirmDialog,
  DashCard,
  DateField,
  ErrorState,
  FormField,
  HOLDS_DATE,
  ListSkeleton,
  MonthCalendar,
  SelectField,
  StatusChip,
  addDays,
  calendarApi,
  formatDate,
  formatDateLong,
  formatTime,
  formatWeekday,
  headcount,
  parseISODate,
  reservationApi,
  toISODate,
  todayISO,
  tokens,
  useNotify,
  useResource
} from '@tm/shared';
import { SectionBar } from '../../components/SectionTabs.jsx';

/**
 * 1v · Calendar tab of "Reservation & Calendar": booked events, blocked dates and daily capacity.
 * Drives the public availability check and the customer date picker. The page title and tabs come from ReservationsCalendarPage.
 * Opens on the date in ?date=YYYY-MM-DD when given (month shown and that day selected), otherwise on today.
 */
export default function CalendarSection() {
  const navigate = useNavigate();
  const notify = useNotify();
  // Load reservations and calendar settings (blocked dates + daily capacity) together
  const { data, loading, error, reload } = useResource(async () => {
    const [reservations, availability] = await Promise.all([reservationApi.listReservations(), calendarApi.getCalendar()]);
    return { reservations, availability };
  }, []);

  // A ?date=YYYY-MM-DD link (e.g. a day clicked on the dashboard calendar) opens on that date; otherwise today
  const [params] = useSearchParams();
  const dateParam = params.get('date');
  const start = /^\d{4}-\d{2}-\d{2}$/.test(dateParam || '') ? dateParam : todayISO();
  const startDate = parseISODate(start);
  const [view, setView] = useState({ year: startDate.getFullYear(), month: startDate.getMonth() }); // month shown
  const [mode, setMode] = useState('month'); // 'month' or 'week' view
  const [weekStart, setWeekStart] = useState(() => mondayOf(start)); // Monday of the week shown
  const [selected, setSelected] = useState(start); // clicked date

  // "Block a date" form
  const [block, setBlock] = useState({ from: '', to: '', reason: 'Fully booked' });
  const [blockErrors, setBlockErrors] = useState({});
  const [blocking, setBlocking] = useState(false);
  // Daily capacity form
  const [capacity, setCapacity] = useState('');
  const [savingCapacity, setSavingCapacity] = useState(false);
  const [unblock, setUnblock] = useState(null); // blocked date waiting for unblock confirmation

  // Fill the capacity box with the saved value once it loads
  useEffect(() => {
    if (data) setCapacity(String(data.availability.capacity));
  }, [data?.availability.capacity]); // eslint-disable-line react-hooks/exhaustive-deps

  // Group active reservations by date, e.g. { '2026-10-03': [res1, res2] }
  const byDate = useMemo(() => {
    const map = {};
    (data ? data.reservations : []).forEach((r) => {
      // Declined and cancelled bookings don't take up the date
      if (['declined', 'cancelled'].includes(r.status)) return;
      (map[r.date] = map[r.date] || []).push(r);
    });
    return map;
  }, [data]);

  // For one date: its events, whether it's blocked, and whether it has reached capacity
  const describe = (iso) => {
    const events = byDate[iso] || [];
    const blocked = data.availability.blocked.find((b) => b.date === iso);
    const full = events.filter((r) => HOLDS_DATE.includes(r.status)).length >= data.availability.capacity;
    return { events, blocked, full };
  };

  // Tell the month calendar how to colour and label each day (blocked > full > has events > open)
  const getDay = (iso) => {
    const { events, blocked, full } = describe(iso);
    if (blocked) return { tone: 'blocked', label: blocked.reason, badge: blocked.reason, dots: events.length };
    if (full) return { tone: 'full', label: 'Capacity reached', badge: `${events.length} events · full`, dots: events.length };
    if (events.length) return { tone: 'event', label: events.map((e) => e.eventName).join(', '), badge: events.length === 1 ? events[0].eventName : `${events.length} events`, dots: events.length };
    return { tone: 'open', label: 'Open' };
  };

  // Validate the date range and block those dates so customers can't book them
  const submitBlock = async () => {
    const found = {};
    if (!block.from) found.from = 'Choose the first date.';
    if (!block.to) found.to = 'Choose the last date.';
    if (block.from && block.to && block.to < block.from) found.to = 'Must be on or after the first date.';
    setBlockErrors(found);
    if (Object.keys(found).length) return;
    // Dates in the range that already have bookings; blocking still works, but the admin is warned
    const conflicts = Object.keys(byDate).filter((d) => d >= block.from && d <= block.to && byDate[d].some((r) => HOLDS_DATE.includes(r.status) || r.status === 'pending'));
    setBlocking(true);
    try {
      const result = await calendarApi.blockDates(block);
      notify(`Blocked ${result.total} ${result.total === 1 ? 'date' : 'dates'}.${conflicts.length ? ` Note: ${conflicts.length} already ${conflicts.length === 1 ? 'has' : 'have'} reservations.` : ''}`, conflicts.length ? 'warning' : 'success');
      setBlock({ from: '', to: '', reason: block.reason });
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBlocking(false);
    }
  };

  // Save how many events can be booked per day
  const saveCapacity = async () => {
    setSavingCapacity(true);
    try {
      await calendarApi.setDailyCapacity(capacity);
      notify('Daily capacity saved.');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setSavingCapacity(false);
    }
  };

  if (error) return <DashCard><ErrorState error={error} onRetry={reload} /></DashCard>;

  // "YYYY-MM" of the month shown, used to list that month's blocked dates
  const monthKey = `${view.year}-${String(view.month + 1).padStart(2, '0')}`;
  const blockedThisMonth = data ? data.availability.blocked.filter((b) => b.date.startsWith(monthKey)) : [];
  const selectedInfo = data ? describe(selected) : null;
  // The 7 dates of the week shown in week view
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Month / Week switch button
  const modeToggle = (
    <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, v) => v && setMode(v)} aria-label="Calendar view">
      <ToggleButton value="month" sx={{ px: 1.75, textTransform: 'none', fontWeight: 600 }}>Month</ToggleButton>
      <ToggleButton value="week" sx={{ px: 1.75, textTransform: 'none', fontWeight: 600 }}>Week</ToggleButton>
    </ToggleButtonGroup>
  );

  return (
    <>
      <SectionBar text="Blocked dates and daily capacity decide which dates customers can reserve." />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1.7fr 1fr' }, gap: 2.5, alignItems: 'start' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, minWidth: 0 }}>
          <DashCard>
            {loading ? (
              <ListSkeleton rows={6} height={70} />
            ) : mode === 'month' ? (
              <MonthCalendar
                year={view.year}
                month={view.month}
                onMonthChange={(year, month) => setView({ year, month })}
                getDay={getDay}
                selected={selected}
                onSelect={(iso) => setSelected(iso)}
                headerAction={modeToggle}
                legend={[
                  { tone: 'event', label: 'Booked event' },
                  { tone: 'blocked', label: 'Blocked' },
                  { tone: 'full', label: 'Capacity reached' },
                  { tone: 'open', label: 'Open' }
                ]}
              />
            ) : (
              <>
                {/* Week view: previous/next week buttons, then one row per day */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 1, flexWrap: 'wrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <IconButton size="small" onClick={() => setWeekStart((w) => addDays(w, -7))} aria-label="Previous week"><ChevronLeftRoundedIcon /></IconButton>
                    <Typography sx={{ fontSize: 15, fontWeight: 700, minWidth: 190, textAlign: 'center' }}>
                      {formatDate(weekDays[0])} – {formatDate(weekDays[6])}
                    </Typography>
                    <IconButton size="small" onClick={() => setWeekStart((w) => addDays(w, 7))} aria-label="Next week"><ChevronRightRoundedIcon /></IconButton>
                    <Button size="small" onClick={() => setWeekStart(mondayOf(todayISO()))}>This week</Button>
                  </Box>
                  {modeToggle}
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {weekDays.map((iso) => {
                    const info = describe(iso);
                    return (
                      <ButtonBase key={iso} onClick={() => setSelected(iso)} sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, p: 1.5, textAlign: 'left', fontFamily: 'inherit', borderRadius: 1.5, border: `1.5px solid ${selected === iso ? tokens.ink : iso === todayISO() ? tokens.gold : tokens.cardLightBorder}`, backgroundColor: info.blocked ? tokens.surfaceMuted : '#fff' }}>
                        <Box sx={{ width: 110, flexShrink: 0 }}>
                          <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: tokens.textPrimary }}>{formatWeekday(iso)}</Typography>
                          <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>{formatDate(iso)}</Typography>
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          {info.blocked && <Typography sx={{ fontSize: 13, fontWeight: 700, color: tokens.textSecondary }}>Blocked · {info.blocked.reason}</Typography>}
                          {info.events.length === 0 && !info.blocked && <Typography sx={{ fontSize: 13, color: tokens.textMuted }}>Open</Typography>}
                          {info.events.map((e) => (
                            <Typography key={e.ref} noWrap sx={{ fontSize: 13, color: tokens.textPrimary }}>
                              {formatTime(e.startTime)} · {e.eventName} · {headcount(e, 'pax')}
                            </Typography>
                          ))}
                        </Box>
                        {info.full && <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: '#b91c1c' }}>FULL</Typography>}
                      </ButtonBase>
                    );
                  })}
                </Box>
              </>
            )}
          </DashCard>

          {/* Details of the clicked date: its reservations and a Block/Unblock button */}
          {selectedInfo && (
            <DashCard>
              <CardTitle subtitle={selectedInfo.blocked ? `Blocked · ${selectedInfo.blocked.reason}` : `${selectedInfo.events.filter((e) => HOLDS_DATE.includes(e.status)).length} of ${data.availability.capacity} slots taken`}>{formatDateLong(selected)}</CardTitle>
              {selectedInfo.events.length === 0 ? (
                <Typography sx={{ fontSize: 13.5, color: tokens.textSecondary }}>No reservations on this date.</Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {selectedInfo.events.map((e) => (
                    <ButtonBase key={e.ref} onClick={() => navigate(`/reservations/${e.ref}`)} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.25, textAlign: 'left', fontFamily: 'inherit', borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}`, '&:hover': { borderColor: '#94a3b8' } }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 700, color: tokens.textPrimary }}>{e.eventName}</Typography>
                        <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                          {formatTime(e.startTime)} · {e.customerName} · {headcount(e, 'pax')} · {e.venue.city}
                        </Typography>
                      </Box>
                      <StatusChip status={e.status} size="sm" />
                    </ButtonBase>
                  ))}
                </Box>
              )}
              <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                {selectedInfo.blocked ? (
                  <Button variant="outlined" onClick={() => setUnblock(selectedInfo.blocked)}>Unblock this date</Button>
                ) : (
                  selected >= todayISO() && <Button variant="outlined" onClick={() => setBlock((b) => ({ ...b, from: selected, to: selected }))}>Block this date</Button>
                )}
              </Box>
            </DashCard>
          )}
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <DashCard>
            <CardTitle>Block a date</CardTitle>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                {/* Picking a From date after the To date moves To forward to match */}
                <DateField id="block-from" label="From" mode="any" value={block.from} onChange={(v) => { setBlock((b) => ({ ...b, from: v, to: b.to && b.to >= v ? b.to : v })); setBlockErrors({}); }} error={blockErrors.from} />
                <DateField id="block-to" label="To" mode="any" value={block.to} onChange={(v) => { setBlock((b) => ({ ...b, to: v })); setBlockErrors({}); }} error={blockErrors.to} />
              </Box>
              <SelectField id="block-reason" label="Reason shown to customers" value={block.reason} onChange={(e) => setBlock((b) => ({ ...b, reason: e.target.value }))} options={BLOCK_REASONS} />
              <BusyButton busy={blocking} onClick={submitBlock}>Block these dates</BusyButton>
            </Box>
          </DashCard>

          <DashCard>
            <CardTitle subtitle="How many events can be served in one day. The customer date picker greys out days at capacity.">Daily capacity</CardTitle>
            <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
              <FormField id="capacity" type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} inputProps={{ min: 1, max: 10, 'aria-label': 'Events per day' }} sx={{ width: 110 }} />
              <BusyButton busy={savingCapacity} disabled={!data || String(data.availability.capacity) === capacity} onClick={saveCapacity} sx={{ height: 40 }}>Save</BusyButton>
            </Box>
          </DashCard>

          <DashCard>
            <CardTitle>Blocked this month</CardTitle>
            {blockedThisMonth.length === 0 ? (
              <Typography sx={{ fontSize: 13.5, color: tokens.textSecondary }}>No blocked dates in this month.</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                {blockedThisMonth.map((b) => (
                  <Box key={b.date} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1, borderBottom: `1px solid ${tokens.cardLightBorder}`, '&:last-child': { borderBottom: 0 } }}>
                    <Typography sx={{ fontSize: 13.5 }}>
                      <b>{formatDate(b.date)}</b> · {b.reason}
                    </Typography>
                    <Button size="small" color="error" onClick={() => setUnblock(b)}>Remove</Button>
                  </Box>
                ))}
              </Box>
            )}
          </DashCard>
        </Box>
      </Box>

      <ConfirmDialog
        open={Boolean(unblock)}
        onClose={() => setUnblock(null)}
        title="Unblock this date?"
        description={unblock ? `${formatDateLong(unblock.date)} (${unblock.reason}) opens for customer reservations again.` : ''}
        confirmLabel="Unblock"
        onConfirm={async () => {
          await calendarApi.unblockDate(unblock.date);
          setUnblock(null);
          notify('Date unblocked.');
        }}
      />
    </>
  );
}

/** Returns the Monday of the week containing the given date ("YYYY-MM-DD"). */
function mondayOf(iso) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISODate(d);
}
