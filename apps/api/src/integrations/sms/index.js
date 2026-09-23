import { config } from '../../config.js';
import logDriver from './log.driver.js';

/**
 * The only SMS entry point the app imports: sms.send({ to, body, meta }) -> { id, provider, at }.
 * SMS_DRIVER in apps/api/.env picks the driver; "log" is the only one until a provider is chosen (Phase 10).
 * Not used yet in Phase 0.
 */
const drivers = { log: logDriver };

export const sms = drivers[config.sms.driver];
