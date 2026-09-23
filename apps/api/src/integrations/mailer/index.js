import { config } from '../../config.js';
import logDriver from './log.driver.js';
import smtpDriver from './smtp.driver.js';

/**
 * The only mail entry point the app imports: mailer.send({ to, subject, text, html, meta }) -> { id, provider, at }.
 * MAIL_DRIVER in apps/api/.env picks the driver ("log" or "smtp", checked by config.js), so changing
 * provider never touches the code that sends mail. Not used yet in Phase 0.
 */
const drivers = { log: logDriver, smtp: smtpDriver };

export const mailer = drivers[config.mail.driver];
