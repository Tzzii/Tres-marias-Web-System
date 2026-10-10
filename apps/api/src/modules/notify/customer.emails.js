import { cancelDeadline } from '@tm/shared/src/domain/cancellation.js';
import { isRental } from '@tm/shared/src/services/config.js';
import { formatDate, formatDateTime, formatEventTime, peso, toISODate, todayISO } from '@tm/shared/src/utils/format.js';
import { statusLabel } from '@tm/shared/src/utils/status.js';
import { PORTAL_PATHS, emailSubject, oneLine, renderEmail, reservationPath, shorten } from './email.layout.js';

/**
 * The customer email notices (Phase 13A, 2026-10-10; event_completed added in Phase 13B, 2026-10-11): one builder per purpose,
 * builder(data) -> { subject, html, text }. Every email is drawn by renderEmail() (email.layout.js), which
 * escapes every value, and every subject comes from emailSubject() (one line, the event name shortened), so
 * nothing here builds HTML. notify.service.js (queueCustomerEmail) adds `firstName` to `data`; the data
 * shapes below are fixed (the reservations and payments services pass exactly these).
 *
 * `reservation` is the booking record as the reservations repo returns it; the builders read only ref,
 * eventName, date, startTime, endTime, serviceType, createdAt and downpaymentDue. Never in an email: bank
 * account numbers, QR codes, payment reference numbers, receipt photos, mobile numbers, the venue address,
 * admin notes or admin names (the sign-off is the business name, added by the layout). Each email is a short
 * notice in the chat's voice with ONE button to the right portal page and no attachments; the chat message
 * the same action posts is unchanged. Tones: success (green) for approved, payment received and confirmed;
 * attention (red) only for rejected, failed, declined and cancelled; info (gold) for the rest (the
 * thank-you of event_completed included).
 *
 * quotation_ready       { reservation, variant: 'new'|'revised'|'updated', net, note, totalBefore,
 *                         statusBefore, statusAfter, downpaymentStillNeeded, downpaymentDue, overpaid,
 *                         damageLines: [{ name, qty, amount }] }
 *     'new' "Your quotation is ready" / 'revised' (a pending request quoted again) "Your revised quotation is
 *     ready": Event, Date, Reference and Net total; review the charges and tap Accept Quotation, the date is
 *     only held once accepted. 'updated' (re-sent after acceptance) "Your quotation was updated": Previous
 *     total and New total, then what it means: back to Approved -> pay {downpaymentStillNeeded} more by
 *     {downpaymentDue} to reach the minimum downpayment (in the box); another status change -> "Your
 *     reservation is now {status}."; overpaid -> that amount will be returned. A rental's damage lines are
 *     listed under "Damage Charges" (the only email about damage charges). The admin's note is shown in a
 *     "Note from our team" box (as a paragraph instead when the box holds the downpayment step).
 *     Button "Review quotation" -> the reservation's page.
 * reservation_approved  { reservation (approved, with downpaymentDue), total, downpayment, acceptedAt }
 *     "Reservation approved": Event, Date and time, Reference, Total, Minimum downpayment and Pay by (or the
 *     full amount by that date when the downpayment is the whole total), the cancel-deadline sentence
 *     (approvalMessage's rule), a box that payments are made only from the Payments page, and a security line
 *     with when the quotation was accepted. Button "Go to Payments".
 * payment_received      { reservation, payment: { amount, method, receiptNo, verifiedAt }, paidSoFar,
 *                         balance, statusBefore, statusAfter }
 *     "Payment received: ₱3,000 for {event} ({ref})", or "Payment received and booking confirmed" when this
 *     payment confirmed the booking (one email, not two). Amount, Method, Receipt no., Date, Total paid so
 *     far and Remaining balance ("Fully paid" at ₱0); the downpayment-reached line when it moved Approved ->
 *     Downpayment paid; on a cancelled or declined booking, that the payment will be returned (no balance
 *     rows). Never a payment reference number. Button "View receipt" -> Documents.
 * payment_rejected      { reservation, payment: { amount, method, submittedAt }, reason }
 *     "We couldn't verify your payment": Amount, Method, Date submitted, the reason in a box, and to submit
 *     it again from Payments. Button "Go to Payments".
 * qr_payment_failed     { reservation, amount }
 *     "Your QR Ph payment didn't go through": the amount, not charged, try again from Payments (never
 *     PayMongo's own message). Button "Go to Payments".
 * booking_confirmed     { reservation, balance }
 *     "Booking confirmed": Event, Date and time, Reference, Remaining balance (due on the event day) or
 *     "Fully paid", and that the contract is in Documents. Button "View contract" -> Documents.
 * reservation_declined  { reservation, reason }
 *     "Reservation request declined": the reason in a box and that they're welcome to book another date.
 *     Button "View reservation".
 * reservation_cancelled { reservation, by: 'admin'|'customer', reason, paid, at }
 *     by 'admin' "Reservation cancelled": the reason, and when money was paid that we'll return it and say
 *     so in their account. by 'customer' "You cancelled your reservation": the reason they gave, when money
 *     was paid that our team will message them about the refund (never an amount promised), and a security
 *     line. Button "View reservation".
 * payment_reminder      { reservation, dueText }   (dueText = the same sentence the chat reminder uses)
 *     "Payment reminder": the due sentence, Event, Date, Reference and the pay-only-from-Payments box.
 *     Button "Go to Payments".
 * event_completed       { reservation }
 *     "Thank you for celebrating with us" (an equipment rental: "Thank you for renting with us"): the event
 *     (or rental, with every rented item back) is marked completed, Event, Date and Reference, an invitation
 *     to rate the service and leave a short review, and that our team reads every review before anything is
 *     shown on the website. No balance or amount: a balance still owed is collected on site and gets its own
 *     payment_received email when it is recorded. Button "Write a testimonial" -> Testimonials.
 */

