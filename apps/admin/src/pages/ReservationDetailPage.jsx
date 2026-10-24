import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import InputAdornment from '@mui/material/InputAdornment';
import Typography from '@mui/material/Typography';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import {
  AlertBanner,
  ActivityTimeline,
  AppDialog,
  BUSINESS,
  BusyButton,
  CardTitle,
  DISH_CATEGORIES,
  ConfirmDialog,
  DashCard,
  DateField,
  EndTimeField,
  DetailRow,
  DocumentDialog,
  ErrorState,
  EventWorkspace,
  FEEDBACK_CATEGORIES,
  FeedbackStatusChip,
  Field,
  FormField,
  ITEM_COUNT_MAX,
  ListSkeleton,
  MenuPicker,
  DessertFields,
  DESSERT_ADDON_ID,
  menuProblem,
  buffetDrinks,
  dessertSummary,
  PackageItemList,
  PageHeader,
  PaymentStatusChip,
  PAYMENT_METHODS,
  QrStatusChip,
  REFUND_METHODS,
  RENTAL,
  RENTAL_FULFILMENT,
  RULES,
  SERVICE_TYPES,
  SelectField,
  StarRating,
  StatusChip,
  StatusPipeline,
  StylingFields,
  StylingSummary,
  TimeField,
  bookingExtraGuests,
  bookingItems,
  catalogApi,
  cleanStyling,
  computeQuote,
  daysFromToday,
  documentsFor,
  extraGuestsFor,
  formatClock,
  formatDate,
  formatDateTime,
  formatMobile,
  formatTime,
  includesFood,
  inventoryApi,
  isRental,
  itemsToConfirm,
  messageApi,
  paymentApi,
  paymentKindLabel,
  pendingStep,
  otherChargeItemsFor,
  peso,
  qrState,
  reservationApi,
  shiftEndTime,
  stylingProblem,
  titleCase,
  tokens,
  useDocumentTitle,
  useNotify,
  useQrWatch,
  useResource,
  usesGuestRule
} from '@tm/shared';
import RefundDialog, { refundRecordedText } from '../components/RefundDialog.jsx';

const CLOSED = ['completed', 'declined', 'cancelled'];
const HOLDS = ['approved', 'downpayment_paid', 'confirmed'];
const PREPARABLE = ['downpayment_paid', 'confirmed'];

