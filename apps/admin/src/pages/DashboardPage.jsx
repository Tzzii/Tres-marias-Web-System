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
  formatEventTime,
  formatRelative,
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

export default function DashboardPage() {
  useDocumentTitle('Dashboard', 'Tres Marias Admin');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, error, reload } = useResource(() => reportApi.getDashboardSummary(), []);
  const calendar = useResource(async () => {
    const [reservations, payments, refunds, availability] = await Promise.all([
      reservationApi.listReservations(),
      paymentApi.listPayments(),
      paymentApi.listRefunds(),
      calendarApi.getCalendar()
    ]);
    return { reservations, payments, refunds, availability };
  }, []);

  const today = parseISODate(todayISO());
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [chartMode, setChartMode] = useState('bookings');
  const [period, setPeriod] = useState('month');
  const [chartYear, setChartYear] = useState(today.getFullYear());
  const [chartMonth, setChartMonth] = useState(today.getMonth());
  const [chartDay, setChartDay] = useState('all');

  const pad = (n) => String(n).padStart(2, '0');

  const completedDates = useMemo(
    () => (calendar.data ? calendar.data.reservations.filter((r) => r.status === 'completed').map((r) => r.date) : []),
    [calendar.data]
  );

  const verifiedPayments = useMemo(
    () =>
      calendar.data
        ? calendar.data.payments
            .filter((p) => p.status === 'verified')
            .map((p) => ({ date: toISODate(new Date(p.verifiedAt)), amount: p.amount }))
        : [],
    [calendar.data]
  );
  const refundsSent = useMemo(
    () => (calendar.data ? calendar.data.refunds.map((r) => ({ date: r.sentOn, amount: r.amount })) : []),
    [calendar.data]
  );

  const bookings = useMemo(() => {
    const year = today.getFullYear();
    const bars = MONTH_NAMES.map((name, m) => ({
      label: name.slice(0, 3),
      title: `${name} ${year}`,
      value: completedDates.filter((d) => d.startsWith(`${year}-${pad(m + 1)}`)).length
    }));
    const total = bars.reduce((sum, b) => sum + b.value, 0);
    return {
      bars,
      highlight: today.getMonth(),
      subtitle: `Completed events per month in ${year} · ${pluralize(total, 'event')}`
    };
  }, [completedDates]); // eslint-disable-line react-hooks/exhaustive-deps

  const FIRST_CHART_YEAR = 2021;
  const lastChartYear = today.getFullYear() + 1;
  const chartYears = Array.from({ length: lastChartYear - FIRST_CHART_YEAR + 1 }, (_, i) => lastChartYear - i);

  const daysInMonth = new Date(chartYear, chartMonth + 1, 0).getDate();

  const earnings = useMemo(() => {
    const total = (list, test) => list.filter((item) => test(item.date)).reduce((sum, item) => sum + item.amount, 0);
    const sumWhere = (test) => total(verifiedPayments, test) - total(refundsSent, test);
    const monthPrefix = `${chartYear}-${pad(chartMonth + 1)}`;
    const monthName = MONTH_NAMES[chartMonth];
    const isThisMonth = chartYear === today.getFullYear() && chartMonth === today.getMonth();
    const focusDay = chartDay !== 'all' ? chartDay : isThisMonth ? today.getDate() : null;

    let bars;
    let highlight;
    let range;
    if (period === 'month') {
      bars = MONTH_NAMES.map((name, m) => ({
        label: name.slice(0, 3),
        title: `${name} ${chartYear}`,
        value: sumWhere((d) => d.startsWith(`${chartYear}-${pad(m + 1)}`))
      }));
      highlight = chartMonth;
      range = `Verified payments less refunds per month in ${chartYear}`;
    } else if (period === 'week') {
      bars = Array.from({ length: Math.ceil(daysInMonth / 7) }, (_, w) => {
        const start = w * 7 + 1;
        const end = Math.min(start + 6, daysInMonth);
        return {
          label: `${start}–${end}`,
          title: `Week ${w + 1} · ${monthName.slice(0, 3)} ${start}–${end}, ${chartYear}`,
          value: sumWhere((d) => d.startsWith(monthPrefix) && Number(d.slice(8)) >= start && Number(d.slice(8)) <= end)
        };
      });
      highlight = focusDay ? Math.floor((focusDay - 1) / 7) : -1;
      range = `Verified payments less refunds per week in ${monthName} ${chartYear}`;
    } else {
      bars = Array.from({ length: daysInMonth }, (_, i) => {
        const iso = `${monthPrefix}-${pad(i + 1)}`;
        return { label: String(i + 1), title: formatDateLong(iso), value: sumWhere((d) => d === iso) };
      });
      highlight = focusDay ? focusDay - 1 : -1;
      range = `Verified payments less refunds per day in ${monthName} ${chartYear}`;
    }

    const rangeTotal = bars.reduce((sum, b) => sum + b.value, 0);
    const picked = period === 'month' || chartDay !== 'all' ? bars[highlight] : null;
    const subtitle = `${range} · ${peso(rangeTotal)} total${picked ? ` · ${picked.title}: ${peso(picked.value)}` : ''}`;
    return { bars, highlight, subtitle };
  }, [verifiedPayments, refundsSent, period, chartYear, chartMonth, chartDay, daysInMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const chart = chartMode === 'bookings' ? bookings : earnings;

  const pickYear = (y) => {
    setChartYear(y);
    if (chartDay !== 'all' && chartDay > new Date(y, chartMonth + 1, 0).getDate()) setChartDay('all');
  };
  const pickMonth = (m) => {
    setChartMonth(m);
    if (chartDay !== 'all' && chartDay > new Date(chartYear, m + 1, 0).getDate()) setChartDay('all');
  };

  const eventsByDate = useMemo(() => {
    const map = {};
    (calendar.data ? calendar.data.reservations : []).forEach((r) => {
      if (HOLDS_DATE.includes(r.status)) (map[r.date] = map[r.date] || []).push(r);
    });
    return map;
  }, [calendar.data]);

  const getDay = (iso) => {
    if (!calendar.data) return { tone: 'open' };
    const blocked = calendar.data.availability.blocked.find((b) => b.date === iso);
    const events = eventsByDate[iso] || [];
    if (blocked) return { tone: 'blocked', label: `Blocked · ${blocked.reason}` };
    const names = events.map((e) => e.eventName).join(', ');
    if (calendarApi.dateUnavailableReason(iso, calendar.data.availability, { enforceLeadTime: false }))
      return { tone: 'full', label: `Fully booked · ${names}` };
    if (events.length) return { tone: 'event', label: names };
    return { tone: 'open' };
  };

  if (error)
    return (
      <DashCard>
        <ErrorState error={error} onRetry={reload} />
      </DashCard>
    );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box>
        <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: tokens.gold }}>
          Today · {formatDateLong(todayISO())}
        </Typography>
        <Typography
          component="h1"
          sx={{ mt: 0.5, fontSize: { xs: 22, md: 26 }, fontWeight: 700, color: tokens.textLight }}
        >
          Welcome Back, {firstName(user.name)}
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 2.5,
          alignItems: 'start',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.7fr) minmax(0, 1fr)' },
          gridTemplateAreas: { xs: '"kpi" "chart" "calendar" "lists"', lg: '"chart kpi" "lists calendar"' }
        }}
      >
        <DashCard sx={{ gridArea: 'chart', minWidth: 0 }}>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 1.5,
              mb: 2
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: tokens.textPrimary }}>
                {chartMode === 'bookings' ? 'Bookings per month' : `Earnings per ${period}`}
              </Typography>
              <Typography sx={{ mt: 0.25, fontSize: 12.5, color: tokens.textSecondary }}>
                {calendar.loading ? 'Loading…' : chart.subtitle}
              </Typography>
            </Box>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={chartMode}
              onChange={(_, v) => v && setChartMode(v)}
              aria-label="Chart"
            >
              <ToggleButton value="bookings" sx={{ px: 1.75, textTransform: 'none', fontWeight: 600 }}>
                Bookings
              </ToggleButton>
              <ToggleButton value="earnings" sx={{ px: 1.75, textTransform: 'none', fontWeight: 600 }}>
                Earnings
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {chartMode === 'earnings' && (
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1.5,
                mb: 2
              }}
            >
              <ToggleButtonGroup
                size="small"
                exclusive
                value={period}
                onChange={(_, v) => v && setPeriod(v)}
                aria-label="Group earnings by"
              >
                <ToggleButton value="month" sx={{ px: 1.5, textTransform: 'none', fontWeight: 600 }}>
                  Per month
                </ToggleButton>
                <ToggleButton value="week" sx={{ px: 1.5, textTransform: 'none', fontWeight: 600 }}>
                  Per week
                </ToggleButton>
                <ToggleButton value="day" sx={{ px: 1.5, textTransform: 'none', fontWeight: 600 }}>
                  Per day
                </ToggleButton>
              </ToggleButtonGroup>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  select
                  size="small"
                  value={chartMonth}
                  onChange={(e) => pickMonth(Number(e.target.value))}
                  inputProps={{ 'aria-label': 'Month' }}
                  sx={{ minWidth: 92 }}
                >
                  {MONTH_NAMES.map((name, m) => (
                    <MenuItem key={name} value={m}>
                      {name.slice(0, 3)}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  size="small"
                  value={chartDay}
                  disabled={period === 'month'}
                  onChange={(e) => setChartDay(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  inputProps={{ 'aria-label': 'Day' }}
                  sx={{ minWidth: 76 }}
                >
                  <MenuItem value="all">DD</MenuItem>
                  {Array.from({ length: daysInMonth }, (_, i) => (
                    <MenuItem key={i + 1} value={i + 1}>
                      {pad(i + 1)}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  size="small"
                  value={chartYear}
                  onChange={(e) => pickYear(Number(e.target.value))}
                  inputProps={{ 'aria-label': 'Year' }}
                  sx={{ minWidth: 92 }}
                >
                  {chartYears.map((y) => (
                    <MenuItem key={y} value={y}>
                      {y}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
            </Box>
          )}

          {calendar.error ? (
            <ErrorState error={calendar.error} onRetry={calendar.reload} />
          ) : calendar.loading ? (
            <ListSkeleton rows={1} height={220} />
          ) : (
            <BarChart
              data={chart.bars}
              highlightIndex={chart.highlight}
              format={chartMode === 'earnings' ? peso : undefined}
              minTop={chartMode === 'bookings' ? 10 : 0}
              ariaLabel={chart.subtitle}
            />
          )}
        </DashCard>

        <Box
          sx={{
            gridArea: 'kpi',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: { xs: 1.5, sm: 2.5 }
          }}
        >
          <StatCard
            icon={EventAvailableOutlinedIcon}
            tone="gold"
            label="Events Today"
            value={data ? data.eventsToday.length : 0}
            meta="Confirmed and in progress"
            loading={loading}
            onClick={() => navigate('/calendar')}
          />
          <StatCard
            icon={MarkEmailUnreadOutlinedIcon}
            tone="amber"
            label="Pending Requests"
            value={data ? data.pending.length : 0}
            meta={
              data
                ? [
                    data.pending.length
                      ? `Oldest ${data.pendingOldestDays === 0 ? 'from today' : `${pluralize(data.pendingOldestDays, 'day')} ago`}`
                      : 'Queue is clear',
                    data.awaitingAcceptance ? `${data.awaitingAcceptance} waiting for the customer` : ''
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : ''
            }
            loading={loading}
            onClick={() => navigate('/reservations?tab=requests')}
          />
          <StatCard
            icon={PendingActionsOutlinedIcon}
            tone="blue"
            label="Unverified Payments"
            value={data ? data.unverifiedPayments : 0}
            meta="Proofs waiting for review"
            loading={loading}
            onClick={() => navigate('/payments?filter=awaiting')}
          />
          <StatCard
            icon={PaymentsOutlinedIcon}
            tone="green"
            label="Revenue This Month"
            value={data ? peso(data.revenueThisMonth) : '₱0'}
            meta="Verified payments less refunds"
            loading={loading}
            onClick={() => navigate('/reports')}
          />
        </Box>

        <Box
          sx={{
            gridArea: 'lists',
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
            gap: 2.5,
            alignItems: 'start',
            minWidth: 0
          }}
        >
          <DashCard>
            <CardTitle
              action={
                data && (
                  <Pill
                    label={data.eventsToday.length ? `${data.eventsToday.length} today` : 'No event today'}
                    bg={tokens.goldChip}
                    fg={tokens.goldDark}
                    dot={false}
                  />
                )
              }
            >
              Events Today
            </CardTitle>
            {loading ? (
              <ListSkeleton rows={2} height={96} />
            ) : data.eventsToday.length === 0 ? (
              <EmptyState
                compact
                title="NO EVENT TODAY"
                description="There are no catering bookings or event reservations scheduled for today."
              />
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {data.eventsToday.map((e) => (
                  <Box
                    key={e.ref}
                    sx={{
                      display: 'flex',
                      gap: 1.5,
                      alignItems: 'flex-start',
                      p: 1.5,
                      borderRadius: 1.5,
                      border: `1px solid ${tokens.cardLightBorder}`
                    }}
                  >
                    <ThemeIcon occasion={e.occasion} size={52} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Typography sx={{ fontSize: 14.5, fontWeight: 700 }}>{e.eventName}</Typography>
                        <StatusChip status={e.status} size="sm" />
                      </Box>
                      <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                        {formatEventTime(e)} ·{' '}
                        {isRental(e.serviceType)
                          ? 'equipment rental'
                          : `${e.guests} guests · ${e.serviceType.toLowerCase()}`}{' '}
                        · {e.venue.name}, {e.venue.city}
                      </Typography>
                      <Box sx={{ mt: 0.75, display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
                        <Pill
                          size="sm"
                          label={e.balance === 0 ? 'Fully paid' : `Balance ${peso(e.balance)}`}
                          bg={e.balance === 0 ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)'}
                          fg={e.balance === 0 ? '#047857' : '#b45309'}
                        />
                      </Box>
                      <Button
                        size="small"
                        variant="outlined"
                        sx={{ mt: 1 }}
                        onClick={() => navigate(`/reservations/${e.ref}`)}
                      >
                        Open
                      </Button>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </DashCard>

          <DashCard>
            <CardTitle
              action={
                <Button size="small" onClick={() => navigate('/reservations?tab=requests')}>
                  View queue
                </Button>
              }
            >
              Newest Bookings
            </CardTitle>
            {loading ? (
              <ListSkeleton rows={3} height={56} />
            ) : data.pending.length === 0 ? (
              <EmptyState
                compact
                title="All caught up"
                description="Every reservation request has its quotation. The customer accepts it to approve the reservation."
              />
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                {data.pending.slice(0, 5).map((r) => (
                  <Box
                    key={r.ref}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      py: 1.25,
                      borderBottom: `1px solid ${tokens.cardLightBorder}`,
                      '&:last-child': { borderBottom: 0 }
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 700 }}>
                        {r.customerName}
                      </Typography>
                      <Typography noWrap sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                        {r.packageName} · {formatDateShort(r.date)} · {headcount(r, 'pax')}
                      </Typography>
                      <Typography sx={{ fontSize: 11.5, color: tokens.textMuted }}>
                        Received {formatRelative(r.createdAt)}
                      </Typography>
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

        <DashCard sx={{ gridArea: 'calendar', minWidth: 0 }}>
          <CardTitle
            action={
              <Button size="small" onClick={() => navigate('/calendar')}>
                Open calendar
              </Button>
            }
          >
            Calendar
          </CardTitle>
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
              onSelect={(iso) => navigate(`/calendar?date=${iso}`)}
              legend={[
                { tone: 'event', label: 'Booked' },
                { tone: 'full', label: 'Fully booked' },
                { tone: 'blocked', label: 'Blocked' }
              ]}
            />
          )}

          <Divider sx={{ my: 2 }} />
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, mb: 0.5 }}>Coming Up</Typography>
          {loading ? (
            <ListSkeleton rows={3} height={44} />
          ) : data.upcoming.length === 0 ? (
            <Typography sx={{ fontSize: 13.5, color: tokens.textSecondary }}>No approved events ahead.</Typography>
          ) : (
            data.upcoming.map((u) => (
              <Box
                key={u.ref}
                onClick={() => navigate(`/reservations/${u.ref}`)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  py: 1.1,
                  cursor: 'pointer',
                  borderBottom: `1px solid ${tokens.cardLightBorder}`,
                  '&:last-child': { borderBottom: 0 },
                  '&:hover .tm-up-name': { textDecoration: 'underline' }
                }}
              >
                <Box
                  sx={{
                    width: 46,
                    flexShrink: 0,
                    textAlign: 'center',
                    borderRadius: 1,
                    py: 0.5,
                    backgroundColor: tokens.surfaceMuted
                  }}
                >
                  <Typography
                    sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: tokens.goldDark }}
                  >
                    {formatWeekday(u.date, 'short')}
                  </Typography>
                  <Typography sx={{ fontSize: 15, fontWeight: 800, lineHeight: 1.1 }}>
                    {Number(u.date.slice(8))}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap className="tm-up-name" sx={{ fontSize: 13.5, fontWeight: 700 }}>
                    {u.eventName}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: tokens.textSecondary }}>
                    {formatEventTime(u)} · {headcount(u)}
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
