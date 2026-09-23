// Public face of the feedback (reviews) service: pages import it through feedbackApi (@tm/shared).
// Each call goes to the browser-store version or the API version, chosen once at startup (backend.js).
import * as local from '../feedbackService.js';
import { pickImpl } from '../backend.js';

// The API version arrives in Phase 9 (services/remote/feedback.js); until then the browser store answers
const impl = pickImpl('feedback', local);

export const listFeedbacks = (...a) => impl.listFeedbacks(...a);
export const listPublished = (...a) => impl.listPublished(...a);
export const unreadFeedbackCount = (...a) => impl.unreadFeedbackCount(...a);
export const createFeedback = (...a) => impl.createFeedback(...a);
export const markFeedbackRead = (...a) => impl.markFeedbackRead(...a);
export const markAllFeedbackRead = (...a) => impl.markAllFeedbackRead(...a);
export const setFeedbackStatus = (...a) => impl.setFeedbackStatus(...a);
export const setFeedbackFeatured = (...a) => impl.setFeedbackFeatured(...a);
export const setFeedbackFlag = (...a) => impl.setFeedbackFlag(...a);
export const setFeedbackArchived = (...a) => impl.setFeedbackArchived(...a);
export const replyToFeedback = (...a) => impl.replyToFeedback(...a);
export const deleteFeedback = (...a) => impl.deleteFeedback(...a);

// Pure rating rule that takes the category ratings as an argument: the same on both sides (moves to domain/ later)
export { categoryAverage } from '../feedbackService.js';
