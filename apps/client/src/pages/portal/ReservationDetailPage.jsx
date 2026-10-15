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
  buffetDrinks,
  dessertSummary,
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
  PackageItemList,
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
  formatDate,
  formatDateLong,
  formatDateTime,
  formatEventTime,
  includesFood,
  isRental,
  pendingStep,
  otherChargeItemsFor,
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

export default function ReservationDetailPage() {
  const { ref } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { user } = useAuth();
  const {
    data: r,
    loading,
    error,
    reload
  } = useResource(() => reservationApi.getReservation(ref, { customerId: user.id }), [ref, user.id]);
  useDocumentTitle(r ? r.eventName : 'Reservation');

  const [changeOpen, setChangeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [doc, setDoc] = useState(null);

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

  const editable = CUSTOMER_EDITABLE.includes(r.status);
  const online = r.onlineCancel || { allowed: false, reason: '', deadline: r.cancelDeadline };
  const closed = ['cancelled', 'declined', 'completed'].includes(r.status);
  const refunds = r.refunds || [];
  const refunded = r.refunded || 0;
  const canPay = ['approved', 'downpayment_paid', 'confirmed'].includes(r.status) && r.balance > 0 && !r.awaitingCount;
  const docs = documentsFor(r);
  const step = pendingStep(r);
  const quotationDoc = docs.find((d) => d.kind === 'quotation');
  const acceptDownpayment = r.quotation ? Math.min(r.downpayment, r.quotation.net) : 0;
  const rental = isRental(r.serviceType);
  const delivered = rental && r.fulfilment === 'delivery';
  const items = rental ? [] : bookingItems(r);

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
              <Button
                variant="outlined"
                startIcon={<EditOutlinedIcon />}
                onClick={() => setChangeOpen(true)}
                sx={{ color: tokens.textLight, borderColor: 'rgba(197,160,89,0.45)' }}
              >
                Request a change
              </Button>
            )}
            {online.allowed && (
              <Button
                startIcon={<EventBusyOutlinedIcon />}
                onClick={() => setCancelOpen(true)}
                sx={{ color: tokens.dangerSoft }}
              >
                Cancel
              </Button>
            )}
          </>
        }
      />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        <DashCard>
          <StatusPipeline status={r.status} />
          {step === 'accept' && (
            <AlertBanner tone="info" sx={{ mt: 2 }} title="Your Quotation Is Ready">
              Net total {peso(r.quotation.net)}. Open the quotation under Documents to see every line, then accept it to
              approve your reservation. To change something first, use Request a Change.
              <Box sx={{ mt: 1.25 }}>
                <Button size="small" variant="contained" onClick={() => setAcceptOpen(true)}>
                  Accept Quotation
                </Button>
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
            <AlertBanner
              tone={r.awaitingCount ? 'info' : r.balanceState === 'overdue' ? 'error' : 'locked'}
              sx={{ mt: 2 }}
              title={
                r.awaitingCount
                  ? 'Payment being verified'
                  : r.balanceState === 'overdue'
                    ? 'Downpayment overdue'
                    : 'Downpayment due'
              }
              action={
                canPay && (
                  <Button size="small" variant="contained" onClick={() => navigate(`/portal/payments?ref=${r.ref}`)}>
                    Pay now
                  </Button>
                )
              }
            >
              {r.awaitingCount
                ? 'Your payment is being verified, usually within a day.'
                : r.downpayment < r.total
                  ? `Pay at least ${peso(r.downpayment - r.paid)} by ${formatDateLong(r.downpaymentDue)} to secure your date. You can pay more, up to ${peso(r.balance)}.`
                  : `Pay the full ${peso(r.balance)} by ${formatDateLong(r.downpaymentDue)} to secure your date.`}
            </AlertBanner>
          )}
          {r.status === 'declined' && (
            <AlertBanner tone="error" sx={{ mt: 2 }} title="Reason from our team">
              {r.declineReason}
            </AlertBanner>
          )}
          {r.status === 'cancelled' && (
            <AlertBanner
              tone="error"
              sx={{ mt: 2 }}
              title={r.cancelledBy === 'admin' ? 'Cancelled by Tres Marias' : 'You cancelled this reservation'}
            >
              {r.cancelReason}
            </AlertBanner>
          )}
          {['cancelled', 'declined'].includes(r.status) && r.refundDue > 0 && (
            <AlertBanner tone="info" sx={{ mt: 2 }} title={`Refund due: ${peso(r.refundDue)}`}>
              We'll return it and tell you in your chat.
            </AlertBanner>
          )}
          {refunds.map((f) =>
            f.amount > 0 ? (
              <AlertBanner
                key={f.id}
                tone="success"
                sx={{ mt: 2 }}
                title={`Refunded ${peso(f.amount)} on ${formatDateLong(f.sentOn)}`}
              >
                Via {REFUND_METHODS[f.method]}
                {f.referenceNo ? ` · Ref ${f.referenceNo}` : ''}.
                {f.reason ? ` We kept ${peso(f.due - f.amount)}: ${f.reason}` : ''}
              </AlertBanner>
            ) : (
              <AlertBanner key={f.id} tone="info" sx={{ mt: 2 }} title="No refund">
                We kept the {peso(f.due)} you paid: {f.reason}
              </AlertBanner>
            )
          )}
          {r.preparingAt && !closed && (
            <Typography sx={{ mt: 2, fontSize: 13.5, fontWeight: 600, color: tokens.textPrimary }}>
              Preparation started on {formatDateLong(toISODate(new Date(r.preparingAt)))}.
            </Typography>
          )}
          {!closed && daysFromToday(r.date) > 0 && (
            <Typography
              sx={{ mt: r.preparingAt ? 0.5 : 2, fontSize: 13, lineHeight: 1.6, color: tokens.textSecondary }}
            >
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

        <Box
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.6fr 1fr' }, gap: 2.5, alignItems: 'start' }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, minWidth: 0 }}>
            <DashCard>
              <CardTitle>Event Details</CardTitle>
              <Box sx={{ display: 'flex', gap: 2.5, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
                <ThemeIcon occasion={r.occasion} size={84} />
                <Box
                  sx={{
                    flex: 1,
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
                    gap: 2
                  }}
                >
                  <Field label="Date">{formatDateLong(r.date)}</Field>
                  <Field label={rental ? (delivered ? 'Delivery time' : 'Pick-up time') : 'Time'}>
                    {formatEventTime(r)}
                  </Field>
                  <Field label="Occasion">{r.occasion}</Field>
                  {rental ? (
                    <Field label="Getting the items">{delivered ? 'Delivery' : 'Pick up'}</Field>
                  ) : (
                    <Field label="Guests">{r.guests}</Field>
                  )}
                </Box>
              </Box>
            </DashCard>

            {rental ? (
              <RentalItemsCard r={r} />
            ) : (
              <DashCard>
                <CardTitle
                  subtitle={`${r.packageName} · ${peso(r.package.price)} · Default: ${r.package.guests} guests`}
                >
                  {r.serviceType}
                </CardTitle>
                <Field
                  label={bookingExtraGuests(r) ? `Package includes, for your ${r.guests} guests` : 'Package includes'}
                >
                  <PackageItemList items={items} />
                </Field>
                {items.some((item) => item.toConfirm) && (
                  <Typography sx={{ mt: 1, fontSize: 12.5, color: tokens.textMuted }}>
                    Our quotation sets the counts marked To confirm.
                  </Typography>
                )}
                <Divider sx={{ my: 2 }} />
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
                  {includesFood(r.serviceType) && <Field label="Drinks">{buffetDrinks(r.menu)} for every guest</Field>}
                  <Field label="Additional charges">
                    {r.addons.length
                      ? r.addons
                          .map((a) => (a.hasQuantity ? `${a.name} × ${(r.addonQty || {})[a.id] || 1}` : a.name))
                          .join(', ')
                      : 'None'}
                  </Field>
                  {dessertSummary(r.menu) && (
                    <Field label="Dessert (additional charge)">{dessertSummary(r.menu)}</Field>
                  )}
                  {r.foodNotes && <Field label="Your note about the food">{r.foodNotes}</Field>}
                </Box>
              </DashCard>
            )}

            {!rental && !stylingEmpty(r.styling) && (
              <DashCard>
                <CardTitle
                  subtitle={
                    editable
                      ? 'To change it, use Request a change and our team will update it.'
                      : 'The look our team sets up for your event.'
                  }
                >
                  Theme and Colors
                </CardTitle>
                <StylingSummary styling={r.styling} reservationRef={r.ref} />
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
                  <Field label={rental ? 'Notes for the delivery' : 'Access notes'}>
                    {r.venue.accessNotes || 'None'}
                  </Field>
                </Box>
              )}
            </DashCard>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, minWidth: 0 }}>
            <DashCard>
              <CardTitle
                subtitle={
                  step === 'accept'
                    ? 'Your quotation, waiting for you to accept it'
                    : step === 'revise'
                      ? 'A revised quotation is on its way'
                      : r.quotation
                        ? 'Final quotation'
                        : rental
                          ? 'Your items and delivery, until our quotation confirms them'
                          : 'An estimate until your quotation confirms the final amounts'
                }
              >
                Payment Summary
              </CardTitle>
              <ChargeLines r={r} rental={rental} delivered={delivered} />
              <DetailRow label="Minimum downpayment" sx={{ mt: 1 }}>
                {peso(r.downpayment)}
              </DetailRow>
              <DetailRow label="Paid">{peso(r.paid + refunded)}</DetailRow>
              {refunded > 0 && <DetailRow label="Refunded">− {peso(refunded)}</DetailRow>}
              {r.awaitingAmount > 0 && <DetailRow label="Being verified">{peso(r.awaitingAmount)}</DetailRow>}
              <Divider sx={{ my: 1 }} />
              <DetailRow label={<b>Balance</b>}>
                <Box component="span" sx={{ fontSize: 17, fontWeight: 800 }}>
                  {peso(r.balance)}
                </Box>
              </DetailRow>
              {r.overpaid > 0 && (
                <AlertBanner tone="info" sx={{ mt: 1.5 }} title={`Overpaid ${peso(r.overpaid)}, to be returned`}>
                  We'll return it and tell you in your chat when it's sent.
                </AlertBanner>
              )}
              {step === 'accept' && (
                <>
                  <Button
                    fullWidth
                    variant="contained"
                    startIcon={<TaskAltRoundedIcon />}
                    onClick={() => setAcceptOpen(true)}
                    sx={{ mt: 1.5 }}
                  >
                    Accept quotation
                  </Button>
                  {quotationDoc && (
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<DescriptionOutlinedIcon />}
                      onClick={() => setDoc(quotationDoc)}
                      sx={{ mt: 1.25 }}
                    >
                      View quotation
                    </Button>
                  )}
                </>
              )}
              {canPay && (
                <Button
                  fullWidth
                  variant="contained"
                  startIcon={<PaymentsOutlinedIcon />}
                  onClick={() => navigate(`/portal/payments?ref=${r.ref}`)}
                  sx={{ mt: 1.5 }}
                >
                  {r.downpaymentPaid ? 'Pay balance' : 'Pay downpayment'}
                </Button>
              )}
              <Button
                fullWidth
                variant="outlined"
                startIcon={<ChatBubbleOutlineRoundedIcon />}
                onClick={() => navigate(`/portal/messages?ref=${r.ref}`)}
                sx={{ mt: 1.25 }}
              >
                Message us
              </Button>
            </DashCard>

            <DashCard>
              <CardTitle>Documents</CardTitle>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {docs.map((d) => (
                  <Box
                    key={d.key}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.25,
                      p: 1.25,
                      borderRadius: 1.5,
                      border: `1px solid ${tokens.cardLightBorder}`
                    }}
                  >
                    <DescriptionOutlinedIcon sx={{ color: d.available ? tokens.goldDark : tokens.placeholder }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 13, fontWeight: 600 }}>
                        {d.name}
                      </Typography>
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

            {r.status === 'completed' && (
              <DashCard>
                <CardTitle>Your Testimonial</CardTitle>
                {r.testimonial ? (
                  <>
                    <StarRating value={r.testimonial.rating} showValue />
                    <Typography sx={{ mt: 1, fontSize: 13.5, color: tokens.textSecondary }}>
                      “{r.testimonial.body}”
                    </Typography>
                    <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                      {FEEDBACK_CATEGORIES.filter(
                        ({ key }) => r.testimonial.categories && r.testimonial.categories[key]
                      ).map(({ key, label }) => (
                        <Typography key={key} sx={{ fontSize: 12, color: tokens.textSecondary }}>
                          {label}: <b>{r.testimonial.categories[key]}/5</b>
                        </Typography>
                      ))}
                    </Box>
                    {r.testimonial.reply && (
                      <Box
                        sx={{
                          mt: 1.5,
                          p: 1.5,
                          borderRadius: 1.5,
                          backgroundColor: tokens.surfaceSubtle,
                          border: `1px solid ${tokens.cardLightBorder}`
                        }}
                      >
                        <Typography sx={{ fontSize: 12, fontWeight: 700, color: tokens.textSecondary }}>
                          Reply from Admin · {formatDateTime(r.testimonial.reply.at)}
                        </Typography>
                        <Typography sx={{ mt: 0.25, fontSize: 12.5, lineHeight: 1.6, color: tokens.textPrimary }}>
                          {r.testimonial.reply.body}
                        </Typography>
                      </Box>
                    )}
                  </>
                ) : (
                  <>
                    <Typography sx={{ fontSize: 13.5, color: tokens.textSecondary }}>
                      How did we do? Your review helps other families plan their celebrations.
                    </Typography>
                    <Button
                      variant="contained"
                      sx={{ mt: 1.5 }}
                      onClick={() => navigate(`/portal/testimonials?ref=${r.ref}`)}
                    >
                      Write a testimonial
                    </Button>
                  </>
                )}
              </DashCard>
            )}

            <DashCard>
              <CardTitle>Activity</CardTitle>
              <Box
                component="ol"
                sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1.75 }}
              >
                {r.activity
                  .slice()
                  .reverse()
                  .map((a, i) => (
                    <Box component="li" key={`${a.at}-${i}`} sx={{ display: 'flex', gap: 1.5 }}>
                      <Box
                        sx={{
                          mt: 0.75,
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          flexShrink: 0,
                          backgroundColor: i === 0 ? tokens.gold : tokens.cardLightBorder
                        }}
                      />
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
        onSend={async (message) => {
          await reservationApi.requestChange(r.ref, user.id, message);
          setChangeOpen(false);
          notify('Change request sent to the admin.');
          navigate('/portal/messages');
        }}
      />

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
        description={
          r.paid > 0
            ? `You paid ${peso(r.paid)}. We'll return it and tell you in your chat when it's sent.`
            : 'The date will be released for other bookings. This cannot be undone.'
        }
        confirmLabel="Cancel reservation"
        cancelLabel="Keep reservation"
        tone="danger"
        reasonLabel="Why are you cancelling?"
        reasonPlaceholder="e.g. We moved the celebration to next year."
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

function ChangeRequestDialog({ open, onClose, onSend }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
      <FormField
        id="change-message"
        label="Your request"
        multiline
        minRows={4}
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          setError('');
        }}
        error={error}
        placeholder="e.g. Please change the guest count from 150 to 170 and add Mango Float to the food."
        inputProps={{ maxLength: 2000 }}
      />
    </AppDialog>
  );
}

