// Public face of the auth service: pages import it through authApi (@tm/shared).
// Each call goes to the browser-store version or the API version, chosen once at startup (backend.js).
import * as local from '../authService.js';
import * as remote from '../remote/auth.js';
import { pickImpl } from '../backend.js';

// The API version (remote/auth.js, Phase 3) when VITE_API_SERVICES includes "auth"; otherwise the browser store
const impl = pickImpl('auth', local, remote);

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

// Returns right away (no waiting): the remaining lock on an account, to restore the countdown on page load.
// On the API it is the lock the server last reported to this tab; the server itself enforces every lock.
export const getLockout = (...a) => impl.getLockout(...a);

// Not listed: authStorageKeys names the browser store's own localStorage / sessionStorage keys, not part of the public API
