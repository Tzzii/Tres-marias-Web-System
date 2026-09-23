// Public face of the reservation service: pages import it through reservationApi (@tm/shared).
// Each call goes to the browser-store version or the API version, chosen once at startup (backend.js).
import * as local from '../reservationService.js';
import { pickImpl } from '../backend.js';

// The API version arrives in Phase 6 (services/remote/reservation.js); until then the browser store answers
const impl = pickImpl('reservations', local);

export const listReservations = (...a) => impl.listReservations(...a);
export const getReservation = (...a) => impl.getReservation(...a);
export const createReservation = (...a) => impl.createReservation(...a);
export const cancelReservation = (...a) => impl.cancelReservation(...a);
export const requestChange = (...a) => impl.requestChange(...a);
export const sendQuotation = (...a) => impl.sendQuotation(...a);
export const approveReservation = (...a) => impl.approveReservation(...a);
export const declineReservation = (...a) => impl.declineReservation(...a);
export const confirmReservation = (...a) => impl.confirmReservation(...a);
export const completeReservation = (...a) => impl.completeReservation(...a);
export const updateLogistics = (...a) => impl.updateLogistics(...a);
export const updateMenu = (...a) => impl.updateMenu(...a);
export const saveNotes = (...a) => impl.saveNotes(...a);
export const getRentalAvailability = (...a) => impl.getRentalAvailability(...a);
export const updateRentalItems = (...a) => impl.updateRentalItems(...a);

// Pure money rule that takes the reservation and payments as arguments: the same on both sides (moves to domain/ later)
export { financials } from '../reservationService.js';

// Not listed: syncPaymentStatus and postAdminMessage change the browser store's raw `data` inside a write(); other services use them, pages don't