// The payment method as an email names it: shorter than PAYMENT_METHODS (status.js)
const METHOD_NAMES = { qrph: 'QR Ph', bank: 'Bank transfer', cash: 'Cash' };

// The box on every email that asks for money: where to pay, and what we never send
const PAY_ONLY_HERE = 'Pay only from the Payments page of your account. We never send bank details, QR codes or payment links by email.';

// Reservation statuses with no way forward: money that arrives on one is returned
const CLOSED = ['cancelled', 'declined'];

/** 'qrph' -> "QR Ph", 'bank' -> "Bank transfer", 'cash' -> "Cash"; an unknown key is shown as it is. */
const methodName = (method) => METHOD_NAMES[method] || oneLine(method);

/** True when `value` has text other than spaces. */
const hasText = (value) => String(value ?? '').trim() !== '';

/** "YYYY-MM-DD" of a timestamp (ms or ISO) on the business's clock, or the value itself when it is already a date. */
const dayOf = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return toISODate(new Date(value));
};

/** The event day with its time: "14 Mar 2026, 6:00 pm – 10:00 pm" (the day alone when no time is saved). */
const eventDateTime = (reservation) => {
  const time = formatEventTime(reservation);
  return time === '—' ? formatDate(reservation.date) : `${formatDate(reservation.date)}, ${time}`;
};

/** The booking's rows for the details card: Event, Date (or "Date and time" with `withTime`) and Reference. */
const bookingRows = (reservation, { withTime = false } = {}) => [
  { label: 'Event', value: reservation.eventName },
  withTime ? { label: 'Date and time', value: eventDateTime(reservation) } : { label: 'Date', value: formatDate(reservation.date) },
  { label: 'Reference', value: reservation.ref }
];

/** A box with the given title around a person's text (the admin's note, a reason); null when there is no text. */
const textBox = (title, value, tone = 'info') => (hasText(value) ? { title, text: String(value).trim(), tone } : null);

