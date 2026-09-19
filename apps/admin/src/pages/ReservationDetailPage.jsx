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
  BusyButton,
  CardTitle,
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
  PageHeader,
  PaymentStatusChip,
  RULES,
  SelectField,
  StarRating,
  StatusChip,
  StatusPipeline,
  TimeField,
  computeQuote,
  daysFromToday,
  documentsFor,
  extraGuests,
  formatDate,
  formatDateTime,
  formatMobile,
  formatPackageItem,
  messageApi,
  paymentApi,
  paymentKindLabel,
  peso,
  reservationApi,
  setupsFor,
  tokens,
  useDocumentTitle,
  useNotify,
  useResource
} from '@tm/shared';
import { useMessenger } from '../components/MessagesWidget.jsx';

// Statuses where the booking is finished and can no longer be edited
const CLOSED = ['completed', 'declined', 'cancelled'];

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

  const [dialog, setDialog] = useState(null); // which dialog is open: approve, decline, confirm, complete, cash, food
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
          <Button onClick={() => setDialog('decline')} sx={{ color: '#fca5a5' }}>Decline</Button>
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

            <LogisticsCard r={r} closed={closed} onSave={(patch) => act(() => reservationApi.updateLogistics(r.ref, patch), 'Event details saved.')} />

            <DashCard>
              <CardTitle subtitle={`${r.packageName} · ${peso(r.package.price)} · covers ${r.package.guests} guests`} action={!closed && <Button size="small" variant="outlined" onClick={() => setDialog('food')}>Edit food request</Button>}>
                Package and food
              </CardTitle>
              {/* The package can be used for any occasion; warn when the guests are more than it covers */}
              {extraGuests(r.package, r.guests) > 0 && (
                <AlertBanner tone="info" sx={{ mb: 2 }}>
                  {r.guests} guests is {extraGuests(r.package, r.guests)} more than {r.packageName} covers. Add a charge for the extra guests under Other charges in the quotation.
                </AlertBanner>
              )}
              <Field label="Package includes">{r.package.items.map(formatPackageItem).join(', ')}</Field>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <Field label="Food to cook">{r.foodRequest}</Field>
                <Field label="Additional charges">{r.addons.length ? r.addons.map((a) => a.name).join(', ') : 'None'}</Field>
              </Box>
            </DashCard>

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
      <FoodDialog open={dialog === 'food'} onClose={() => setDialog(null)} r={r} onSubmit={async (text) => { await reservationApi.updateFoodRequest(r.ref, text); setDialog(null); notify('Food request updated. Re-send the quotation if the food price changed.'); }} />
      <DocumentDialog open={Boolean(doc)} onClose={() => setDoc(null)} detail={r} doc={doc} />
    </>
  );
}

