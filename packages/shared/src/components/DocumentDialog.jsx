import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import { BUFFET_DRINKS, BUSINESS, RENTAL, RULES, includesFood, isRental } from '../services/config.js';
import { tokens } from '../theme/tokens.js';
import { formatDate, formatDateLong, formatDateTime, formatMobile, formatPackageItem, formatTime, peso, toISODate } from '../utils/format.js';
import { PAYMENT_METHODS, paymentKindLabel } from '../utils/status.js';
import { LOGO_SRC } from './Brand.jsx';
import { LightSurface } from './Surface.jsx';

/**
 * The documents a reservation produces. `detail` is the object returned by
 * reservationService.getReservation().
 */
export function documentsFor(detail) {
  const docs = [];
  // Quotation: available once the admin sends it
  docs.push({
    key: `quotation-${detail.ref}`,
    kind: 'quotation',
    name: `Quotation-${detail.ref}.pdf`,
    available: Boolean(detail.quotation),
    note: detail.quotation ? `Sent ${formatDate(toISODate(new Date(detail.quotation.sentAt)))}` : 'Sent after review'
  });
  // Contract: viewable as soon as the quotation is sent (final prices exist), so the customer
  // can read the terms before paying and come back to it anytime. It stays a draft until confirmed.
  const contractFinal = ['confirmed', 'completed'].includes(detail.status);
  docs.push({
    key: `contract-${detail.ref}`,
    kind: 'contract',
    name: `Contract-${detail.ref}.pdf`,
    available: Boolean(detail.quotation),
    note: !detail.quotation ? 'Available once the quotation is sent' : contractFinal ? 'Final' : 'Draft · final once confirmed'
  });
  // One receipt per verified payment
  detail.payments
    .filter((p) => p.status === 'verified')
    .forEach((p) => {
      docs.push({ key: `receipt-${p.id}`, kind: 'receipt', name: `Receipt-${p.receiptNo}.pdf`, available: true, paymentId: p.id, note: `${peso(p.amount)} · ${PAYMENT_METHODS[p.method]}` });
    });
  return docs;
}

// Heading printed on each document type (an equipment rental's contract has its own title)
const TITLES = { quotation: 'Quotation', contract: 'Catering Service Contract', rentalContract: 'Equipment Rental Contract', receipt: 'Official Receipt' };

/** One label/amount row in a document's totals. */
function Line({ label, value, strong, muted }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.6 }}>
      <Typography sx={{ fontSize: 13, color: muted ? tokens.textMuted : tokens.textSecondary, fontWeight: strong ? 700 : 400 }}>{label}</Typography>
      <Typography sx={{ fontSize: strong ? 15 : 13, fontWeight: strong ? 800 : 600, color: tokens.textPrimary }}>{value}</Typography>
    </Box>
  );
}

/**
 * Printable preview of a quotation, contract or receipt. "Print / Save as PDF" uses the browser's print.
 * An equipment rental prints its rented items (how many x the price per piece), the delivery fee and
 * any damage charges instead of a package, menu and guest count, and its contract carries the rental
 * terms: pick up or delivery, returning the items, and damage fees applying only through a revised quotation.
 */
