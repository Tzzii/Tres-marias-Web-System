import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import MarkEmailUnreadOutlinedIcon from '@mui/icons-material/MarkEmailUnreadOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import {
  BarChart,
  CardTitle,
  DashCard,
  EmptyState,
  ErrorState,
  HOLDS_DATE,
  ListSkeleton,
  MONTH_NAMES,
  MonthCalendar,
  Pill,
  StatCard,
  StatusChip,
  ThemeIcon,
  calendarApi,
  firstName,
  formatDateLong,
  formatDateShort,
  formatRelative,
  formatTime,
  formatWeekday,
  headcount,
  isRental,
  parseISODate,
  paymentApi,
  peso,
  pluralize,
  reportApi,
  reservationApi,
  toISODate,
  todayISO,
  tokens,
  useDocumentTitle,
  useResource
} from '@tm/shared';
import { useAuth } from '../auth.js';

/**
 * 1r · Admin dashboard: today's events and what needs attention.
 * Wide screens: bar chart (top left) beside the four KPI cards (top right); Events today and
 * Newest bookings (bottom left) beside a small calendar with the next events (bottom right).
 * Phones: KPIs, chart, calendar, then the lists.
 * The chart card switches between Bookings (completed events per month this year, no pickers) and
 * Earnings (verified payments per month, per week or per day). Earnings has MM / DD / YYYY pickers:
 * the year and month choose the range, and a day highlights its bar (or its week's bar).
 */
