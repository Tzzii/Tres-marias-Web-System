import { tokens } from '../theme/tokens.js';

/**
 * The reservation status pipeline, identical on both portals:
 * Pending → Approved → Downpayment paid → Confirmed → Completed
 * plus the two exits, Declined (by the admin) and Cancelled (by the customer).
 */
export const PIPELINE = ['pending', 'approved', 'downpayment_paid', 'confirmed', 'completed'];

// Display name and chip colours for each reservation status
export const STATUS = {
  pending: { label: 'Pending', color: tokens.amber, bg: 'rgba(245, 158, 11, 0.12)', fg: '#b45309' },
  approved: { label: 'Approved', color: tokens.blue, bg: 'rgba(59, 130, 246, 0.12)', fg: '#1d4ed8' },
  downpayment_paid: { label: 'Downpayment paid', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)', fg: '#6d28d9' },
  confirmed: { label: 'Confirmed', color: tokens.green, bg: 'rgba(16, 185, 129, 0.12)', fg: '#047857' },
  completed: { label: 'Completed', color: tokens.textMuted, bg: 'rgba(100, 116, 139, 0.14)', fg: '#334155' },
  declined: { label: 'Declined', color: tokens.red, bg: 'rgba(239, 68, 68, 0.1)', fg: '#b91c1c' },
  cancelled: { label: 'Cancelled', color: tokens.red, bg: 'rgba(239, 68, 68, 0.1)', fg: '#b91c1c' }
};

/** Readable name for a status key, e.g. 'downpayment_paid' -> 'Downpayment paid'. */
export const statusLabel = (status) => (STATUS[status] ? STATUS[status].label : status);

/** Index in the pipeline, or -1 for declined / cancelled. */
export const pipelineIndex = (status) => PIPELINE.indexOf(status);

/** Statuses that hold a date against the daily capacity. */
export const HOLDS_DATE = ['approved', 'downpayment_paid', 'confirmed'];

/** Statuses the customer may still cancel or change. */
export const CUSTOMER_EDITABLE = ['pending', 'approved'];

// Display name and chip colours for each payment status
export const PAYMENT_STATUS = {
  awaiting: { label: 'Awaiting verification', bg: 'rgba(245, 158, 11, 0.12)', fg: '#b45309' },
  verified: { label: 'Verified', bg: 'rgba(16, 185, 129, 0.12)', fg: '#047857' },
  rejected: { label: 'Rejected', bg: 'rgba(239, 68, 68, 0.1)', fg: '#b91c1c' }
};

// Display name for each payment method key
export const PAYMENT_METHODS = {
  gcash: 'GCash / e-wallet',
  bank: 'Bank transfer',
  cash: 'Cash on site'
};

/** What a payment was for, as shown on receipts and payment lists: 'downpayment' -> 'Downpayment (50%)'. */
export const paymentKindLabel = (kind) => (kind === 'downpayment' ? 'Downpayment (50%)' : kind === 'full' ? 'Full payment' : 'Balance');

/** Balance standing used by the admin Payments filters. */
export const BALANCE_STATE = {
  unpaid: { label: 'Unpaid', bg: 'rgba(100, 116, 139, 0.14)', fg: '#334155' },
  partial: { label: 'Partially paid', bg: 'rgba(59, 130, 246, 0.12)', fg: '#1d4ed8' },
  full: { label: 'Fully paid', bg: 'rgba(16, 185, 129, 0.12)', fg: '#047857' },
  overdue: { label: 'Overdue', bg: 'rgba(239, 68, 68, 0.1)', fg: '#b91c1c' }
};

// Display name and chip colours for where a customer's feedback stands on the website.
// 'featured' and 'flagged' are not stored as the status: they are the featured / flagged
// flags on the record, resolved by feedbackState() below.
export const FEEDBACK_STATUS = {
  featured: { label: 'Featured', bg: 'rgba(197, 160, 89, 0.16)', fg: '#9d7c38' },
  published: { label: 'Published', bg: 'rgba(16, 185, 129, 0.12)', fg: '#047857' },
  hidden: { label: 'Not published', bg: 'rgba(100, 116, 139, 0.14)', fg: '#334155' },
  flagged: { label: 'Flagged', bg: 'rgba(239, 68, 68, 0.1)', fg: '#b91c1c' },
  archived: { label: 'Archived', bg: 'rgba(100, 116, 139, 0.14)', fg: '#334155' }
};

/** The one label that describes a feedback right now, strongest state first. */
export const feedbackState = (feedback = {}) => {
  if (feedback.archived) return 'archived';
  if (feedback.flagged) return 'flagged';
  if (feedback.featured) return 'featured';
  return feedback.status === 'published' ? 'published' : 'hidden';
};
