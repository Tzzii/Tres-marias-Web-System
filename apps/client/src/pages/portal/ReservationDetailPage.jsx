import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import {
  AlertBanner,
  AppDialog,
  BUFFET_DRINKS,
  BUSINESS,
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
  RENTAL,
  REFUND_METHODS,
  StarRating,
  StatusChip,
  StatusPipeline,
  StylingSummary,
  ThemeIcon,
  bookingExtraGuests,
  bookingItems,
  daysFromToday,
  documentsFor,
  downpaymentDueFor,
  formatBookingItem,
  formatDate,
  formatDateLong,
  formatDateTime,
  formatEventTime,
  includesFood,
  isRental,
  pendingStep,
  peso,
  reservationApi,
  stylingEmpty,
  toISODate,
  todayISO,
  tokens,
  useDocumentTitle,
  useNotify,
  useResource
} from '@tm/shared';
import { useAuth } from '../../auth.js';

/**
 * 1i · Reservation details. Read-only except Accept Quotation, Request a change, Cancel and Pay.
 * A pending request is approved by the customer accepting the quotation we sent (pendingStep 'accept'):
 * the status card and the Payment Summary offer Accept Quotation, whose dialog shows the total, the
 * minimum downpayment and its due date first. An out-of-date quotation ('revise') waits for the revised one.
 * Cancel shows only while the booking can be cancelled online (the summary's `onlineCancel`, worked out
 * by domain/cancellation.js); the status card says until when, or why not and how to cancel instead.
 * It also shows the "Started preparing" mark, who cancelled, and any refund owed or sent, and the theme,
 * colours and design details chosen on the booking form (a card only when there are some; the team edits
 * them after a change request).
 */
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
  const [acceptOpen, setAcceptOpen] = useState(false); // "Accept quotation" confirmation dialog
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
        <PageHeader title="Loading Reservation…" crumbs={crumbs} />
        <DashCard>
          <ListSkeleton rows={6} height={48} />
        </DashCard>
      </>
    );
  }

  // Customer can request changes only in certain statuses (Pending, Approved)
  const editable = CUSTOMER_EDITABLE.includes(r.status);
  // Online cancellation: allowed now, or the reason why not (checked again when cancelling)
  const online = r.onlineCancel || { allowed: false, reason: '', deadline: r.cancelDeadline };
  const closed = ['cancelled', 'declined', 'completed'].includes(r.status);
  // What was returned so far on this booking, newest first
  const refunds = r.refunds || [];
  const refunded = r.refunded || 0;
  // Can pay when approved or later, money is owed, and no payment is already waiting for verification
  const canPay = ['approved', 'downpayment_paid', 'confirmed'].includes(r.status) && r.balance > 0 && !r.awaitingCount;
  // Quotation, contract and receipts for this reservation
  const docs = documentsFor(r);
  // Pending: 'quote' (we still send the quotation), 'revise' (a revised one is coming) or 'accept'
  const step = pendingStep(r);
  const quotationDoc = docs.find((d) => d.kind === 'quotation');
  // What accepting asks for: the minimum downpayment (the whole total when that is lower), due as an approval sets it
  const acceptDownpayment = r.quotation ? Math.min(r.downpayment, r.quotation.net) : 0;
  // An equipment rental shows its items, pick up or delivery and any damage charges instead of a package and menu
  const rental = isRental(r.serviceType);
  const delivered = rental && r.fulfilment === 'delivery';

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
            {online.allowed && (
              <Button startIcon={<EventBusyOutlinedIcon />} onClick={() => setCancelOpen(true)} sx={{ color: tokens.dangerSoft }}>
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
          {/* The button sits under the text, so the text keeps the banner's full width on a phone */}
          {step === 'accept' && (
            <AlertBanner tone="info" sx={{ mt: 2 }} title="Your Quotation Is Ready">
              Net total {peso(r.quotation.net)}. Open the quotation under Documents to see every line, then accept it to approve your reservation. To change something first, use Request a Change.
              <Box sx={{ mt: 1.25 }}>
                <Button size="small" variant="contained" onClick={() => setAcceptOpen(true)}>Accept Quotation</Button>
              </Box>
            </AlertBanner>
          )}
          {(step === 'quote' || step === 'revise') && (
            <AlertBanner tone="info" sx={{ mt: 2 }}>
              {step === 'revise'
                ? 'Your reservation changed after we sent your quotation. We will send you a revised quotation to accept.'
                : 'We are reviewing your request and will send your quotation within 24 hours. You accept it here to approve your reservation.'}
            </AlertBanner>
          )}
          {r.status === 'approved' && !r.downpaymentPaid && (
            <AlertBanner tone={r.awaitingCount ? 'info' : r.balanceState === 'overdue' ? 'error' : 'locked'} sx={{ mt: 2 }} title={r.awaitingCount ? 'Payment being verified' : r.balanceState === 'overdue' ? 'Downpayment overdue' : 'Downpayment due'} action={canPay && <Button size="small" variant="contained" onClick={() => navigate(`/portal/payments?ref=${r.ref}`)}>Pay now</Button>}>
              {r.awaitingCount
                ? 'Your payment is being verified, usually within a day.'
                : r.downpayment < r.total
                  ? `Pay at least ${peso(r.downpayment - r.paid)} by ${formatDateLong(r.downpaymentDue)} to secure your date. You can pay more, up to ${peso(r.balance)}.`
                  : `Pay the full ${peso(r.balance)} by ${formatDateLong(r.downpaymentDue)} to secure your date.`}
            </AlertBanner>
          )}
          {r.status === 'declined' && <AlertBanner tone="error" sx={{ mt: 2 }} title="Reason from our team">{r.declineReason}</AlertBanner>}
          {/* Records without cancelledBy are the customer's own cancellations */}
          {r.status === 'cancelled' && (
            <AlertBanner tone="error" sx={{ mt: 2 }} title={r.cancelledBy === 'admin' ? 'Cancelled by Tres Marias' : 'You cancelled this reservation'}>
              {r.cancelReason}
            </AlertBanner>
          )}
          {/* Money owed back after a cancellation (an overpayment shows under Payment summary) */}
          {['cancelled', 'declined'].includes(r.status) && r.refundDue > 0 && (
            <AlertBanner tone="info" sx={{ mt: 2 }} title={`Refund due: ${peso(r.refundDue)}`}>
              We'll return it and tell you in your chat.
            </AlertBanner>
          )}
          {/* Each refund recorded; a refund of ₱0 means everything paid was kept, with the reason */}
          {refunds.map((f) =>
            f.amount > 0 ? (
              <AlertBanner key={f.id} tone="success" sx={{ mt: 2 }} title={`Refunded ${peso(f.amount)} on ${formatDateLong(f.sentOn)}`}>
                Via {REFUND_METHODS[f.method]}
                {f.referenceNo ? ` · Ref ${f.referenceNo}` : ''}.{f.reason ? ` We kept ${peso(f.due - f.amount)}: ${f.reason}` : ''}
              </AlertBanner>
            ) : (
              <AlertBanner key={f.id} tone="info" sx={{ mt: 2 }} title="No refund">
                We kept the {peso(f.due)} you paid: {f.reason}
              </AlertBanner>
            )
          )}
          {/* Preparation has started: the booking can no longer be cancelled online */}
          {r.preparingAt && !closed && (
            <Typography sx={{ mt: 2, fontSize: 13.5, fontWeight: 600, color: tokens.textPrimary }}>Preparation started on {formatDateLong(toISODate(new Date(r.preparingAt)))}.</Typography>
          )}
          {/* Online cancellation: until when, or why not and how to cancel instead (nothing once the event day has come) */}
          {!closed && daysFromToday(r.date) > 0 && (
            <Typography sx={{ mt: r.preparingAt ? 0.5 : 2, fontSize: 13, lineHeight: 1.6, color: tokens.textSecondary }}>
              {!online.allowed
                ? `${online.reason} To cancel, message us in your chat or call ${BUSINESS.phone}.`
                : r.paid > 0
                  ? `You can cancel online until ${formatDateLong(online.deadline)}.`
                  : `You can cancel online any time before the event day. ${
                      online.deadline >= todayISO()
                        ? `After you pay, you can cancel online until ${formatDateLong(online.deadline)}.`
                        : `After you pay, message us in your chat or call ${BUSINESS.phone} to cancel: online cancellation for paid bookings ended on ${formatDateLong(online.deadline)}.`
                    }`}
            </Typography>
          )}
        </DashCard>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.6fr 1fr' }, gap: 2.5, alignItems: 'start' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, minWidth: 0 }}>
            <DashCard>
              <CardTitle>Event Details</CardTitle>
              <Box sx={{ display: 'flex', gap: 2.5, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
                <ThemeIcon occasion={r.occasion} size={84} />
                <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
                  <Field label="Date">{formatDateLong(r.date)}</Field>
                  <Field label={rental ? (delivered ? 'Delivery time' : 'Pick-up time') : 'Time'}>{formatEventTime(r)}</Field>
                  <Field label="Occasion">{r.occasion}</Field>
                  {rental ? <Field label="Getting the items">{delivered ? 'Delivery' : 'Pick up'}</Field> : <Field label="Guests">{r.guests}</Field>}
                </Box>
              </Box>
            </DashCard>

            {rental ? (
              <RentalItemsCard r={r} />
            ) : (
            <DashCard>
              <CardTitle subtitle={`${r.packageName} · ${peso(r.package.price)} · Default: ${r.package.guests} guests`}>{r.serviceType}</CardTitle>
              {/* For the booking's guest count: above the package's default, plates, chairs and tables grow and
                  the other counted items show the counts our quotation set, or "(to confirm)" before it */}
              <Field label={bookingExtraGuests(r) ? `Package includes, for your ${r.guests} guests` : 'Package includes'}>{bookingItems(r).map(formatBookingItem).join(', ')}</Field>
              <Divider sx={{ my: 2 }} />
              {/* A buffet lists the dish chosen for each category; catering only has no menu */}
              {includesFood(r.serviceType) ? (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
                  {(r.menuDishes || []).map((dish) => (
                    <Field key={dish.key} label={dish.label}>
                      {dish.name}
                    </Field>
                  ))}
                </Box>
              ) : (
                <Field label="Food">Catering only: equipment and setup, with no food.</Field>
              )}
              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                {includesFood(r.serviceType) && <Field label="Drinks">{BUFFET_DRINKS} for every guest</Field>}
                {/* Charges counted by the piece show how many were asked for */}
                <Field label="Additional charges">
                  {r.addons.length ? r.addons.map((a) => (a.hasQuantity ? `${a.name} × ${(r.addonQty || {})[a.id] || 1}` : a.name)).join(', ') : 'None'}
                </Field>
                {r.foodNotes && <Field label="Your note about the food">{r.foodNotes}</Field>}
              </Box>
            </DashCard>
            )}

            {/* The look chosen on the booking form; hidden when there is none (a rental, a blank section, an older booking) */}
            {!rental && !stylingEmpty(r.styling) && (
              <DashCard>
                <CardTitle subtitle={editable ? 'To change it, use Request a change and our team will update it.' : 'The look our team sets up for your event.'}>Theme and Colors</CardTitle>
                <StylingSummary styling={r.styling} />
              </DashCard>
            )}

            <DashCard>
              <CardTitle>{rental ? 'Pick Up or Delivery' : 'Venue and Logistics'}</CardTitle>
              {rental && !delivered ? (
                <Field label="Pick up at">{RENTAL.pickupAddress} · free</Field>
              ) : (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                  <Field label={rental ? 'Deliver to' : 'Venue'}>{r.venue.name}</Field>
                  <Field label="Address">{`${r.venue.address}, ${r.venue.city}`}</Field>
                  <Field label={rental ? 'Notes for the delivery' : 'Access notes'}>{r.venue.accessNotes || 'None'}</Field>
                </Box>
              )}
            </DashCard>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, minWidth: 0 }}>
            <DashCard>
              <CardTitle subtitle={step === 'accept' ? 'Your quotation, waiting for you to accept it' : step === 'revise' ? 'A revised quotation is on its way' : r.quotation ? 'Final quotation' : rental ? 'Your items and delivery, until our quotation confirms them' : 'An estimate until your quotation confirms the final amounts'}>Payment Summary</CardTitle>
              <DetailRow label="Total">{peso(r.total)}</DetailRow>
              {/* Before the quotation, the equipment for guests above the package's default has no price yet */}
              {!r.quotation && bookingExtraGuests(r) > 0 && <DetailRow label={`Extra ${bookingExtraGuests(r)} guests (equipment)`}>To be quoted</DetailRow>}
              <DetailRow label="Minimum downpayment">{peso(r.downpayment)}</DetailRow>
              {/* Paid = what was received; money given back shows on its own row */}
              <DetailRow label="Paid">{peso(r.paid + refunded)}</DetailRow>
              {refunded > 0 && <DetailRow label="Refunded">− {peso(refunded)}</DetailRow>}
              {r.awaitingAmount > 0 && <DetailRow label="Being verified">{peso(r.awaitingAmount)}</DetailRow>}
              <Divider sx={{ my: 1 }} />
              <DetailRow label={<b>Balance</b>}>
                <Box component="span" sx={{ fontSize: 17, fontWeight: 800 }}>
                  {peso(r.balance)}
                </Box>
              </DetailRow>
              {/* A lower revised quotation left more paid than the new total */}
              {r.overpaid > 0 && (
                <AlertBanner tone="info" sx={{ mt: 1.5 }} title={`Overpaid ${peso(r.overpaid)}, to be returned`}>
                  We'll return it and tell you in your chat when it's sent.
                </AlertBanner>
              )}
              {step === 'accept' && (
                <>
                  <Button fullWidth variant="contained" startIcon={<TaskAltRoundedIcon />} onClick={() => setAcceptOpen(true)} sx={{ mt: 1.5 }}>
                    Accept quotation
                  </Button>
                  {quotationDoc && (
                    <Button fullWidth variant="outlined" startIcon={<DescriptionOutlinedIcon />} onClick={() => setDoc(quotationDoc)} sx={{ mt: 1.25 }}>
                      View quotation
                    </Button>
                  )}
                </>
              )}
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
                <CardTitle>Your Testimonial</CardTitle>
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

      {/* Accepting approves the request: the server checks again that the date is still free, and a refusal stays in the dialog */}
      {step === 'accept' && (
        <ConfirmDialog
          open={acceptOpen}
          onClose={() => setAcceptOpen(false)}
          title="Accept This Quotation?"
          description={`You agree to the net total of ${peso(r.quotation.net)} for ${r.eventName}. This approves your reservation and holds your date. ${
            acceptDownpayment < r.quotation.net
              ? `Pay a downpayment of at least ${peso(acceptDownpayment)} by ${formatDateLong(downpaymentDueFor(r.date))} to secure it.`
              : `Pay the full ${peso(r.quotation.net)} by ${formatDateLong(downpaymentDueFor(r.date))} to secure it.`
          }`}
          confirmLabel="Accept quotation"
          cancelLabel="Not yet"
          onConfirm={async () => {
            await reservationApi.acceptQuotation(r.ref, r.quotation.sentAt);
            setAcceptOpen(false);
            notify('Quotation accepted. Your reservation is approved.');
          }}
        />
      )}

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel This Reservation?"
        description={r.paid > 0 ? `You paid ${peso(r.paid)}. We'll return it and tell you in your chat when it's sent.` : 'The date will be released for other bookings. This cannot be undone.'}
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

/** Dialog where the customer describes the change they want (10 to 2,000 characters, like a chat message). */
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
      title="Request a Change"
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
      <FormField id="change-message" label="Your request" multiline minRows={4} value={message} onChange={(e) => { setMessage(e.target.value); setError(''); }} error={error} placeholder="e.g. Please change the guest count from 150 to 170 and add Mango Float to the food." inputProps={{ maxLength: 2000 }} />
    </AppDialog>
  );
}

