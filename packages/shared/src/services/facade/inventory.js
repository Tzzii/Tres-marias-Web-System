// Public face of the inventory service: pages import it through inventoryApi (@tm/shared).
// Each call goes to the browser-store version or the API version, chosen once at startup (backend.js).
import * as local from '../inventoryService.js';
import { pickImpl } from '../backend.js';

// The API version arrives in Phase 10 (services/remote/inventory.js); until then the browser store answers
const impl = pickImpl('inventory', local);

export const listInventory = (...a) => impl.listInventory(...a);
export const listCheckoutEvents = (...a) => impl.listCheckoutEvents(...a);
export const addInventoryItems = (...a) => impl.addInventoryItems(...a);
export const updateInventoryItem = (...a) => impl.updateInventoryItem(...a);
export const moveInventoryStock = (...a) => impl.moveInventoryStock(...a);
export const setInventoryArchived = (...a) => impl.setInventoryArchived(...a);
export const checkOutRental = (...a) => impl.checkOutRental(...a);
export const returnRental = (...a) => impl.returnRental(...a);
export const listReservationEquipment = (...a) => impl.listReservationEquipment(...a);

// Constant: the same on both sides
export { NO_EVENT } from '../inventoryService.js';
