import { BUSINESS } from '@tm/shared/src/services/config.js';
import { renderPartnerRequestEmail, shorten } from '../notify/email.layout.js';

export function outsourceRequestEmail({ ref, body }) {
  return {
    subject: shorten(`Outsourcing request ${ref} from ${BUSINESS.name}`, 200),
    ...renderPartnerRequestEmail({ ref, text: body })
  };
}

export function deliverPartnerRequest(delivery, email, { mailer }) {
  if (delivery.channel !== 'email') throw new Error('Partner requests can only be delivered by email.');
  return mailer.deliver({ to: delivery.to, subject: email.subject, text: delivery.body, html: email.html });
}
