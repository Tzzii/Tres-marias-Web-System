import { BUSINESS } from '@tm/shared/src/services/config.js';
import { renderPartnerRequestEmail, shorten } from '../notify/email.layout.js';

/** Build the partner email from the final compose message, including any admin edits. Opens no connection. */
export function outsourceRequestEmail({ ref, body }) {
  return {
    subject: shorten(`Outsourcing request ${ref} from ${BUSINESS.name}`, 200),
    ...renderPartnerRequestEmail({ ref, text: body })
  };
}

/** Email gets the branded HTML and text fallback; SMS gets only the final plain-text request. */
export function deliverPartnerRequest(delivery, email, { mailer, sms }) {
  return delivery.channel === 'email'
    ? mailer.deliver({ to: delivery.to, subject: email.subject, text: delivery.body, html: email.html })
    : sms.deliver({ to: delivery.to, body: delivery.body });
}