/**
 * What a rental includes: each item with how many and its price per piece (the prices it was booked
 * at), and any damage charges recorded after the items came back. The quotation is what the customer
 * pays; this card only lists the booking.
 */
function RentalItemsCard({ r }) {
  const damage = r.damageCharges || [];
  return (
    <DashCard>
      <CardTitle subtitle={`${r.packageName} · priced per piece`}>Rented Items</CardTitle>
      {r.rentalItems.map((line) => (
        <DetailRow key={line.itemId} label={`${line.name} · ${line.qty} × ${peso(line.price)}`}>
          {peso(line.qty * line.price)}
        </DetailRow>
      ))}
      <Typography sx={{ mt: 1, fontSize: 12.5, color: tokens.textSecondary }}>
        Pieces that come back damaged or missing are charged at each item's damage fee: {r.rentalItems.map((line) => `${line.name} ${peso(line.damageFee)}`).join(', ')}.
      </Typography>
      {damage.length > 0 && (
        <AlertBanner tone="warning" sx={{ mt: 2 }} title="Damage charges">
          {damage.map((line) => `${line.qty} × ${line.name} (${peso(line.fee)} each)`).join(', ')}: {peso(damage.reduce((sum, line) => sum + line.qty * line.fee, 0))}. {r.quotationStale ? 'They apply once our revised quotation reaches you.' : 'They are included in your quotation.'}
        </AlertBanner>
      )}
    </DashCard>
  );
}
