import { config } from '../../config.js';
import logDriver from './log.driver.js';

/**
 * The only SMS entry point the app imports: sms.send({ to, body, meta }) -> { id, provider, at }.
 * SMS_DRIVER in apps/api/.env picks the driver; "log" is the only one until a provider is chosen (Phase 10).
 * Used since Phase 3 for the customer's password-reset code (modules/auth/auth.messages.js).
 */
const drivers = { log: logDriver };

export const sms = drivers[config.sms.driver];
