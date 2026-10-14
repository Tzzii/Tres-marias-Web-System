import { config } from '../../config.js';
import logDriver from './log.driver.js';
import smtpDriver from './smtp.driver.js';

const drivers = { log: logDriver, smtp: smtpDriver };

export const mailer = drivers[config.mail.driver];