/** Editable event details: date, time, guests, setup, venue and access notes. */
function LogisticsCard({ r, closed, onSave }) {
  // Form values built from the saved reservation
  const initial = () => ({ date: r.date, startTime: r.startTime, guests: String(r.guests), setup: r.venue.setup, venueName: r.venue.name, venueAddress: r.venue.address, city: r.venue.city, accessNotes: r.venue.accessNotes });
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  // Refill the form when the saved reservation changes
  useEffect(() => setValues(initial()), [r.date, r.startTime, r.guests, r.venue.setup, r.venue.name, r.venue.address, r.venue.city, r.venue.accessNotes]); // eslint-disable-line react-hooks/exhaustive-deps

  // True when something was changed, so Save/Reset appear enabled
  const dirty = JSON.stringify(values) !== JSON.stringify(initial());
  // Change handler for one field (accepts an input event or a plain value from the date picker)
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e && e.target ? e.target.value : e }));
  // Warn (but don't block) when the guest count is above what the package covers
  const overBy = extraGuests(r.package, values.guests);
  // Setup styles the package offers, plus the saved one if the package no longer offers it (so it still shows)
  const setupOptions = setupsFor(r.package).includes(r.venue.setup) ? setupsFor(r.package) : [...setupsFor(r.package), r.venue.setup];

  return (
    <DashCard>
      <CardTitle subtitle={closed ? 'This reservation is closed.' : 'Editable by admin'}>Event and logistics</CardTitle>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        <DateField id="l-date" label="Date" mode="any" value={values.date} onChange={set('date')} disabled={closed} />
        {/* Same hour / minute / AM-PM picker as the customer form: booking hours only, every 30 minutes */}
        <TimeField id="l-start" label="Start time" value={values.startTime} onChange={set('startTime')} min={RULES.earliestStart} max={RULES.latestStart} step={30} disabled={closed} />
        <FormField id="l-guests" label="Guests" type="number" value={values.guests} onChange={set('guests')} disabled={closed} hint={overBy ? `${overBy} more than ${r.packageName} covers (${r.package.guests})` : undefined} />
        <SelectField id="l-setup" label="Setup" value={values.setup} onChange={set('setup')} options={setupOptions} disabled={closed} hint={`Setups offered with ${r.packageName}`} />
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
 * The admin prices the quotation: the package price is fixed, and the admin types the food amount,
 * a price for each additional charge the customer ticked, any other charges (e.g. extra guests)
 * and a discount, then saves and sends it to the customer.
 */
function QuotationCard({ r, closed, onSend }) {
  // Form values from the last sent quotation (blank amounts when nothing was sent yet)
  const initial = () => {
    const q = r.quotation;
    const amount = (value) => (q && value ? String(value) : '');
    return {
      food: amount(q && q.food),
      addonPrices: Object.fromEntries(r.addonIds.map((id) => [id, amount(q && q.addonPrices && q.addonPrices[id])])),
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

  // Live price calculation from the typed amounts
  const preview = computeQuote({ pkg: r.package, addonIds: r.addonIds, food: values.food, addonPrices: values.addonPrices, otherCharges: values.otherCharges, discount: values.discount });
  // Every amount must be a number of 0 or more
  const invalid = (value) => value !== '' && (Number.isNaN(Number(value)) || Number(value) < 0);
  const amountError = (value) => (invalid(value) ? 'Enter a valid amount.' : '');
  const anyInvalid = [values.food, values.otherCharges, values.discount, ...Object.values(values.addonPrices)].some(invalid);
  // Discount must not be more than the total, and the total must not drop below what was already paid
  const gross = preview.packageTotal + preview.food + preview.addons + preview.otherCharges;
  const discountError = amountError(values.discount) || (preview.discount > gross ? 'Discount is larger than the total.' : preview.net < r.paid ? 'Net total is below what the customer already paid.' : '');
  // Food and every additional charge need a price before the quotation can be sent
  const missingPrice = !Number(values.food) || r.addonIds.some((id) => !Number(values.addonPrices[id]));
  // Only allow sending if nothing was sent yet, or something is different from the last one sent
  const changed = !r.quotation || JSON.stringify(values) !== JSON.stringify(initial());
  const peso0 = { startAdornment: <InputAdornment position="start">₱</InputAdornment> };

  return (
    <DashCard id="quotation-card">
      <CardTitle subtitle={r.quotation ? `Last sent ${formatDateTime(r.quotation.sentAt)}` : 'Not sent yet'}>Quotation</CardTitle>
      <DetailRow label={`Package · ${r.packageName}`}>{peso(preview.packageTotal)}</DetailRow>
      {closed ? (
        // Closed reservations show the sent amounts read-only
        <>
          <DetailRow label="Food">{peso(preview.food)}</DetailRow>
          {r.addons.map((a) => <DetailRow key={a.id} label={a.name}>{peso(preview.addonPrices[a.id])}</DetailRow>)}
          {preview.otherCharges > 0 && <DetailRow label={values.otherLabel || 'Other charges'}>{peso(preview.otherCharges)}</DetailRow>}
          <DetailRow label="Discount">— {peso(preview.discount)}</DetailRow>
        </>
      ) : (
        <Box sx={{ my: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <FormField id="q-food" label="Food" required type="number" value={values.food} onChange={set('food')} error={amountError(values.food)} hint={`For: ${r.foodRequest}`} InputProps={peso0} inputProps={{ min: 0, step: 500 }} />
          {r.addons.map((a) => (
            <FormField key={a.id} id={`q-addon-${a.id}`} label={a.name} required type="number" value={values.addonPrices[a.id] ?? ''} onChange={setAddonPrice(a.id)} error={amountError(values.addonPrices[a.id] ?? '')} InputProps={peso0} inputProps={{ min: 0, step: 500 }} />
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
          {missingPrice && <Typography sx={{ mt: 1, fontSize: 12.5, color: tokens.textMuted }}>Enter the food price{r.addonIds.length ? ' and a price for each additional charge' : ''} to send the quotation.</Typography>}
          <BusyButton
            fullWidth
            busy={busy}
            disabled={anyInvalid || Boolean(discountError) || missingPrice || !changed}
            onClick={async () => {
              setBusy(true);
              await onSend({
                food: Number(values.food) || 0,
                addonPrices: Object.fromEntries(Object.entries(values.addonPrices).map(([id, price]) => [id, Number(price) || 0])),
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

/** Dialog for the admin to edit the food the customer asked for (e.g. after agreeing changes in chat). */
function FoodDialog({ open, onClose, r, onSubmit }) {
  const [text, setText] = useState(r.foodRequest);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Start from the saved food request each time the dialog opens
  useEffect(() => {
    if (open) {
      setText(r.foodRequest);
      setError('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // At least 5 characters, then save; errors from the server stay in the dialog
  const save = async () => {
    if (text.trim().length < 5) return setError('Describe the food to cook (at least 5 characters).');
    setBusy(true);
    try {
      await onSubmit(text);
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
      title="Edit food request"
      description="What our kitchen cooks for this event. Re-send the quotation if the food price changes."
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <BusyButton busy={busy} disabled={text.trim() === r.foodRequest} onClick={save}>
            Save food request
          </BusyButton>
        </>
      }
    >
      <FormField id="food-request" label="Food to cook" multiline minRows={5} value={text} onChange={(e) => { setText(e.target.value); setError(''); }} error={error} inputProps={{ maxLength: 1000 }} autoFocus />
    </AppDialog>
  );
}
