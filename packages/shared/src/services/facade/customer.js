// Public face of the customer service (admin customer list): pages import it through customerApi (@tm/shared).
// Each call goes to the browser-store version or the API version, chosen once at startup (backend.js).
import * as local from '../customerService.js';
import * as remote from '../remote/customer.js';
import { pickImpl } from '../backend.js';

// The API version since Phase 9 (services/remote/customer.js), when VITE_API_SERVICES includes "customers"
const impl = pickImpl('customers', local, remote);

export const listCustomers = (...a) => impl.listCustomers(...a);
export const getCustomer = (...a) => impl.getCustomer(...a);
export const updateCustomerContact = (...a) => impl.updateCustomerContact(...a);
