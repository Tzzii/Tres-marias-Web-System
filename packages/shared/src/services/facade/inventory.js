// Public face of the inventory service: pages import it through inventoryApi (@tm/shared).
// Each call goes to the browser-store version or the API version, chosen once at startup (backend.js).
import * as local from '../inventoryService.js';
import * as remote from '../remote/inventory.js';
import { pickImpl } from '../backend.js';

// The API version since Phase 10 (services/remote/inventory.js), when VITE_API_SERVICES includes "inventory"
const impl = pickImpl('inventory', local, remote);

export const listInventory = (...a) => impl.listInventory(...a);
export const listCheckoutEvents = (...a) => impl.listCheckoutEvents(...a);
export const addInventoryItems = (...a) => impl.addInventoryItems(...a);
export const updateInventoryItem = (...a) => impl.updateInventoryItem(...a);
export const moveInventoryStock = (...a) => impl.moveInventoryStock(...a);
export const setInventoryArchived = (...a) => impl.setInventoryArchived(...a);
export const checkOutRental = (...a) => impl.checkOutRental(...a);
export const returnRental = (...a) => impl.returnRental(...a);
export const listReservationEquipment = (...a) => impl.listReservationEquipment(...a);

// Constant: the same on both sides (domain/inventory.js, which the API server uses too)
export { NO_EVENT } from '../../domain/inventory.js';
