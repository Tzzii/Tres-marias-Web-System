import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import {
  CardTitle,
  DashCard,
  EmptyState,
  ErrorState,
  ListSkeleton,
  daysFromToday,
  formatDate,
  pendingStep,
  peso,
  todayISO,
  tokens
} from '@tm/shared';
import { operationsMetrics } from '../lib/operationsMetrics.js';

export function NeedsAttention({ data, loading, error, onRetry }) {
  if (error)
    return (
      <DashCard>
        <ErrorState error={error} onRetry={onRetry} />
      </DashCard>
    );
  if (loading || !data)
    return (
      <DashCard>
        <ListSkeleton rows={3} height={42} />
      </DashCard>
    );
  const { reservations = [], payments = [], inventory = [] } = data;
  const active = reservations.filter((r) =>
    ['approved', 'downpayment_paid', 'confirmed', 'completed'].includes(r.status)
  );
  const tasks = [
    ...payments
      .filter((p) => p.status === 'awaiting')
      .map((p) => ({
        key: `payment-${p.id}`,
        title: 'Verify a payment',
        text: `${p.customerName} · ${peso(p.amount)}`,
        to: `/payments?verify=${p.id}`,
        priority: 0
      })),
    ...reservations
      .filter((r) => ['quote', 'revise'].includes(pendingStep(r)))
      .map((r) => ({
        key: `quote-${r.ref}`,
        title: pendingStep(r) === 'revise' ? 'Revise a quotation' : 'Prepare a quotation',
        text: `${r.customerName} · ${r.eventName}`,
        to: `/reservations/${r.ref}`,
        priority: 1
      })),
    ...active
      .filter((r) => r.status !== 'completed' && r.balanceState === 'overdue')
      .map((r) => ({
        key: `due-${r.ref}`,
        title: 'Follow up an overdue balance',
        text: `${r.eventName} · ${peso(r.balance)}`,
        to: `/reservations/${r.ref}`,
        priority: 2
      })),
    ...active
      .filter(
        (r) => r.status !== 'completed' && daysFromToday(r.date) >= 0 && daysFromToday(r.date) <= 7 && !r.preparingAt
      )
      .map((r) => ({
        key: `prep-${r.ref}`,
        title: 'Review event preparation',
        text: `${r.eventName} · ${formatDate(r.date)}`,
        to: `/reservations/${r.ref}`,
        priority: 3
      })),
    ...inventory
      .filter((i) => ['low', 'out'].includes(i.stock) || i.damaged > 0)
      .map((i) => ({
        key: `stock-${i.id}`,
        title: i.damaged > 0 ? 'Review damaged equipment' : 'Review equipment stock',
        text: `${i.name} · ${i.available} available`,
        to: '/inventory',
        priority: 4
      }))
  ].sort((a, b) => a.priority - b.priority);
  return (
    <DashCard className="tm-feature-card" sx={{ borderTop: `3px solid ${tokens.gold}` }}>
      <CardTitle
        subtitle="Prioritized work that needs a decision"
        action={
          <Button component={RouterLink} to="/reservations?tab=all" size="small">
            All reservations
          </Button>
        }
      >
        Needs attention · {tasks.length}
      </CardTitle>
      {!tasks.length ? (
        <EmptyState
          title="Your queue is clear"
          description="New quotations, payments and preparation tasks will appear here."
        />
      ) : (
        <Box sx={{ display: 'grid', gap: 1.25, maxHeight: 310, overflowY: 'auto' }}>
          {tasks.slice(0, 12).map((task) => (
            <Box
              key={task.key}
              sx={{
                display: 'flex',
                gap: 2,
                alignItems: 'center',
                justifyContent: 'space-between',
                py: 1,
                borderBottom: `1px solid ${tokens.cardLightBorder}`
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{task.title}</Typography>
                <Typography sx={{ fontSize: 12, color: tokens.textSecondary, overflowWrap: 'anywhere' }}>
                  {task.text}
                </Typography>
              </Box>
              <Button component={RouterLink} to={task.to} size="small" aria-label={`${task.title}: ${task.text}`}>
                Review
              </Button>
            </Box>
          ))}
          {tasks.length > 12 && (
            <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>
              Showing the first 12 priorities. Open the relevant section for the full list.
            </Typography>
          )}
        </Box>
      )}
    </DashCard>
  );
}

export function BusinessPulse({ data, loading, error, onRetry }) {
  if (error)
    return (
      <DashCard>
        <ErrorState error={error} onRetry={onRetry} />
      </DashCard>
    );
  if (loading || !data)
    return (
      <DashCard>
        <ListSkeleton rows={3} height={42} />
      </DashCard>
    );
  const { reservations = [], payments = [], refunds = [] } = data;
  const { net, before, bookingValue, outstanding } = operationsMetrics({ reservations, payments, refunds }, todayISO());
  const change =
    before > 0
      ? `${Math.abs(((net - before) / before) * 100).toFixed(1)}% ${net >= before ? 'higher' : 'lower'}`
      : 'No positive prior-period baseline';
  return (
    <DashCard>
      <CardTitle subtitle="Booking value and cash collections measure different things">Business pulse</CardTitle>
      <Typography sx={{ fontSize: 12, color: tokens.textSecondary }}>Net collections · month to date</Typography>
      <Typography sx={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.04em' }}>{peso(net)}</Typography>
      <Typography sx={{ mt: 0.5, fontSize: 12, color: tokens.textSecondary }}>
        {change}
        {before > 0 ? ' than the same date range last month' : ''}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          mt: 3,
          gap: 2,
          pt: 2,
          borderTop: `1px solid ${tokens.cardLightBorder}`
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 11.5, color: tokens.textMuted }}>Accepted bookings this month</Typography>
          <Typography sx={{ mt: 0.5, fontSize: 19, fontWeight: 600 }}>{peso(bookingValue)}</Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 11.5, color: tokens.textMuted }}>Open booking balances</Typography>
          <Typography sx={{ mt: 0.5, fontSize: 19, fontWeight: 600 }}>{peso(outstanding)}</Typography>
        </Box>
      </Box>
      <Typography sx={{ mt: 2, fontSize: 11, color: tokens.textMuted }}>
        Collections = verified payments less recorded refunds. Booking value uses event dates; open balances exclude
        completed bookings.
      </Typography>
    </DashCard>
  );
}
