import nodemailer from 'nodemailer';
import { config } from '../../config.js';
import { now } from '../../lib/time.js';

let transport = null; // made on the first send, so importing this file needs no SMTP settings and opens nothing

/**
 * The nodemailer transport for config.mail.smtp (Gmail with an App Password, Mailtrap, or any SMTP server),
 * created once and reused. Port 465 speaks TLS from the start; 587 upgrades with STARTTLS.
 */
function getTransport() {
  if (!transport) {
    const { host, port, user, pass } = config.mail.smtp;
    if (!host) throw new Error('MAIL_DRIVER is "smtp" but SMTP_HOST is empty in apps/api/.env.');
    transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined
    });
  }
  return transport;
}

/** Mail driver that sends through SMTP (MAIL_DRIVER=smtp). Same send() shape as the log driver. */
export default {
  name: 'smtp',

  /** Send the message from config.mail.from. Takes the same { to, subject, text, html, meta } as the log driver; meta is not sent. */
  async send({ to, subject, text, html }) {
    const info = await getTransport().sendMail({ from: config.mail.from, to, subject, text, html });
    return { id: info.messageId, provider: 'smtp', at: now() };
  }
};
