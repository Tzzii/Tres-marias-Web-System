import { cancelDeadline } from '@tm/shared/src/domain/cancellation.js';
import { isRental } from '@tm/shared/src/services/config.js';
import { formatDate, formatDateTime, formatEventTime, peso, toISODate, todayISO } from '@tm/shared/src/utils/format.js';
import { statusLabel } from '@tm/shared/src/utils/status.js';
import { PORTAL_PATHS, emailSubject, oneLine, renderEmail, reservationPath, shorten } from './email.layout.js';


const METHOD_NAMES = { qrph: 'QR Ph', bank: 'Bank transfer', cash: 'Cash' };

const PAY_ONLY_HERE =
  'Pay only from the Payments page of your account. We never send bank details, QR codes or payment links by email.';

const CLOSED = ['cancelled', 'declined'];

const methodName = (method) => METHOD_NAMES[method] || oneLine(method);

const hasText = (value) => String(value ?? '').trim() !== '';

const dayOf = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return toISODate(new Date(value));
};

const eventDateTime = (reservation) => {
  const time = formatEventTime(reservation);
  return time === '—' ? formatDate(reservation.date) : `${formatDate(reservation.date)}, ${time}`;
};

const bookingRows = (reservation, { withTime = false } = {}) => [
  { label: 'Event', value: reservation.eventName },
  withTime
    ? { label: 'Date and time', value: eventDateTime(reservation) }
    : { label: 'Date', value: formatDate(reservation.date) },
  { label: 'Reference', value: reservation.ref }
];

const textBox = (title, value, tone = 'info') => (hasText(value) ? { title, text: String(value).trim(), tone } : null);

const subjectWithEvent = (what, eventName, ref) =>
  shorten(`${oneLine(what)} ${shorten(eventName, 60)} (${oneLine(ref)})`, 200);

function cancelSentence(reservation) {
  if (!reservation.createdAt || !reservation.date) return '';
  const deadline = cancelDeadline(reservation);
  return deadline >= todayISO()
    ? `After you pay, you can cancel online until ${formatDate(deadline)}.`
    : `Online cancellation for paid bookings ended on ${formatDate(deadline)}, so after you pay, message us from your account to cancel.`;
}

function quotationReady({
  reservation,
  variant = 'new',
  net,
  note,
  totalBefore,
  statusBefore,
  statusAfter,
  downpaymentStillNeeded,
  downpaymentDue,
  overpaid,
  damageLines = [],
  firstName
}) {
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
          revised
            ? 'We have revised the quotation for your reservation.'
            : 'We have prepared the quotation for your reservation.',
          'Please review the charges and tap Accept Quotation on your reservation page. Your date is only held once you accept.'
        ],
        details: [...bookingRows(reservation), { label: 'Net total', value: peso(net), strong: true }],
        box: textBox('Note from our team', note),
        button
      })
    };
  }

  const damage = Array.isArray(damageLines) ? damageLines : [];
  const sections = damage.length
    ? [
        {
          heading: 'Damage Charges',
          rows: damage.map((line) => ({ label: `${oneLine(line.name)} × ${line.qty}`, value: peso(line.amount) }))
        }
      ]
    : [];
  const due = downpaymentDue || reservation.downpaymentDue;
  const backToApproved = statusAfter === 'approved' && statusBefore !== 'approved';
  const payBox = backToApproved
    ? {
        text: `Please pay ${peso(downpaymentStillNeeded)} more${due ? ` by ${formatDate(due)}` : ''} to reach the minimum downpayment.`,
        tone: 'info'
      }
    : null;
  const statusLine =
    !backToApproved && statusAfter && statusAfter !== statusBefore
      ? `Your reservation is now ${statusLabel(statusAfter)}.`
      : '';
  const overpaidLine =
    Number(overpaid) > 0 ? `${peso(overpaid)} was paid above the new total and will be returned.` : '';
  const noteBox = textBox('Note from our team', note);
  const noteLine = payBox && noteBox ? `Note from our team: ${noteBox.text}` : '';

  const summary = backToApproved
    ? `Please pay ${peso(downpaymentStillNeeded)} more${due ? ` by ${formatDate(due)}` : ''}.`
    : statusLine ||
      (overpaidLine ? `${peso(overpaid)} will be returned.` : 'See the updated charges on your reservation page.');
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
        damage.length
          ? 'The new total includes charges for rented items that came back damaged or were not returned, listed below.'
          : ''
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

function reservationApproved({ reservation, total, downpayment, acceptedAt, firstName }) {
  const { ref, eventName } = reservation;
  const due = reservation.downpaymentDue ? formatDate(reservation.downpaymentDue) : '';
  const byDue = due ? ` by ${due}` : '';
  const full = Number(downpayment) >= Number(total);
  const pay = full
    ? `Please pay the full ${peso(total)}${byDue} to secure your date.`
    : `Please pay a downpayment of at least ${peso(downpayment)}${byDue} to secure your date. You can pay more, up to the full ${peso(total)}.`;
  const moneyRows = full
    ? [
        { label: 'Total', value: peso(total), strong: true },
        { label: 'Pay in full by', value: due || '—' }
      ]
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
      preheader: full
        ? `Pay the full ${peso(total)}${byDue} to secure your date.`
        : `Minimum downpayment ${peso(downpayment)}${byDue} · Total ${peso(total)}.`,
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

function bookingConfirmed({ reservation, balance, firstName }) {
  const { ref, eventName } = reservation;
  const owes = Number(balance) > 0;
  return {
    subject: emailSubject('Booking confirmed', eventName, ref),
    ...renderEmail({
      label: 'Booking Confirmed',
      tone: 'success',
      preheader: owes
        ? `Remaining balance ${peso(balance)}, due on the event day · Your contract is in Documents.`
        : 'Fully paid · Your contract is in Documents.',
      heading: 'Your Booking Is Confirmed',
      firstName,
      intro: ['Your booking is confirmed. Thank you for choosing Tres Marias.'],
      details: [
        ...bookingRows(reservation, { withTime: true }),
        {
          label: 'Remaining balance',
          value: owes ? `${peso(balance)}, due on the event day` : 'Fully paid',
          strong: true
        }
      ],
      after: ['Your contract is in Documents.'],
      button: { label: 'View contract', path: PORTAL_PATHS.documents }
    })
  };
}

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
      intro: [
        byCustomer
          ? 'You cancelled your reservation from your account.'
          : 'We are sorry, we had to cancel your reservation.'
      ],
      details,
      box: textBox(byCustomer ? 'Your reason' : 'Reason', reason, 'attention'),
      after: [refundLine],
      button: { label: 'View reservation', path: reservationPath(ref) },
      security: byCustomer ? "If you didn't cancel this, change your password right away and message us." : ''
    })
  };
}

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

function eventCompleted({ reservation, firstName }) {
  const { ref, eventName } = reservation;
  const rental = isRental(reservation.serviceType);
  return {
    subject: emailSubject(
      rental ? 'Thank you for renting with us' : 'Thank you for celebrating with us',
      eventName,
      ref
    ),
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
