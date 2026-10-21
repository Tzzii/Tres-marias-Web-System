import { Link as RouterLink, useNavigate } from 'react-router-dom';
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
  EventWorkspace,
  ListSkeleton,
  StatCard,
  StatusChip,
  daysFromToday,
  firstName,
  formatDate,
  formatDateLong,
  formatRelative,
  messageApi,
  pendingStep,
  peso,
  pluralize,
  reservationApi,
  tokens,
  useDocumentTitle,
  useResource
} from '@tm/shared';
import { useAuth } from '../../auth.js';
import { readDraft } from '../../lib/booking.js';
import FirstReservationWelcome from '../../components/FirstReservationWelcome.jsx';

const ACTIVE = ['pending', 'approved', 'downpayment_paid', 'confirmed'];

export default function DashboardPage() {
  useDocumentTitle('Dashboard');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, error, reload } = useResource(async () => {
    const [reservations, threads] = await Promise.all([
      reservationApi.listReservations({ customerId: user.id }),
      messageApi.listThreads({ customerId: user.id, side: 'customer' })
    ]);
    return { reservations, threads };
  }, [user.id]);

  const draft = readDraft(user.id);

  if (error)
    return (
      <DashCard>
        <ErrorState error={error} onRetry={reload} />
      </DashCard>
    );

  const reservations = data ? data.reservations : [];
  const upcoming = reservations
    .filter((r) => ACTIVE.includes(r.status) && daysFromToday(r.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const next = upcoming[0];
  const toAccept = reservations.find((r) => pendingStep(r) === 'accept');
  const pending = reservations.filter((r) => r.status === 'pending' && pendingStep(r) !== 'accept').length;
  const balanceDue = reservations
    .filter((r) => ['approved', 'downpayment_paid', 'confirmed'].includes(r.status))
    .reduce((sum, r) => sum + r.balance, 0);
  const needsDownpayment = reservations.find((r) => r.status === 'approved' && !r.downpaymentPaid && !r.awaitingCount);
  const unread = data ? data.threads.reduce((sum, t) => sum + t.unread, 0) : 0;
  const latestUnread = data ? data.threads.find((t) => t.unread) : null;

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  })();

  const subline = loading
    ? 'Loading your reservations…'
    : toAccept
      ? `Your quotation for ${toAccept.eventName} is ready. Accept it to approve your reservation.`
      : pending
        ? `You have ${pluralize(pending, 'reservation')} waiting for our quotation.`
        : needsDownpayment
          ? `${needsDownpayment.eventName} is approved. Pay the downpayment to secure your date.`
          : next
            ? `Your next event is ${daysFromToday(next.date) === 0 ? 'today' : `in ${pluralize(daysFromToday(next.date), 'day')}`}.`
            : !reservations.length
              ? 'Welcome to your planning space. Let’s bring your next celebration to life.'
              : 'Everything is up to date.';

  const brandNew = !loading && reservations.length === 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, ...(brandNew && { maxWidth: 1440, mx: 'auto' }) }}>
      <Box>
        <Typography component="h1" sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 700, color: tokens.textLight }}>
          {greeting}, {firstName(user.name)}
        </Typography>
        <Typography sx={{ mt: 0.5, fontSize: 14, color: tokens.textOnDarkSoft }}>{subline}</Typography>
      </Box>

      {!loading && (toAccept || needsDownpayment || next) && (
        <EventWorkspace
          event={toAccept || needsDownpayment || next}
          action={
            <Button
              variant="contained"
              onClick={() =>
                navigate(
                  toAccept
                    ? `/portal/reservations/${toAccept.ref}`
                    : needsDownpayment
                      ? `/portal/payments?ref=${needsDownpayment.ref}`
                      : `/portal/reservations/${next.ref}`
                )
              }
            >
              {toAccept ? 'Review your quotation' : needsDownpayment ? 'Pay your downpayment' : 'View your event'}
            </Button>
          }
        />
      )}

      {draft && (
        <DashCard
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexWrap: 'wrap',
            borderLeft: `4px solid ${tokens.gold}`
          }}
        >
          <EditNoteRoundedIcon sx={{ fontSize: 30, color: tokens.goldDark }} />
          <Box sx={{ flex: '1 1 200px', minWidth: 0, overflowWrap: 'anywhere' }}>
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
        <FirstReservationWelcome draft={draft} />
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2.5 }}>
            <StatCard
              icon={EventAvailableOutlinedIcon}
              tone="gold"
              label="Upcoming Events"
              value={upcoming.length}
              meta={next ? formatDateLong(next.date) : 'Nothing scheduled'}
              loading={loading}
              onClick={() => navigate('/portal/calendar')}
            />
            <StatCard
              icon={PaymentsOutlinedIcon}
              tone={needsDownpayment ? 'amber' : 'green'}
              label="Balance Due"
              value={peso(balanceDue)}
              meta={
                needsDownpayment
                  ? 'Downpayment not yet paid'
                  : balanceDue
                    ? 'Due on or before event day'
                    : 'All paid up'
              }
              loading={loading}
              onClick={() => navigate('/portal/payments')}
            />
            <StatCard
              icon={MarkUnreadChatAltOutlinedIcon}
              tone="blue"
              label="Unread Messages"
              value={unread}
              meta={latestUnread ? 'From the admin' : 'No new messages'}
              loading={loading}
              onClick={() => navigate('/portal/messages')}
            />
          </Box>

          <Box
            sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.6fr 1fr' }, gap: 2.5, alignItems: 'start' }}
          >
            <DashCard>
              <CardTitle
                action={
                  <Button size="small" onClick={() => navigate('/portal/reservations')}>
                    View all
                  </Button>
                }
              >
                Upcoming celebrations
              </CardTitle>
              {loading ? (
                <ListSkeleton rows={2} height={70} />
              ) : upcoming.length ? (
                <Box sx={{ display: 'grid', gap: 1 }}>
                  {upcoming.slice(0, 3).map((event) => (
                    <Button
                      key={event.ref}
                      component={RouterLink}
                      to={`/portal/reservations/${event.ref}`}
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        textAlign: 'left',
                        gap: 2,
                        p: 1.5,
                        borderRadius: 2,
                        border: `1px solid ${tokens.cardLightBorder}`
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: tokens.textPrimary }}>
                          {event.eventName}
                        </Typography>
                        <Typography sx={{ mt: 0.5, fontSize: 12, fontWeight: 400, color: tokens.textSecondary }}>
                          {formatDateLong(event.date)} · {event.packageName}
                        </Typography>
                      </Box>
                      <StatusChip status={event.status} size="sm" />
                    </Button>
                  ))}
                  <Button
                    component={RouterLink}
                    to="/portal/messages"
                    variant="text"
                    startIcon={<ChatBubbleOutlineRoundedIcon />}
                    sx={{ justifySelf: 'start', mt: 1 }}
                  >
                    Message our team
                  </Button>
                </Box>
              ) : (
                <EmptyState
                  compact
                  title="No upcoming events"
                  description="Past events stay in My Reservations. Ready to plan the next one?"
                />
              )}
            </DashCard>

            <DashCard>
              <CardTitle>Quick Actions</CardTitle>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                <Button
                  variant="contained"
                  startIcon={<AddRoundedIcon />}
                  onClick={() => navigate('/portal/book')}
                  sx={{ justifyContent: 'flex-start', py: 1.2 }}
                >
                  New reservation
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<PaymentsOutlinedIcon />}
                  disabled={!needsDownpayment}
                  onClick={() => navigate(`/portal/payments?ref=${needsDownpayment.ref}`)}
                  sx={{ justifyContent: 'flex-start', py: 1.2 }}
                >
                  {needsDownpayment
                    ? `Pay downpayment · ${peso(needsDownpayment.downpayment - needsDownpayment.paid)}`
                    : 'No downpayment due'}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<DescriptionOutlinedIcon />}
                  onClick={() => navigate('/portal/documents')}
                  sx={{ justifyContent: 'flex-start', py: 1.2 }}
                >
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
