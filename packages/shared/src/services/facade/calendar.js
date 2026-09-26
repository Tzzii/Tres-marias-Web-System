// Public face of the calendar service (availability): pages import it through calendarApi (@tm/shared),
// and DateField imports it directly. Each call goes to the browser-store version or the API version,
// chosen once at startup (backend.js).
import * as local from '../calendarService.js';
import * as remote from '../remote/calendar.js';
import { pickImpl } from '../backend.js';

// The API version since Phase 5 (services/remote/calendar.js), when VITE_API_SERVICES includes "calendar"
const impl = pickImpl('calendar', local, remote);

// Returns right away (no waiting): the availability map date pickers read while rendering.
// The API version answers from its copy of the server's map, marked `loading: true` until the first one arrives.
export const availabilitySnapshot = (...a) => impl.availabilitySnapshot(...a);
export const checkAvailability = (...a) => impl.checkAvailability(...a);
export const getCalendar = (...a) => impl.getCalendar(...a);
export const blockDates = (...a) => impl.blockDates(...a);
export const unblockDate = (...a) => impl.unblockDate(...a);
export const setDailyCapacity = (...a) => impl.setDailyCapacity(...a);

// Pure rules that take the map as an argument: the same code on both sides and on the server
export { timeUnavailableReason, daySchedule, dateUnavailableReason, earliestBookableDate } from '../../domain/availability.js';
