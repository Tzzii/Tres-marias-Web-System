import { config } from '../../config.js';
import logDriver from './log.driver.js';

/**
 * The only SMS entry point the app imports. SMS_DRIVER in apps/api/.env picks the driver; "log" is the
 * only one until a provider is chosen. Every driver has the same two functions, like the mailer's:
 *   sms.send({ to, body, meta }) -> { id, provider, at }
 *       deliver now; the log driver also keeps it in the outbox. Used since Phase 3 for the customer's
 *       password-reset code (modules/auth/auth.messages.js).
 *   sms.deliver({ to, body }) -> { status: 'sent' | 'logged', providerId }
 *       hand the text over and say how it went, writing nothing: for a text whose outbox row the caller
 *       saved first (an outsourcing contract, Phase 10). Throws when the provider refuses it.
 *
 * Adding a provider (e.g. Semaphore) is one more file here with the same two functions, added to
 * `drivers` and to the SMS_DRIVER check in config.js. Mobile numbers are stored as 09XXXXXXXXX or
 * +639XXXXXXXXX; a provider that wants the international form gets "+63" + the number without its 0.
 * Until then, a contract sent to a partner by SMS is only logged, and the admin is told to send it
 * themselves (the contract's Download .txt).
 */
const drivers = { log: logDriver };

export const sms = drivers[config.sms.driver];
