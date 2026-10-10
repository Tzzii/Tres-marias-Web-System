import { BUSINESS, RENTAL, RULES } from '../services/config.js';
import { cancelWindowText } from '../domain/cancellation.js';

/**
 * The Terms of Service and the Privacy Policy, written once and used everywhere: the public /terms and
 * /privacy pages, the sign-up dialog, the "We updated our terms" prompt and the booking form's tick box
 * (customer portal), and the server, which saves TERMS_VERSION on the account and on each booking so
 * there is a record of which version the customer agreed to.
 *
 * Each document is a list of sections: { id, heading, paragraphs: [text], bullets: [text] } (either list
 * may be empty), read top to bottom. The numbers in them (lead days, guest range, hours, fees) come from
 * the shared rules, so the terms always say what the system actually does.
 *
 * Changing the wording in a way customers should agree to again: set TERMS_VERSION (and TERMS_UPDATED) to
 * the new date. Every signed-in customer is then asked once to accept the new version; bookings already
 * made keep the version saved on them. The owner should have the final text reviewed before go-live; it
 * is written for a small catering business under Philippine law, but it is not legal advice.
 */

/**
 * The version customers agree to (a date, "YYYY-MM-DD"); stored on accounts and bookings. 2026-10-10: editing
 * and deleting chat messages (and the earlier text we keep), and the stronger password rule.
 */
export const TERMS_VERSION = '2026-10-10';

/** The same date in words, for "Last updated" at the top of both pages. */
export const TERMS_UPDATED = '10 October 2026';

// "₱3,000"
const pesos = (amount) => `₱${Number(amount).toLocaleString('en-PH')}`;

// One section; empty lists are allowed
const section = (id, heading, paragraphs = [], bullets = []) => ({ id, heading, paragraphs, bullets });

// The business's contact lines, as plain text (no links that open other apps)
const contactLines = () => [
  `${BUSINESS.name}, ${BUSINESS.address}`,
  `Email: ${BUSINESS.email}`,
  `Mobile: ${BUSINESS.phone}`
];

/**
 * The Terms of Service as sections. `minDownpayment` is the current minimum downpayment in pesos (the
 * catalog setting); without it the amount is left out ("the minimum downpayment shown in your quotation").
 */
