import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import InputAdornment from '@mui/material/InputAdornment';
import Typography from '@mui/material/Typography';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import {
  AlertBanner,
  AppDialog,
  BUFFET_DRINKS,
  BusyButton,
  CardTitle,
  DISH_CATEGORIES,
  ConfirmDialog,
  DashCard,
  DateField,
  DetailRow,
  DocumentDialog,
  ErrorState,
  FEEDBACK_CATEGORIES,
  FeedbackStatusChip,
  Field,
  FormField,
  ListSkeleton,
  MENU_LINE_MAX,
  PageHeader,
  PaymentStatusChip,
  RENTAL,
  RENTAL_FULFILMENT,
  RULES,
  SERVICE_TYPES,
  SelectField,
  StarRating,
  StatusChip,
  StatusPipeline,
  TimeField,
  catalogApi,
  computeQuote,
  daysFromToday,
  documentsFor,
  extraGuests,
  formatDate,
  formatDateTime,
  formatMobile,
  formatPackageItem,
  includesFood,
  inventoryApi,
  isRental,
  messageApi,
  paymentApi,
  paymentKindLabel,
  peso,
  reservationApi,
  tokens,
  useDocumentTitle,
  useNotify,
  useResource
} from '@tm/shared';
import { useMessenger } from '../components/MessagesWidget.jsx';

// Statuses where the booking is finished and can no longer be edited
const CLOSED = ['completed', 'declined', 'cancelled'];
// Statuses whose equipment can be checked out (approved to confirmed)
const HOLDS = ['approved', 'downpayment_paid', 'confirmed'];

