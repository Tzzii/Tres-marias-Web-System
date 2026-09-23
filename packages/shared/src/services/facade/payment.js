// Public face of the payment service: pages import it through paymentApi (@tm/shared).
// Each call goes to the browser-store version or the API version, chosen once at startup (backend.js).
import * as local from '../paymentService.js';
import { pickImpl } from '../backend.js';

// The API version arrives in Phase 8 (services/remote/payment.js); until then the browser store answers
const impl = pickImpl('payments', local);

export const listPayments = (...a) => impl.listPayments(...a);
export const listBalances = (...a) => impl.listBalances(...a);
export const submitPayment = (...a) => impl.submitPayment(...a);
export const verifyPayment = (...a) => impl.verifyPayment(...a);
export const rejectPayment = (...a) => impl.rejectPayment(...a);
export const recordCashPayment = (...a) => impl.recordCashPayment(...a);
export const sendPaymentReminder = (...a) => impl.sendPaymentReminder(...a);