export function termsOfService({ minDownpayment } = {}) {
  const minimum = minDownpayment ? `the minimum downpayment (currently ${pesos(minDownpayment)})` : 'the minimum downpayment shown in your quotation';
  return [
    section('about', 'About These Terms', [
      `These terms are an agreement between you and ${BUSINESS.name} ("Tres Marias", "we", "us"), a catering business based in ${BUSINESS.address}. They apply when you create an account, send a reservation request, pay, rent equipment or message us through this website.`,
      'By ticking "I agree" when you sign up or send a request, you accept these terms and our Privacy Policy. The contract for each event, which you can open from your reservation, adds the details of that booking (its prices, dates and items). If the contract and these terms say different things about your booking, the contract wins.'
    ]),
    section('account', 'Your Account', [], [
      'You must be at least 18 years old, or have a parent or guardian make the booking for you.',
      'Give your real name, a working email address and mobile number, and keep them up to date. We send sign-up and password codes and booking updates to them.',
      'Choose a password of at least 8 characters with a lowercase and an uppercase letter, a number and a special character (such as ! or -), and keep it to yourself. You are responsible for what is done with your account. If you think someone else has used it, change your password and tell us right away.',
      'We may suspend or close an account that gives false details, sends fake payment proof, abuses our team in the chat, or tries to break or misuse the website.'
    ]),
    section('reservations', 'Reservations', [], [
      'A reservation you send is a request, not a confirmed booking. We review it and send you a quotation, usually within 24 hours. You review the quotation and accept it on your reservation page; accepting it approves your reservation.',
      `Events must be booked at least ${RULES.leadDays} days ahead, for ${RULES.minGuests} to ${RULES.maxGuests} guests, and run ${RULES.minEventHours} to ${RULES.maxEventHours} hours. We keep ${RULES.eventBufferHours} hours free between events for setup and tear-down, and we take a limited number of events each day.`,
      'Until you accept the quotation, your date is not held, so another booking may take it; if that happens, we help you find another date or time. Your date is held for you once you accept the quotation. It is secured once your downpayment is verified; the booking is then confirmed and your contract is final.',
      'A date can be closed by us (for example, a private event). The calendar shows the reason when you tap the date.',
      'To change the date, time, guest count or anything else, use "Request a change" on your reservation or message us. Changes depend on what is still available and may change the price.'
    ]),
    section('messages', 'Messages With Our Team', [], [
      'Use the chat in your account to talk to us about your bookings. Be respectful; the chat is a record of what we discuss.',
      `You can edit or delete a message you typed within ${RULES.messageEditMinutes} minutes of sending it. An edited message is marked "Edited", and a deleted one shows as "This message was deleted" to both you and us. Our team can do the same with the messages they type.`,
      'Messages our system sends, such as quotations, receipts, contracts and notices about your booking, cannot be edited or deleted.',
      'We keep the earlier text of an edited or deleted message as a record of the conversation. Only our team can see it, and we may refer to it if there is a disagreement about your booking. Our Privacy Policy explains how it is kept.'
    ]),
    section('prices', 'Prices and Quotations', [], [
      'A package has a fixed price. A buffet adds a price per person, multiplied by your guest count; the price per person is the one in force when you send your request, so a later price change never affects your booking.',
      'Each package is set up for its default guest count (shown on the package). If you have more guests, the plates, glasses, cutlery, chairs and tables grow with your guest count; we confirm the other items (such as food warmers and waiters) and price the equipment for the extra guests in your quotation. With fewer guests, the package price stays the same.',
      'Additional charges you pick (for example, extra waiters) are priced in the quotation. The quotation you accept is the amount you owe.',
      'If something that affects the price changes before you accept (for example, the guest count), we send a revised quotation and you accept that one instead.',
      'If something that affects the price changes after you accept (for example, the guest count, or damage charges on rented items), we tell you in your chat and send a revised quotation. The new amount applies only from the quotation we send you, never before. If the new total is lower than what you have paid, we return the difference.',
      'Extending the service beyond the agreed end time is charged per hour, as stated in your contract.'
    ]),
    section('payments', 'Payments', [], [
      `To secure your date, pay at least ${minimum}, or the full amount when your total is lower. You choose how much to pay, up to the full amount. The downpayment is due on the date shown on your reservation (about ${RULES.downpaymentDueDays} days after you accept the quotation); the balance is due on or before the event day and can be paid in parts.`,
      'QR Ph: scan the QR code on the Payments page with GCash, Maya or your bank app. The payment is processed by our payment provider, PayMongo, and confirmed automatically. We do not add a fee for it.',
      `Bank transfer: send the amount to our ${BUSINESS.bankName} account shown on the Payments page, then enter the reference number and upload a photo or screenshot of the receipt. Our team checks it, usually within a day.`,
      'Cash: the balance can be paid in cash to our event coordinator on the event day, who records it and gives you an official receipt.',
      'Every verified payment gets a receipt in your Documents.',
      'Payment proof must be real and your own. A receipt that is edited, belongs to someone else or reuses a reference number is rejected, and the reservation may be cancelled.'
    ]),
    section('cancellations', 'Cancellations and Refunds', [], [
      'Before you pay, you can cancel your request online at any time before the event day.',
      `After you pay, you can cancel online during ${cancelWindowText()}, and only before we start preparing. Your reservation shows the exact last day.`,
      'After that, message us in your chat or call us, and we will talk it through with you.',
      'When a paid booking is cancelled, we return what you paid. If we keep any part of it (for example, for food or items already bought for your event), we tell you the amount and the reason in your chat before sending the rest.',
      'Refunds are sent by bank transfer, GCash or cash, and recorded in your account.',
      'If we must cancel (for example, an emergency on our side), we tell you as soon as possible and return everything you paid, or move your event to another date if you agree.'
    ]),
    section('rentals', 'Equipment Rental', [], [
      'Rented items are charged per piece for the whole rental, at the prices shown when you book.',
      `You can pick them up for free at ${RENTAL.pickupAddress}, or have them delivered for our standard fee of ${pesos(RENTAL.deliveryFee)}; a large order may be quoted a different delivery fee.`,
      'Items are counted with you when you receive them and again when they come back. Please use them with care and return them clean and on time.',
      'A piece that comes back damaged or does not come back is charged at its damage fee, shown for each item when you book. Damage charges are added through a revised quotation sent to you.'
    ]),
    section('event-day', 'On the Event Day', [], [
      `Give our team safe access to the venue at least ${RULES.eventBufferHours} hours before the start time for setup, and tell us about parking, gates or building rules in the access notes.`,
      'Tell us about food allergies, vegetarian guests or other needs in your booking. We prepare food with care, but we cannot guarantee a kitchen free of every allergen.',
      'For food safety, leftovers taken home after the service are at your own risk; keep them chilled and eat them soon.',
      'Some services, such as lights and sound, come from partner suppliers we arrange for you.',
      'Loss or damage to our equipment caused by guests is charged at cost.'
    ]),
    section('weather', 'Weather and Events Outside Our Control', [
      'If a typhoon, flood, government order or another event outside anyone\'s control makes it unsafe or impossible to hold the event, we will work with you to move it to another available date. If that is not possible, we settle the payments as stated in your contract and in the cancellation terms above.'
    ]),
    section('liability', 'Our Responsibility', [
      'We are responsible for our food, our equipment and our team, and we will make things right if we fall short. We are not responsible for losses caused by the venue, by guests, or by events outside our control. As far as the law allows, our responsibility for a booking is limited to the amount paid for it.'
    ]),
    section('changes', 'Changes to These Terms', [
      'We may update these terms. The date at the top shows the latest version. When we make an important change, we ask you to read and accept it the next time you open your account. A booking keeps the terms you agreed to when you made it.'
    ]),
    section('law', 'Law and Disputes', [
      'These terms follow the laws of the Republic of the Philippines. If something goes wrong, please message us first; most problems can be solved quickly. If not, the dispute will be settled in the proper courts of Batangas.'
    ]),
    section('contact', 'Contact Us', [], contactLines())
  ];
}