/**
 * The payment subject without emailSubject's colon after `what`: "Payment received: ₱3,000 for Santos
 * Wedding (RES-2026-1130-01)". Same safety as emailSubject: one line (no CR/LF), the event name shortened to
 * about 60 characters and the whole line at most 200.
 */
const subjectWithEvent = (what, eventName, ref) => shorten(`${oneLine(what)} ${shorten(eventName, 60)} (${oneLine(ref)})`, 200);

/**
 * The approved email's cancel-deadline sentence, by the rule of approvalMessage (domain/reservation.js):
 * the deadline is cancelDeadline(reservation); while it is today or ahead, "you can cancel online until
 * {date}", otherwise online cancellation for paid bookings has ended, so message us from the account
 * (the email gives no phone number). '' when the booking has no request or event date to count from.
 */
function cancelSentence(reservation) {
  if (!reservation.createdAt || !reservation.date) return '';
  const deadline = cancelDeadline(reservation);
  return deadline >= todayISO()
    ? `After you pay, you can cancel online until ${formatDate(deadline)}.`
    : `Online cancellation for paid bookings ended on ${formatDate(deadline)}, so after you pay, message us from your account to cancel.`;
}

/**
 * quotation_ready: the quotation was sent. 'new' and 'revised' (a pending request) ask the customer to review
 * it and tap Accept Quotation; 'updated' (re-sent after acceptance) shows the previous and the new total and
 * what the change means: back to Approved with the downpayment still needed and its new due date, another
 * status, or an amount paid above the new total. A rental's damage lines are listed under "Damage Charges".
 * The admin's note goes in a "Note from our team" box, or in a paragraph when the box holds the downpayment.
 */
function quotationReady({ reservation, variant = 'new', net, note, totalBefore, statusBefore, statusAfter, downpaymentStillNeeded, downpaymentDue, overpaid, damageLines = [], firstName }) {
  const { ref, eventName } = reservation;
  const button = { label: 'Review quotation', path: reservationPath(ref) };

  if (variant !== 'updated') {
    const revised = variant === 'revised';
    return {
      subject: emailSubject(revised ? 'Your revised quotation is ready' : 'Your quotation is ready', eventName, ref),
      ...renderEmail({
        label: revised ? 'Revised Quotation' : 'Quotation Ready',
        tone: 'info',
        preheader: `Net total ${peso(net)} · Accept it to approve your reservation.`,
        heading: revised ? 'Your Revised Quotation Is Ready' : 'Your Quotation Is Ready',
        firstName,
        intro: [
          revised ? 'We have revised the quotation for your reservation.' : 'We have prepared the quotation for your reservation.',
          'Please review the charges and tap Accept Quotation on your reservation page. Your date is only held once you accept.'
        ],
        details: [...bookingRows(reservation), { label: 'Net total', value: peso(net), strong: true }],
        box: textBox('Note from our team', note),
        button
      })
    };
  }

  // Re-sent after acceptance: what the new total means for the booking. Damage charges (a rental's) are
  // only ever listed here: a request still pending has had nothing rented out yet.
  const damage = Array.isArray(damageLines) ? damageLines : [];
  const sections = damage.length
    ? [{ heading: 'Damage Charges', rows: damage.map((line) => ({ label: `${oneLine(line.name)} × ${line.qty}`, value: peso(line.amount) })) }]
    : [];
  const due = downpaymentDue || reservation.downpaymentDue;
  const backToApproved = statusAfter === 'approved' && statusBefore !== 'approved';
  const payBox = backToApproved
    ? { text: `Please pay ${peso(downpaymentStillNeeded)} more${due ? ` by ${formatDate(due)}` : ''} to reach the minimum downpayment.`, tone: 'info' }
    : null;
  const statusLine = !backToApproved && statusAfter && statusAfter !== statusBefore ? `Your reservation is now ${statusLabel(statusAfter)}.` : '';
  const overpaidLine = Number(overpaid) > 0 ? `${peso(overpaid)} was paid above the new total and will be returned.` : '';
  // One box only: the downpayment step when there is one, the admin's note otherwise
  const noteBox = textBox('Note from our team', note);
  const noteLine = payBox && noteBox ? `Note from our team: ${noteBox.text}` : '';

  const summary = backToApproved
    ? `Please pay ${peso(downpaymentStillNeeded)} more${due ? ` by ${formatDate(due)}` : ''}.`
    : statusLine || (overpaidLine ? `${peso(overpaid)} will be returned.` : 'See the updated charges on your reservation page.');
  return {
    subject: emailSubject('Your quotation was updated', eventName, ref),
    ...renderEmail({
      label: 'Quotation Updated',
      tone: 'info',
      preheader: `New total ${peso(net)} (was ${peso(totalBefore)}) · ${summary}`,
      heading: 'Your Quotation Was Updated',
      firstName,
      intro: [
        'We updated the quotation for your reservation. You can see the full charges on your reservation page.',
        damage.length ? 'The new total includes charges for rented items that came back damaged or were not returned, listed below.' : ''
      ],
      details: [
        ...bookingRows(reservation),
        { label: 'Previous total', value: peso(totalBefore), strong: true },
        { label: 'New total', value: peso(net), strong: true }
      ],
      sections,
      box: payBox || noteBox,
      after: [statusLine, overpaidLine, noteLine],
      button
    })
  };
}

