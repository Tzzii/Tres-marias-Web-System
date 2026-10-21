import { tokens } from '../theme/tokens.js';

/**
 * The reservation status pipeline, identical on both portals:
 * Pending → Approved → Downpayment paid → Confirmed → Completed
 * A request moves from Pending to Approved when the customer accepts the quotation the admin sent
 * (pendingStep in domain/reservation.js says where a pending one stands)
 * plus the two exits, Declined (by the admin) and Cancelled (by the customer online, or by the admin
 * with a reason; the reservation's `cancelledBy` says which). "Started preparing" is a mark on the
 * booking (`preparingAt`), not a status.
 */
export const PIPELINE = ['pending', 'approved', 'downpayment_paid', 'confirmed', 'completed'];

// Display name and chip colours for each reservation status
export const STATUS = {
  pending: { label: 'Pending', color: tokens.amber, bg: 'rgba(245, 158, 11, 0.12)', fg: tokens.warningText },
  approved: { label: 'Approved', color: tokens.blue, bg: 'rgba(59, 130, 246, 0.12)', fg: tokens.infoText },
  downpayment_paid: {
    label: 'Downpayment paid',
    color: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.12)',
    fg: tokens.violetText
  },
  confirmed: { label: 'Confirmed', color: tokens.green, bg: 'rgba(16, 185, 129, 0.12)', fg: tokens.successText },
  completed: { label: 'Completed', color: tokens.textMuted, bg: 'rgba(100, 116, 139, 0.14)', fg: tokens.textSecondary },
  declined: { label: 'Declined', color: tokens.red, bg: 'rgba(239, 68, 68, 0.1)', fg: tokens.dangerText },
  cancelled: { label: 'Cancelled', color: tokens.red, bg: 'rgba(239, 68, 68, 0.1)', fg: tokens.dangerText }
};

/** Readable name for a status key, e.g. 'downpayment_paid' -> 'Downpayment paid'. */
export const statusLabel = (status) => (STATUS[status] ? STATUS[status].label : status);

/** Index in the pipeline, or -1 for declined / cancelled. */
export const pipelineIndex = (status) => PIPELINE.indexOf(status);

/** Statuses that hold a date against the daily capacity. */
export const HOLDS_DATE = ['approved', 'downpayment_paid', 'confirmed'];

/**
 * Statuses in which the customer may still ask for a change (the "Request a change" button). Cancelling
 * online has its own rules, onlineCancellation in domain/cancellation.js.
 */
export const CUSTOMER_EDITABLE = ['pending', 'approved'];

// Display name and chip colours for each payment status
export const PAYMENT_STATUS = {
  awaiting: { label: 'Awaiting verification', bg: 'rgba(245, 158, 11, 0.12)', fg: tokens.warningText },
  verified: { label: 'Verified', bg: 'rgba(16, 185, 129, 0.12)', fg: tokens.successText },
  rejected: { label: 'Rejected', bg: 'rgba(239, 68, 68, 0.1)', fg: tokens.dangerText }
};

// Display name and chip colours for where a QR Ph code stands (qrState in domain/payment.js). Words of
// their own, never "Pending" (a reservation status) or "Awaiting verification" (a bank transfer the
// admin must check): an unpaid QR is not money received, and PayMongo confirms it, not the admin.
export const QR_STATUS = {
  waiting: { label: 'Waiting for payment', bg: 'rgba(14, 165, 233, 0.12)', fg: tokens.infoText },
  checking: { label: 'Checking payment', bg: 'rgba(14, 165, 233, 0.12)', fg: tokens.infoText },
  paid: { label: 'Paid', bg: 'rgba(16, 185, 129, 0.12)', fg: tokens.successText },
  expired: { label: 'Expired · not charged', bg: 'rgba(100, 116, 139, 0.14)', fg: tokens.textSecondary },
  failed: { label: 'Failed · not charged', bg: 'rgba(239, 68, 68, 0.1)', fg: tokens.dangerText }
};

// Display name for each payment method key. 'qrph' is the PayMongo QR Ph code (Phase 8B), which GCash, Maya
// and bank apps can all scan; a bank transfer comes with a photo of its receipt; cash is recorded by the admin.
// There is no manual GCash payment (owner's decision, 2026-09-30).
export const PAYMENT_METHODS = {
  qrph: 'QR Ph (GCash, Maya or bank app)',
  bank: 'Bank transfer',
  cash: 'Cash on site'
};

// Display name for each way a refund is sent back. Shorter than PAYMENT_METHODS: a refund is never "on site",
// and the admin may send it by GCash even though customers pay GCash by QR only.
export const REFUND_METHODS = {
  gcash: 'GCash',
  bank: 'Bank transfer',
  cash: 'Cash'
};

/** What a payment was for, as shown on receipts and payment lists: 'downpayment' -> 'Downpayment'. */
export const paymentKindLabel = (kind) =>
  kind === 'downpayment' ? 'Downpayment' : kind === 'full' ? 'Full payment' : 'Balance';

/** Balance status used by the admin Payments filters. */
export const BALANCE_STATE = {
  unpaid: { label: 'Unpaid', bg: 'rgba(100, 116, 139, 0.14)', fg: tokens.textSecondary },
  partial: { label: 'Partially paid', bg: 'rgba(59, 130, 246, 0.12)', fg: tokens.infoText },
  full: { label: 'Fully paid', bg: 'rgba(16, 185, 129, 0.12)', fg: tokens.successText },
  overdue: { label: 'Overdue', bg: 'rgba(239, 68, 68, 0.1)', fg: tokens.dangerText }
};

// Display name and chip colours for where a customer's feedback stands on the website.
// 'featured' and 'flagged' are not stored as the status: they are the featured / flagged
// flags on the record, worked out by feedbackState() below.
export const FEEDBACK_STATUS = {
  featured: { label: 'Featured', bg: 'rgba(197, 160, 89, 0.16)', fg: tokens.goldText },
  published: { label: 'Published', bg: 'rgba(16, 185, 129, 0.12)', fg: tokens.successText },
  hidden: { label: 'Not published', bg: 'rgba(100, 116, 139, 0.14)', fg: tokens.textSecondary },
  flagged: { label: 'Flagged', bg: 'rgba(239, 68, 68, 0.1)', fg: tokens.dangerText },
  archived: { label: 'Archived', bg: 'rgba(100, 116, 139, 0.14)', fg: tokens.textSecondary }
};

/** The one label that describes a feedback right now, strongest state first. */
export const feedbackState = (feedback = {}) => {
  if (feedback.archived) return 'archived';
  if (feedback.flagged) return 'flagged';
  if (feedback.featured) return 'featured';
  return feedback.status === 'published' ? 'published' : 'hidden';
};
