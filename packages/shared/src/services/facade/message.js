// Public face of the message (chat) service: pages import it through messageApi (@tm/shared).
// Each call goes to the browser-store version or the API version, chosen once at startup (backend.js).
import * as local from '../messageService.js';
import { pickImpl } from '../backend.js';

// The API version arrives in Phase 7 (services/remote/message.js); until then the browser store answers
const impl = pickImpl('messages', local);

export const listThreads = (...a) => impl.listThreads(...a);
export const getThread = (...a) => impl.getThread(...a);
export const markThreadRead = (...a) => impl.markThreadRead(...a);
export const sendMessage = (...a) => impl.sendMessage(...a);
export const openThread = (...a) => impl.openThread(...a);

// Unread count for navigation badges, returned right away (no waiting)
export const unreadCount = (...a) => impl.unreadCount(...a);

// Not listed: customerThread changes the browser store's raw `data` inside a write(); other services use it, pages don't