/**
 * reservation_approved: the customer accepted the quotation, so the reservation is approved. Says how much to
 * pay by when (the minimum downpayment, or the full amount when the downpayment is the whole total), until
 * when a paid booking can be cancelled online, that payments are made only from the Payments page, and when
 * the quotation was accepted (in case it wasn't them).
 */
function reservationApproved({ reservation, total, downpayment, acceptedAt, firstName }) {
  const { ref, eventName } = reservation;
  const due = reservation.downpaymentDue ? formatDate(reservation.downpaymentDue) : '';
  const byDue = due ? ` by ${due}` : '';
  const full = Number(downpayment) >= Number(total);
  const pay = full
    ? `Please pay the full ${peso(total)}${byDue} to secure your date.`
    : `Please pay a downpayment of at least ${peso(downpayment)}${byDue} to secure your date. You can pay more, up to the full ${peso(total)}.`;
  const moneyRows = full
    ? [{ label: 'Total', value: peso(total), strong: true }, { label: 'Pay in full by', value: due || '—' }]
    : [
        { label: 'Total', value: peso(total), strong: true },
        { label: 'Minimum downpayment', value: peso(downpayment), strong: true },
        { label: 'Pay by', value: due || '—' }
      ];
  return {
    subject: emailSubject('Reservation approved', eventName, ref),
    ...renderEmail({
      label: 'Approved',
      tone: 'success',
      preheader: full ? `Pay the full ${peso(total)}${byDue} to secure your date.` : `Minimum downpayment ${peso(downpayment)}${byDue} · Total ${peso(total)}.`,
      heading: 'Your Reservation Is Approved',
      firstName,
      intro: ['Thank you for accepting your quotation. Your reservation is approved.', pay],
      details: [...bookingRows(reservation, { withTime: true }), ...moneyRows],
      box: { text: PAY_ONLY_HERE, tone: 'info' },
      after: [cancelSentence(reservation)],
      button: { label: 'Go to Payments', path: PORTAL_PATHS.payments },
      security: `You accepted this quotation from your account${acceptedAt ? ` on ${formatDateTime(acceptedAt)}` : ''}. If this wasn't you, change your password right away and message us.`
    })
  };
}

/**
 * payment_received: a payment was verified (or recorded as cash). One email even when it also confirmed the
 * booking ("Payment received and booking confirmed"). Shows the amount, method, receipt number, date, the
 * total paid so far and the balance left, plus what changed: the minimum downpayment reached (Approved ->
 * Downpayment paid), the booking confirmed, or, on a cancelled or declined booking, that this payment will
 * be returned (then without the balance rows). Never a payment reference number.
 */