export default function ReservationDetailPage() {
  const { ref } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { data: r, loading, error, reload } = useResource(() => reservationApi.getReservation(ref), [ref]);
  useDocumentTitle(r ? `${r.ref} · ${r.eventName}` : 'Reservation', 'Tres Marias Admin');

  const [dialog, setDialog] = useState(null);
  const [doc, setDoc] = useState(null);
  const crumbs = [{ label: 'Reservations', to: '/reservations?tab=all' }, { label: ref }];

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
        <PageHeader title="Loading…" crumbs={crumbs} />
        <DashCard>
          <ListSkeleton rows={8} height={48} />
        </DashCard>
      </>
    );
  }

  const closed = CLOSED.includes(r.status);
  const step = pendingStep(r);
  const act = async (fn, message) => {
    try {
      await fn();
      notify(message);
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const messageCustomer = async () => {
    try {
      const { id } = await messageApi.openThread({ customerId: r.customerId });
      navigate(`/messages?thread=${encodeURIComponent(id)}`);
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const headerActions = (
    <>
      {r.status === 'pending' && (
        <>
          <Button
            variant={step === 'accept' ? 'outlined' : 'contained'}
            onClick={() =>
              document.getElementById('quotation-card')?.scrollIntoView({ behavior: 'instant', block: 'center' })
            }
            sx={step === 'accept' ? { color: tokens.textLight, borderColor: 'rgba(197,160,89,0.45)' } : undefined}
          >
            {step === 'quote' ? 'Send quotation' : 'Re-send quotation'}
          </Button>
          <Button onClick={() => setDialog('decline')} sx={{ color: tokens.dangerSoft }}>
            Decline
          </Button>
        </>
      )}
      {r.status === 'downpayment_paid' && (
        <Button variant="contained" onClick={() => setDialog('confirm')}>
          Confirm booking
        </Button>
      )}
      {r.status === 'confirmed' && daysFromToday(r.date) <= 0 && (
        <Button variant="contained" onClick={() => setDialog('complete')}>
          Mark completed
        </Button>
      )}
      {HOLDS.includes(r.status) && (
        <Button onClick={() => setDialog('cancel')} sx={{ color: tokens.dangerSoft }}>
          Cancel reservation
        </Button>
      )}
    </>
  );
  const refunds = r.refunds || [];
  const refunded = r.refunded || 0;

  return (
    <>
      <PageHeader
        crumbs={crumbs}
        title={r.eventName}
        chip={<StatusChip status={r.status} />}
        subtitle={`Reservation · ${r.ref} · received ${formatDateTime(r.createdAt)}`}
        actions={headerActions}
      />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        <EventWorkspace event={r} admin />
        <Box component="nav" aria-label="Event workspace sections" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {[
            ['quotation-card', 'Quotation'],
            ['event-payments', 'Payments'],
            ['event-documents', 'Documents'],
            ['event-audit', 'Activity']
          ].map(([id, label]) => (
            <Button key={id} component="a" href={`#${id}`} size="small" variant="outlined">
              {label}
            </Button>
          ))}
          <Button size="small" onClick={messageCustomer}>
            Message customer
          </Button>
        </Box>
        <DashCard>
          <StatusPipeline status={r.status} />
          {step === 'quote' && (
            <AlertBanner tone="warning" sx={{ mt: 2 }} title="Send the quotation">
              The customer approves this request by accepting the quotation in their portal. The date is not held until
              they do.
            </AlertBanner>
          )}
          {step === 'revise' && (
            <AlertBanner tone="warning" sx={{ mt: 2 }} title="Re-send the quotation">
              The booking changed after the quotation was sent, so the customer can't accept it yet.{' '}
              {r.quotationStaleReason}
            </AlertBanner>
          )}
          {step === 'accept' && (
            <AlertBanner tone="info" sx={{ mt: 2 }} title="Waiting for the customer to accept the quotation">
              Sent {formatDateTime(r.quotation.sentAt)} ({peso(r.quotation.net)}). Accepting approves the reservation
              and asks for the minimum downpayment by a due date. The date is not held until then.
            </AlertBanner>
          )}
          {r.status === 'declined' && (
            <AlertBanner tone="error" sx={{ mt: 2 }} title="Decline reason sent to the customer">
              {r.declineReason}
            </AlertBanner>
          )}
          {r.status === 'cancelled' && (
            <AlertBanner
              tone="error"
              sx={{ mt: 2 }}
              title={r.cancelledBy === 'admin' ? 'Cancelled by the admin' : 'Cancelled by the customer'}
            >
              {r.cancelReason}
            </AlertBanner>
          )}
          {r.status === 'approved' && r.balanceState === 'overdue' && (
            <AlertBanner tone="error" sx={{ mt: 2 }} title="Downpayment overdue">
              Due {formatDate(r.downpaymentDue)}. Send a reminder from Payments or message the customer.
            </AlertBanner>
          )}
          {!closed && (PREPARABLE.includes(r.status) || r.preparingAt) && (
            <Box
              sx={{
                mt: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1.5,
                flexWrap: 'wrap'
              }}
            >
              <Typography sx={{ fontSize: 13.5, color: tokens.textSecondary, minWidth: 0 }}>
                {r.preparingAt ? (
                  <>
                    <b>Started preparing</b> on {formatDateTime(r.preparingAt)}. The customer can no longer cancel
                    online.
                  </>
                ) : (
                  'Preparation not started. Mark it when you start: from then on the customer cancels by chat or phone only.'
                )}
              </Typography>
              {r.preparingAt ? (
                <Button size="small" onClick={() => setDialog('unprepare')}>
                  Undo
                </Button>
              ) : (
                <Button size="small" variant="outlined" onClick={() => setDialog('prepare')}>
                  Start preparing
                </Button>
              )}
            </Box>
          )}
        </DashCard>

        <Box
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1.5fr 1fr' }, gap: 2.5, alignItems: 'start' }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, minWidth: 0 }}>
            <DashCard>
              <CardTitle
                action={
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<ChatBubbleOutlineRoundedIcon />}
                    onClick={messageCustomer}
                  >
                    Message
                  </Button>
                }
              >
                Customer
              </CardTitle>
              <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{r.customer.name}</Typography>
              <Typography sx={{ fontSize: 13.5, color: tokens.textSecondary }}>
                {r.customer.email} · {formatMobile(r.customer.mobile)} · {r.customer.pastEvents} past{' '}
                {r.customer.pastEvents === 1 ? 'event' : 'events'}
              </Typography>
              <Button size="small" sx={{ mt: 1, px: 0 }} onClick={() => navigate(`/customers?open=${r.customerId}`)}>
                View customer profile
              </Button>
            </DashCard>

            <LogisticsCard
              r={r}
              closed={closed}
              onSave={(patch) =>
                act(
                  () => reservationApi.updateLogistics(r.ref, patch),
                  isRental(r.serviceType) ? 'Rental details saved.' : 'Event details saved.'
                )
              }
            />

            {isRental(r.serviceType) ? (
              <RentalCard
                r={r}
                closed={closed}
                onEdit={() => setDialog('rentalItems')}
                onCheckOut={() => setDialog('checkout')}
                onReturn={() => setDialog('return')}
              />
            ) : (
              <DashCard>
                <CardTitle
                  subtitle={`${r.packageName} · ${peso(r.package.price)} · Default: ${r.package.guests} guests`}
                  action={
                    !closed && (
                      <Button size="small" variant="outlined" onClick={() => setDialog('food')}>
                        Edit menu
                      </Button>
                    )
                  }
                >
                  {r.serviceType}
                </CardTitle>
                <Field
                  label={
                    bookingExtraGuests(r)
                      ? `Package includes, for ${r.guests} guests (${bookingExtraGuests(r)} above the package)`
                      : 'Package includes'
                  }
                >
                  <PackageItemList items={bookingItems(r)} />
                </Field>
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
                  <Field label="Food">Catering only: equipment and setup, with no food to cook.</Field>
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
                  {r.foodNotes && <Field label="Note from the customer">{r.foodNotes}</Field>}
                </Box>
              </DashCard>
            )}

            {!isRental(r.serviceType) && (
              <DashCard>
                <CardTitle
                  subtitle="Never changes the price. Edits show in the Activity, which the customer sees."
                  action={
                    !closed && (
                      <Button size="small" variant="outlined" onClick={() => setDialog('styling')}>
                        Edit
                      </Button>
                    )
                  }
                >
                  Theme and Colors
                </CardTitle>
                <StylingSummary styling={r.styling} reservationRef={r.ref} forAdmin />
              </DashCard>
            )}
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, minWidth: 0 }}>
            <QuotationCard
              r={r}
              closed={closed}
              onSend={(values) =>
                act(
                  () => reservationApi.sendQuotation(r.ref, values),
                  r.status === 'pending'
                    ? 'Quotation sent. The customer accepts it in their portal to approve the reservation.'
                    : 'Quotation saved and sent to the customer.'
                )
              }
            />

            <DashCard>
              <Box id="event-payments">
                <CardTitle>Payments</CardTitle>
              </Box>
              <DetailRow label={`Minimum downpayment · ${peso(r.downpayment)}`}>
                {['pending', 'declined', 'cancelled'].includes(r.status)
                  ? '—'
                  : r.downpaymentPaid
                    ? 'Paid'
                    : `Unpaid${r.downpaymentDue ? ` · due ${formatDate(r.downpaymentDue)}` : ''}`}
              </DetailRow>
              <DetailRow label="Total">{peso(r.total)}</DetailRow>
              <DetailRow label="Paid">{peso(r.paid + refunded)}</DetailRow>
              {refunded > 0 && <DetailRow label="Refunded">− {peso(refunded)}</DetailRow>}
              <DetailRow label="Balance">{peso(r.balance)}</DetailRow>
              {r.overpaid > 0 && (
                <AlertBanner tone="warning" sx={{ mt: 1.5 }} title={`Overpaid ${peso(r.overpaid)}, to be returned`}>
                  The revised quotation is below what was paid. Record the refund under Refund once it is sent.
                </AlertBanner>
              )}
              {r.payments.length > 0 && (
                <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {r.payments.map((p) => (
                    <Box key={p.id} sx={{ p: 1.25, borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}` }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center' }}>
                        <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>
                          {peso(p.amount)} · {paymentKindLabel(p.kind)}
                        </Typography>
                        <PaymentStatusChip status={p.status} size="sm" />
                      </Box>
                      <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>
                        {PAYMENT_METHODS[p.method]} · {formatDateTime(p.submittedAt)}
                        {p.receiptNo ? ` · ${p.receiptNo}` : ''}
                      </Typography>
                      {p.status === 'awaiting' && (
                        <Button
                          size="small"
                          sx={{ mt: 0.5, px: 0 }}
                          onClick={() => navigate(`/payments?verify=${p.id}`)}
                        >
                          Review proof
                        </Button>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
              <QrCodes reservationRef={r.ref} />
              {['approved', 'downpayment_paid', 'confirmed', 'completed'].includes(r.status) && r.balance > 0 && (
                <Button fullWidth variant="contained" sx={{ mt: 2 }} onClick={() => setDialog('cash')}>
                  Mark payment received
                </Button>
              )}
            </DashCard>

            {(r.refundDue > 0 || refunds.length > 0) && (
              <DashCard>
                <CardTitle
                  subtitle={
                    r.refundDue > 0
                      ? r.overpaid > 0
                        ? 'Paid above the revised quotation'
                        : `Everything paid on this ${r.status} booking`
                      : refunds.some((f) => f.amount > 0)
                        ? 'Returned to the customer'
                        : 'Nothing returned'
                  }
                >
                  Refund
                </CardTitle>
                {r.refundDue > 0 && (
                  <>
                    <DetailRow label="To return">
                      <Box component="span" sx={{ fontSize: 16, fontWeight: 800 }}>
                        {peso(r.refundDue)}
                      </Box>
                    </DetailRow>
                    <Button fullWidth variant="contained" sx={{ mt: 1.5 }} onClick={() => setDialog('refund')}>
                      Record refund
                    </Button>
                  </>
                )}
                {refunds.length > 0 && (
                  <Box sx={{ mt: r.refundDue > 0 ? 1.5 : 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {refunds.map((f) => (
                      <Box
                        key={f.id}
                        sx={{ p: 1.25, borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}` }}
                      >
                        <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>
                          {f.amount > 0
                            ? `${peso(f.amount)} · ${f.kind === 'overpayment' ? 'Overpayment' : 'Cancellation'} refund`
                            : 'No refund · everything paid was kept'}
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>
                          {f.amount > 0
                            ? `${REFUND_METHODS[f.method]}${f.referenceNo ? ` · Ref ${f.referenceNo}` : ''} · sent ${formatDate(f.sentOn)}`
                            : `Recorded ${formatDate(f.sentOn)}`}{' '}
                          · {f.id} · recorded by {f.recordedBy}
                        </Typography>
                        {f.reason && (
                          <Typography sx={{ mt: 0.5, fontSize: 12.5, color: tokens.textSecondary }}>
                            Kept {peso(f.due - f.amount)}: {f.reason}
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Box>
                )}
              </DashCard>
            )}

            {r.testimonial && (
              <DashCard>
                <CardTitle
                  action={
                    <Button size="small" onClick={() => navigate(`/feedbacks?q=${r.ref}`)}>
                      Open in Feedbacks
                    </Button>
                  }
                >
                  Customer Feedback
                </CardTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <StarRating value={r.testimonial.rating} showValue />
                  <FeedbackStatusChip feedback={r.testimonial} size="sm" />
                </Box>
                <Typography sx={{ mt: 1, fontSize: 13.5, lineHeight: 1.6, color: tokens.textPrimary }}>
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
                <Typography sx={{ mt: 1.25, fontSize: 12, color: tokens.textMuted }}>
                  {r.testimonial.reply ? `Replied ${formatDateTime(r.testimonial.reply.at)}` : 'Not answered yet.'}
                </Typography>
              </DashCard>
            )}

            <DashCard>
              <Box id="event-documents">
                <CardTitle>Documents</CardTitle>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {documentsFor(r).map((d) => (
                  <Box
                    key={d.key}
                    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 13, fontWeight: 600 }}>
                        {d.name}
                      </Typography>
                      <Typography sx={{ fontSize: 11.5, color: tokens.textMuted }}>{d.note}</Typography>
                    </Box>
                    <Button size="small" disabled={!d.available} onClick={() => setDoc(d)}>
                      {d.available ? 'Open' : 'Pending'}
                    </Button>
                  </Box>
                ))}
              </Box>
            </DashCard>

            <NotesCard
              r={r}
              onSave={(notes) => act(() => reservationApi.saveNotes(r.ref, notes), 'Internal notes saved.')}
            />

            <ActivityTimeline id="event-audit" entries={r.activity} title="Audit trail" />
          </Box>
        </Box>
      </Box>

      <ConfirmDialog
        open={dialog === 'decline'}
        onClose={() => setDialog(null)}
        title="Decline This Reservation?"
        description={`The reason is shown to the customer${r.quotation ? ', and the quotation can no longer be accepted' : ''}. The date stays open for other bookings.`}
        confirmLabel="Decline"
        tone="danger"
        reasonLabel="Reason shown to the customer"
        onConfirm={async (reason) => {
          await reservationApi.declineReservation(r.ref, reason);
          setDialog(null);
          notify('Reservation declined.', 'info');
        }}
      />
      <ConfirmDialog
        open={dialog === 'confirm'}
        onClose={() => setDialog(null)}
        title="Confirm This Booking?"
        description="The customer's contract becomes available in their Documents."
        confirmLabel="Confirm booking"
        onConfirm={async () => {
          await reservationApi.confirmReservation(r.ref);
          setDialog(null);
          notify('Booking confirmed.');
        }}
      />
      <ConfirmDialog
        open={dialog === 'complete'}
        onClose={() => setDialog(null)}
        title="Mark as Completed?"
        description={
          r.balance > 0
            ? `There is still a balance of ${peso(r.balance)}. Record the payment first if it was collected.`
            : 'The customer will be invited to leave a testimonial.'
        }
        confirmLabel="Mark completed"
        onConfirm={async () => {
          await reservationApi.completeReservation(r.ref);
          setDialog(null);
          notify('Event marked as completed.');
        }}
      />
      <ConfirmDialog
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        title="Cancel This Reservation?"
        description={`The customer is told in their chat with your reason, and the date is released for other bookings.${r.paid > 0 ? ` ${peso(r.paid)} was paid: it shows under Refund to be returned.` : ''}`}
        confirmLabel="Cancel reservation"
        cancelLabel="Keep reservation"
        tone="danger"
        reasonLabel="Reason shown to the customer"
        reasonPlaceholder="e.g. Our kitchen cannot take this date after all."
        onConfirm={async (reason) => {
          await reservationApi.cancelReservationByAdmin(r.ref, reason);
          setDialog(null);
          notify('Reservation cancelled. The customer was told in their chat.', 'info');
        }}
      />
      <ConfirmDialog
        open={dialog === 'prepare'}
        onClose={() => setDialog(null)}
        title="Mark as Started Preparing?"
        description={`From now on the customer can no longer cancel online: their chat tells them to message you or call ${BUSINESS.phone} instead. You can undo this if it was a mistake.`}
        confirmLabel="Start preparing"
        onConfirm={async () => {
          await reservationApi.startPreparing(r.ref);
          setDialog(null);
          notify('Marked as started preparing.');
        }}
      />
      <ConfirmDialog
        open={dialog === 'unprepare'}
        onClose={() => setDialog(null)}
        title="Undo “Started Preparing”?"
        description="The customer is told in their chat that it was marked by mistake, with the date online cancellation is open until (when it hasn't passed)."
        confirmLabel="Undo"
        onConfirm={async () => {
          await reservationApi.undoPreparing(r.ref);
          setDialog(null);
          notify('The “Started preparing” mark was removed.', 'info');
        }}
      />
      <RefundDialog
        open={dialog === 'refund'}
        onClose={() => setDialog(null)}
        booking={r}
        onRecorded={(refund) => {
          setDialog(null);
          notify(refundRecordedText(refund));
        }}
      />
      <CashDialog
        open={dialog === 'cash'}
        onClose={() => setDialog(null)}
        r={r}
        onSubmit={async (amount) => {
          await paymentApi.recordCashPayment(r.ref, amount);
          setDialog(null);
          notify('Payment recorded and receipt issued.');
        }}
      />
      <StylingDialog
        open={dialog === 'styling'}
        onClose={() => setDialog(null)}
        r={r}
        onSubmit={async (values) => {
          await reservationApi.updateStyling(r.ref, values);
          setDialog(null);
          notify('Theme and colors saved.');
        }}
      />
      <MenuDialog
        open={dialog === 'food'}
        onClose={() => setDialog(null)}
        r={r}
        onSubmit={async (patch) => {
          await reservationApi.updateMenu(r.ref, patch);
          setDialog(null);
          notify('Menu updated. Re-send the quotation if the total changed.');
        }}
      />
      {isRental(r.serviceType) && (
        <>
          <RentalItemsDialog
            open={dialog === 'rentalItems'}
            onClose={() => setDialog(null)}
            r={r}
            onSubmit={async (items) => {
              await reservationApi.updateRentalItems(r.ref, { items });
              setDialog(null);
              notify(
                'Rented items saved. The customer was told in their chat; re-send the quotation for the new total.'
              );
            }}
          />
          <ConfirmDialog
            open={dialog === 'checkout'}
            onClose={() => setDialog(null)}
            title="Check Out the Rented Items?"
            description="Every item still needed for this rental moves from Available to In use in the inventory, and each check-out is added to the audit trail."
            confirmLabel="Check out"
            onConfirm={async () => {
              await inventoryApi.checkOutRental(r.ref);
              setDialog(null);
              notify('Rented items checked out.');
            }}
          />
          <ReturnDialog
            open={dialog === 'return'}
            onClose={() => setDialog(null)}
            r={r}
            onSubmit={async (rows) => {
              const result = await inventoryApi.returnRental(r.ref, rows);
              setDialog(null);
              notify(
                result.damaged
                  ? `Return recorded. ${result.damaged} damaged or missing pieces were charged; re-send the quotation.`
                  : 'Return recorded.'
              );
            }}
          />
        </>
      )}
      <DocumentDialog open={Boolean(doc)} onClose={() => setDoc(null)} detail={r} doc={doc} />
    </>
  );
}

