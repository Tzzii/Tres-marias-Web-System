import { config } from '../../config.js';
import logDriver from './log.driver.js';
import smtpDriver from './smtp.driver.js';

/**
 * The only mail entry point the app imports. MAIL_DRIVER in apps/api/.env picks the driver ("log" or
 * "smtp", checked by config.js), so changing provider never touches the code that sends mail. Every
 * driver has the same two functions:
 *   mailer.send({ to, subject, text, html, meta }) -> { id, provider, at }
 *       deliver now; the log driver also keeps it in the outbox. Used since Phase 3 for the admin's
 *       sign-in and contact-change codes (modules/auth/auth.messages.js).
 *   mailer.deliver({ to, subject, text, html }) -> { status: 'sent' | 'logged', providerId }
 *       hand the message over and say how it went, writing nothing: for a message whose outbox row the
 *       caller saved first (an outsourcing contract, Phase 10). Throws when the provider refuses it.
 */
const drivers = { log: logDriver, smtp: smtpDriver };

export const mailer = drivers[config.mail.driver];
