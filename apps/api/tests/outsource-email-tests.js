import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUSINESS } from '@tm/shared/src/services/config.js';
import { composeContractText, contractDeliveries } from '@tm/shared/src/domain/outsource.js';
import { outsourceRequestEmail, deliverPartnerRequest } from '../src/modules/outsource/outsource.emails.js';

const ref = 'OUT-2026-0001';
const partner = { name: 'Sample Studio', contactPerson: 'Rene', email: 'supplier@example.test', mobile: '09171234567' };
const compose = (fields) =>
  composeContractText({
    ref,
    partner,
    items: [{ name: 'Rectangular buffet table', qty: 40 }],
    needBy: '2026-10-17',
    amount: 700,
    ...fields
  });

test('partner request uses the branded email frame and readable item/quantity and request details', () => {
  const body = compose();
  const email = outsourceRequestEmail({ ref, body });
  assert.equal(email.subject, `Outsourcing request ${ref} from ${BUSINESS.name}`);
  for (const fact of [
    'TRES MARIAS',
    'Partner Supply Request',
    ref,
    'Hi Rene (Sample Studio),',
    'Rectangular buffet table',
    '40 pcs',
    '17 Oct 2026',
    '₱700',
    BUSINESS.phone
  ])
    assert.ok(email.html.includes(fact), fact);
  assert.match(email.html, /scope="col"[^>]*>Item</);
  assert.match(email.html, /scope="col"[^>]*>Quantity</);
  assert.ok(email.html.includes('Request number'));
  assert.ok(email.html.includes('Agreed amount'));
  assert.equal(email.text, body);
  assert.ok(email.html.includes('outsourcing partner'));
  assert.ok(!email.html.includes('you have a reservation'));
});

test('edited messages and quantities are the source for both HTML and plain text', () => {
  const body =
    'Hi partner,\n\nPlease supply these instead:\n- Photo booth: 2 pcs\n- LED wall: 1 pcs\n\nNeeded on 18 Oct 2026 at Sample Hall.\nAgreed amount: ₱9,000.\nArrive at 8 AM, not 9 AM.\n\nPlease text our coordinator to confirm.';
  const email = outsourceRequestEmail({ ref, body });
  for (const fact of [
    'Photo booth',
    '2 pcs',
    'LED wall',
    '1 pcs',
    'Sample Hall',
    '₱9,000',
    'Arrive at 8 AM, not 9 AM.',
    'Please text our coordinator'
  ])
    assert.ok(email.html.includes(fact), fact);
  assert.equal(email.text, body);
  assert.ok(!email.html.includes('Rectangular buffet table'));
  assert.ok(!email.html.includes('₱700'));
});

test('freeform requests and nonstandard units remain readable without losing or inventing facts', () => {
  const body =
    'Hello partner,\n\nWe need extra staff:\n- Servers: 3 people\n- Driver: 1 person\n\nPlease share your available schedule and rate.';
  const email = outsourceRequestEmail({ ref, body });
  assert.equal(email.text, body);
  for (const fact of ['- Servers: 3 people', '- Driver: 1 person', 'Please share your available schedule and rate.'])
    assert.ok(email.html.includes(fact));
  assert.ok(!email.html.includes('Agreed amount'));
  assert.ok(!email.html.includes('pcs</td>'));
});

test('a missing amount, event or contact person produces no invented booking details', () => {
  const body = compose({ partner: { name: 'Sample Supplier' }, amount: 0, needBy: '', eventName: '' });
  const email = outsourceRequestEmail({ ref, body });
  assert.ok(email.html.includes('Hi Sample Supplier,'));
  assert.ok(!email.html.includes('Agreed amount'));
  assert.ok(!email.html.includes('Needed on'));
  assert.ok(!email.html.includes('undefined'));
});

test('typed HTML, scripts, attributes, ampersands and quotes are escaped everywhere', () => {
  const body =
    'Hi <script>alert(1)</script> & "Supplier",\n\n- Table <img src=x onerror="alert(1)">: 2 pcs\n\nNeeded on <iframe src="https://evil.test"></iframe>.\nAgreed amount: <b>700</b>.\nKeep <a href="https://evil.test">my note</a>.';
  const email = outsourceRequestEmail({ ref: '<b>OUT</b>', body });
  assert.ok(!/<(?:script|img|iframe|b|a)\b/i.test(email.html));
  for (const escaped of ['&lt;script&gt;', '&lt;img', '&lt;iframe', '&lt;b&gt;', '&lt;a', '&amp;', '&quot;'])
    assert.ok(email.html.includes(escaped), escaped);
  assert.equal(email.text, body);
});

test('subjects reject header injection and stay within the email subject limit', () => {
  const email = outsourceRequestEmail({ ref: `OUT\r\nBcc: other@example.test ${'x'.repeat(400)}`, body: compose() });
  assert.ok(!/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(email.subject));
  assert.ok(Array.from(email.subject).length <= 200);
});

test('partner emails use inline styling without tracking images, scripts or account-only links', () => {
  const email = outsourceRequestEmail({
    ref,
    body: compose({ items: Array.from({ length: 50 }, (_, i) => ({ name: `Equipment ${i + 1}`, qty: 1 })) })
  });
  assert.ok(!/<img|<script|<link|@import|url\(|href=|\/portal\//i.test(email.html));
  assert.ok(Buffer.byteLength(email.html) < 50 * 1024);
});

test('a partner with email and mobile receives one email with HTML plus exact text', async () => {
  const body = compose();
  const email = outsourceRequestEmail({ ref, body });
  const deliveries = contractDeliveries(partner, body, 123);
  const mails = [];
  const ports = {
    mailer: {
      deliver: async (message) => {
        mails.push(message);
        return { status: 'sent', providerId: 'test-mail' };
      }
    }
  };
  for (const delivery of deliveries) await deliverPartnerRequest(delivery, email, ports);
  assert.deepEqual(mails, [{ to: partner.email, subject: email.subject, text: body, html: email.html }]);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].channel, 'email');
});

test('driver failures still propagate to the existing failed-delivery handling', async () => {
  const body = compose();
  await assert.rejects(
    deliverPartnerRequest({ channel: 'email', to: partner.email, body }, outsourceRequestEmail({ ref, body }), {
      mailer: {
        deliver: async () => {
          throw new Error('Test SMTP failure');
        }
      }
    }),
    /Test SMTP failure/
  );
});

test('unsupported channels are rejected instead of being handed to the email driver', () => {
  const email = outsourceRequestEmail({ ref, body: compose() });
  const ports = { mailer: { deliver: () => assert.fail('The email driver must not receive a non-email delivery.') } };
  for (const channel of ['sms', 'phone', undefined]) {
    assert.throws(
      () => deliverPartnerRequest({ channel, to: partner.mobile }, email, ports),
      /only be delivered by email/
    );
  }
});