function LogisticsCard({ r, closed, onSave }) {
  const rental = isRental(r.serviceType);
  const initial = () => ({
    date: r.date,
    startTime: r.startTime,
    endTime: r.endTime || '',
    guests: String(r.guests),
    fulfilment: r.fulfilment || '',
    venueName: r.venue.name,
    venueAddress: r.venue.address,
    city: r.venue.city,
    accessNotes: r.venue.accessNotes
  });
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(
    () => setValues(initial()),
    [
      r.date,
      r.startTime,
      r.endTime,
      r.guests,
      r.fulfilment,
      r.venue.name,
      r.venue.address,
      r.venue.city,
      r.venue.accessNotes
    ]
  ); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(values) !== JSON.stringify(initial());
  const set = (k) => (e) =>
    setValues((v) => {
      const value = e && e.target ? e.target.value : e;
      const next = { ...v, [k]: value };
      if (k === 'fulfilment' && value === 'delivery' && r.fulfilment !== 'delivery')
        Object.assign(next, { venueName: '', venueAddress: '', city: '', accessNotes: '' });
      if (k === 'fulfilment' && value === r.fulfilment)
        Object.assign(next, {
          venueName: r.venue.name,
          venueAddress: r.venue.address,
          city: r.venue.city,
          accessNotes: r.venue.accessNotes
        });
      return next;
    });
  const delivered = rental && values.fulfilment === 'delivery';
  const switching = rental && values.fulfilment !== r.fulfilment;
  const guestsNow = Number(values.guests) || 0;
  const repricing = includesFood(r.serviceType) && guestsNow !== r.guests && guestsNow > 0;
  const extraBefore = rental ? 0 : bookingExtraGuests(r);
  const extraNow = rental || !usesGuestRule(r) ? 0 : extraGuestsFor(r.package, guestsNow);
  const extraMoves = guestsNow > 0 && guestsNow !== r.guests && extraNow !== extraBefore;

  if (rental) {
    return (
      <DashCard sx={{ containerType: 'inline-size', containerName: 'logistics-form' }}>
        <CardTitle subtitle={closed ? 'This reservation is closed.' : 'Editable by admin'}>
          Rental and Logistics
        </CardTitle>
        {switching && (
          <AlertBanner tone="warning" sx={{ mb: 2 }} title="This changes the customer's total">
            {delivered
              ? `Delivery adds ${peso(RENTAL.deliveryFee)} (the standard fee).`
              : 'Pick up is free, so the delivery fee comes off.'}{' '}
            Saving posts a message telling the customer; the amount they owe only changes once you re-send the
            quotation.
          </AlertBanner>
        )}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr)',
            '@container logistics-form (min-width: 520px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
            gap: 2
          }}
        >
          <DateField
            id="l-date"
            label="Rental date"
            mode="any"
            value={values.date}
            onChange={set('date')}
            disabled={closed}
          />
          <TimeField
            id="l-start"
            label={delivered ? 'Delivery time' : 'Pick-up time'}
            value={values.startTime}
            onChange={set('startTime')}
            min={RULES.earliestStart}
            max={RULES.latestStart}
            step={30}
            disabled={closed}
          />
          <SelectField
            id="l-fulfilment"
            label="Pick up or delivery"
            value={values.fulfilment}
            onChange={set('fulfilment')}
            options={RENTAL_FULFILMENT}
            disabled={closed}
            sx={{ gridColumn: { sm: '1 / -1' } }}
          />
          {delivered ? (
            <>
              <FormField
                id="l-venue"
                label="Deliver to"
                value={values.venueName}
                onChange={set('venueName')}
                disabled={closed}
              />
              <FormField id="l-city" label="City" value={values.city} onChange={set('city')} disabled={closed} />
              <FormField
                id="l-address"
                label="Address"
                value={values.venueAddress}
                onChange={set('venueAddress')}
                disabled={closed}
                sx={{ gridColumn: { sm: '1 / -1' } }}
              />
              <FormField
                id="l-notes"
                label="Notes for the delivery"
                multiline
                minRows={2}
                value={values.accessNotes}
                onChange={set('accessNotes')}
                disabled={closed}
                sx={{ gridColumn: { sm: '1 / -1' } }}
              />
            </>
          ) : (
            <Field label="Pick up at">{RENTAL.pickupAddress}</Field>
          )}
        </Box>
        {!closed && (
          <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
            <BusyButton
              busy={busy}
              disabled={
                !dirty ||
                (delivered && (!values.venueName.trim() || !values.venueAddress.trim() || !values.city.trim()))
              }
              onClick={async () => {
                setBusy(true);
                await onSave(values);
                setBusy(false);
              }}
            >
              Save changes
            </BusyButton>
            {dirty && <Button onClick={() => setValues(initial())}>Reset</Button>}
          </Box>
        )}
      </DashCard>
    );
  }

  return (
    <DashCard sx={{ containerType: 'inline-size', containerName: 'logistics-form' }}>
      <CardTitle subtitle={closed ? 'This reservation is closed.' : 'Editable by admin'}>Event and Logistics</CardTitle>
      {repricing && (
        <AlertBanner tone="warning" sx={{ mb: 2 }} title="This changes the customer's total">
          {r.guests} → {guestsNow} guests at {peso(r.pricePerPlate)} per person moves the buffet from{' '}
          {peso(r.guests * r.pricePerPlate)} to {peso(guestsNow * r.pricePerPlate)}. Saving posts a message telling the
          customer; the amount they owe only changes once you re-send the quotation.
        </AlertBanner>
      )}
      {extraMoves && (
        <AlertBanner tone="warning" sx={{ mb: 2 }} title="This changes the extra guests">
          {extraBefore || 'No'} → {extraNow || 'no'} guests above the package's {r.package.guests}. Their equipment and
          the items to confirm are set in the quotation, so{' '}
          {r.quotation
            ? 're-send it after saving. Saving posts a message telling the customer; the amount they owe only changes once you re-send the quotation.'
            : 'price them when you send it.'}
        </AlertBanner>
      )}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          '@container logistics-form (min-width: 520px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
          gap: 2
        }}
      >
        <DateField id="l-date" label="Date" mode="any" value={values.date} onChange={set('date')} disabled={closed} />
        <TimeField
          id="l-start"
          label="Start time"
          value={values.startTime}
          onChange={(v) =>
            setValues((cur) => ({
              ...cur,
              startTime: v,
              endTime: cur.endTime ? shiftEndTime(cur.startTime, cur.endTime, v) : ''
            }))
          }
          min={RULES.earliestStart}
          max={RULES.latestStart}
          step={30}
          disabled={closed}
        />
        <EndTimeField
          id="l-end"
          startTime={values.startTime}
          value={values.endTime}
          onChange={set('endTime')}
          disabled={closed}
          hint={
            r.endTime
              ? `Events run ${RULES.minEventHours} to ${RULES.maxEventHours} hours.`
              : `Not set: booked before end times existed, so it counts as ${RULES.defaultEventHours} hours.`
          }
        />
        <FormField
          id="l-guests"
          label="Guests"
          type="number"
          value={values.guests}
          onChange={set('guests')}
          disabled={closed}
        />
        <FormField id="l-venue" label="Venue" value={values.venueName} onChange={set('venueName')} disabled={closed} />
        <FormField id="l-city" label="City" value={values.city} onChange={set('city')} disabled={closed} />
        <FormField
          id="l-address"
          label="Address"
          value={values.venueAddress}
          onChange={set('venueAddress')}
          disabled={closed}
          sx={{ gridColumn: { sm: '1 / -1' } }}
        />
        <FormField
          id="l-notes"
          label="Access notes"
          multiline
          minRows={2}
          value={values.accessNotes}
          onChange={set('accessNotes')}
          disabled={closed}
          sx={{ gridColumn: { sm: '1 / -1' } }}
        />
      </Box>
      {!closed && (
        <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
          <BusyButton
            busy={busy}
            disabled={!dirty || !values.venueName.trim() || !values.venueAddress.trim() || !values.city.trim()}
            onClick={async () => {
              setBusy(true);
              await onSave(values);
              setBusy(false);
            }}
          >
            Save changes
          </BusyButton>
          {dirty && <Button onClick={() => setValues(initial())}>Reset</Button>}
        </Box>
      )}
    </DashCard>
  );
}