export function DocumentDialog({ open, onClose, detail, doc }) {
  if (!detail || !doc) return null;
  // Prices come from the sent quotation, or the estimate if none was sent
  const quote = detail.quotation || detail.estimate;
  const rental = isRental(detail.serviceType);
  const delivered = rental && detail.fulfilment === 'delivery';
  // For receipts: the payment the receipt is for
  const payment = doc.paymentId ? detail.payments.find((p) => p.id === doc.paymentId) : null;
  // For quotations: the verified payments, oldest first, listed in the payment record
  const verifiedPayments = detail.payments.filter((p) => p.status === 'verified').sort((a, b) => a.verifiedAt - b.verifiedAt);
  // Admin's price for one add-on (0 on an estimate, where add-ons aren't priced yet)
  // What an add-on costs on this quotation: for one counted by the piece that is the unit price
  // times the quantity, which computeQuote has already worked out into `addonTotals`.
  const addonPrice = (id) => (quote.addonTotals && quote.addonTotals[id]) || (quote.addonPrices && quote.addonPrices[id]) || 0;
  // How many of an add-on were asked for (1 for anything not counted by the piece)
  const addonCount = (id) => (quote.addonQty && quote.addonQty[id]) || 1;

  return (
    <LightSurface>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" className="tm-print-root" scroll="body">
        <Box className="tm-no-print" sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${tokens.cardLightBorder}`, backgroundColor: tokens.surfaceSubtle }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: tokens.textPrimary }}>{doc.name}</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" variant="contained" startIcon={<PrintOutlinedIcon />} onClick={() => window.print()}>
              Print / Save as PDF
            </Button>
            <IconButton size="small" onClick={onClose} aria-label="Close document">
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        <Box sx={{ p: { xs: 2.5, sm: 5 }, color: tokens.textPrimary }}>
          {/* Letterhead */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <Box component="img" src={LOGO_SRC} alt="" sx={{ width: 64, height: 64, borderRadius: '50%', border: `2px solid ${tokens.gold}` }} />
              <Box>
                <Typography sx={{ fontSize: 18, fontWeight: 800 }}>{BUSINESS.name}</Typography>
                <Typography sx={{ fontSize: 12, color: tokens.textSecondary }}>{BUSINESS.address}</Typography>
                <Typography sx={{ fontSize: 12, color: tokens.textSecondary }}>
                  {BUSINESS.phone} · {BUSINESS.email}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
              <Typography sx={{ fontSize: 20, fontWeight: 800, color: tokens.goldDark, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{TITLES[rental && doc.kind === 'contract' ? 'rentalContract' : doc.kind]}</Typography>
              <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                {doc.kind === 'receipt' ? `No. ${payment.receiptNo}` : `Ref. ${detail.ref}`}
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                Date:{' '}
                {doc.kind === 'receipt'
                  ? formatDateTime(payment.verifiedAt)
                  : formatDateTime(detail.quotation ? detail.quotation.sentAt : detail.createdAt)}
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ my: 3, borderColor: tokens.gold, borderBottomWidth: 2 }} />

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3 }}>
            <Box>
              <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: tokens.textMuted }}>
                {doc.kind === 'receipt' ? 'Received from' : 'Prepared for'}
              </Typography>
              <Typography sx={{ mt: 0.5, fontSize: 14, fontWeight: 700 }}>{detail.customerName}</Typography>
              <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>{detail.customerEmail}</Typography>
              <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>{formatMobile(detail.customerMobile)}</Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: tokens.textMuted }}>Event</Typography>
              <Typography sx={{ mt: 0.5, fontSize: 14, fontWeight: 700 }}>{detail.eventName}</Typography>
              <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                {formatDateLong(detail.date)} · {rental ? (delivered ? 'delivery at ' : 'pick-up at ') : ''}
                {formatTime(detail.startTime)}
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                {rental && !delivered ? `Pick up at ${RENTAL.pickupAddress}` : `${detail.venue.name}, ${detail.venue.address}, ${detail.venue.city}`}
              </Typography>
            </Box>
          </Box>

          {/* Receipt: payment summary. Quotation/contract: package, food request and price breakdown. */}
          {doc.kind === 'receipt' ? (
            <Box sx={{ mt: 4, p: 3, borderRadius: 2, border: `1px solid ${tokens.cardLightBorder}`, backgroundColor: tokens.surfaceSubtle }}>
              <Line label="Payment for" value={`${paymentKindLabel(payment.kind)} · ${detail.ref}`} />
              <Line label="Payment method" value={PAYMENT_METHODS[payment.method]} />
              {payment.referenceNo && <Line label="Reference no." value={payment.referenceNo} />}
              <Divider sx={{ my: 1.5 }} />
              <Line label="Amount received" value={peso(payment.amount)} strong />
            </Box>
          ) : (
            <>
              {rental ? (
                <Box sx={{ mt: 4 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 1 }}>
                    {detail.packageName} · {delivered ? 'Delivery' : 'Pick up'}
                  </Typography>
                  <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: tokens.textMuted }}>Damage fee per piece</Typography>
                  <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>{detail.rentalItems.map((line) => `${line.name} ${peso(line.damageFee)}`).join(', ')}</Typography>
                </Box>
              ) : (
              <Box sx={{ mt: 4 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 1 }}>
                  {detail.packageName} · {detail.guests} guests · {detail.serviceType}
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                  <Box>
                    <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: tokens.textMuted }}>Package includes</Typography>
                    <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>{detail.package.items.map(formatPackageItem).join(', ')}</Typography>
                  </Box>
                  <Box>
                    {/* A buffet prints its four dishes and the drinks; catering only says there is no food */}
                    <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: tokens.textMuted }}>
                      {includesFood(detail.serviceType) ? 'Buffet menu' : 'Food'}
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>
                      {includesFood(detail.serviceType)
                        ? `${(detail.menuDishes || []).map((d) => d.name).join(', ')}, with ${BUFFET_DRINKS.join(' and ')}.`
                        : 'Catering only: equipment and setup, no food.'}
                    </Typography>
                    {detail.foodNotes && <Typography sx={{ mt: 0.5, fontSize: 12.5, color: tokens.textSecondary }}>Note: {detail.foodNotes}</Typography>}
                  </Box>
                </Box>
              </Box>
              )}

              {/* Price breakdown: package, food, each add-on, other charges, discount.
                  A rental lists its items, the delivery fee and any damage charges instead of a package and food. */}
              <Box sx={{ mt: 3, ml: 'auto', maxWidth: rental ? 420 : 360 }}>
                {rental ? (
                  <>
                    {(quote.rentalItems || []).map((line) => (
                      <Line key={line.itemId} label={`${line.name} (${line.qty} x ${peso(line.price)})`} value={peso(line.total)} />
                    ))}
                    <Line label={delivered ? 'Delivery' : `Pick up at ${RENTAL.pickupAddress}`} value={delivered ? peso(quote.deliveryFee) : 'Free'} />
                    {(quote.damageCharges || []).map((line) => (
                      <Line key={`damage-${line.itemId}`} label={`Damaged or missing: ${line.name} (${line.qty} x ${peso(line.fee)})`} value={peso(line.total)} />
                    ))}
                  </>
                ) : (
                  <Line label={`Package (covers ${detail.package.guests} guests)`} value={peso(quote.packageTotal)} />
                )}
                {/* The buffet is charged per person, so the line shows the sum it came from */}
                {quote.plates > 0 && <Line label={`Buffet (${quote.plates} x ${peso(quote.pricePerPlate)} per person)`} value={peso(quote.food)} />}
                {detail.addons.map((a) => (
                  <Line key={a.id} label={a.hasQuantity ? `${a.name} x ${addonCount(a.id)}` : a.name} value={peso(addonPrice(a.id))} />
                ))}
                {quote.otherCharges > 0 && <Line label={quote.otherLabel || 'Other charges'} value={peso(quote.otherCharges)} />}
                {quote.discount > 0 && <Line label="Discount" value={`− ${peso(quote.discount)}`} />}
                <Divider sx={{ my: 1 }} />
                <Line label="Net total" value={peso(quote.net)} strong />
                <Line label={`Downpayment (${RULES.downpaymentRate * 100}%)`} value={peso(Math.round(quote.net * RULES.downpaymentRate))} muted />
              </Box>

              {/* Contracts add the terms and signature lines */}
              {doc.kind === 'contract' && (
                <Box sx={{ mt: 4 }}>
                  {/* Before confirmation the contract is shown as a draft for the customer to review */}
                  {!['confirmed', 'completed'].includes(detail.status) && (
                    <Typography sx={{ mb: 2, p: 1.25, fontSize: 12.5, fontWeight: 600, textAlign: 'center', borderRadius: 1, border: `1px dashed ${tokens.goldDark}`, color: tokens.goldDark }}>
                      Draft · This contract becomes final once your booking is confirmed.
                    </Typography>
                  )}
                  <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 1 }}>Terms and conditions</Typography>
                  {rental ? (
                    <RentalTerms detail={detail} quote={quote} delivered={delivered} />
                  ) : (
                  <Box component="ol" sx={{ m: 0, pl: 2.5, fontSize: 12.5, lineHeight: 1.7, color: tokens.textSecondary }}>
                    <li>The 50% downpayment secures the event date. The balance is due on or before the event day.</li>
                    {/* The per-person rate is read off this quotation, not today's price list, so an old
                        contract keeps printing the rate it was actually agreed at. */}
                    {includesFood(detail.serviceType) ? (
                      <li>
                        The buffet is served plated and charged per person at {peso(quote.pricePerPlate)} per plate, as shown above, multiplied by the guest count. It covers one pork, chicken, fish
                        and vegetable dish with {BUFFET_DRINKS.join(' and ')} for every guest.
                      </li>
                    ) : (
                      <li>This booking is catering only: equipment and setup, with no food and no per-person charge.</li>
                    )}
                    <li>
                      The final guest count may be adjusted up to 7 days before the event. <b>Any change to it changes the total, so we send you a revised quotation; the new amount applies only
                      from the quotation we send you, never before.</b> Increases made later than 7 days before the event are billed per guest on the day.
                    </li>
                    <li>Cancellations more than 30 days before the event receive a refund of the downpayment less a ₱5,000 processing fee.</li>
                    {/* Same setup time the booking calendar keeps free before every event (RULES.eventBufferHours) */}
                    <li>The client provides safe access to the venue at least {RULES.eventBufferHours} hours before the start time for setup.</li>
                    <li>Service time is as agreed with our team. Extensions are billed at ₱3,500 per hour.</li>
                    <li>Tres Marias is responsible for all catering equipment it brings. Loss or damage caused by guests is charged at cost.</li>
                  </Box>
                  )}
                  <Box sx={{ mt: 5, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    {[detail.customerName, `For ${BUSINESS.shortName}`].map((who) => (
                      <Box key={who} sx={{ pt: 1, borderTop: `1px solid ${tokens.textPrimary}` }}>
                        <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>{who}</Typography>
                        <Typography sx={{ fontSize: 11.5, color: tokens.textMuted }}>Signature over printed name</Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}

              {/* Quotations also keep the record of payments: every verified payment, what's paid and what's left */}
              {doc.kind === 'quotation' && (
                <Box sx={{ mt: 4 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Payment record</Typography>
                    {verifiedPayments.length > 0 && detail.balance <= 0 && (
                      <Typography sx={{ px: 1.25, py: 0.25, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', borderRadius: 1, border: '2px solid #047857', color: '#047857' }}>FULLY PAID</Typography>
                    )}
                  </Box>
                  {verifiedPayments.length === 0 ? (
                    <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>No payments received yet.</Typography>
                  ) : (
                    <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, '& th, & td': { py: 0.75, px: 0.5, textAlign: 'left', borderBottom: `1px solid ${tokens.cardLightBorder}` }, '& th': { fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: tokens.textMuted }, '& .amt': { textAlign: 'right' } }}>
                      <thead>
                        <tr>
                          <th>Date paid</th>
                          <th>Payment</th>
                          <th>Method</th>
                          <th>Receipt no.</th>
                          <th className="amt">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {verifiedPayments.map((p) => (
                          <tr key={p.id}>
                            <td>{formatDateTime(p.verifiedAt)}</td>
                            <td>{paymentKindLabel(p.kind)}</td>
                            <td>{PAYMENT_METHODS[p.method]}</td>
                            <td>{p.receiptNo}</td>
                            <td className="amt">{peso(p.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Box>
                  )}
                  <Box sx={{ mt: 1.5, ml: 'auto', maxWidth: 360 }}>
                    <Line label="Net total" value={peso(quote.net)} />
                    <Line label="Paid so far" value={peso(detail.paid)} />
                    <Line label="Balance" value={peso(detail.balance)} strong />
                  </Box>
                  {detail.awaitingCount > 0 && (
                    <Typography sx={{ mt: 1, fontSize: 12, color: tokens.textMuted }}>
                      {peso(detail.awaitingAmount)} is being verified and will appear here once confirmed.
                    </Typography>
                  )}
                </Box>
              )}

              {doc.kind === 'quotation' && (
                <Typography sx={{ mt: 3, fontSize: 12, lineHeight: 1.6, color: tokens.textMuted }}>
                  {/* The 14-day validity only matters until the first payment is made */}
                  {verifiedPayments.length === 0 ? 'This quotation is valid for 14 days. ' : ''}
                  {rental
                    ? 'Rental prices are per piece for your whole rental. A piece that comes back damaged or missing is charged at its damage fee through a revised quotation.'
                    : 'The package covers the equipment and service listed above; the food is cooked to your request and priced separately.'}
                  {detail.quotation?.note ? ` Note: ${detail.quotation.note}` : ''}
                </Typography>
              )}
            </>
          )}

          <Typography sx={{ mt: 5, fontSize: 11.5, textAlign: 'center', color: tokens.textMuted }}>
            Thank you for choosing {BUSINESS.name}.
          </Typography>
        </Box>
      </Dialog>
    </LightSurface>
  );
}

/**
 * The contract terms for an equipment rental. Like the catering contract, anything that changes the
 * total (other items, switching between pick up and delivery, damage charges after the return) only
 * applies from the revised quotation the customer receives, never before.
 */
function RentalTerms({ detail, quote, delivered }) {
  return (
    <Box component="ol" sx={{ m: 0, pl: 2.5, fontSize: 12.5, lineHeight: 1.7, color: tokens.textSecondary }}>
      <li>The 50% downpayment reserves the items for your date. The balance is due on or before the day you receive them.</li>
      <li>Each item is charged per piece at the price shown above, for the whole rental.</li>
      <li>
        {delivered
          ? `We deliver the items to the address above for the delivery fee shown (${peso(quote.deliveryFee)}), and collect them after your event as agreed with our team.`
          : `You pick up the items at ${RENTAL.pickupAddress} at the time above, free of charge, and bring them back there as agreed with our team.`}
      </li>
      <li>
        The items are counted with you when you receive them and again when they come back. A piece that comes back damaged or does not come back is charged at its damage fee, listed above for each item.{' '}
        <b>Damage charges are added through a revised quotation we send you; the new amount applies only from that quotation, never before.</b>
      </li>
      <li>
        <b>Any change to the items or to pick up or delivery changes the total, so we send you a revised quotation; the new amount applies only from the quotation we send you, never before.</b>
      </li>
      <li>If you cancel after paying, our team arranges the refund of what you paid with you in your chat.</li>
    </Box>
  );
}