function ChargeLines({ r, rental, delivered }) {
  const quote = r.quotation || r.estimate;
  const quoted = Boolean(r.quotation);
  const extraGuests = rental ? 0 : quoted ? r.quotation.extraGuests || 0 : bookingExtraGuests(r);
  const addonTotal = (id) =>
    (quote.addonTotals && quote.addonTotals[id]) || (quote.addonPrices && quote.addonPrices[id]) || 0;
  const addonCount = (id) => (quote.addonQty && quote.addonQty[id]) || (r.addonQty || {})[id] || 1;
  const inQuotation = (id) => [quote.addonPrices, quote.addonTotals].some((prices) => prices && id in prices);
  const rentalLines = quote.rentalItems || [];
  const damageLines = quote.damageCharges || [];
  const pieces = (lines) => lines.reduce((sum, line) => sum + line.qty, 0);

  const lines = rental
    ? [
        {
          key: 'items',
          label: 'Rented items',
          note: `${rentalLines.length} ${rentalLines.length === 1 ? 'item' : 'items'}, ${pieces(rentalLines)} pieces`,
          value: peso(quote.rental || 0)
        },
        delivered
          ? { key: 'delivery', label: 'Delivery', value: peso(quote.deliveryFee || 0) }
          : { key: 'pickup', label: 'Pick up', value: 'Free' },
        ...(quote.damage > 0
          ? [
              {
                key: 'damage',
                label: 'Damage charges',
                note: `${pieces(damageLines)} pieces damaged or missing`,
                value: peso(quote.damage)
              }
            ]
          : [])
      ]
    : [
        {
          key: 'package',
          label: `Package · ${r.packageName}`,
          note: `Covers ${quote.packageGuests || r.package.guests} guests`,
          value: peso(quote.packageTotal)
        },
        ...(extraGuests > 0
          ? [
              {
                key: 'extra',
                label: `Extra ${extraGuests} guests (equipment)`,
                value: quoted ? peso(quote.extraGuestsCharge || 0) : 'To be quoted',
                toQuote: !quoted
              }
            ]
          : []),
        ...(quote.plates > 0
          ? [
              {
                key: 'buffet',
                label: 'Buffet',
                note: `${quote.plates} × ${peso(quote.pricePerPlate)} per person`,
                value: peso(quote.food)
              }
            ]
          : []),
        ...r.addons.map((a) => {
          const priced = quoted ? inQuotation(a.id) : addonTotal(a.id) > 0;
          const count = addonCount(a.id);
          const each = quote.addonPrices && quote.addonPrices[a.id];
          return {
            key: a.id,
            label: a.hasQuantity ? `${a.name} × ${count}` : a.name,
            note: a.hasQuantity && priced && each && count > 1 ? `${peso(each)} each` : '',
            value: priced ? peso(addonTotal(a.id)) : 'To be quoted',
            toQuote: !priced
          };
        })
      ];
  otherChargeItemsFor(quote)
    .filter((line) => line.amount > 0)
    .forEach((line, index) => {
      lines.push({ key: `other-${index}`, label: line.label || 'Other charges', value: peso(line.amount) });
    });
  if (quote.discount > 0) lines.push({ key: 'discount', label: 'Discount', value: `− ${peso(quote.discount)}` });
  const toQuote = lines.some((line) => line.toQuote);

  return (
    <Box sx={{ borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}`, overflow: 'hidden' }}>
      {lines.map((line) => (
        <Box
          key={line.key}
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 2,
            px: 1.75,
            py: 1.1,
            borderBottom: `1px solid ${tokens.cardLightBorder}`
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: tokens.textPrimary, overflowWrap: 'anywhere' }}>
              {line.label}
            </Typography>
            {line.note && (
              <Typography sx={{ mt: 0.125, fontSize: 11.5, color: tokens.textMuted }}>{line.note}</Typography>
            )}
          </Box>
          <Typography
            sx={{
              fontSize: 13.5,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              color: line.toQuote ? tokens.textMuted : tokens.textPrimary
            }}
          >
            {line.value}
          </Typography>
        </Box>
      ))}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 2,
          px: 1.75,
          py: 1.25,
          backgroundColor: tokens.surfaceSubtle
        }}
      >
        <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>Total</Typography>
        <Typography sx={{ fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap' }}>
          {peso(r.total)}
          {toQuote ? ' + quoted' : ''}
        </Typography>
      </Box>
    </Box>
  );
}

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
        Pieces that come back damaged or missing are charged at each item's damage fee:{' '}
        {r.rentalItems.map((line) => `${line.name} ${peso(line.damageFee)}`).join(', ')}.
      </Typography>
      {damage.length > 0 && (
        <AlertBanner tone="warning" sx={{ mt: 2 }} title="Damage charges">
          {damage.map((line) => `${line.qty} × ${line.name} (${peso(line.fee)} each)`).join(', ')}:{' '}
          {peso(damage.reduce((sum, line) => sum + line.qty * line.fee, 0))}.{' '}
          {r.quotationStale
            ? 'They apply once our revised quotation reaches you.'
            : 'They are included in your quotation.'}
        </AlertBanner>
      )}
    </DashCard>
  );
}