/** The Privacy Policy as sections (Data Privacy Act of 2012, Republic Act No. 10173). */
export function privacyPolicy() {
  return [
    section('about', 'About This Policy', [
      `${BUSINESS.name} ("Tres Marias", "we", "us") respects your privacy. This policy explains what personal information we collect through this website, why, who we share it with, how long we keep it and how we protect it, as required by the Data Privacy Act of 2012 (Republic Act No. 10173), its rules, and the issuances of the National Privacy Commission (NPC).`,
      'We are the personal information controller for the information described here.'
    ]),
    section('collect', 'What We Collect', [], [
      'Account details: your name, email address, mobile number and, if you give it, your company. Your password is stored only in a scrambled form (a hash) that no one, including us, can read.',
      'Event details: the event name and occasion, date and time, guest count, venue address and access notes, your menu choices and food notes (including allergies you tell us about).',
      'Payment details: amounts, payment methods, bank reference numbers and the receipt photos you upload, and the receipts we issue. QR Ph payments are processed by PayMongo; we never see your GCash, Maya or bank login or card details.',
      'Messages and reviews: what you write in the chat with our team (including the earlier text of a message you edit or delete), change requests, and the reviews you send us.',
      'Security records: when you sign in, failed sign-in attempts, and the kind of device and browser used (for example, "Chrome on Windows"), to protect your account.',
      'Browser storage: your browser keeps your sign-in so you stay signed in. We do not use advertising or tracking cookies.'
    ]),
    section('use', 'Why We Use It', [], [
      'To create your account, take your reservation requests, prepare quotations and contracts, and deliver your event or rental (this is needed for our contract with you).',
      'To record payments, issue receipts and keep the records that tax and business laws require.',
      'To send you sign-up and password codes and updates about your bookings by email, and event-day texts to your mobile number.',
      'To keep accounts and payments safe: stopping repeated wrong passwords, fake receipts and other misuse (our legitimate interest).',
      'To keep a true record of what was said in the chat: when you or our team edit or delete a typed message, we keep its earlier text, which only our team can see, in case there is a disagreement about a booking (our legitimate interest).',
      'To show your review on our website, only if you sent one and our team chose to publish it.'
    ]),
    section('share', 'Who We Share It With', [
      'We never sell your personal information or share it for advertising. We share only what is needed with:'
    ], [
      'PayMongo, our payment provider, for QR Ph payments.',
      'The company that sends our emails, to deliver codes and updates to you.',
      'The company that hosts our website and database, which stores the information for us.',
      'Partner suppliers (for example, lights and sound), who receive only the event date, time and place they need to know.',
      'Government offices or courts, when the law requires it.',
      'The public, for a review we publish: your name, your event name, your rating and what you wrote. Nothing else, such as your email, mobile number or event date, is ever shown.'
    ]),
    section('keep', 'How Long We Keep It', [], [
      'Your account, for as long as you keep it. You may ask us to close it.',
      'Bookings, payments, receipts and refunds, for as long as tax and accounting laws require, after which they are deleted or made anonymous.',
      `Sign-up, password and other codes stop working after ${RULES.codeValidMinutes} minutes.`,
      'Chat messages, including the earlier text of edited or deleted messages, for as long as the bookings they belong to are kept.'
    ]),
    section('protect', 'How We Protect It', [], [
      'The website uses an encrypted connection (HTTPS).',
      'Passwords and one-time codes are stored only as hashes. Every password needs at least 8 characters with a lowercase and an uppercase letter, a number and a special character. Admin sign-in needs a password and a code sent by email.',
      'Only our authorised staff can see your bookings and payments, and every change they make to a booking is recorded.',
      'Receipt photos can be seen only by you and our team.',
      'If a breach puts your information at risk, we will tell the National Privacy Commission and you within 72 hours of knowing about it, as the NPC requires.'
    ]),
    section('rights', 'Your Rights', [
      'Under the Data Privacy Act you have the right to:'
    ], [
      'be informed of how your personal information is used;',
      'access it, and get a copy in a common format;',
      'have wrong or outdated information corrected;',
      'object to its use, or ask for it to be blocked or deleted when it is no longer needed or was used unlawfully (records the law requires us to keep are kept until that period ends);',
      'be paid for damages if it was used unlawfully; and',
      'file a complaint with the National Privacy Commission.',
      'To use any of these rights, message us in your account chat or email us. We may ask you to confirm who you are first.'
    ]),
    section('minors', 'Children', [
      'Our accounts are for adults. Events for children (for example, a christening or birthday) are booked by a parent or guardian, who decides what details about the child to share with us.'
    ]),
    section('changes', 'Changes to This Policy', [
      'We may update this policy. The date at the top shows the latest version, and we ask you to accept an important change the next time you open your account.'
    ]),
    section('contact', 'Contact Us', ['For privacy questions or requests, contact our Data Protection Officer:'], contactLines())
  ];
}
