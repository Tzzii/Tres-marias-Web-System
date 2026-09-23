// Public face of the auth service: pages import it through authApi (@tm/shared).
// Each call goes to the browser-store version or the API version, chosen once at startup (backend.js).
import * as local from '../authService.js';
import { pickImpl } from '../backend.js';

// The API version arrives in Phase 3 (services/remote/auth.js); until then the browser store answers
const impl = pickImpl('auth', local);

// Customers
export const customerLogin = (...a) => impl.customerLogin(...a);
export const customerRegister = (...a) => impl.customerRegister(...a);
export const startPasswordReset = (...a) => impl.startPasswordReset(...a);
export const resendPasswordResetCode = (...a) => impl.resendPasswordResetCode(...a);
export const verifyPasswordResetCode = (...a) => impl.verifyPasswordResetCode(...a);
export const completePasswordReset = (...a) => impl.completePasswordReset(...a);
export const getCustomerProfile = (...a) => impl.getCustomerProfile(...a);
export const updateCustomerProfile = (...a) => impl.updateCustomerProfile(...a);
export const changeCustomerPassword = (...a) => impl.changeCustomerPassword(...a);

// Admins
export const adminStartSignIn = (...a) => impl.adminStartSignIn(...a);
export const adminResendCode = (...a) => impl.adminResendCode(...a);
export const adminVerifyCode = (...a) => impl.adminVerifyCode(...a);
export const getAdminProfile = (...a) => impl.getAdminProfile(...a);
export const updateAdminProfile = (...a) => impl.updateAdminProfile(...a);
export const changeAdminPassword = (...a) => impl.changeAdminPassword(...a);
export const adminStartContactChange = (...a) => impl.adminStartContactChange(...a);
export const adminResendContactCode = (...a) => impl.adminResendContactCode(...a);
export const adminConfirmContactChange = (...a) => impl.adminConfirmContactChange(...a);

// Returns right away (no waiting): the remaining lock on an account, to restore the countdown on page load
export const getLockout = (...a) => impl.getLockout(...a);

// Not listed: authStorageKeys names the browser store's own localStorage / sessionStorage keys, not part of the public API
