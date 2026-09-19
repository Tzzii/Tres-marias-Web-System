import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import MarkUnreadChatAltOutlinedIcon from '@mui/icons-material/MarkUnreadChatAltOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import {
  CardTitle,
  DashCard,
  EmptyState,
  ErrorState,
  Field,
  ListSkeleton,
  StatCard,
  StatusChip,
  StatusPipeline,
  ThemeIcon,
  daysFromToday,
  firstName,
  formatDate,
  formatDateLong,
  formatRelative,
  formatTime,
  messageApi,
  peso,
  pluralize,
  reservationApi,
  tokens,
  useDocumentTitle,
  useResource
} from '@tm/shared';
import { useAuth } from '../../auth.js';
import { readDraft } from '../../lib/booking.js';

// Statuses of bookings that are still in progress
const ACTIVE = ['pending', 'approved', 'downpayment_paid', 'confirmed'];

/** 1g / 1p · Customer dashboard. */
export default function DashboardPage() {
  useDocumentTitle('Dashboard');
  const navigate = useNavigate();
  const { user } = useAuth();
  // Load the customer's reservations and chat threads
  const { data, loading, error, reload } = useResource(async () => {
    const [reservations, threads] = await Promise.all([
      reservationApi.listReservations({ customerId: user.id }),
      messageApi.listThreads({ customerId: user.id, side: 'customer' })
    ]);
    return { reservations, threads };
  }, [user.id]);

  // Unfinished reservation form saved on this device, if any
  const draft = readDraft(user.id);

  if (error) return <DashCard><ErrorState error={error} onRetry={reload} /></DashCard>;

  // Numbers and items for the dashboard cards
  const reservations = data ? data.reservations : [];
  // Active events from today onward, soonest first
  const upcoming = reservations.filter((r) => ACTIVE.includes(r.status) && daysFromToday(r.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  const next = upcoming[0]; // the very next event
  const pending = reservations.filter((r) => r.status === 'pending').length;
  // Total still owed across approved and confirmed bookings
  const balanceDue = reservations.filter((r) => ['approved', 'downpayment_paid', 'confirmed'].includes(r.status)).reduce((sum, r) => sum + r.balance, 0);
  // First approved booking with no downpayment and no proof uploaded yet
  const needsDownpayment = reservations.find((r) => r.status === 'approved' && !r.downpaymentPaid && !r.awaitingCount);
  const unread = data ? data.threads.reduce((sum, t) => sum + t.unread, 0) : 0;
  const latestUnread = data ? data.threads.find((t) => t.unread) : null;
  // Reservation shown in the status progress card: the next event, or any active one
  const focus = next || reservations.find((r) => ACTIVE.includes(r.status));

  // Greeting based on the current hour
  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  })();

  // One-line summary under the greeting, picking the most important message first
  const subline = loading
    ? 'Loading your reservations…'
    : pending
      ? `You have ${pluralize(pending, 'reservation')} waiting on our approval.`
      : needsDownpayment
        ? `${needsDownpayment.eventName} is approved. Pay the downpayment to secure your date.`
        : next
          ? `Your next event is ${daysFromToday(next.date) === 0 ? 'today' : `in ${pluralize(daysFromToday(next.date), 'day')}`}.`
          : 'Everything is up to date.';

  // New customer with no reservations: show a welcome card instead of the stats
  const brandNew = !loading && reservations.length === 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box>
        <Typography component="h1" sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 700, color: tokens.textLight }}>
          {greeting}, {firstName(user.name)}
        </Typography>
        <Typography sx={{ mt: 0.5, fontSize: 14, color: tokens.textOnDarkSoft }}>{subline}</Typography>
      </Box>

      {/* "Continue" banner for an unfinished reservation form */}
      {draft && (
        <DashCard sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', borderLeft: `4px solid ${tokens.gold}` }}>
          <EditNoteRoundedIcon sx={{ fontSize: 30, color: tokens.goldDark }} />
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography sx={{ fontSize: 14.5, fontWeight: 700 }}>You have an unfinished reservation</Typography>
            <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>
              {draft.form.eventName || 'Untitled event'}
              {draft.form.date ? ` · ${formatDate(draft.form.date)}` : ''} · saved {formatRelative(draft.savedAt)}
            </Typography>
          </Box>
          <Button variant="contained" onClick={() => navigate('/portal/book?draft=1')}>
            Continue
          </Button>
        </DashCard>
      )}

      {brandNew ? (
        <DashCard>
          <EmptyState
            title="Your Home page is empty for now"
            description="Start your first reservation. Pick a package and your date, tell us the food you want, and we will send your quotation within 24 hours."
            action={
              <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => navigate('/portal/book')}>
                New reservation
              </Button>
            }
          />
        </DashCard>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2.5 }}>
            <StatCard icon={EventAvailableOutlinedIcon} tone="gold" label="Upcoming events" value={upcoming.length} meta={next ? formatDateLong(next.date) : 'Nothing scheduled'} loading={loading} onClick={() => navigate('/portal/calendar')} />
            <StatCard icon={PaymentsOutlinedIcon} tone={needsDownpayment ? 'amber' : 'green'} label="Balance due" value={peso(balanceDue)} meta={needsDownpayment ? 'Downpayment not yet paid' : balanceDue ? 'Due on or before event day' : 'All paid up'} loading={loading} onClick={() => navigate('/portal/payments')} />
            <StatCard icon={MarkUnreadChatAltOutlinedIcon} tone="blue" label="Unread messages" value={unread} meta={latestUnread ? 'From the admin' : 'No new messages'} loading={loading} onClick={() => navigate('/portal/messages')} />
          </Box>

          {loading ? (
            <DashCard>
              <ListSkeleton rows={3} height={60} />
            </DashCard>
          ) : (
            focus && (
              <DashCard>
                <CardTitle subtitle={`${focus.eventName} · ${focus.ref}`} action={<StatusChip status={focus.status} />}>
                  Reservation status
                </CardTitle>
                <StatusPipeline status={focus.status} />
              </DashCard>
            )
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.6fr 1fr' }, gap: 2.5, alignItems: 'start' }}>
            <DashCard>
              <CardTitle action={<Button size="small" onClick={() => navigate('/portal/reservations')}>View all</Button>}>Upcoming event preview</CardTitle>
              {loading ? (
                <ListSkeleton rows={2} height={70} />
              ) : next ? (
                <Box>
                  <Box sx={{ display: 'flex', gap: 2.5, alignItems: 'flex-start', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
                    <ThemeIcon occasion={next.occasion} size={92} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontSize: 18, fontWeight: 700 }}>{next.eventName}</Typography>
                        <StatusChip status={next.status} size="sm" />
                      </Box>
                      <Typography sx={{ mt: 0.5, fontSize: 13.5, color: tokens.textSecondary }}>
                        {formatDateLong(next.date)} · {formatTime(next.startTime)} · {next.guests} guests
                      </Typography>
                      <Typography sx={{ fontSize: 13.5, color: tokens.textSecondary }}>
                        {next.venue.name}, {next.venue.city}
                      </Typography>
                      <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
                        <Field label="Package">{next.packageName}</Field>
                        <Field label="Total">{peso(next.total)}</Field>
                        <Field label="Balance">{peso(next.balance)}</Field>
                      </Box>
                    </Box>
                  </Box>
                  <Box sx={{ mt: 2.5, display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
                    <Button variant="contained" onClick={() => navigate(`/portal/reservations/${next.ref}`)}>
                      View details
                    </Button>
                    <Button variant="outlined" startIcon={<ChatBubbleOutlineRoundedIcon />} onClick={() => navigate(`/portal/messages?ref=${next.ref}`)}>
                      Message us
                    </Button>
                  </Box>
                </Box>
              ) : (
                <EmptyState compact title="No upcoming events" description="Past events stay in My Reservations. Ready to plan the next one?" />
              )}
            </DashCard>

            <DashCard>
              <CardTitle>Quick actions</CardTitle>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => navigate('/portal/book')} sx={{ justifyContent: 'flex-start', py: 1.2 }}>
                  New reservation
                </Button>
                {/* Enabled only when a downpayment is due */}
                <Button
                  variant="outlined"
                  startIcon={<PaymentsOutlinedIcon />}
                  disabled={!needsDownpayment}
                  onClick={() => navigate(`/portal/payments?ref=${needsDownpayment.ref}`)}
                  sx={{ justifyContent: 'flex-start', py: 1.2 }}
                >
                  {/* What is still owed on the downpayment (part may already be paid) */}
                  {needsDownpayment ? `Pay downpayment · ${peso(needsDownpayment.downpayment - needsDownpayment.paid)}` : 'No downpayment due'}
                </Button>
                <Button variant="outlined" startIcon={<DescriptionOutlinedIcon />} onClick={() => navigate('/portal/documents')} sx={{ justifyContent: 'flex-start', py: 1.2 }}>
                  View contract and documents
                </Button>
              </Box>
            </DashCard>
          </Box>
        </>
      )}
    </Box>
  );
}