function paymentReceived({ reservation, payment = {}, paidSoFar, balance, statusBefore, statusAfter, firstName }) {
  const { ref, eventName } = reservation;
  const amount = peso(payment.amount);
  const confirmedNow = statusAfter === 'confirmed' && statusBefore !== 'confirmed';
  const closed = CLOSED.includes(statusAfter);
  const securedNow = statusAfter === 'downpayment_paid' && statusBefore === 'approved';
  const fullyPaid = Number(balance) <= 0;

  const statusLine = closed
    ? `This reservation is ${statusLabel(statusAfter).toLowerCase()}, so we will return this payment and tell you in your account.`
    : confirmedNow
      ? 'Your booking is confirmed. Your contract is in Documents.'
      : securedNow
        ? 'Your minimum downpayment is reached, so your date is secured.'
        : '';
  const preheader = closed
    ? `${amount} received · This reservation is ${statusLabel(statusAfter).toLowerCase()}, so we will return it.`
    : confirmedNow
      ? `${amount} received · Your booking is confirmed.`
      : securedNow
        ? `${amount} received · Your minimum downpayment is reached.`
        : `${amount} received · ${fullyPaid ? 'Fully paid.' : `Remaining balance ${peso(balance)}.`}`;

  const details = [
    { label: 'Amount', value: amount, strong: true },
    { label: 'Method', value: methodName(payment.method) },
    { label: 'Receipt no.', value: payment.receiptNo || '—' },
    { label: 'Date', value: formatDate(dayOf(payment.verifiedAt)) }
  ];
  // A closed booking owes nothing more: no balance to show
  if (!closed) {
    details.push(
      { label: 'Total paid so far', value: peso(paidSoFar), strong: true },
      { label: 'Remaining balance', value: fullyPaid ? 'Fully paid' : peso(balance), strong: true }
    );
  }

  return {
    subject: confirmedNow
      ? emailSubject('Payment received and booking confirmed', eventName, ref)
      : subjectWithEvent(`Payment received: ${amount} for`, eventName, ref),
    ...renderEmail({
      label: confirmedNow ? 'Booking Confirmed' : 'Payment Received',
      tone: 'success',
      preheader,
      heading: confirmedNow ? 'Payment Received and Booking Confirmed' : 'Payment Received',
      firstName,
      intro: [`We received your payment of ${amount} for ${oneLine(eventName)}.`, statusLine],
      details,
      after: [confirmedNow ? 'Your receipt is in Documents, next to your contract.' : 'Your receipt is in Documents.'],
      button: { label: 'View receipt', path: PORTAL_PATHS.documents }
    })
  };
}

/**
 * payment_rejected: the admin could not verify a submitted payment. Amount, method and when it was
 * submitted, the admin's reason in a box, and to submit it again from Payments.
 */
function paymentRejected({ reservation, payment = {}, reason, firstName }) {
  const { ref, eventName } = reservation;
  return {
    subject: emailSubject("We couldn't verify your payment", eventName, ref),
    ...renderEmail({
      label: 'Payment Not Verified',
      tone: 'attention',
      preheader: `${peso(payment.amount)} by ${methodName(payment.method)} · Please submit it again from Payments.`,
      heading: "We Couldn't Verify Your Payment",
      firstName,
      intro: [`We couldn't verify the payment you submitted for ${oneLine(eventName)}.`],
      details: [
        { label: 'Amount', value: peso(payment.amount), strong: true },
        { label: 'Method', value: methodName(payment.method) },
        { label: 'Date submitted', value: formatDateTime(payment.submittedAt) }
      ],
      box: textBox('Reason', reason, 'attention'),
      after: ['Please submit it again from Payments.'],
      button: { label: 'Go to Payments', path: PORTAL_PATHS.payments }
    })
  };
}

