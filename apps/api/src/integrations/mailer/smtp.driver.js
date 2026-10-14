import nodemailer from 'nodemailer';
import { config } from '../../config.js';
import { now } from '../../lib/time.js';

let transport = null;

const SMTP_TIMEOUT_MS = 15000;

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

async function deliver({ to, subject, text, html }) {
  const info = await getTransport().sendMail({ from: config.mail.from, to, subject, text, html });
  return { status: 'sent', providerId: info.messageId };
}

export default {
  name: 'smtp',
  deliver,

  async send({ to, subject, text, html }) {
    const { providerId } = await deliver({ to, subject, text, html });
    return { id: providerId, provider: 'smtp', at: now() };
  }
};