function QuotationCard({ r, closed, onSend }) {
  const nextOtherChargeId = useRef(0);
  const newOtherCharge = () => ({
    id: `new-${nextOtherChargeId.current++}`,
    amount: '',
    label: ''
  });
  const rental = isRental(r.serviceType);
  const delivered = rental && r.fulfilment === 'delivery';
  const extraGuests = rental ? 0 : extraGuestsFor(r.package, r.guests);
  const confirmItems = rental ? [] : itemsToConfirm(r.package, r.guests);
  const initial = () => {
    const q = r.quotation;
    const otherLines = otherChargeItemsFor(q);
    const amount = (value) => (q && value ? String(value) : '');
    const startPrice = (id) => {
      const booked = r.estimate && r.estimate.addonPrices && r.estimate.addonPrices[id];
      const addon = r.addons.find((a) => a.id === id);
      const price = booked || (addon && addon.price);
      return price ? String(price) : '';
    };
    return {
      addonPrices: Object.fromEntries(
        r.addonIds.map((id) => [id, q ? amount(q.addonPrices && q.addonPrices[id]) : startPrice(id)])
      ),
      extraGuestsCharge: q && q.extraGuests ? String(q.extraGuestsCharge || 0) : '',
      itemCounts: Object.fromEntries(
        confirmItems.map((item) => [
          item.name,
          q && q.itemCounts && q.itemCounts[item.name] ? String(q.itemCounts[item.name]) : ''
        ])
      ),
      deliveryFee: String(q && q.fulfilment === 'delivery' ? q.deliveryFee : RENTAL.deliveryFee),
      otherChargeItems: (otherLines.length ? otherLines : [{ amount: '', label: '' }]).map((line, index) => ({
        id: `saved-${index}`,
        amount: String(line.amount),
        label: line.label
      })),
      discount: amount(q && q.discount),
      note: q ? q.note : ''
    };
  };
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setValues(initial()), [r.quotation?.sentAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const setAddonPrice = (id) => (e) =>
    setValues((v) => ({ ...v, addonPrices: { ...v.addonPrices, [id]: e.target.value } }));
  const setItemCount = (name) => (e) =>
    setValues((v) => ({ ...v, itemCounts: { ...v.itemCounts, [name]: e.target.value } }));
  const itemCount = (name) => (values.itemCounts || {})[name] ?? '';
  const setOtherCharge = (id, key) => (e) => {
    const value = e.target.value;
    setValues((v) => ({
      ...v,
      otherChargeItems: v.otherChargeItems.map((line) => (line.id === id ? { ...line, [key]: value } : line))
    }));
  };
  const removeOtherCharge = (id) =>
    setValues((v) => ({
      ...v,
      otherChargeItems:
        v.otherChargeItems.length === 1 ? [newOtherCharge()] : v.otherChargeItems.filter((line) => line.id !== id)
    }));

  const preview = computeQuote({
    pkg: r.package,
    serviceType: r.serviceType,
    guests: r.guests,
    pricePerPlate: r.pricePerPlate,
    rentalItems: rental ? r.rentalItems : [],
    deliveryFee: delivered ? values.deliveryFee : 0,
    damageCharges: rental ? r.damageCharges || [] : [],
    addonIds: r.addonIds,
    addonQty: r.addonQty,
    addonPrices: values.addonPrices,
    extraGuestsCharge: values.extraGuestsCharge,
    otherChargeItems: values.otherChargeItems,
    discount: values.discount
  });
  const addonLabel = (a) => (a.hasQuantity ? `${a.name} × ${(r.addonQty || {})[a.id] || 1}` : a.name);
  const invalid = (value) => value !== '' && (Number.isNaN(Number(value)) || Number(value) < 0);
  const amountError = (value) => (invalid(value) ? 'Enter a valid amount.' : '');
  const otherAmountError = (value) =>
    value !== '' && (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 10000000)
      ? 'Enter an amount in whole pesos, from 0 to 10,000,000.'
      : '';
  const anyInvalid =
    [
      values.discount,
      ...(delivered ? [values.deliveryFee] : []),
      ...(extraGuests ? [values.extraGuestsCharge] : []),
      ...Object.values(values.addonPrices)
    ].some(invalid) || values.otherChargeItems.some((line) => otherAmountError(line.amount));
  const countError = (value) =>
    value !== '' && !(Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= ITEM_COUNT_MAX)
      ? `Enter a whole number from 1 to ${ITEM_COUNT_MAX.toLocaleString('en-PH')}.`
      : '';
  const gross =
    preview.packageTotal +
    preview.extraGuestsCharge +
    preview.food +
    preview.rental +
    preview.deliveryFee +
    preview.damage +
    preview.addons +
    preview.otherCharges;
  const discountError =
    amountError(values.discount) || (preview.discount > gross ? 'Discount is larger than the total.' : '');
  const paidAbove = Math.max(0, r.paid - preview.net);
  const missingPrice = r.addonIds.some((id) => !Number(values.addonPrices[id]));
  const missingExtra =
    extraGuests > 0 &&
    (values.extraGuestsCharge === '' ||
      confirmItems.some((item) => itemCount(item.name) === '' || countError(itemCount(item.name))));
  const toSend = (v) => ({
    addonPrices: Object.fromEntries(Object.entries(v.addonPrices).map(([id, price]) => [id, Number(price) || 0])),
    ...(extraGuests
      ? {
          extraGuestsCharge: Number(v.extraGuestsCharge) || 0,
          itemCounts: Object.fromEntries(
            confirmItems.map((item) => [item.name, Number((v.itemCounts || {})[item.name] ?? '')])
          )
        }
      : {}),
    deliveryFee: Number(v.deliveryFee) || 0,
    otherChargeItems: otherChargeItemsFor({ otherChargeItems: v.otherChargeItems }),
    discount: Number(v.discount) || 0,
    note: v.note
  });
  const changed =
    !r.quotation || r.quotationStale || JSON.stringify(toSend(values)) !== JSON.stringify(toSend(initial()));
  const peso0 = { startAdornment: <InputAdornment position="start">₱</InputAdornment> };

  return (
    <DashCard id="quotation-card">
      <CardTitle subtitle={r.quotation ? `Last sent ${formatDateTime(r.quotation.sentAt)}` : 'Not sent yet'}>
        Quotation
      </CardTitle>
      {r.quotationStale && !closed && (
        <AlertBanner tone="warning" sx={{ mb: 2 }} title="The customer's quotation is out of date">
          {r.quotationStaleReason} Re-send it so the customer has the correct total.
        </AlertBanner>
      )}
      {rental ? (
        <>
          {preview.rentalItems.map((line) => (
            <DetailRow key={line.itemId} label={`${line.name} · ${line.qty} × ${peso(line.price)}`}>
              {peso(line.total)}
            </DetailRow>
          ))}
          {!delivered && <DetailRow label="Pick up">Free</DetailRow>}
          {closed && delivered && <DetailRow label="Delivery">{peso(preview.deliveryFee)}</DetailRow>}
          {preview.damageCharges.map((line) => (
            <DetailRow
              key={`damage-${line.itemId}`}
              label={`Damaged or missing · ${line.name} · ${line.qty} × ${peso(line.fee)}`}
            >
              {peso(line.total)}
            </DetailRow>
          ))}
        </>
      ) : (
        <>
          <DetailRow label={`Package · ${r.packageName} (${r.package.guests} guests)`}>
            {peso(preview.packageTotal)}
          </DetailRow>
          {includesFood(r.serviceType) ? (
            <DetailRow label={`Buffet · ${preview.plates} × ${peso(preview.pricePerPlate)}`}>
              {peso(preview.food)}
            </DetailRow>
          ) : (
            <DetailRow label="Food">Catering only</DetailRow>
          )}
        </>
      )}
      {closed ? (
        <>
          {usesGuestRule(r) && preview.extraGuests > 0 && (
            <DetailRow label={`Extra ${preview.extraGuests} guests (equipment)`}>
              {peso(preview.extraGuestsCharge)}
            </DetailRow>
          )}
          {usesGuestRule(r) && confirmItems.length > 0 && (
            <DetailRow label="Items confirmed">
              {confirmItems.map((item) => `${itemCount(item.name) || '?'} ${item.name}`).join(', ')}
            </DetailRow>
          )}
          {r.addons.map((a) => (
            <DetailRow key={a.id} label={addonLabel(a)}>
              {peso(preview.addonTotals[a.id])}
            </DetailRow>
          ))}
          {preview.otherChargeItems
            .filter((line) => line.amount > 0)
            .map((line, index) => (
              <DetailRow key={`other-${index}`} label={line.label || 'Other charges'}>
                {peso(line.amount)}
              </DetailRow>
            ))}
          <DetailRow label="Discount">— {peso(preview.discount)}</DetailRow>
        </>
      ) : (
        <Box sx={{ my: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {delivered && (
            <FormField
              id="q-delivery"
              label="Delivery fee"
              required
              type="number"
              value={values.deliveryFee}
              onChange={set('deliveryFee')}
              error={amountError(values.deliveryFee)}
              hint={`Standard ${peso(RENTAL.deliveryFee)}. Set more for a large order.`}
              InputProps={peso0}
              inputProps={{ min: 0, step: 50 }}
            />
          )}
          {extraGuests > 0 && (
            <>
              <FormField
                id="q-extra-guests"
                label={`Extra ${extraGuests} guests (equipment)`}
                required
                type="number"
                value={values.extraGuestsCharge}
                onChange={set('extraGuestsCharge')}
                error={amountError(values.extraGuestsCharge)}
                hint={`${r.guests} guests on a package for ${r.package.guests}. Plates, glasses, cutlery, chairs and tables grow by themselves; enter 0 to waive the charge.`}
                InputProps={peso0}
                inputProps={{ min: 0, step: 500 }}
              />
              {confirmItems.length > 0 && (
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 700 }}>Items to confirm for {r.guests} guests</Typography>
                  <Typography sx={{ mb: 1, fontSize: 12, color: tokens.textMuted }}>
                    How many of each for this event. The customer sees these instead of "to confirm".
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                    {confirmItems.map((item) => (
                      <FormField
                        key={item.name}
                        id={`q-count-${item.name}`}
                        label={item.name}
                        required
                        type="number"
                        value={itemCount(item.name)}
                        onChange={setItemCount(item.name)}
                        error={countError(itemCount(item.name))}
                        hint={`Package: ${item.defaultQty} for ${r.package.guests} guests`}
                        inputProps={{ min: 1, step: 1 }}
                      />
                    ))}
                  </Box>
                </Box>
              )}
            </>
          )}
          {r.addons.map((a) => (
            <FormField
              key={a.id}
              id={`q-addon-${a.id}`}
              label={addonLabel(a)}
              required
              type="number"
              value={values.addonPrices[a.id] ?? ''}
              onChange={setAddonPrice(a.id)}
              error={amountError(values.addonPrices[a.id] ?? '')}
              hint={
                a.hasQuantity
                  ? `Price of one · ${(r.addonQty || {})[a.id] || 1} = ${peso(preview.addonTotals[a.id])}`
                  : undefined
              }
              InputProps={peso0}
              inputProps={{ min: 0, step: 500 }}
            />
          ))}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {values.otherChargeItems.map((line, index) => (
              <Box key={line.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                <Box
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    gap: 1
                  }}
                >
                  <FormField
                    id={`q-other-${line.id}`}
                    label={index === 0 ? 'Other charges' : `Other charge ${index + 1}`}
                    optional
                    type="number"
                    value={line.amount}
                    onChange={setOtherCharge(line.id, 'amount')}
                    error={otherAmountError(line.amount)}
                    InputProps={peso0}
                    inputProps={{ min: 0, max: 10000000, step: 1 }}
                  />
                  <FormField
                    id={`q-other-label-${line.id}`}
                    label="What for"
                    optional
                    value={line.label}
                    onChange={setOtherCharge(line.id, 'label')}
                    placeholder="e.g. Extra waiter or 2 extra hours"
                    inputProps={{ maxLength: 60, 'aria-label': `What for other charge ${index + 1}` }}
                  />
                </Box>
                <IconButton
                  aria-label={`Remove other charge ${index + 1}`}
                  onClick={() => removeOtherCharge(line.id)}
                  sx={{ mt: 3.25, color: tokens.textMuted }}
                >
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
            <Button
              startIcon={<AddRoundedIcon />}
              onClick={() =>
                setValues((v) => ({
                  ...v,
                  otherChargeItems: [...v.otherChargeItems, newOtherCharge()]
                }))
              }
              sx={{ alignSelf: 'flex-start' }}
            >
              Add other charge
            </Button>
          </Box>
          <FormField
            id="q-discount"
            label="Discount"
            optional
            type="number"
            value={values.discount}
            onChange={set('discount')}
            error={discountError}
            InputProps={peso0}
            inputProps={{ min: 0, step: 500 }}
          />
        </Box>
      )}
      <Divider sx={{ my: 1 }} />
      <DetailRow label={<b>Net total</b>}>
        <Box component="span" sx={{ fontSize: 18, fontWeight: 800 }}>
          {peso(preview.net)}
        </Box>
      </DetailRow>
      {!closed && (
        <>
          {changed && paidAbove > 0 && (
            <AlertBanner tone="info" sx={{ mt: 1 }} title={`${peso(paidAbove)} was paid above this total`}>
              The customer has paid {peso(r.paid)}. Once sent, the difference shows under Refund to be returned, and the
              customer is told in their chat.
            </AlertBanner>
          )}
          <FormField
            id="q-note"
            label="Note to the customer"
            optional
            multiline
            minRows={2}
            value={values.note}
            onChange={set('note')}
            inputProps={{ maxLength: 300 }}
            sx={{ mt: 1 }}
          />
          {missingPrice && (
            <Typography sx={{ mt: 1, fontSize: 12.5, color: tokens.textMuted }}>
              Enter a price for each additional charge to send the quotation.
            </Typography>
          )}
          {missingExtra && (
            <Typography sx={{ mt: 1, fontSize: 12.5, color: tokens.textMuted }}>
              Enter the price for the extra guests and the count of each item to confirm to send the quotation.
            </Typography>
          )}
          {!changed && (
            <Typography sx={{ mt: 1, fontSize: 12.5, color: tokens.textMuted }}>
              Nothing has changed since the last quotation. Re-sending it sends the same quotation to the customer
              again.
            </Typography>
          )}
          <BusyButton
            fullWidth
            busy={busy}
            disabled={anyInvalid || Boolean(discountError) || missingPrice || missingExtra}
            onClick={async () => {
              setBusy(true);
              await onSend(toSend(values));
              setBusy(false);
            }}
            sx={{ mt: 2 }}
          >
            {r.quotation ? 'Save and re-send quotation' : 'Save and send quotation'}
          </BusyButton>
        </>
      )}
    </DashCard>
  );
}

function NotesCard({ r, onSave }) {
  const [notes, setNotes] = useState(r.notes);
  const [busy, setBusy] = useState(false);
  useEffect(() => setNotes(r.notes), [r.notes]);
  return (
    <DashCard>
      <CardTitle subtitle="Visible to admin only">Internal Notes</CardTitle>
      <FormField
        id="internal-notes"
        multiline
        minRows={3}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Allergies, VIP guests, access details, follow-ups…"
        inputProps={{ maxLength: 1000 }}
      />
      {notes !== r.notes && (
        <BusyButton
          size="small"
          busy={busy}
          sx={{ mt: 1.5 }}
          onClick={async () => {
            setBusy(true);
            await onSave(notes);
            setBusy(false);
          }}
        >
          Save notes
        </BusyButton>
      )}
    </DashCard>
  );
}

function QrCodes({ reservationRef }) {
  const { data, reload } = useResource(() => paymentApi.listQrPayments({ ref: reservationRef }), [reservationRef]);
  const qrs = data || [];
  useQrWatch(qrs, reload);
  if (!qrs.length) return null;
  const open = qrs.find((q) => q.status === 'pending');
  const openState = open ? qrState(open) : '';
  return (
    <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {openState === 'waiting' && (
        <AlertBanner tone="info" title="Waiting for QR Ph payment">
          The customer opened a QR Ph code for {peso(open.amount)} at {formatClock(open.createdAt)}. It can be paid
          until {formatClock(open.expiresAt)}. PayMongo confirms the payment by itself, so there is nothing to verify.
          Cash can be recorded once it is paid or expires.
        </AlertBanner>
      )}
      {openState === 'checking' && (
        <AlertBanner tone="info" title="Checking QR Ph payment">
          The QR Ph code for {peso(open.amount)} ran out of time at {formatClock(open.expiresAt)}. The system is
          checking with PayMongo whether it was paid in its last seconds.
        </AlertBanner>
      )}
      <Typography sx={{ mt: 0.5, fontSize: 12.5, fontWeight: 700, color: tokens.textSecondary }}>
        QR Ph Codes
      </Typography>
      {qrs.map((q) => (
        <Box key={q.id} sx={{ p: 1.25, borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}` }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center' }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{peso(q.amount)} · QR Ph</Typography>
            <QrStatusChip qr={q} size="sm" />
          </Box>
          <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>
            Opened {formatDateTime(q.createdAt)}
            {q.status === 'paid' ? ` · paid${q.paidAt ? ` ${formatClock(q.paidAt)}` : ''} · ${q.receiptNo}` : ''}
            {q.status === 'pending' ? ` · until ${formatClock(q.expiresAt)}` : ''}
            {q.status === 'failed' && q.failureReason ? ` · ${q.failureReason}` : ''}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function CashDialog({ open, onClose, r, onSubmit }) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setAmount(String(r.balance));
      setError('');
    }
  }, [open, r.balance]);

  const submit = async () => {
    const n = Number(amount);
    if (!n || n <= 0) return setError('Enter the amount received.');
    if (n > r.balance) return setError(`The remaining balance is ${peso(r.balance)}.`);
    setBusy(true);
    try {
      await onSubmit(n);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      busy={busy}
      maxWidth="xs"
      title="Mark Payment Received"
      description="Record a cash payment collected on site. A receipt is generated and the customer is notified."
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <BusyButton busy={busy} onClick={submit}>
            Record payment
          </BusyButton>
        </>
      }
    >
      <FormField
        id="cash-amount"
        label="Amount received"
        type="number"
        value={amount}
        onChange={(e) => {
          setAmount(e.target.value);
          setError('');
        }}
        error={error}
        hint={`Balance ${peso(r.balance)} · minimum downpayment ${peso(r.downpayment)}${r.downpaymentPaid ? ' (reached)' : ''}`}
        InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
        autoFocus
      />
    </AppDialog>
  );
}

function MenuDialog({ open, onClose, r, onSubmit }) {
  const start = () => ({ serviceType: r.serviceType, menu: { ...(r.menu || {}) }, foodNotes: r.foodNotes || '' });
  const [values, setValues] = useState(start);
  const [dishes, setDishes] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const buffet = includesFood(values.serviceType);

  useEffect(() => {
    if (!open) return;
    setValues(start());
    setError('');
    catalogApi
      .listDishes()
      .then(setDishes)
      .catch(() => setDishes([]));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setError('');
  };
  const setDish = (category, text) => {
    setValues((v) => ({ ...v, menu: { ...v.menu, [category]: text } }));
    setError('');
  };

  const changed = JSON.stringify(values) !== JSON.stringify(start());
  const menuCheck = menuProblem(values.menu, { buffet, dessert: r.addonIds.includes(DESSERT_ADDON_ID) });
  const incomplete = Boolean(menuCheck);

  const save = async () => {
    if (incomplete) return setError(menuCheck.message);
    setBusy(true);
    try {
      await onSubmit(values);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      busy={busy}
      maxWidth="md"
      fullScreenOnMobile
      title="Edit Menu"
      description="What we are serving at this event. Re-send the quotation if the total changes."
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <BusyButton busy={busy} disabled={!changed || incomplete} onClick={save}>
            Save menu
          </BusyButton>
        </>
      }
    >
      {error && (
        <AlertBanner tone="error" sx={{ mb: 2 }}>
          {error}
        </AlertBanner>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <SelectField
          id="menu-service"
          label="Booking"
          value={values.serviceType}
          onChange={set('serviceType')}
          options={SERVICE_TYPES}
          hint={
            buffet
              ? `Charged ${peso(r.pricePerPlate)} per person for ${r.guests} guests`
              : 'Equipment and setup only, with no per-person charge'
          }
        />
        {buffet && <MenuPicker idPrefix="menu" menu={values.menu} dishes={dishes} onChange={setDish} />}
        {buffet && (
          <FormField
            id="menu-juice"
            label="Preferred juice"
            optional
            value={values.menu.juice || ''}
            onChange={(e) => setDish('juice', e.target.value)}
            inputProps={{ maxLength: 120 }}
            hint="Unlimited water remains included."
          />
        )}
        {r.addonIds.includes(DESSERT_ADDON_ID) && (
          <DessertFields idPrefix="menu-dessert" value={values.menu.dessert} onChange={(v) => setDish('dessert', v)} />
        )}
        <FormField
          id="menu-notes"
          label="Note about the food"
          multiline
          minRows={3}
          value={values.foodNotes}
          onChange={set('foodNotes')}
          inputProps={{ maxLength: 500 }}
          hint="Allergies, a vegetarian portion, serving time. Does not change the price."
        />
      </Box>
    </AppDialog>
  );
}

function StylingDialog({ open, onClose, r, onSubmit }) {
  const start = () => ({ theme: '', themeOther: '', colors: [], notes: '', ...(r.styling || {}) });
  const [values, setValues] = useState(start);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(start());
    setErrors({});
    setError('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (patch) => {
    setValues((v) => ({ ...v, ...patch }));
    setErrors({});
    setError('');
  };
  const cleaned = cleanStyling(values);
  const changed = JSON.stringify(cleaned) !== JSON.stringify(cleanStyling(start()));

  const save = async () => {
    const problem = stylingProblem(cleaned);
    if (problem) return setErrors({ [problem.field]: problem.message });
    setBusy(true);
    try {
      await onSubmit(cleaned || { theme: '', themeOther: '', colors: [], notes: '' });
    } catch (e) {
      if (e.meta && e.meta.field) setErrors({ [e.meta.field]: e.message });
      else setError(e.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      busy={busy}
      maxWidth="md"
      fullScreenOnMobile
      title="Edit Theme and Colors"
      description="The look the team sets up for this event. It never changes the price."
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <BusyButton busy={busy} disabled={!changed} onClick={save}>
            Save
          </BusyButton>
        </>
      }
    >
      {r.preparingAt && (
        <AlertBanner tone="warning" sx={{ mb: 2 }}>
          Preparation has started. Check that the team can still change the linens and decorations before saving.
        </AlertBanner>
      )}
      {error && (
        <AlertBanner tone="error" sx={{ mb: 2 }}>
          {error}
        </AlertBanner>
      )}
      <StylingFields idPrefix="styling" value={values} onChange={change} occasion={r.occasion} errors={errors} />
    </AppDialog>
  );
}

function RentalCard({ r, closed, onEdit, onCheckOut, onReturn }) {
  const { data } = useResource(() => inventoryApi.rentalCheckoutState(r.ref), [r.ref]);
  const out = data?.out || {};
  const piecesOut = Object.values(out).reduce((sum, qty) => sum + qty, 0);
  const toCheckOut =
    Boolean(data) &&
    r.rentalItems.some((line) => line.qty > Math.max(out[line.itemId] || 0, data.dispatched[line.itemId] || 0));
  const damage = r.damageCharges || [];

  return (
    <DashCard>
      <CardTitle
        subtitle={`${r.packageName} · ${r.fulfilment === 'delivery' ? 'delivery' : `pick up at ${RENTAL.pickupAddress}`}`}
        action={
          !closed && (
            <Button size="small" variant="outlined" onClick={onEdit}>
              Edit items
            </Button>
          )
        }
      >
        {r.serviceType}
      </CardTitle>
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        {r.rentalItems.map((line) => (
          <Box
            key={line.itemId}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 2,
              py: 1,
              borderBottom: `1px solid ${tokens.cardLightBorder}`
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{line.name}</Typography>
              <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>
                {line.qty} × {peso(line.price)} · damage fee {peso(line.damageFee)}
                {out[line.itemId] ? ` · ${out[line.itemId]} out now` : ''}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {peso(line.qty * line.price)}
            </Typography>
          </Box>
        ))}
      </Box>
      {damage.length > 0 && (
        <AlertBanner tone="warning" sx={{ mt: 2 }} title="Damage charges">
          {damage.map((line) => `${line.qty} × ${line.name} (${peso(line.fee)} each)`).join(', ')}:{' '}
          {peso(damage.reduce((sum, line) => sum + line.qty * line.fee, 0))}.
          {r.quotationStale ? ' Re-send the quotation so the customer owes it.' : ' Included in the quotation.'}
        </AlertBanner>
      )}
      {!closed && toCheckOut && (
        <Typography sx={{ mt: 1.5, fontSize: 12.5, color: tokens.textSecondary }}>
          {r.status === 'confirmed'
            ? `Items check out automatically on ${formatDate(r.date)} at ${formatTime(r.startTime)}, the scheduled ${r.fulfilment === 'delivery' ? 'delivery' : 'pickup'} time. Check the audit trail if stock is short.`
            : 'Items are reserved for the rental date once approved. Automatic checkout starts after confirmation, at the scheduled pickup or delivery time.'}
        </Typography>
      )}
      {!closed && ((HOLDS.includes(r.status) && toCheckOut) || piecesOut > 0) && (
        <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {HOLDS.includes(r.status) && toCheckOut && (
            <Button variant="outlined" onClick={onCheckOut}>
              Check out now
            </Button>
          )}
          {piecesOut > 0 && (
            <Button variant="outlined" onClick={onReturn}>
              Record return
            </Button>
          )}
        </Box>
      )}
    </DashCard>
  );
}

function RentalItemsDialog({ open, onClose, r, onSubmit }) {
  const [items, setItems] = useState([]);
  const [free, setFree] = useState({});
  const [qty, setQty] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQty(Object.fromEntries(r.rentalItems.map((line) => [line.itemId, String(line.qty)])));
    setError('');
    Promise.all([catalogApi.listRentalItems(), reservationApi.getRentalAvailability(r.date, { excludeRef: r.ref })])
      .then(([list, available]) => {
        const booked = r.rentalItems.map((line) => ({
          id: line.itemId,
          name: line.name,
          category: 'On this rental',
          price: line.price
        }));
        setItems([...booked, ...list.filter((item) => !r.rentalItems.some((line) => line.itemId === item.id))]);
        setFree(available);
      })
      .catch((e) => setError(e.message));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCount = (id) => (e) => {
    const digits = e.target.value.replace(/\D/g, '');
    if (digits && Number(digits) > RENTAL.maxQty) return;
    setQty((q) => ({ ...q, [id]: digits }));
    setError('');
  };

  const chosen = items.filter((item) => Number(qty[item.id]) > 0);
  const before = r.rentalItems.reduce((sum, line) => sum + line.qty * line.price, 0);
  const after = chosen.reduce((sum, item) => sum + Number(qty[item.id]) * item.price, 0);
  const changed =
    JSON.stringify(chosen.map((item) => [item.id, Number(qty[item.id])])) !==
    JSON.stringify(r.rentalItems.map((line) => [line.itemId, line.qty]));

  const save = async () => {
    if (!chosen.length) return setError('Keep at least one item on the rental.');
    setBusy(true);
    try {
      await onSubmit(chosen.map((item) => ({ itemId: item.id, qty: Number(qty[item.id]) })));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      busy={busy}
      maxWidth="sm"
      fullScreenOnMobile
      title="Edit Rented Items"
      description={`Free counts are for ${formatDate(r.date)}. Items already on the rental keep the price they were booked at.`}
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <BusyButton busy={busy} disabled={!changed} onClick={save}>
            Save items
          </BusyButton>
        </>
      }
    >
      {error && (
        <AlertBanner tone="error" sx={{ mb: 2 }}>
          {error}
        </AlertBanner>
      )}
      {changed && chosen.length > 0 && (
        <AlertBanner tone="warning" sx={{ mb: 2 }} title="This changes the customer's total">
          Items from {peso(before)} to {peso(after)}. Saving posts a message telling the customer; the amount they owe
          only changes once you re-send the quotation.
        </AlertBanner>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {items.map((item, index) => (
          <Box key={item.id}>
            {(index === 0 || items[index - 1].category !== item.category) && (
              <Typography
                sx={{ mt: index ? 1.5 : 0, mb: 0.75, fontSize: 12.5, fontWeight: 700, color: tokens.textMuted }}
              >
                {titleCase(item.category)}
              </Typography>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 96px', gap: 1.25, alignItems: 'center' }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{item.name}</Typography>
                <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>
                  {peso(item.price)} each{free[item.id] ? ` · ${free[item.id].left} free that day` : ''}
                </Typography>
              </Box>
              <FormField
                id={`ri-${item.id}`}
                value={qty[item.id] || ''}
                onChange={setCount(item.id)}
                placeholder="0"
                inputProps={{
                  inputMode: 'numeric',
                  maxLength: String(RENTAL.maxQty).length,
                  'aria-label': `How many ${item.name}`
                }}
              />
            </Box>
          </Box>
        ))}
      </Box>
    </AppDialog>
  );
}

function ReturnDialog({ open, onClose, r, onSubmit }) {
  const [out, setOut] = useState({});
  const [rows, setRows] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    inventoryApi
      .listReservationEquipment(r.ref)
      .then((pieces) => {
        setOut(pieces);
        setRows(
          Object.fromEntries(Object.entries(pieces).map(([id, qty]) => [id, { good: String(qty), damaged: '0' }]))
        );
      })
      .catch((e) => setError(e.message));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = r.rentalItems.filter((line) => out[line.itemId]);
  const set = (id, field) => (e) => {
    setRows((all) => ({ ...all, [id]: { ...all[id], [field]: e.target.value.replace(/\D/g, '') } }));
    setError('');
  };
  const count = (id, field) => Number((rows[id] || {})[field]) || 0;
  const tooMany = lines.find((line) => count(line.itemId, 'good') + count(line.itemId, 'damaged') > out[line.itemId]);
  const charge = lines.reduce((sum, line) => sum + count(line.itemId, 'damaged') * line.damageFee, 0);

  const save = async () => {
    if (tooMany) return setError(`Only ${out[tooMany.itemId]} ${tooMany.name} are out for this rental.`);
    setBusy(true);
    try {
      await onSubmit(
        lines.map((line) => ({
          itemId: line.itemId,
          good: count(line.itemId, 'good'),
          damaged: count(line.itemId, 'damaged')
        }))
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      busy={busy}
      maxWidth="sm"
      fullScreenOnMobile
      title="Record Return"
      description="Count what came back. Pieces still missing can be left out now and recorded when they come back."
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <BusyButton busy={busy} onClick={save}>
            Record return
          </BusyButton>
        </>
      }
    >
      {error && (
        <AlertBanner tone="error" sx={{ mb: 2 }}>
          {error}
        </AlertBanner>
      )}
      {charge > 0 && (
        <AlertBanner tone="warning" sx={{ mb: 2 }} title={`${peso(charge)} in damage charges`}>
          Damaged or missing pieces are charged at each item's damage fee. Saving posts a message telling the customer;
          the amount they owe only changes once you re-send the quotation.
        </AlertBanner>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {lines.map((line) => (
          <Box
            key={line.itemId}
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', sm: 'minmax(0, 1.4fr) 1fr 1fr' },
              gap: 1.25,
              alignItems: 'start'
            }}
          >
            <Box sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' }, minWidth: 0 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{line.name}</Typography>
              <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>
                {out[line.itemId]} out · damage fee {peso(line.damageFee)}
              </Typography>
            </Box>
            <FormField
              id={`ret-good-${line.itemId}`}
              label="Good condition"
              value={(rows[line.itemId] || {}).good || ''}
              onChange={set(line.itemId, 'good')}
              inputProps={{ inputMode: 'numeric' }}
            />
            <FormField
              id={`ret-bad-${line.itemId}`}
              label="Damaged or missing"
              value={(rows[line.itemId] || {}).damaged || ''}
              onChange={set(line.itemId, 'damaged')}
              inputProps={{ inputMode: 'numeric' }}
            />
          </Box>
        ))}
      </Box>
    </AppDialog>
  );
}