/**
 * qr_payment_failed: a QR Ph payment failed at PayMongo, so nothing was charged. The amount and that they can
 * try again from Payments; PayMongo's own message is never shown (it isn't passed in).
 */
function qrPaymentFailed({ reservation, amount, firstName }) {
  const { ref, eventName } = reservation;
  return {
    subject: emailSubject("Your QR Ph payment didn't go through", eventName, ref),
    ...renderEmail({
      label: 'Payment Failed',
      tone: 'attention',
      preheader: `${peso(amount)} by QR Ph · You were not charged. You can try again from Payments.`,
      heading: "Your QR Ph Payment Didn't Go Through",
      firstName,
      intro: [`Your QR Ph payment for ${oneLine(eventName)} didn't go through, and you were not charged.`],
      details: [
        { label: 'Amount', value: peso(amount), strong: true },
        { label: 'Method', value: METHOD_NAMES.qrph }
      ],
      after: ['You can try again from Payments.'],
      button: { label: 'Go to Payments', path: PORTAL_PATHS.payments }
    })
  };
}

/**
 * booking_confirmed: the admin confirmed the booking. Event, date and time, reference, the remaining balance
 * (due on the event day) or "Fully paid", and that the contract is in Documents.
 */
function bookingConfirmed({ reservation, balance, firstName }) {
  const { ref, eventName } = reservation;
  const owes = Number(balance) > 0;
  return {
    subject: emailSubject('Booking confirmed', eventName, ref),
    ...renderEmail({
      label: 'Booking Confirmed',
      tone: 'success',
      preheader: owes ? `Remaining balance ${peso(balance)}, due on the event day · Your contract is in Documents.` : 'Fully paid · Your contract is in Documents.',
      heading: 'Your Booking Is Confirmed',
      firstName,
      intro: ['Your booking is confirmed. Thank you for choosing Tres Marias.'],
      details: [
        ...bookingRows(reservation, { withTime: true }),
        { label: 'Remaining balance', value: owes ? `${peso(balance)}, due on the event day` : 'Fully paid', strong: true }
      ],
      after: ['Your contract is in Documents.'],
      button: { label: 'View contract', path: PORTAL_PATHS.documents }
    })
  };
}

/** reservation_declined: the admin declined the request. The reason in a box, and that they're welcome to book another date. */
function reservationDeclined({ reservation, reason, firstName }) {
  const { ref, eventName } = reservation;
  return {
    subject: emailSubject('Reservation request declined', eventName, ref),
    ...renderEmail({
      label: 'Declined',
      tone: 'attention',
      preheader: "We're unable to accept this request · You're welcome to book another date.",
      heading: 'Your Reservation Request Was Declined',
      firstName,
      intro: ['We are sorry, we are unable to accept your reservation request.'],
      details: bookingRows(reservation),
      box: textBox('Reason', reason, 'attention'),
      after: ["You're welcome to book another date."],
      button: { label: 'View reservation', path: reservationPath(ref) }
    })
  };
}

/**
 * reservation_cancelled: by 'admin', with the admin's reason, and when money was paid, that we'll return it
 * and say so in the account. By 'customer' (online), with the reason they gave, when money was paid that our
 * team will message them about the refund (no amount is promised: what is returned depends on the terms),
 * and a security line in case it wasn't them.
 */