export default function DashboardPage() {
  useDocumentTitle('Dashboard', 'Tres Marias Admin');
  const navigate = useNavigate();
  const { user } = useAuth();
  // Load the dashboard summary: today's events, pending requests, payments, revenue and charts
  const { data, loading, error, reload } = useResource(() => reportApi.getDashboardSummary(), []);
  // Load reservations, payments and blocked dates for the charts and the small calendar (separately, so the rest of the dashboard doesn't wait)
  const calendar = useResource(async () => {
    const [reservations, payments, availability] = await Promise.all([reservationApi.listReservations(), paymentApi.listPayments(), calendarApi.getCalendar()]);
    return { reservations, payments, availability };
  }, []);

  const today = parseISODate(todayISO());
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() }); // month shown in the small calendar
  // Which chart is shown: 'bookings' (completed events per month) or 'earnings' (verified payments)
  const [chartMode, setChartMode] = useState('bookings');
  // Earnings grouping: 'month' (12 bars for the year), 'week' (weeks of the month) or 'day' (days of the month)
  const [period, setPeriod] = useState('month');
  // Earnings pickers: year and month are always set (month 0–11); day is 'all' or 1–31
  const [chartYear, setChartYear] = useState(today.getFullYear());
  const [chartMonth, setChartMonth] = useState(today.getMonth());
  const [chartDay, setChartDay] = useState('all');

  const pad = (n) => String(n).padStart(2, '0');

  // Completed events as "YYYY-MM-DD" dates; the bookings chart counts these
  const completedDates = useMemo(() => (calendar.data ? calendar.data.reservations.filter((r) => r.status === 'completed').map((r) => r.date) : []), [calendar.data]);

  // Verified payments as { date: "YYYY-MM-DD", amount }, dated by when they were verified
  // (same rule as the "Revenue this month" card); the earnings chart sums these
  const verifiedPayments = useMemo(
    () => (calendar.data ? calendar.data.payments.filter((p) => p.status === 'verified').map((p) => ({ date: toISODate(new Date(p.verifiedAt)), amount: p.amount })) : []),
    [calendar.data]
  );

  // Bookings chart: completed events per month of the current year (no pickers), current month in gold
  const bookings = useMemo(() => {
    const year = today.getFullYear();
    const bars = MONTH_NAMES.map((name, m) => ({ label: name.slice(0, 3), title: `${name} ${year}`, value: completedDates.filter((d) => d.startsWith(`${year}-${pad(m + 1)}`)).length }));
    const total = bars.reduce((sum, b) => sum + b.value, 0);
    return { bars, highlight: today.getMonth(), subtitle: `Completed events per month in ${year} · ${pluralize(total, 'event')}` };
  }, [completedDates]); // eslint-disable-line react-hooks/exhaustive-deps

  // Years in the YYYY picker, newest first: always one year ahead of the present, back to 2021.
  // The list grows by itself each new year (2026: 2027–2021, 2027: 2028–2021, ...).
  const FIRST_CHART_YEAR = 2021;
  const lastChartYear = today.getFullYear() + 1;
  const chartYears = Array.from({ length: lastChartYear - FIRST_CHART_YEAR + 1 }, (_, i) => lastChartYear - i);

  // Days in the chosen month, for the DD picker and the per-day / per-week bars
  const daysInMonth = new Date(chartYear, chartMonth + 1, 0).getDate();

  // Earnings chart: bars for the chosen period, which bar is gold, and the subtitle.
  // - per month: 12 bars for the year; the chosen month is gold
  // - per week: weeks of the month (days 1–7, 8–14, 15–21, 22–28, 29–end); the week holding the chosen day (or today) is gold
  // - per day: one bar per day of the month; the chosen day (or today) is gold
  const earnings = useMemo(() => {
    const sumWhere = (test) => verifiedPayments.filter((p) => test(p.date)).reduce((sum, p) => sum + p.amount, 0);
    const monthPrefix = `${chartYear}-${pad(chartMonth + 1)}`;
    const monthName = MONTH_NAMES[chartMonth];
    const isThisMonth = chartYear === today.getFullYear() && chartMonth === today.getMonth();
    // Day that picks the gold bar in week/day view: the chosen DD, else today when viewing this month
    const focusDay = chartDay !== 'all' ? chartDay : isThisMonth ? today.getDate() : null;

    let bars;
    let highlight;
    let range;
    if (period === 'month') {
      bars = MONTH_NAMES.map((name, m) => ({ label: name.slice(0, 3), title: `${name} ${chartYear}`, value: sumWhere((d) => d.startsWith(`${chartYear}-${pad(m + 1)}`)) }));
      highlight = chartMonth;
      range = `Verified payments per month in ${chartYear}`;
    } else if (period === 'week') {
      bars = Array.from({ length: Math.ceil(daysInMonth / 7) }, (_, w) => {
        const start = w * 7 + 1;
        const end = Math.min(start + 6, daysInMonth);
        return { label: `${start}–${end}`, title: `Week ${w + 1} · ${monthName.slice(0, 3)} ${start}–${end}, ${chartYear}`, value: sumWhere((d) => d.startsWith(monthPrefix) && Number(d.slice(8)) >= start && Number(d.slice(8)) <= end) };
      });
      highlight = focusDay ? Math.floor((focusDay - 1) / 7) : -1;
      range = `Verified payments per week in ${monthName} ${chartYear}`;
    } else {
      bars = Array.from({ length: daysInMonth }, (_, i) => {
        const iso = `${monthPrefix}-${pad(i + 1)}`;
        return { label: String(i + 1), title: formatDateLong(iso), value: sumWhere((d) => d === iso) };
      });
      highlight = focusDay ? focusDay - 1 : -1;
      range = `Verified payments per day in ${monthName} ${chartYear}`;
    }

    // Subtitle: the range and its total, plus the chosen month / week / day's amount when one is picked
    const total = bars.reduce((sum, b) => sum + b.value, 0);
    const picked = period === 'month' || chartDay !== 'all' ? bars[highlight] : null;
    const subtitle = `${range} · ${peso(total)} total${picked ? ` · ${picked.title}: ${peso(picked.value)}` : ''}`;
    return { bars, highlight, subtitle };
  }, [verifiedPayments, period, chartYear, chartMonth, chartDay, daysInMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const chart = chartMode === 'bookings' ? bookings : earnings;

  // Changing the year or month keeps the day only if it still exists (e.g. Feb 30 resets to All days)
  const pickYear = (y) => {
    setChartYear(y);
    if (chartDay !== 'all' && chartDay > new Date(y, chartMonth + 1, 0).getDate()) setChartDay('all');
  };
  const pickMonth = (m) => {
    setChartMonth(m);
    if (chartDay !== 'all' && chartDay > new Date(chartYear, m + 1, 0).getDate()) setChartDay('all');
  };

  // Events that hold a date, grouped by date, e.g. { '2026-10-03': [res1, res2] }
  const eventsByDate = useMemo(() => {
    const map = {};
    (calendar.data ? calendar.data.reservations : []).forEach((r) => {
      if (HOLDS_DATE.includes(r.status)) (map[r.date] = map[r.date] || []).push(r);
    });
    return map;
  }, [calendar.data]);

  // Tell the small calendar how to colour each day: blocked > fully booked > has events > open.
  // "Fully booked" uses the same rule as the Calendar tab and the customer date picker.
  const getDay = (iso) => {
    if (!calendar.data) return { tone: 'open' };
    const blocked = calendar.data.availability.blocked.find((b) => b.date === iso);
    const events = eventsByDate[iso] || [];
    if (blocked) return { tone: 'blocked', label: `Blocked · ${blocked.reason}` };
    const names = events.map((e) => e.eventName).join(', ');
    if (calendarApi.dateUnavailableReason(iso, calendar.data.availability, { enforceLeadTime: false })) return { tone: 'full', label: `Fully booked · ${names}` };
    if (events.length) return { tone: 'event', label: names };
    return { tone: 'open' };
  };

  // If loading failed, show an error with a Retry button instead of the dashboard
  if (error) return <DashCard><ErrorState error={error} onRetry={reload} /></DashCard>;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box>
        <Typography sx={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: tokens.gold }}>Today · {formatDateLong(todayISO())}</Typography>
        <Typography component="h1" sx={{ mt: 0.5, fontSize: { xs: 22, md: 26 }, fontWeight: 700, color: tokens.textLight }}>
          Welcome back, {firstName(user.name)}
        </Typography>
      </Box>

      {/* Two-column grid on wide screens; the named areas set the order on phones */}
      <Box
        sx={{
          display: 'grid',
          gap: 2.5,
          alignItems: 'start',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.7fr) minmax(0, 1fr)' },
          gridTemplateAreas: { xs: '"kpi" "chart" "calendar" "lists"', lg: '"chart kpi" "lists calendar"' }
        }}
      >
        {/* Chart card: Bookings (completed events per month, no pickers) or Earnings (verified payments
            per month / week / day, with the MM / DD / YYYY pickers) */}
        <DashCard sx={{ gridArea: 'chart', minWidth: 0 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, mb: 2 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: tokens.textPrimary }}>{chartMode === 'bookings' ? 'Bookings per month' : `Earnings per ${period}`}</Typography>
              <Typography sx={{ mt: 0.25, fontSize: 12.5, color: tokens.textSecondary }}>{calendar.loading ? 'Loading…' : chart.subtitle}</Typography>
            </Box>
            <ToggleButtonGroup size="small" exclusive value={chartMode} onChange={(_, v) => v && setChartMode(v)} aria-label="Chart">
              <ToggleButton value="bookings" sx={{ px: 1.75, textTransform: 'none', fontWeight: 600 }}>Bookings</ToggleButton>
              <ToggleButton value="earnings" sx={{ px: 1.75, textTransform: 'none', fontWeight: 600 }}>Earnings</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Earnings controls: grouping on the left, date pickers on the right */}
          {chartMode === 'earnings' && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 2 }}>
              <ToggleButtonGroup size="small" exclusive value={period} onChange={(_, v) => v && setPeriod(v)} aria-label="Group earnings by">
                <ToggleButton value="month" sx={{ px: 1.5, textTransform: 'none', fontWeight: 600 }}>Per month</ToggleButton>
                <ToggleButton value="week" sx={{ px: 1.5, textTransform: 'none', fontWeight: 600 }}>Per week</ToggleButton>
                <ToggleButton value="day" sx={{ px: 1.5, textTransform: 'none', fontWeight: 600 }}>Per day</ToggleButton>
              </ToggleButtonGroup>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField select size="small" value={chartMonth} onChange={(e) => pickMonth(Number(e.target.value))} inputProps={{ 'aria-label': 'Month' }} sx={{ minWidth: 92 }}>
                  {MONTH_NAMES.map((name, m) => <MenuItem key={name} value={m}>{name.slice(0, 3)}</MenuItem>)}
                </TextField>
                {/* Day picker is off in per-month view (a day doesn't change the month bars) */}
                <TextField select size="small" value={chartDay} disabled={period === 'month'} onChange={(e) => setChartDay(e.target.value === 'all' ? 'all' : Number(e.target.value))} inputProps={{ 'aria-label': 'Day' }} sx={{ minWidth: 76 }}>
                  <MenuItem value="all">DD</MenuItem>
                  {Array.from({ length: daysInMonth }, (_, i) => <MenuItem key={i + 1} value={i + 1}>{pad(i + 1)}</MenuItem>)}
                </TextField>
                <TextField select size="small" value={chartYear} onChange={(e) => pickYear(Number(e.target.value))} inputProps={{ 'aria-label': 'Year' }} sx={{ minWidth: 92 }}>
                  {chartYears.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                </TextField>
              </Box>
            </Box>
          )}

          {calendar.error ? (
            <ErrorState error={calendar.error} onRetry={calendar.reload} />
          ) : calendar.loading ? (
            <ListSkeleton rows={1} height={220} />
          ) : (
            // Bookings axis starts at 0–10 (grows past 10 when needed); earnings scale to the amounts
            <BarChart data={chart.bars} highlightIndex={chart.highlight} format={chartMode === 'earnings' ? peso : undefined} minTop={chartMode === 'bookings' ? 10 : 0} ariaLabel={chart.subtitle} />
          )}
        </DashCard>

        {/* Four summary cards beside the chart; clicking one opens the related page */}
        {/* Two cards per row on every screen; on phones they switch to their narrow layout (icon above the text) */}
        <Box sx={{ gridArea: 'kpi', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: { xs: 1.5, sm: 2.5 } }}>
          <StatCard icon={EventAvailableOutlinedIcon} tone="gold" label="Events today" value={data ? data.eventsToday.length : 0} meta="Confirmed and in progress" loading={loading} onClick={() => navigate('/reservations?tab=calendar')} />
          <StatCard icon={MarkEmailUnreadOutlinedIcon} tone="amber" label="Pending requests" value={data ? data.pending.length : 0} meta={data && data.pending.length ? `Oldest ${data.pendingOldestDays === 0 ? 'from today' : `${pluralize(data.pendingOldestDays, 'day')} ago`}` : 'Queue is clear'} loading={loading} onClick={() => navigate('/reservations?tab=requests')} />
          <StatCard icon={PendingActionsOutlinedIcon} tone="blue" label="Unverified payments" value={data ? data.unverifiedPayments : 0} meta="Proofs waiting for review" loading={loading} onClick={() => navigate('/reports?tab=payments&filter=awaiting')} />
          <StatCard icon={PaymentsOutlinedIcon} tone="green" label="Revenue this month" value={data ? peso(data.revenueThisMonth) : '₱0'} meta="Verified payments" loading={loading} onClick={() => navigate('/reports')} />
        </Box>

        {/* Events today and Newest bookings, side by side under the chart */}
        <Box sx={{ gridArea: 'lists', display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2.5, alignItems: 'start', minWidth: 0 }}>
          {/* Today's events with payment status */}
          <DashCard>
            <CardTitle action={data && <Pill label={data.eventsToday.length ? `${data.eventsToday.length} today` : 'No event today'} bg={tokens.goldChip} fg={tokens.goldDark} dot={false} />}>Events today</CardTitle>
            {loading ? (
              <ListSkeleton rows={2} height={96} />
            ) : data.eventsToday.length === 0 ? (
              <EmptyState compact title="NO EVENT TODAY" description="There are no catering bookings or event reservations scheduled for today." />
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {data.eventsToday.map((e) => (
                  <Box key={e.ref} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', p: 1.5, borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}` }}>
                    <ThemeIcon occasion={e.occasion} size={52} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Typography sx={{ fontSize: 14.5, fontWeight: 700 }}>{e.eventName}</Typography>
                        <StatusChip status={e.status} size="sm" />
                      </Box>
                      <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                        {formatTime(e.startTime)} · {isRental(e.serviceType) ? 'equipment rental' : `${e.guests} guests · ${e.serviceType.toLowerCase()}`} · {e.venue.name}, {e.venue.city}
                      </Typography>
                      <Box sx={{ mt: 0.75, display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
                        <Pill size="sm" label={e.balance === 0 ? 'Fully paid' : `Balance ${peso(e.balance)}`} bg={e.balance === 0 ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)'} fg={e.balance === 0 ? '#047857' : '#b45309'} />
                      </Box>
                      <Button size="small" variant="outlined" sx={{ mt: 1 }} onClick={() => navigate(`/reservations/${e.ref}`)}>
                        Open
                      </Button>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </DashCard>

          {/* The 5 newest reservation requests waiting for review */}
          <DashCard>
            <CardTitle action={<Button size="small" onClick={() => navigate('/reservations?tab=requests')}>View queue</Button>}>Newest bookings</CardTitle>
            {loading ? (
              <ListSkeleton rows={3} height={56} />
            ) : data.pending.length === 0 ? (
              <EmptyState compact title="All caught up" description="All reservation requests have been processed." />
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                {data.pending.slice(0, 5).map((r) => (
                  <Box key={r.ref} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, borderBottom: `1px solid ${tokens.cardLightBorder}`, '&:last-child': { borderBottom: 0 } }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 700 }}>{r.customerName}</Typography>
                      <Typography noWrap sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                        {r.packageName} · {formatDateShort(r.date)} · {headcount(r, 'pax')}
                      </Typography>
                      <Typography sx={{ fontSize: 11.5, color: tokens.textMuted }}>Received {formatRelative(r.createdAt)}</Typography>
                    </Box>
                    <Button size="small" variant="contained" onClick={() => navigate(`/reservations/${r.ref}`)}>
                      Review
                    </Button>
                  </Box>
                ))}
              </Box>
            )}
          </DashCard>
        </Box>

        {/* Small calendar under the KPI cards, then the next approved events. Clicking a day opens that date in the Calendar tab. */}
        <DashCard sx={{ gridArea: 'calendar', minWidth: 0 }}>
          <CardTitle action={<Button size="small" onClick={() => navigate('/reservations?tab=calendar')}>Open calendar</Button>}>Calendar</CardTitle>
          {calendar.error ? (
            <ErrorState error={calendar.error} onRetry={calendar.reload} />
          ) : calendar.loading ? (
            <ListSkeleton rows={5} height={34} />
          ) : (
            <MonthCalendar
              size="sm"
              year={view.year}
              month={view.month}
              onMonthChange={(year, month) => setView({ year, month })}
              getDay={getDay}
              onSelect={(iso) => navigate(`/reservations?tab=calendar&date=${iso}`)}
              legend={[
                { tone: 'event', label: 'Booked' },
                { tone: 'full', label: 'Fully booked' },
                { tone: 'blocked', label: 'Blocked' }
              ]}
            />
          )}

          <Divider sx={{ my: 2 }} />
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, mb: 0.5 }}>Coming up</Typography>
          {loading ? (
            <ListSkeleton rows={3} height={44} />
          ) : data.upcoming.length === 0 ? (
            <Typography sx={{ fontSize: 13.5, color: tokens.textSecondary }}>No approved events ahead.</Typography>
          ) : (
            data.upcoming.map((u) => (
              <Box key={u.ref} onClick={() => navigate(`/reservations/${u.ref}`)} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.1, cursor: 'pointer', borderBottom: `1px solid ${tokens.cardLightBorder}`, '&:last-child': { borderBottom: 0 }, '&:hover .tm-up-name': { textDecoration: 'underline' } }}>
                <Box sx={{ width: 46, flexShrink: 0, textAlign: 'center', borderRadius: 1, py: 0.5, backgroundColor: tokens.surfaceMuted }}>
                  <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: tokens.goldDark }}>{formatWeekday(u.date, 'short')}</Typography>
                  <Typography sx={{ fontSize: 15, fontWeight: 800, lineHeight: 1.1 }}>{Number(u.date.slice(8))}</Typography>
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap className="tm-up-name" sx={{ fontSize: 13.5, fontWeight: 700 }}>{u.eventName}</Typography>
                  <Typography sx={{ fontSize: 12, color: tokens.textSecondary }}>
                    {formatTime(u.startTime)} · {headcount(u)}
                  </Typography>
                </Box>
                <StatusChip status={u.status} size="sm" />
              </Box>
            ))
          )}
        </DashCard>
      </Box>
    </Box>
  );
}
