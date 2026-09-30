// Public face of the payment service (payments and refunds): pages import it through paymentApi (@tm/shared).
// Each call goes to the browser-store version or the API version, chosen once at startup (backend.js).
import * as local from '../paymentService.js';
import * as remote from '../remote/payment.js';
import { pickImpl } from '../backend.js';

// The API version since Phase 8 (services/remote/payment.js), refunds included, when VITE_API_SERVICES includes "payments"
const impl = pickImpl('payments', local, remote);

export const listPayments = (...a) => impl.listPayments(...a);
export const listBalances = (...a) => impl.listBalances(...a);
export const submitPayment = (...a) => impl.submitPayment(...a);
export const verifyPayment = (...a) => impl.verifyPayment(...a);
export const rejectPayment = (...a) => impl.rejectPayment(...a);
export const recordCashPayment = (...a) => impl.recordCashPayment(...a);
export const sendPaymentReminder = (...a) => impl.sendPaymentReminder(...a);
export const recordRefund = (...a) => impl.recordRefund(...a);
export const listRefunds = (...a) => impl.listRefunds(...a);
export const listRefundsDue = (...a) => impl.listRefundsDue(...a);
// What the Payments page can offer ({ qr }: the GCash / e-wallet QR), and a payment's uploaded receipt (null in the browser store)
export const paymentOptions = (...a) => impl.paymentOptions(...a);
export const proofUrl = (...a) => impl.proofUrl(...a);
// GCash / e-wallet QR through PayMongo (Phase 8B, API only): open one, and ask how it stands
export const startQrPayment = (...a) => impl.startQrPayment(...a);
export const getQrPayment = (...a) => impl.getQrPayment(...a);
