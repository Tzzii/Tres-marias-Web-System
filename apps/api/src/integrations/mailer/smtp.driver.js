import nodemailer from 'nodemailer';
import { config } from '../../config.js';
import { now } from '../../lib/time.js';

let transport = null; // made on the first send, so importing this file needs no SMTP settings and opens nothing

// How long to wait for the SMTP server to connect, greet and answer (ms), so a stuck server makes a send fail
// fast instead of hanging: one-time codes then show "try again", and customer emails are marked failed
const SMTP_TIMEOUT_MS = 15000;

/**
 * The nodemailer transport for config.mail.smtp (Gmail with an App Password, Mailtrap, or any SMTP server),
 * created once and reused. Port 465 speaks TLS from the start; 587 upgrades with STARTTLS. Connecting,
 * the server's greeting and each answer may take up to SMTP_TIMEOUT_MS (added 2026-10-10).
 */
function getTransport() {
  if (!transport) {
    const { host, port, user, pass } = config.mail.smtp;
    if (!host) throw new Error('MAIL_DRIVER is "smtp" but SMTP_HOST is empty in apps/api/.env.');
    transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS
    });
  }
  return transport;
}

/**
 * Send the message from config.mail.from. Returns { status: 'sent', providerId: the SMTP message id };
 * throws when the server refuses it.
 */
async function deliver({ to, subject, text, html }) {
  const info = await getTransport().sendMail({ from: config.mail.from, to, subject, text, html });
  return { status: 'sent', providerId: info.messageId };
}

/** Mail driver that sends through SMTP (MAIL_DRIVER=smtp). Same shape as the log driver. */
export default {
  name: 'smtp',
  deliver,

  /** Send the message. Takes the same { to, subject, text, html, meta } as the log driver; meta is not sent. */
  async send({ to, subject, text, html }) {
    const { providerId } = await deliver({ to, subject, text, html });
    return { id: providerId, provider: 'smtp', at: now() };
  }
};
