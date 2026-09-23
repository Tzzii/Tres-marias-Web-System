// Public face of the calendar service (availability): pages import it through calendarApi (@tm/shared),
// and DateField imports it directly. Each call goes to the browser-store version or the API version,
// chosen once at startup (backend.js).
import * as local from '../calendarService.js';
import { pickImpl } from '../backend.js';

// The API version arrives in Phase 5 (services/remote/calendar.js); until then the browser store answers
const impl = pickImpl('calendar', local);

// Returns right away (no waiting): the availability map date pickers read while rendering
export const availabilitySnapshot = (...a) => impl.availabilitySnapshot(...a);
export const checkAvailability = (...a) => impl.checkAvailability(...a);
export const getCalendar = (...a) => impl.getCalendar(...a);
export const blockDates = (...a) => impl.blockDates(...a);
export const unblockDate = (...a) => impl.unblockDate(...a);
export const setDailyCapacity = (...a) => impl.setDailyCapacity(...a);

// Pure rules that take the snapshot as an argument: the same on both sides (they move to domain/ later)
export { timeUnavailableReason, daySchedule, dateUnavailableReason, earliestBookableDate } from '../calendarService.js';
