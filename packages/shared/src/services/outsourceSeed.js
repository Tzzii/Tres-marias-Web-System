import { addDays, todayISO } from '../utils/format.js';
import { composeContractText } from './outsourceService.js';

/**
 * Starting outsourcing partners and contracts, used by seed.js.
 *
 * The partners differ on purpose in in how they can be reached — some have both an email address and a
 * mobile number, some only one — because a contract is sent to whatever channels a partner has, with
 * the same text in each. `composeContractText` comes from the service so seeded contracts read exactly
 * like the ones the admin sends.
 */

// Partners as [id, name, service, contact person, email, mobile, address, notes]
// An empty email or mobile means that channel is not available for that partner.
const PARTNERS = [
  ['op-001', 'Batangas Party Rentals', 'Chairs and tables', 'Rico Delgado', 'rentals@batangaspartyrentals.ph', '09171112233', 'Poblacion, Malvar, Batangas', 'Delivers free within Malvar. Chairs are charged per 50 pcs.'],
  ['op-002', 'Aling Nena Chairs and Tables', 'Chairs and tables', 'Nena Ilagan', '', '09183334455', 'San Isidro, Lipa City, Batangas', 'Takes bookings by text only. Confirm a day before pick-up.'],
  ['op-003', 'Malvar Tent Services', 'Tents and canopies', 'Ariel Panganiban', 'malvartents@gmail.com', '09195556677', 'Bagong Pook, Malvar, Batangas', ''],
  ['op-004', 'J and R Lights and Sounds', 'Lights and sound', 'Jomar Reyes', 'jandr.lightsound@gmail.com', '', 'Tanauan City, Batangas', 'Brings its own operator for every booking.'],
  ['op-005', 'Sta. Teresita Linens', 'Linens and covers', 'Divina Marasigan', '', '09207778899', 'Sta. Teresita, Batangas', 'Linens are returned washed within three days.'],
  ['op-006', 'Lipa Chilled Transport', 'Transport', 'Edgar Bautista', 'dispatch@lipachilled.ph', '09218889900', 'Mataas na Kahoy, Batangas', ''],
  ['op-007', 'Bayanihan Event Staff', 'Extra staff', 'Cherry Alvarez', '', '09229990011', 'Balete, Batangas', 'Waiters and dishwashers, minimum of four per booking.']
];

/**
 * Contracts as [id, ref number, partner id, seed reservation key (or '' for none), items,
 * date needed (days from today), amount, status, days since it was drafted, note].
 * `items` is [name, quantity] pairs. The keys in the fourth slot are the ones in seed.js's RES table.
 */
const CONTRACTS = [
  ['oc-001', 1, 'op-001', 'sofia-debut', [['Monobloc chair', 150], ['Round table (10 seats)', 15]], 0, 9500, 'accepted', 9, ''],
  ['oc-002', 2, 'op-004', 'bautista-graduation', [['LED par light', 8], ['Speaker set', 1]], -5, 7000, 'completed', 20, ''],
  ['oc-003', 3, 'op-003', 'mendoza-anniversary', [['Tent 10x20 ft', 2]], 33, 12000, 'sent', 2, ''],
  ['oc-004', 4, 'op-002', 'liam-christening', [['Monobloc chair', 60], ['Round table (10 seats)', 6]], 12, 3800, 'declined', 4, 'Fully booked for that weekend.'],
  ['oc-005', 5, 'op-005', 'lim-thanksgiving', [['Round tablecloth', 12], ['Chair cover', 100]], 18, 4200, 'draft', 1, ''],
  ['oc-006', 6, 'op-007', '', [['Waiter', 6]], 21, 9000, 'sent', 1, ''],
  ['oc-007', 7, 'op-001', 'lola-carmen', [['Monobloc chair', 80]], 0, 2400, 'completed', 14, '']
];

/**
 * Build the outsourcing partners and contracts, and the next contract number.
 * `refs` maps each seed reservation key to its reference, e.g. { 'sofia-debut': 'RES-2026-0916-01' }
 * (the REF map in seed.js); `events` is the reservation list, for the event name, date and venue that
 * go into each contract's text. Timestamps are relative to today.
 */
export function buildOutsourceSeed(refs, events, actor = 'Teresa Marquez') {
  const today = todayISO();
  // Timestamp `offset` days from today at a given hour
  const at = (offset, hour) => {
    const [y, m, d] = addDays(today, offset).split('-').map(Number);
    return new Date(y, m - 1, d, hour).getTime();
  };

  const partners = PARTNERS.map(([id, name, service, contactPerson, email, mobile, address, notes]) => ({
    id,
    name,
    service,
    contactPerson,
    email,
    mobile,
    address,
    notes,
    archived: false,
    history: [{ at: at(-120, 9), actor, text: 'Added as an outsourcing partner.' }]
  }));

  const contracts = CONTRACTS.map(([id, number, partnerId, eventKey, itemPairs, needByOffset, amount, status, draftedDaysAgo, note]) => {
    const partner = partners.find((p) => p.id === partnerId);
    const reservationRef = eventKey ? refs[eventKey] : 'none';
    const reservation = eventKey ? events.find((r) => r.ref === reservationRef) : null;
    const items = itemPairs.map(([name, qty]) => ({ name, qty }));
    const ref = `OUT-${today.slice(0, 4)}-${String(number).padStart(4, '0')}`;
    const needBy = addDays(today, needByOffset);
    const createdAt = at(-draftedDaysAgo, 10);

    // Drafts have not been written out yet; everything else carries the text that went to the partner
    const body =
      status === 'draft'
        ? ''
        : composeContractText({
            ref,
            partner,
            items,
            needBy,
            eventName: reservation ? reservation.eventName : '',
            eventDate: reservation ? reservation.date : '',
            venue: reservation ? `${reservation.venue.name}, ${reservation.venue.city}` : '',
            amount,
            notes: ''
          });
    // Sent an hour after drafting, to every channel that partner has
    const sentAt = status === 'draft' ? null : createdAt + 3600000;
    const channels = [...(partner.email ? ['email'] : []), ...(partner.mobile ? ['sms'] : [])];
    const deliveries = sentAt ? channels.map((channel) => ({ channel, to: channel === 'email' ? partner.email : partner.mobile, at: sentAt, body })) : [];
    // Answered the day after it was sent (accepted, declined and completed contracts only)
    const answeredAt = ['accepted', 'declined', 'completed'].includes(status) ? sentAt + 86400000 : null;

    const history = [{ at: createdAt, actor, text: 'Drafted the contract.' }];
    if (sentAt) {
      const where = deliveries.map((d) => `${d.channel === 'email' ? 'email' : 'SMS'} (${d.to})`).join(' and ');
      history.push({ at: sentAt, actor, text: `Sent the contract by ${where}.` });
    }
    if (status === 'accepted' || status === 'completed') history.push({ at: answeredAt, actor, text: 'Partner accepted the contract.' });
    if (status === 'declined') history.push({ at: answeredAt, actor, text: `Partner declined the contract.${note ? ` Reason: ${note}` : ''}` });
    if (status === 'completed') history.push({ at: at(needByOffset, 18), actor, text: 'Marked delivered and completed.' });

    return {
      id,
      ref,
      partnerId,
      reservationRef,
      items,
      needBy,
      amount,
      notes: '',
      status,
      body,
      deliveries,
      createdAt,
      sentAt,
      answeredAt,
      answerNote: note,
      history
    };
  });

  return { partners, contracts, counter: CONTRACTS.length };
}