/** 1t · Reservation details. The one screen where the admin edits a booking. */
export default function ReservationDetailPage() {
  // The reservation reference from the URL, e.g. /reservations/RES-2026-1020-01
  const { ref } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { openMessages } = useMessenger();
  // Load the reservation with its package, food request, add-ons and payments
  const { data: r, loading, error, reload } = useResource(() => reservationApi.getReservation(ref), [ref]);
  useDocumentTitle(r ? `${r.ref} · ${r.eventName}` : 'Reservation', 'Tres Marias Admin');

  const [dialog, setDialog] = useState(null); // which dialog is open: approve, decline, confirm, complete, cash, food, rentalItems, checkout, return
  const [doc, setDoc] = useState(null); // document open in the preview dialog
  // Breadcrumb links shown above the title
  const crumbs = [{ label: 'Reservation & Calendar', to: '/reservations?tab=all' }, { label: ref }];

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
  // Run a save action and show a success or error toast
  const act = async (fn, message) => {
    try {
      await fn();
      notify(message);
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  // Open (or create) the chat with this reservation's customer in the chat window
  const messageCustomer = async () => {
    try {
      const { id } = await messageApi.openThread({ customerId: r.customerId });
      openMessages(id);
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  // Buttons in the page header change with the status:
  // pending -> Approve / Send quotation / Decline, downpayment paid -> Confirm, confirmed and event day reached -> Mark completed
  const headerActions = (
    <>
      {r.status === 'pending' && (
        <>
          <Button variant="contained" onClick={() => setDialog('approve')}>Approve</Button>
          <Button variant="outlined" onClick={() => document.getElementById('quotation-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} sx={{ color: tokens.textLight, borderColor: 'rgba(197,160,89,0.45)' }}>
            Send quotation
          </Button>
          <Button onClick={() => setDialog('decline')} sx={{ color: tokens.dangerSoft }}>Decline</Button>
        </>
      )}
      {r.status === 'downpayment_paid' && <Button variant="contained" onClick={() => setDialog('confirm')}>Confirm booking</Button>}
      {r.status === 'confirmed' && daysFromToday(r.date) <= 0 && <Button variant="contained" onClick={() => setDialog('complete')}>Mark completed</Button>}
    </>
  );

  return (
    <>
      <PageHeader crumbs={crumbs} title={r.eventName} chip={<StatusChip status={r.status} />} subtitle={`Reservation · ${r.ref} · received ${formatDateTime(r.createdAt)}`} actions={headerActions} />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {/* Progress bar of the booking status, plus decline/cancel/overdue notices */}
        <DashCard>
          <StatusPipeline status={r.status} />
          {r.status === 'declined' && <AlertBanner tone="error" sx={{ mt: 2 }} title="Decline reason sent to the customer">{r.declineReason}</AlertBanner>}
          {r.status === 'cancelled' && <AlertBanner tone="error" sx={{ mt: 2 }} title="Cancelled by the customer">{r.cancelReason}</AlertBanner>}
          {r.status === 'approved' && r.balanceState === 'overdue' && <AlertBanner tone="error" sx={{ mt: 2 }} title="Downpayment overdue">Due {formatDate(r.downpaymentDue)}. Send a reminder from Payments or message the customer.</AlertBanner>}
        </DashCard>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1.5fr 1fr' }, gap: 2.5, alignItems: 'start' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, minWidth: 0 }}>
            <DashCard>
              <CardTitle action={<Button size="small" variant="outlined" startIcon={<ChatBubbleOutlineRoundedIcon />} onClick={messageCustomer}>Message</Button>}>Customer</CardTitle>
              <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{r.customer.name}</Typography>
              <Typography sx={{ fontSize: 13.5, color: tokens.textSecondary }}>
                {r.customer.email} · {formatMobile(r.customer.mobile)} · {r.customer.pastEvents} past {r.customer.pastEvents === 1 ? 'event' : 'events'}
              </Typography>
              <Button size="small" sx={{ mt: 1, px: 0 }} onClick={() => navigate(`/customers?open=${r.customerId}`)}>
                View customer profile
              </Button>
            </DashCard>

            <LogisticsCard r={r} closed={closed} onSave={(patch) => act(() => reservationApi.updateLogistics(r.ref, patch), isRental(r.serviceType) ? 'Rental details saved.' : 'Event details saved.')} />

            {/* An equipment rental shows its items and their check-out and return instead of a package and menu */}
            {isRental(r.serviceType) ? (
              <RentalCard r={r} closed={closed} onEdit={() => setDialog('rentalItems')} onCheckOut={() => setDialog('checkout')} onReturn={() => setDialog('return')} />
            ) : (
            <DashCard>
              <CardTitle subtitle={`${r.packageName} · ${peso(r.package.price)} · covers ${r.package.guests} guests`} action={!closed && <Button size="small" variant="outlined" onClick={() => setDialog('food')}>Edit menu</Button>}>
                {r.serviceType}
              </CardTitle>
              {/* The package can be used for any occasion; warn when the guests are more than it covers */}
              {extraGuests(r.package, r.guests) > 0 && (
                <AlertBanner tone="info" sx={{ mb: 2 }}>
                  {r.guests} guests is {extraGuests(r.package, r.guests)} more than {r.packageName} covers. Add a charge for the extra guests under Other charges in the quotation.
                </AlertBanner>
              )}
              <Field label="Package includes">{r.package.items.map(formatPackageItem).join(', ')}</Field>
              <Divider sx={{ my: 2 }} />
              {/* A buffet lists the dish chosen for each category, so the kitchen reads it at a glance */}
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
                {includesFood(r.serviceType) && <Field label="Drinks">{BUFFET_DRINKS.join(' and ')} for every guest</Field>}
                {/* Charges counted by the piece show how many the customer asked for */}
                <Field label="Additional charges">
                  {r.addons.length ? r.addons.map((a) => (a.hasQuantity ? `${a.name} × ${(r.addonQty || {})[a.id] || 1}` : a.name)).join(', ') : 'None'}
                </Field>
                {r.foodNotes && <Field label="Note from the customer">{r.foodNotes}</Field>}
              </Box>
            </DashCard>
            )}

          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, minWidth: 0 }}>
            <QuotationCard r={r} closed={closed} onSend={(values) => act(() => reservationApi.sendQuotation(r.ref, values), 'Quotation saved and sent to the customer.')} />

            <DashCard>
              <CardTitle>Payments</CardTitle>
              <DetailRow label="Downpayment 50%">
                {['pending', 'declined', 'cancelled'].includes(r.status) ? '—' : r.downpaymentPaid ? 'Paid' : `Unpaid${r.downpaymentDue ? ` · due ${formatDate(r.downpaymentDue)}` : ''}`}
              </DetailRow>
              <DetailRow label="Total">{peso(r.total)}</DetailRow>
              <DetailRow label="Paid">{peso(r.paid)}</DetailRow>
              <DetailRow label="Balance">{peso(r.balance)}</DetailRow>
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
                        {p.method === 'gcash' ? 'GCash' : p.method === 'bank' ? 'Bank transfer' : 'Cash'} · {formatDateTime(p.submittedAt)}
                        {p.receiptNo ? ` · ${p.receiptNo}` : ''}
                      </Typography>
                      {p.status === 'awaiting' && (
                        <Button size="small" sx={{ mt: 0.5, px: 0 }} onClick={() => navigate(`/reports?tab=payments&verify=${p.id}`)}>
                          Review proof
                        </Button>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
              {/* Record a cash payment only once approved and while money is still owed */}
              {['approved', 'downpayment_paid', 'confirmed', 'completed'].includes(r.status) && r.balance > 0 && (
                <Button fullWidth variant="contained" sx={{ mt: 2 }} onClick={() => setDialog('cash')}>
                  Mark payment received
                </Button>
              )}
            </DashCard>

            {/* The review the customer wrote for this event. It is moderated on the Feedbacks page. */}
            {r.testimonial && (
              <DashCard>
                <CardTitle action={<Button size="small" onClick={() => navigate(`/feedbacks?q=${r.ref}`)}>Open in Feedbacks</Button>}>Customer feedback</CardTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <StarRating value={r.testimonial.rating} showValue />
                  <FeedbackStatusChip feedback={r.testimonial} size="sm" />
                </Box>
                <Typography sx={{ mt: 1, fontSize: 13.5, lineHeight: 1.6, color: tokens.textPrimary }}>“{r.testimonial.body}”</Typography>
                <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                  {FEEDBACK_CATEGORIES.filter(({ key }) => r.testimonial.categories && r.testimonial.categories[key]).map(({ key, label }) => (
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
              <CardTitle>Documents</CardTitle>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {documentsFor(r).map((d) => (
                  <Box key={d.key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 13, fontWeight: 600 }}>{d.name}</Typography>
                      <Typography sx={{ fontSize: 11.5, color: tokens.textMuted }}>{d.note}</Typography>
                    </Box>
                    <Button size="small" disabled={!d.available} onClick={() => setDoc(d)}>
                      {d.available ? 'Open' : 'Pending'}
                    </Button>
                  </Box>
                ))}
              </Box>
            </DashCard>

            <NotesCard r={r} onSave={(notes) => act(() => reservationApi.saveNotes(r.ref, notes), 'Internal notes saved.')} />

            <DashCard>
              <CardTitle>Audit trail</CardTitle>
              <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: 360, overflowY: 'auto' }} className="tm-scroll">
                {/* History of every change, newest first (the newest dot is gold) */}
                {r.activity.slice().reverse().map((a, i) => (
                  <Box component="li" key={`${a.at}-${i}`} sx={{ display: 'flex', gap: 1.25 }}>
                    <Box sx={{ mt: 0.75, width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: i === 0 ? tokens.gold : tokens.cardLightBorder }} />
                    <Box>
                      <Typography sx={{ fontSize: 13 }}>{a.text}</Typography>
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

      {/* Dialogs for each status change; each calls the API, closes, and shows a toast */}
      <ConfirmDialog open={dialog === 'approve'} onClose={() => setDialog(null)} title="Approve this reservation?" description={r.quotation ? `The quotation of ${peso(r.quotation.net)} is attached. The customer gets a 50% downpayment due date.` : 'Send the quotation first: the food and additional charges need prices before the reservation can be approved.'} confirmLabel="Approve" onConfirm={async () => { await reservationApi.approveReservation(r.ref); setDialog(null); notify('Reservation approved.'); }} />
      <ConfirmDialog open={dialog === 'decline'} onClose={() => setDialog(null)} title="Decline this reservation?" description="The reason is shown to the customer. The date stays open for other bookings." confirmLabel="Decline" tone="danger" reasonLabel="Reason shown to the customer" onConfirm={async (reason) => { await reservationApi.declineReservation(r.ref, reason); setDialog(null); notify('Reservation declined.', 'info'); }} />
      <ConfirmDialog open={dialog === 'confirm'} onClose={() => setDialog(null)} title="Confirm this booking?" description="The customer's contract becomes available in their Documents." confirmLabel="Confirm booking" onConfirm={async () => { await reservationApi.confirmReservation(r.ref); setDialog(null); notify('Booking confirmed.'); }} />
      <ConfirmDialog open={dialog === 'complete'} onClose={() => setDialog(null)} title="Mark as completed?" description={r.balance > 0 ? `There is still a balance of ${peso(r.balance)}. Record the payment first if it was collected.` : 'The customer will be invited to leave a testimonial.'} confirmLabel="Mark completed" onConfirm={async () => { await reservationApi.completeReservation(r.ref); setDialog(null); notify('Event marked as completed.'); }} />
      <CashDialog open={dialog === 'cash'} onClose={() => setDialog(null)} r={r} onSubmit={async (amount) => { await paymentApi.recordCashPayment(r.ref, amount); setDialog(null); notify('Payment recorded and receipt issued.'); }} />
      <MenuDialog open={dialog === 'food'} onClose={() => setDialog(null)} r={r} onSubmit={async (patch) => { await reservationApi.updateMenu(r.ref, patch); setDialog(null); notify('Menu updated. Re-send the quotation if the total changed.'); }} />
      {isRental(r.serviceType) && (
        <>
          <RentalItemsDialog open={dialog === 'rentalItems'} onClose={() => setDialog(null)} r={r} onSubmit={async (items) => { await reservationApi.updateRentalItems(r.ref, { items }); setDialog(null); notify('Rented items saved. The customer was told in their chat; re-send the quotation for the new total.'); }} />
          <ConfirmDialog open={dialog === 'checkout'} onClose={() => setDialog(null)} title="Check out the rented items?" description="Every item still needed for this rental moves from Available to In use in the inventory, and each check-out is added to the audit trail." confirmLabel="Check out" onConfirm={async () => { await inventoryApi.checkOutRental(r.ref); setDialog(null); notify('Rented items checked out.'); }} />
          <ReturnDialog open={dialog === 'return'} onClose={() => setDialog(null)} r={r} onSubmit={async (rows) => { const result = await inventoryApi.returnRental(r.ref, rows); setDialog(null); notify(result.damaged ? `Return recorded. ${result.damaged} damaged or missing pieces were charged; re-send the quotation.` : 'Return recorded.'); }} />
        </>
      )}
      <DocumentDialog open={Boolean(doc)} onClose={() => setDoc(null)} detail={r} doc={doc} />
    </>
  );
}

/**
 * Editable event details: date, time, guests, setup, venue and access notes.
 * For an equipment rental: the date, the pick-up or delivery time, pick up versus delivery and the
 * delivery address (no guests). Switching between pick up and delivery changes the total, so it
 * is flagged before saving, the same way a new guest count on a buffet is.
 */
function LogisticsCard({ r, closed, onSave }) {
  const rental = isRental(r.serviceType);
  // Form values built from the saved reservation
  const initial = () => ({ date: r.date, startTime: r.startTime, guests: String(r.guests), fulfilment: r.fulfilment || '', venueName: r.venue.name, venueAddress: r.venue.address, city: r.venue.city, accessNotes: r.venue.accessNotes });
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  // Refill the form when the saved reservation changes
  useEffect(() => setValues(initial()), [r.date, r.startTime, r.guests, r.fulfilment, r.venue.name, r.venue.address, r.venue.city, r.venue.accessNotes]); // eslint-disable-line react-hooks/exhaustive-deps

  // True when something was changed, so Save/Reset appear enabled
  const dirty = JSON.stringify(values) !== JSON.stringify(initial());
  // Change handler for one field (accepts an input event or a plain value from the date picker).
  // Switching a picked-up rental to delivery empties the address, which still holds our pick-up point.
  const set = (k) => (e) =>
    setValues((v) => {
      const value = e && e.target ? e.target.value : e;
      const next = { ...v, [k]: value };
      if (k === 'fulfilment' && value === 'delivery' && r.fulfilment !== 'delivery') Object.assign(next, { venueName: '', venueAddress: '', city: '', accessNotes: '' });
      if (k === 'fulfilment' && value === r.fulfilment) Object.assign(next, { venueName: r.venue.name, venueAddress: r.venue.address, city: r.venue.city, accessNotes: r.venue.accessNotes });
      return next;
    });
  const delivered = rental && values.fulfilment === 'delivery';
  // A rental switched between pick up and delivery gains or loses the delivery fee
  const switching = rental && values.fulfilment !== r.fulfilment;
  // Warn (but don't block) when the guest count is above what the package covers
  const overBy = extraGuests(r.package, values.guests);
  // A buffet is charged per person, so a new guest count moves the total before it is even saved
  const guestsNow = Number(values.guests) || 0;
  const repricing = includesFood(r.serviceType) && guestsNow !== r.guests && guestsNow > 0;

  if (rental) {
    return (
      <DashCard>
        <CardTitle subtitle={closed ? 'This reservation is closed.' : 'Editable by admin'}>Rental and logistics</CardTitle>
        {switching && (
          <AlertBanner tone="warning" sx={{ mb: 2 }} title="This changes the customer's total">
            {delivered ? `Delivery adds ${peso(RENTAL.deliveryFee)} (the standard fee).` : 'Pick up is free, so the delivery fee comes off.'} Saving posts a message telling the customer; the amount they owe only changes once you re-send the quotation.
          </AlertBanner>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <DateField id="l-date" label="Rental date" mode="any" value={values.date} onChange={set('date')} disabled={closed} />
          <TimeField id="l-start" label={delivered ? 'Delivery time' : 'Pick-up time'} value={values.startTime} onChange={set('startTime')} min={RULES.earliestStart} max={RULES.latestStart} step={30} disabled={closed} />
          <SelectField id="l-fulfilment" label="Pick up or delivery" value={values.fulfilment} onChange={set('fulfilment')} options={RENTAL_FULFILMENT} disabled={closed} sx={{ gridColumn: { sm: '1 / -1' } }} />
          {delivered ? (
            <>
              <FormField id="l-venue" label="Deliver to" value={values.venueName} onChange={set('venueName')} disabled={closed} />
              <FormField id="l-city" label="City" value={values.city} onChange={set('city')} disabled={closed} />
              <FormField id="l-address" label="Address" value={values.venueAddress} onChange={set('venueAddress')} disabled={closed} sx={{ gridColumn: { sm: '1 / -1' } }} />
              <FormField id="l-notes" label="Notes for the delivery" multiline minRows={2} value={values.accessNotes} onChange={set('accessNotes')} disabled={closed} sx={{ gridColumn: { sm: '1 / -1' } }} />
            </>
          ) : (
            <Field label="Pick up at">{RENTAL.pickupAddress}</Field>
          )}
        </Box>
        {!closed && (
          <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
            <BusyButton
              busy={busy}
              disabled={!dirty || (delivered && (!values.venueName.trim() || !values.venueAddress.trim() || !values.city.trim()))}
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
    <DashCard>
      <CardTitle subtitle={closed ? 'This reservation is closed.' : 'Editable by admin'}>Event and logistics</CardTitle>
      {/* Changing the guest count on a buffet changes what the customer owes, so say so plainly
          before it is saved. Saving tells the customer in their chat; only re-sending the
          quotation actually changes the amount. */}
      {repricing && (
        <AlertBanner tone="warning" sx={{ mb: 2 }} title="This changes the customer's total">
          {r.guests} → {guestsNow} guests at {peso(r.pricePerPlate)} per person moves the buffet from {peso(r.guests * r.pricePerPlate)} to {peso(guestsNow * r.pricePerPlate)}. Saving posts a message
          telling the customer; the amount they owe only changes once you re-send the quotation.
        </AlertBanner>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        <DateField id="l-date" label="Date" mode="any" value={values.date} onChange={set('date')} disabled={closed} />
        {/* Same hour / minute / AM-PM picker as the customer form: booking hours only, every 30 minutes */}
        <TimeField id="l-start" label="Start time" value={values.startTime} onChange={set('startTime')} min={RULES.earliestStart} max={RULES.latestStart} step={30} disabled={closed} />
        <FormField id="l-guests" label="Guests" type="number" value={values.guests} onChange={set('guests')} disabled={closed} hint={overBy ? `${overBy} more than ${r.packageName} covers (${r.package.guests})` : undefined} />
        <FormField id="l-venue" label="Venue" value={values.venueName} onChange={set('venueName')} disabled={closed} />
        <FormField id="l-city" label="City" value={values.city} onChange={set('city')} disabled={closed} />
        <FormField id="l-address" label="Address" value={values.venueAddress} onChange={set('venueAddress')} disabled={closed} sx={{ gridColumn: { sm: '1 / -1' } }} />
        <FormField id="l-notes" label="Access notes" multiline minRows={2} value={values.accessNotes} onChange={set('accessNotes')} disabled={closed} sx={{ gridColumn: { sm: '1 / -1' } }} />
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

/**
 * The admin prices the quotation. The package price is fixed and the food works itself out - a
 * buffet is the guest count times the per-person rate stored on this booking, and Catering only
 * has no food at all - so the admin only types a price for each additional charge the customer
 * ticked, any other charges (e.g. extra guests) and a discount, then sends it to the customer.
 *
 * For an add-on counted by the piece the amount typed is the price of ONE; the line total is that
 * times the quantity the customer asked for.
 *
 * An equipment rental lists its items at the prices they were booked at and any damage charges;
 * the admin only sets the delivery fee (standard RENTAL.deliveryFee, more for a large order).
 */
function QuotationCard({ r, closed, onSend }) {
  const rental = isRental(r.serviceType);
  const delivered = rental && r.fulfilment === 'delivery';
  // Form values from the last sent quotation (blank amounts when nothing was sent yet).
  // The delivery fee starts at the standard fee until a delivered quotation sets another.
  const initial = () => {
    const q = r.quotation;
    const amount = (value) => (q && value ? String(value) : '');
    return {
      addonPrices: Object.fromEntries(r.addonIds.map((id) => [id, amount(q && q.addonPrices && q.addonPrices[id])])),
      deliveryFee: String(q && q.fulfilment === 'delivery' ? q.deliveryFee : RENTAL.deliveryFee),
      otherCharges: amount(q && q.otherCharges),
      otherLabel: q ? q.otherLabel || '' : '',
      discount: amount(q && q.discount),
      note: q ? q.note : ''
    };
  };
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  // After a quotation is sent, reset the fields to the sent values
  useEffect(() => setValues(initial()), [r.quotation?.sentAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Change handler for one field
  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));
  // Change handler for one additional charge's price
  const setAddonPrice = (id) => (e) => setValues((v) => ({ ...v, addonPrices: { ...v.addonPrices, [id]: e.target.value } }));

  // Live price calculation. The food comes from the booking, not from anything typed here.
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
    otherCharges: values.otherCharges,
    discount: values.discount
  });
  // An add-on's label carries its count when it is charged by the piece
  const addonLabel = (a) => (a.hasQuantity ? `${a.name} × ${(r.addonQty || {})[a.id] || 1}` : a.name);
  // Every amount must be a number of 0 or more
  const invalid = (value) => value !== '' && (Number.isNaN(Number(value)) || Number(value) < 0);
  const amountError = (value) => (invalid(value) ? 'Enter a valid amount.' : '');
  const anyInvalid = [values.otherCharges, values.discount, ...(delivered ? [values.deliveryFee] : []), ...Object.values(values.addonPrices)].some(invalid);
  // Discount must not be more than the total, and the total must not drop below what was already paid
  const gross = preview.packageTotal + preview.food + preview.rental + preview.deliveryFee + preview.damage + preview.addons + preview.otherCharges;
  const discountError = amountError(values.discount) || (preview.discount > gross ? 'Discount is larger than the total.' : preview.net < r.paid ? 'Net total is below what the customer already paid.' : '');
  // Every additional charge needs a price before the quotation can be sent. The food does not:
  // it is already known from the service type and the guest count.
  const missingPrice = r.addonIds.some((id) => !Number(values.addonPrices[id]));
  // Only allow sending if nothing was sent yet, or something is different from the last one sent
  const changed = !r.quotation || JSON.stringify(values) !== JSON.stringify(initial());
  const peso0 = { startAdornment: <InputAdornment position="start">₱</InputAdornment> };

  return (
    <DashCard id="quotation-card">
      <CardTitle subtitle={r.quotation ? `Last sent ${formatDateTime(r.quotation.sentAt)}` : 'Not sent yet'}>Quotation</CardTitle>
      {/* The booking changed after the quotation went out, so what the customer holds is out of
          date. Their total does not move until this is re-sent, which is the point. */}
      {r.quotationStale && !closed && (
        <AlertBanner tone="warning" sx={{ mb: 2 }} title="The customer's quotation is out of date">
          {/* Name only what actually changed, so the reason is obvious at a glance */}
          {r.quotationStaleReason} Re-send it so the customer has the correct total.
        </AlertBanner>
      )}
      {rental ? (
        // Worked out, never typed: each item at the price it was booked at, then any damage charges
        <>
          {preview.rentalItems.map((line) => (
            <DetailRow key={line.itemId} label={`${line.name} · ${line.qty} × ${peso(line.price)}`}>{peso(line.total)}</DetailRow>
          ))}
          {!delivered && <DetailRow label="Pick up">Free</DetailRow>}
          {closed && delivered && <DetailRow label="Delivery">{peso(preview.deliveryFee)}</DetailRow>}
          {preview.damageCharges.map((line) => (
            <DetailRow key={`damage-${line.itemId}`} label={`Damaged or missing · ${line.name} · ${line.qty} × ${peso(line.fee)}`}>{peso(line.total)}</DetailRow>
          ))}
        </>
      ) : (
        <>
          <DetailRow label={`Package · ${r.packageName}`}>{peso(preview.packageTotal)}</DetailRow>
          {/* Worked out, never typed: the guest count times the rate this booking was made at */}
          {includesFood(r.serviceType) ? (
            <DetailRow label={`Buffet · ${preview.plates} × ${peso(preview.pricePerPlate)}`}>{peso(preview.food)}</DetailRow>
          ) : (
            <DetailRow label="Food">Catering only</DetailRow>
          )}
        </>
      )}
      {closed ? (
        // Closed reservations show the sent amounts read-only
        <>
          {r.addons.map((a) => <DetailRow key={a.id} label={addonLabel(a)}>{peso(preview.addonTotals[a.id])}</DetailRow>)}
          {preview.otherCharges > 0 && <DetailRow label={values.otherLabel || 'Other charges'}>{peso(preview.otherCharges)}</DetailRow>}
          <DetailRow label="Discount">— {peso(preview.discount)}</DetailRow>
        </>
      ) : (
        <Box sx={{ my: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {/* A delivered rental: standard fee unless the order is large */}
          {delivered && (
            <FormField id="q-delivery" label="Delivery fee" required type="number" value={values.deliveryFee} onChange={set('deliveryFee')} error={amountError(values.deliveryFee)} hint={`Standard ${peso(RENTAL.deliveryFee)}. Set more for a large order.`} InputProps={peso0} inputProps={{ min: 0, step: 50 }} />
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
              // By the piece: type what one costs, and the line total follows the customer's count
              hint={a.hasQuantity ? `Price of one · ${(r.addonQty || {})[a.id] || 1} = ${peso(preview.addonTotals[a.id])}` : undefined}
              InputProps={peso0}
              inputProps={{ min: 0, step: 500 }}
            />
          ))}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
            <FormField id="q-other" label="Other charges" optional type="number" value={values.otherCharges} onChange={set('otherCharges')} error={amountError(values.otherCharges)} InputProps={peso0} inputProps={{ min: 0, step: 500 }} />
            <FormField id="q-other-label" label="What for" optional value={values.otherLabel} onChange={set('otherLabel')} placeholder="e.g. 20 extra guests" inputProps={{ maxLength: 60 }} />
          </Box>
          <FormField id="q-discount" label="Discount" optional type="number" value={values.discount} onChange={set('discount')} error={discountError} InputProps={peso0} inputProps={{ min: 0, step: 500 }} />
        </Box>
      )}
      <Divider sx={{ my: 1 }} />
      <DetailRow label={<b>Net total</b>}>
        <Box component="span" sx={{ fontSize: 18, fontWeight: 800 }}>{peso(preview.net)}</Box>
      </DetailRow>
      {!closed && (
        <>
          <FormField id="q-note" label="Note to the customer" optional multiline minRows={2} value={values.note} onChange={set('note')} inputProps={{ maxLength: 300 }} sx={{ mt: 1 }} />
          {missingPrice && <Typography sx={{ mt: 1, fontSize: 12.5, color: tokens.textMuted }}>Enter a price for each additional charge to send the quotation.</Typography>}
          <BusyButton
            fullWidth
            busy={busy}
            disabled={anyInvalid || Boolean(discountError) || missingPrice || !changed}
            onClick={async () => {
              setBusy(true);
              await onSend({
                addonPrices: Object.fromEntries(Object.entries(values.addonPrices).map(([id, price]) => [id, Number(price) || 0])),
                deliveryFee: Number(values.deliveryFee) || 0,
                otherCharges: Number(values.otherCharges) || 0,
                otherLabel: values.otherLabel,
                discount: Number(values.discount) || 0,
                note: values.note
              });
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

/** Admin-only notes about the booking. The Save button appears once the text changes. */
function NotesCard({ r, onSave }) {
  const [notes, setNotes] = useState(r.notes);
  const [busy, setBusy] = useState(false);
  useEffect(() => setNotes(r.notes), [r.notes]);
  return (
    <DashCard>
      <CardTitle subtitle="Visible to admin only">Internal notes</CardTitle>
      <FormField id="internal-notes" multiline minRows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Allergies, VIP guests, access details, follow-ups…" inputProps={{ maxLength: 1000 }} />
      {notes !== r.notes && (
        <BusyButton size="small" busy={busy} sx={{ mt: 1.5 }} onClick={async () => { setBusy(true); await onSave(notes); setBusy(false); }}>
          Save notes
        </BusyButton>
      )}
    </DashCard>
  );
}

/** Dialog to record a cash payment collected by the admin. */
function CashDialog({ open, onClose, r, onSubmit }) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // When opened, pre-fill the full remaining balance
  useEffect(() => {
    if (open) {
      setAmount(String(r.balance));
      setError('');
    }
  }, [open, r.balance]);

  // Amount must be more than 0 and not more than the balance
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
    <AppDialog open={open} onClose={onClose} busy={busy} maxWidth="xs" title="Mark payment received" description="Record a cash payment collected on site. A receipt is generated and the customer is notified." actions={<><Button onClick={onClose} disabled={busy}>Cancel</Button><BusyButton busy={busy} onClick={submit}>Record payment</BusyButton></>}>
      <FormField id="cash-amount" label="Amount received" type="number" value={amount} onChange={(e) => { setAmount(e.target.value); setError(''); }} error={error} hint={`Balance ${peso(r.balance)} · downpayment ${peso(r.downpayment)}`} InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }} autoFocus />
    </AppDialog>
  );
}

/**
 * Dialog for the admin to change what the customer is having (e.g. after agreeing it in chat):
 * the service type, the four menu lines and the note. Each line is free text, the same as on the
 * booking form, so a line can name more than one dish. Switching between Buffet and Catering only
 * changes the total, so the customer is messaged and the quotation is left flagged until re-sent.
 */
function MenuDialog({ open, onClose, r, onSubmit }) {
  const start = () => ({ serviceType: r.serviceType, menu: { ...(r.menu || {}) }, foodNotes: r.foodNotes || '' });
  const [values, setValues] = useState(start);
  const [dishes, setDishes] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const buffet = includesFood(values.serviceType);

  // Start from what is saved, and load the dishes still on offer, each time the dialog opens
  useEffect(() => {
    if (!open) return;
    setValues(start());
    setError('');
    catalogApi.listDishes().then(setDishes).catch(() => setDishes([]));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (e) => { setValues((v) => ({ ...v, [key]: e.target.value })); setError(''); };
  const setDish = (category) => (e) => { setValues((v) => ({ ...v, menu: { ...v.menu, [category]: e.target.value } })); setError(''); };

  const changed = JSON.stringify(values) !== JSON.stringify(start());
  // A buffet needs something written on every line before it can be saved
  const incomplete = buffet && DISH_CATEGORIES.some(({ key }) => (values.menu[key] || '').trim().length < 2);

  // Save; errors from the server stay in the dialog
  const save = async () => {
    if (incomplete) return setError('Fill in all four lines of the menu.');
    setBusy(true);
    try {
      await onSubmit(buffet ? values : { ...values, menu: {} });
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
      title="Edit menu"
      description="What we are serving at this event. Re-send the quotation if the total changes."
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <BusyButton busy={busy} disabled={!changed || incomplete} onClick={save}>
            Save menu
          </BusyButton>
        </>
      }
    >
      {error && <AlertBanner tone="error" sx={{ mb: 2 }}>{error}</AlertBanner>}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <SelectField id="menu-service" label="Booking" value={values.serviceType} onChange={set('serviceType')} options={SERVICE_TYPES} hint={buffet ? `Charged ${peso(r.pricePerPlate)} per person for ${r.guests} guests` : 'Equipment and setup only, with no per-person charge'} />
        {/* Only a buffet has a menu. Free text, with the dish list offered as autocomplete. */}
        {buffet &&
          DISH_CATEGORIES.map(({ key, label }) => {
            const suggestions = dishes.filter((d) => d.category === key);
            return (
              <Box key={key}>
                <FormField
                  id={`menu-${key}`}
                  label={label}
                  value={values.menu[key] || ''}
                  onChange={setDish(key)}
                  placeholder={suggestions.length ? `e.g. ${suggestions[0].name}` : `The ${label.toLowerCase()}`}
                  inputProps={{ maxLength: MENU_LINE_MAX, list: `menu-dishes-${key}`, autoComplete: 'off' }}
                />
                <Box component="datalist" id={`menu-dishes-${key}`}>
                  {suggestions.map((d) => (
                    <option key={d.id} value={d.name} />
                  ))}
                </Box>
              </Box>
            );
          })}
        <FormField id="menu-notes" label="Note about the food" multiline minRows={3} value={values.foodNotes} onChange={set('foodNotes')} inputProps={{ maxLength: 500 }} hint="Allergies, a vegetarian portion, serving time. Does not change the price." />
      </Box>
    </AppDialog>
  );
}

/**
 * An equipment rental's items: how many of each, the price per piece it was booked at, how many are
 * out right now, and any damage charges. From here the admin edits the items (before the rental is
 * closed), checks everything out once it is approved, and records the return afterwards.
 */
function RentalCard({ r, closed, onEdit, onCheckOut, onReturn }) {
  // Pieces checked out for this rental right now, { itemId: pieces }; refreshes when the inventory changes
  const { data } = useResource(() => inventoryApi.listReservationEquipment(r.ref), [r.ref]);
  const out = data || {};
  const piecesOut = Object.values(out).reduce((sum, qty) => sum + qty, 0);
  // Some booked pieces are not out yet
  const toCheckOut = r.rentalItems.some((line) => line.qty > (out[line.itemId] || 0));
  const damage = r.damageCharges || [];

  return (
    <DashCard>
      <CardTitle
        subtitle={`${r.packageName} · ${r.fulfilment === 'delivery' ? 'delivery' : `pick up at ${RENTAL.pickupAddress}`}`}
        action={!closed && <Button size="small" variant="outlined" onClick={onEdit}>Edit items</Button>}
      >
        {r.serviceType}
      </CardTitle>
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        {r.rentalItems.map((line) => (
          <Box key={line.itemId} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 1, borderBottom: `1px solid ${tokens.cardLightBorder}` }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{line.name}</Typography>
              <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>
                {line.qty} × {peso(line.price)} · damage fee {peso(line.damageFee)}
                {out[line.itemId] ? ` · ${out[line.itemId]} out now` : ''}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{peso(line.qty * line.price)}</Typography>
          </Box>
        ))}
      </Box>
      {damage.length > 0 && (
        <AlertBanner tone="warning" sx={{ mt: 2 }} title="Damage charges">
          {damage.map((line) => `${line.qty} × ${line.name} (${peso(line.fee)} each)`).join(', ')}: {peso(damage.reduce((sum, line) => sum + line.qty * line.fee, 0))}.
          {r.quotationStale ? ' Re-send the quotation so the customer owes it.' : ' Included in the quotation.'}
        </AlertBanner>
      )}
      {r.status === 'pending' && <Typography sx={{ mt: 1.5, fontSize: 12.5, color: tokens.textSecondary }}>The items can be checked out once the rental is approved.</Typography>}
      {!closed && ((HOLDS.includes(r.status) && toCheckOut) || piecesOut > 0) && (
        <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {HOLDS.includes(r.status) && toCheckOut && <Button variant="contained" onClick={onCheckOut}>Check out items</Button>}
          {piecesOut > 0 && <Button variant="outlined" onClick={onReturn}>Record return</Button>}
        </Box>
      )}
    </DashCard>
  );
}

/**
 * Dialog to change a rental's items: how many of each, including items not on it yet. Items already
 * booked keep the price they were booked at; added items take today's rental price. Each row says how
 * many are free on the rental date (this rental's own pieces count as free). Saving tells the customer
 * in their chat and flags the quotation, which has to be re-sent for the new total to count.
 */
function RentalItemsDialog({ open, onClose, r, onSubmit }) {
  const [items, setItems] = useState([]); // [{ id, name, category, price }], this rental's items first
  const [free, setFree] = useState({}); // { itemId: { left } } on the rental date
  const [qty, setQty] = useState({}); // { itemId: how many, as typed }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Start from what is booked, and load the rentable items and what is free that day, each time the dialog opens
  useEffect(() => {
    if (!open) return;
    setQty(Object.fromEntries(r.rentalItems.map((line) => [line.itemId, String(line.qty)])));
    setError('');
    Promise.all([catalogApi.listRentalItems(), reservationApi.getRentalAvailability(r.date, { excludeRef: r.ref })])
      .then(([list, available]) => {
        const booked = r.rentalItems.map((line) => ({ id: line.itemId, name: line.name, category: 'On this rental', price: line.price }));
        setItems([...booked, ...list.filter((item) => !r.rentalItems.some((line) => line.itemId === item.id))]);
        setFree(available);
      })
      .catch((e) => setError(e.message));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Digits only, never above what one line can ask for
  const setCount = (id) => (e) => {
    const digits = e.target.value.replace(/\D/g, '');
    if (digits && Number(digits) > RENTAL.maxQty) return;
    setQty((q) => ({ ...q, [id]: digits }));
    setError('');
  };

  const chosen = items.filter((item) => Number(qty[item.id]) > 0);
  const before = r.rentalItems.reduce((sum, line) => sum + line.qty * line.price, 0);
  const after = chosen.reduce((sum, item) => sum + Number(qty[item.id]) * item.price, 0);
  const changed = JSON.stringify(chosen.map((item) => [item.id, Number(qty[item.id])])) !== JSON.stringify(r.rentalItems.map((line) => [line.itemId, line.qty]));

  // Save; errors from the server (e.g. not enough free that day) stay in the dialog
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
      title="Edit rented items"
      description={`Free counts are for ${formatDate(r.date)}. Items already on the rental keep the price they were booked at.`}
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <BusyButton busy={busy} disabled={!changed} onClick={save}>Save items</BusyButton>
        </>
      }
    >
      {error && <AlertBanner tone="error" sx={{ mb: 2 }}>{error}</AlertBanner>}
      {changed && chosen.length > 0 && (
        <AlertBanner tone="warning" sx={{ mb: 2 }} title="This changes the customer's total">
          Items from {peso(before)} to {peso(after)}. Saving posts a message telling the customer; the amount they owe only changes once you re-send the quotation.
        </AlertBanner>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {items.map((item, index) => (
          <Box key={item.id}>
            {/* A heading wherever the category changes */}
            {(index === 0 || items[index - 1].category !== item.category) && (
              <Typography sx={{ mt: index ? 1.5 : 0, mb: 0.75, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: tokens.textMuted }}>{item.category}</Typography>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 96px', gap: 1.25, alignItems: 'center' }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{item.name}</Typography>
                <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>
                  {peso(item.price)} each{free[item.id] ? ` · ${free[item.id].left} free that day` : ''}
                </Typography>
              </Box>
              <FormField id={`ri-${item.id}`} value={qty[item.id] || ''} onChange={setCount(item.id)} placeholder="0" inputProps={{ inputMode: 'numeric', maxLength: String(RENTAL.maxQty).length, 'aria-label': `How many ${item.name}` }} />
            </Box>
          </Box>
        ))}
      </Box>
    </AppDialog>
  );
}

/**
 * Dialog to record a rental coming back: for each item out, how many came back fine and how many came
 * back damaged or not at all. Fine pieces return to Available; the others go to Damaged in the
 * inventory and are charged at the item's damage fee. The customer is told in their chat, and the
 * quotation has to be re-sent for the charge to count.
 */
function ReturnDialog({ open, onClose, r, onSubmit }) {
  const [out, setOut] = useState({}); // { itemId: pieces out }
  const [rows, setRows] = useState({}); // { itemId: { good, damaged } } as typed
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Each time it opens: everything out, all of it back in good condition to start with
  useEffect(() => {
    if (!open) return;
    setError('');
    inventoryApi
      .listReservationEquipment(r.ref)
      .then((pieces) => {
        setOut(pieces);
        setRows(Object.fromEntries(Object.entries(pieces).map(([id, qty]) => [id, { good: String(qty), damaged: '0' }])));
      })
      .catch((e) => setError(e.message));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = r.rentalItems.filter((line) => out[line.itemId]);
  // Digits only
  const set = (id, field) => (e) => {
    setRows((all) => ({ ...all, [id]: { ...all[id], [field]: e.target.value.replace(/\D/g, '') } }));
    setError('');
  };
  const count = (id, field) => Number((rows[id] || {})[field]) || 0;
  // A row can't bring back more than is out
  const tooMany = lines.find((line) => count(line.itemId, 'good') + count(line.itemId, 'damaged') > out[line.itemId]);
  const charge = lines.reduce((sum, line) => sum + count(line.itemId, 'damaged') * line.damageFee, 0);

  const save = async () => {
    if (tooMany) return setError(`Only ${out[tooMany.itemId]} ${tooMany.name} are out for this rental.`);
    setBusy(true);
    try {
      await onSubmit(lines.map((line) => ({ itemId: line.itemId, good: count(line.itemId, 'good'), damaged: count(line.itemId, 'damaged') })));
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
      title="Record return"
      description="Count what came back. Pieces still missing can be left out now and recorded when they come back."
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <BusyButton busy={busy} onClick={save}>Record return</BusyButton>
        </>
      }
    >
      {error && <AlertBanner tone="error" sx={{ mb: 2 }}>{error}</AlertBanner>}
      {charge > 0 && (
        <AlertBanner tone="warning" sx={{ mb: 2 }} title={`${peso(charge)} in damage charges`}>
          Damaged or missing pieces are charged at each item's damage fee. Saving posts a message telling the customer; the amount they owe only changes once you re-send the quotation.
        </AlertBanner>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {lines.map((line) => (
          <Box key={line.itemId} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'minmax(0, 1.4fr) 1fr 1fr' }, gap: 1.25, alignItems: 'start' }}>
            <Box sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' }, minWidth: 0 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{line.name}</Typography>
              <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>
                {out[line.itemId]} out · damage fee {peso(line.damageFee)}
              </Typography>
            </Box>
            <FormField id={`ret-good-${line.itemId}`} label="Good condition" value={(rows[line.itemId] || {}).good || ''} onChange={set(line.itemId, 'good')} inputProps={{ inputMode: 'numeric' }} />
            <FormField id={`ret-bad-${line.itemId}`} label="Damaged or missing" value={(rows[line.itemId] || {}).damaged || ''} onChange={set(line.itemId, 'damaged')} inputProps={{ inputMode: 'numeric' }} />
          </Box>
        ))}
      </Box>
    </AppDialog>
  );
}