function reservationCancelled({ reservation, by, reason, paid, at, firstName }) {
  const { ref, eventName } = reservation;
  const byCustomer = by === 'customer';
  const hasPaid = Number(paid) > 0;
  const refundLine = !hasPaid
    ? ''
    : byCustomer
      ? `You paid ${peso(paid)}. Our team will message you in your account about the refund.`
      : `We'll return ${peso(paid)} and tell you in your account when it's sent.`;
  const details = [...bookingRows(reservation)];
  if (at) details.push({ label: 'Cancelled on', value: formatDateTime(at) });
  return {
    subject: emailSubject(byCustomer ? 'You cancelled your reservation' : 'Reservation cancelled', eventName, ref),
    ...renderEmail({
      label: 'Cancelled',
      tone: 'attention',
      preheader: byCustomer
        ? `Cancelled from your account${hasPaid ? ' · Our team will message you about the refund.' : '.'}`
        : `Cancelled by our team${hasPaid ? ` · We'll return ${peso(paid)}.` : '.'}`,
      heading: byCustomer ? 'You Cancelled Your Reservation' : 'Your Reservation Was Cancelled',
      firstName,
      intro: [byCustomer ? 'You cancelled your reservation from your account.' : 'We are sorry, we had to cancel your reservation.'],
      details,
      box: textBox(byCustomer ? 'Your reason' : 'Reason', reason, 'attention'),
      after: [refundLine],
      button: { label: 'View reservation', path: reservationPath(ref) },
      security: byCustomer ? "If you didn't cancel this, change your password right away and message us." : ''
    })
  };
}

/**
 * payment_reminder: the admin sent a payment reminder. The chat reminder's own due sentence (`dueText`), the
 * booking's rows, and the box that payments are made only from the Payments page.
 */
function paymentReminder({ reservation, dueText, firstName }) {
  const { ref, eventName } = reservation;
  return {
    subject: emailSubject('Payment reminder', eventName, ref),
    ...renderEmail({
      label: 'Payment Reminder',
      tone: 'info',
      preheader: oneLine(dueText),
      heading: 'Payment Reminder',
      firstName,
      intro: ['A friendly reminder about your reservation.', dueText],
      details: bookingRows(reservation),
      box: { text: PAY_ONLY_HERE, tone: 'info' },
      button: { label: 'Go to Payments', path: PORTAL_PATHS.payments }
    })
  };
}

/**
 * event_completed: the admin marked the event (or the equipment rental) completed. A thank-you, the
 * booking's rows, and an invitation to leave a testimonial on the Testimonials page (one review per
 * completed booking; it stays hidden until our team publishes it, see feedback.service.js). A rental is
 * thanked for renting, and since it can only be completed once every piece is back, it says so. No amounts:
 * money still owed is collected on site and confirmed by its own payment_received email.
 */
function eventCompleted({ reservation, firstName }) {
  const { ref, eventName } = reservation;
  const rental = isRental(reservation.serviceType);
  return {
    subject: emailSubject(rental ? 'Thank you for renting with us' : 'Thank you for celebrating with us', eventName, ref),
    ...renderEmail({
      label: rental ? 'Rental Completed' : 'Event Completed',
      tone: 'info',
      preheader: `${rental ? 'Your rental is complete' : 'Your event is complete'} · We would love to hear how it went.`,
      heading: rental ? 'Thank You for Renting With Us' : 'Thank You for Celebrating With Us',
      firstName,
      intro: [
        rental
          ? `Thank you for renting from Tres Marias for ${oneLine(eventName)}. All your rented items are back, and your rental is now marked as completed.`
          : `Thank you for choosing Tres Marias for ${oneLine(eventName)}. Your event is now marked as completed.`,
        'We would love to hear how it went. You can rate our service and leave a short review from your account.'
      ],
      details: bookingRows(reservation),
      after: ['Our team reads every review before anything is shown on our website.'],
      button: { label: 'Write a testimonial', path: PORTAL_PATHS.testimonials }
    })
  };
}

/** Every customer email, by purpose (the `purpose` queueCustomerEmail takes). */
export const CUSTOMER_EMAILS = {
  quotation_ready: quotationReady,
  reservation_approved: reservationApproved,
  payment_received: paymentReceived,
  payment_rejected: paymentRejected,
  qr_payment_failed: qrPaymentFailed,
  booking_confirmed: bookingConfirmed,
  reservation_declined: reservationDeclined,
  reservation_cancelled: reservationCancelled,
  payment_reminder: paymentReminder,
  event_completed: eventCompleted
};
