import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import {
  AlertBanner,
  AppDialog,
  BusyButton,
  CUSTOMER_EDITABLE,
  CardTitle,
  ConfirmDialog,
  DashCard,
  DetailRow,
  DocumentDialog,
  ErrorState,
  FEEDBACK_CATEGORIES,
  Field,
  FormField,
  ListSkeleton,
  PageHeader,
  StarRating,
  StatusChip,
  StatusPipeline,
  ThemeIcon,
  documentsFor,
  formatDate,
  formatDateLong,
  formatDateTime,
  formatPackageItem,
  formatTime,
  peso,
  reservationApi,
  toISODate,
  tokens,
  useDocumentTitle,
  useNotify,
  useResource
} from '@tm/shared';
import { useAuth } from '../../auth.js';

/** 1i · Reservation details. Read-only except Request a change, Cancel and Pay. */
export default function ReservationDetailPage() {
  const { ref } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { user } = useAuth();
  // Load the reservation. Passing customerId makes sure customers can only open their own bookings.
  const { data: r, loading, error, reload } = useResource(() => reservationApi.getReservation(ref, { customerId: user.id }), [ref, user.id]);
  useDocumentTitle(r ? r.eventName : 'Reservation');

  const [changeOpen, setChangeOpen] = useState(false); // "Request a change" dialog
  const [cancelOpen, setCancelOpen] = useState(false); // cancel confirmation dialog
  const [doc, setDoc] = useState(null); // document open in the preview

  const crumbs = [{ label: 'My Reservations', to: '/portal/reservations' }, { label: r ? r.eventName : ref }];

  if (error) {
    return (
      <>
        <PageHeader title="Reservation" crumbs={crumbs} />
        <DashCard>
          <ErrorState error={error} onRetry={reload} />
        </DashCard>
      </>
    );
  }

  if (loading || !r) {
    return (
      <>
        <PageHeader title="Loading reservation…" crumbs={crumbs} />
        <DashCard>
          <ListSkeleton rows={6} height={48} />
        </DashCard>
      </>
    );
  }

  // Customer can request changes or cancel only in certain statuses
  const editable = CUSTOMER_EDITABLE.includes(r.status);
  // Can pay when approved or later, money is owed, and no payment is already waiting for verification
  const canPay = ['approved', 'downpayment_paid', 'confirmed'].includes(r.status) && r.balance > 0 && !r.awaitingCount;
  // Quotation, contract and receipts for this reservation
  const docs = documentsFor(r);

  return (
    <>
      <PageHeader
        crumbs={crumbs}
        title={r.eventName}
        chip={<StatusChip status={r.status} />}
        subtitle={`${r.ref} · requested ${formatDate(toISODate(new Date(r.createdAt)))}`}
        actions={
          <>
            {editable && (
              <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => setChangeOpen(true)} sx={{ color: tokens.textLight, borderColor: 'rgba(197,160,89,0.45)' }}>
                Request a change
              </Button>
            )}
            {editable && (
              <Button startIcon={<EventBusyOutlinedIcon />} onClick={() => setCancelOpen(true)} sx={{ color: '#fca5a5' }}>
                Cancel
              </Button>
            )}
          </>
        }
      />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {/* Status progress bar plus a message explaining what happens next */}
        <DashCard>
          <StatusPipeline status={r.status} />
          {r.status === 'pending' && (
            <AlertBanner tone="info" sx={{ mt: 2 }}>
              {r.quotation ? 'Your quotation is ready below. We will approve the reservation and send payment instructions shortly.' : 'We are reviewing your request and will send the final quotation within 24 hours.'}
            </AlertBanner>
          )}
          {r.status === 'approved' && !r.downpaymentPaid && (
            <AlertBanner tone={r.awaitingCount ? 'info' : r.balanceState === 'overdue' ? 'error' : 'locked'} sx={{ mt: 2 }} title={r.awaitingCount ? 'Payment being verified' : r.balanceState === 'overdue' ? 'Downpayment overdue' : 'Downpayment due'} action={canPay && <Button size="small" variant="contained" onClick={() => navigate(`/portal/payments?ref=${r.ref}`)}>Pay now</Button>}>
              {r.awaitingCount ? 'Your payment is being verified, usually within a day.' : `Pay ${peso(r.downpayment - r.paid)} by ${formatDateLong(r.downpaymentDue)} to secure your date.`}
            </AlertBanner>
          )}
          {r.status === 'declined' && <AlertBanner tone="error" sx={{ mt: 2 }} title="Reason from our team">{r.declineReason}</AlertBanner>}
          {r.status === 'cancelled' && <AlertBanner tone="error" sx={{ mt: 2 }} title="You cancelled this reservation">{r.cancelReason}</AlertBanner>}
        </DashCard>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.6fr 1fr' }, gap: 2.5, alignItems: 'start' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, minWidth: 0 }}>
            <DashCard>
              <CardTitle>Event details</CardTitle>
              <Box sx={{ display: 'flex', gap: 2.5, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
                <ThemeIcon occasion={r.occasion} size={84} />
                <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
                  <Field label="Date">{formatDateLong(r.date)}</Field>
                  <Field label="Start">{formatTime(r.startTime)}</Field>
                  <Field label="Occasion">{r.occasion}</Field>
                  <Field label="Guests">{r.guests}</Field>
                </Box>
              </Box>
            </DashCard>

            <DashCard>
              <CardTitle subtitle={`${r.packageName} · ${peso(r.package.price)} · covers ${r.package.guests} guests`}>Package and food</CardTitle>
              <Field label="Package includes">{r.package.items.map(formatPackageItem).join(', ')}</Field>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <Field label="Food you asked us to cook">{r.foodRequest}</Field>
                <Field label="Additional charges">{r.addons.length ? r.addons.map((a) => a.name).join(', ') : 'None'}</Field>
              </Box>
            </DashCard>

            <DashCard>
              <CardTitle>Venue and logistics</CardTitle>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <Field label="Venue">{r.venue.name}</Field>
                <Field label="Address">{`${r.venue.address}, ${r.venue.city}`}</Field>
                <Field label="Setup style">{r.venue.setup}</Field>
                <Field label="Access notes">{r.venue.accessNotes || 'None'}</Field>
              </Box>
            </DashCard>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, minWidth: 0 }}>
            <DashCard>
              <CardTitle subtitle={r.quotation ? 'Final quotation' : 'Package price only until your quotation prices the food and additional charges'}>Payment summary</CardTitle>
              <DetailRow label="Total">{peso(r.total)}</DetailRow>
              <DetailRow label="Downpayment · 50%">{peso(r.downpayment)}</DetailRow>
              <DetailRow label="Paid">{peso(r.paid)}</DetailRow>
              {r.awaitingAmount > 0 && <DetailRow label="Being verified">{peso(r.awaitingAmount)}</DetailRow>}
              <Divider sx={{ my: 1 }} />
              <DetailRow label={<b>Balance</b>}>
                <Box component="span" sx={{ fontSize: 17, fontWeight: 800 }}>
                  {peso(r.balance)}
                </Box>
              </DetailRow>
              {canPay && (
                <Button fullWidth variant="contained" startIcon={<PaymentsOutlinedIcon />} onClick={() => navigate(`/portal/payments?ref=${r.ref}`)} sx={{ mt: 1.5 }}>
                  {r.downpaymentPaid ? 'Pay balance' : 'Pay downpayment'}
                </Button>
              )}
              <Button fullWidth variant="outlined" startIcon={<ChatBubbleOutlineRoundedIcon />} onClick={() => navigate(`/portal/messages?ref=${r.ref}`)} sx={{ mt: 1.25 }}>
                Message us
              </Button>
            </DashCard>

            <DashCard>
              <CardTitle>Documents</CardTitle>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {docs.map((d) => (
                  <Box key={d.key} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1.25, borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}` }}>
                    <DescriptionOutlinedIcon sx={{ color: d.available ? tokens.goldDark : tokens.placeholder }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 13, fontWeight: 600 }}>{d.name}</Typography>
                      <Typography sx={{ fontSize: 11.5, color: tokens.textMuted }}>{d.note}</Typography>
                    </Box>
                    {d.available ? (
                      <Button size="small" onClick={() => setDoc(d)}>
                        Open
                      </Button>
                    ) : (
                      <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>Pending</Typography>
                    )}
                  </Box>
                ))}
              </Box>
            </DashCard>

            {/* After the event: show the customer's review, or invite them to write one */}
            {r.status === 'completed' && (
              <DashCard>
                <CardTitle>Your testimonial</CardTitle>
                {r.testimonial ? (
                  <>
                    <StarRating value={r.testimonial.rating} showValue />
                    <Typography sx={{ mt: 1, fontSize: 13.5, color: tokens.textSecondary }}>“{r.testimonial.body}”</Typography>
                    {/* What you rated part by part */}
                    <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                      {FEEDBACK_CATEGORIES.filter(({ key }) => r.testimonial.categories && r.testimonial.categories[key]).map(({ key, label }) => (
                        <Typography key={key} sx={{ fontSize: 12, color: tokens.textSecondary }}>
                          {label}: <b>{r.testimonial.categories[key]}/5</b>
                        </Typography>
                      ))}
                    </Box>
                    {/* The admin's answer to this review */}
                    {r.testimonial.reply && (
                      <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 1.5, backgroundColor: tokens.surfaceSubtle, border: `1px solid ${tokens.cardLightBorder}` }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 700, color: tokens.textSecondary }}>
                          Reply from Admin · {formatDateTime(r.testimonial.reply.at)}
                        </Typography>
                        <Typography sx={{ mt: 0.25, fontSize: 12.5, lineHeight: 1.6, color: tokens.textPrimary }}>{r.testimonial.reply.body}</Typography>
                      </Box>
                    )}
                  </>
                ) : (
                  <>
                    <Typography sx={{ fontSize: 13.5, color: tokens.textSecondary }}>How did we do? Your review helps other families plan their celebrations.</Typography>
                    <Button variant="contained" sx={{ mt: 1.5 }} onClick={() => navigate(`/portal/testimonials?ref=${r.ref}`)}>
                      Write a testimonial
                    </Button>
                  </>
                )}
              </DashCard>
            )}

            <DashCard>
              <CardTitle>Activity</CardTitle>
              <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1.75 }}>
                {/* History of the booking, newest first */}
                {r.activity.slice().reverse().map((a, i) => (
                  <Box component="li" key={`${a.at}-${i}`} sx={{ display: 'flex', gap: 1.5 }}>
                    <Box sx={{ mt: 0.75, width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: i === 0 ? tokens.gold : tokens.cardLightBorder }} />
                    <Box>
                      <Typography sx={{ fontSize: 13, color: tokens.textPrimary }}>{a.text}</Typography>
                      <Typography sx={{ fontSize: 11.5, color: tokens.textMuted }}>
                        {a.actor} · {formatDateTime(a.at)}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </DashCard>
          </Box>
        </Box>
      </Box>

      <ChangeRequestDialog
        open={changeOpen}
        onClose={() => setChangeOpen(false)}
        // Send the change request as a chat message (tagged with this event), then open the chat
        onSend={async (message) => {
          await reservationApi.requestChange(r.ref, user.id, message);
          setChangeOpen(false);
          notify('Change request sent to the admin.');
          navigate('/portal/messages');
        }}
      />

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this reservation?"
        description={r.paid > 0 ? 'Refunds follow the cancellation terms in your contract. The admin will contact you in your chat.' : 'The date will be released for other bookings. This cannot be undone.'}
        confirmLabel="Cancel reservation"
        cancelLabel="Keep reservation"
        tone="danger"
        reasonLabel="Why are you cancelling?"
        reasonPlaceholder="e.g. We moved the celebration to next year."
        // Cancel with the reason the customer typed
        onConfirm={async (reason) => {
          await reservationApi.cancelReservation(r.ref, user.id, reason);
          setCancelOpen(false);
          notify('Your reservation was cancelled.', 'info');
        }}
      />

      <DocumentDialog open={Boolean(doc)} onClose={() => setDoc(null)} detail={r} doc={doc} />
    </>
  );
}

/** Dialog where the customer describes the change they want. */
function ChangeRequestDialog({ open, onClose, onSend }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Require at least 10 characters, send, then clear the text box
  const send = async () => {
    if (message.trim().length < 10) {
      setError('Describe the change you need (at least 10 characters).');
      return;
    }
    setBusy(true);
    try {
      await onSend(message);
      setMessage('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      busy={busy}
      title="Request a change"
      description="Tell us what you would like to change: date, guest count, package, food, venue or additional charges. The admin replies in your chat, usually within an hour."
      actions={
        <>
          <Button onClick={onClose} disabled={busy} sx={{ color: tokens.textSecondary }}>
            Cancel
          </Button>
          <BusyButton busy={busy} onClick={send}>
            Send request
          </BusyButton>
        </>
      }
    >
      <FormField id="change-message" label="Your request" multiline minRows={4} value={message} onChange={(e) => { setMessage(e.target.value); setError(''); }} error={error} placeholder="e.g. Please change the guest count from 150 to 170 and add Mango Float to the food." />
    </AppDialog>
  );
}
