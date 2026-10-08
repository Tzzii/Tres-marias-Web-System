import { DEFAULT_MIN_DOWNPAYMENT, DEFAULT_PRICE_PER_PLATE, RENTAL_SERVICE } from '@tm/shared/src/services/config.js';
import { shiftEndTime } from '@tm/shared/src/domain/availability.js';
import { computeQuote } from '@tm/shared/src/services/pricing.js';
import { makeReservationRef } from '@tm/shared/src/services/reservationRef.js';
import { addDays, formatDate, todayISO } from '@tm/shared/src/utils/format.js';
import { buildInventorySeed } from './inventorySeed.js';
import { buildOutsourceSeed } from './outsourceSeed.js';

/**
 * The sample data the API seeder loads (src/seed.js): `npm run seed:api` loads all of it, and
 * `npm run seed:starter` keeps only the real business data (the catalog, settings and inventory).
 * Event dates are laid out relative to today so the dashboards always have a current picture:
 * events today, requests waiting, payments to verify and a year of completed events.
 *
 * Moved here from packages/shared in Phase 12, when the browser data store was removed: the
 * website no longer ships any sample customer. No password is written here either (the repository
 * is public): the seeder takes the accounts' passwords from apps/api/.env (SEED_ADMIN_PASSWORD,
 * SEED_CUSTOMER_PASSWORD), so these records carry none.
 */

// Items included in a package as [quantity, name]; quantity is null for items without a count (e.g. "Buffet Table")
const items = (list) => list.map(([qty, name]) => ({ qty, name }));

// What every catering package (not the wedding ones) starts with
const BUFFET_BASE = [
  [null, 'Buffet Table'],
  [null, 'Buffet Backdrop']
];

// Tableware, tables and chairs for a catering package set up for `guests` (its default guest count)
const cateringItems = ({ guests, warmers, warmerName, tables, pitchers, jugs, waiters }) =>
  items([
    ...BUFFET_BASE,
    [warmers, warmerName],
    [guests, 'Porcelain Plates'],
    [guests, 'Glasses'],
    [guests, 'Spoons'],
    [guests, 'Forks'],
    [tables, 'Round Tables with Cloth'],
    [guests, 'Chairs'],
    [pitchers, 'Stainless Pitchers'],
    [jugs, 'Water Jug'],
    ...(waiters ? [[waiters, 'Waiters/Dishwashers']] : [])
  ]);

// What both wedding packages include besides their counts
const WEDDING_EXTRAS = [
  [null, 'Goblets for the Presidential Table'],
  [null, 'Presidential Table Full Setup'],
  [null, 'Arc'],
  [null, 'Stage'],
  [null, 'Dove'],
  [null, 'Wine'],
  [null, 'Cake Table'],
  [null, 'Water Table']
];

/**
 * Packages from the Tres Marias price lists. A package is equipment and service only:
 * food is cooked to the customer's request and priced by the admin in the quotation.
 * Packages are not tied to an occasion; any package can be booked for any event.
 * `guests` is the package's default guest count: it helps the customer pick a package, and the
 * booking follows the customer's own count at the same package price. Any package can be booked as a
 * Buffet (food cooked, charged per person) or as Catering only (the equipment on its own).
 *
 * The last one, Equipment Rental (`kind: 'rental'`), has no price, guests or items of its own: the
 * customer picks inventory items and pays each one's rental price per piece. Every other package
 * is `kind: 'package'`.
 */
const PACKAGES = [
  {
    id: 'pkg-mini',
    slug: 'petite',
    name: 'Petite',
    price: 8000,
    guests: 60,
    description: 'A buffet setup with tableware, round tables and chairs for small gatherings of up to 60 guests.',
    items: cateringItems({ guests: 60, warmers: 5, warmerName: 'Food Warmers', tables: 5, pitchers: 2, jugs: 1 }),
    mood: 0
  },
  {
    id: 'pkg-1',
    slug: 'classic',
    name: 'Classic',
    price: 10000,
    guests: 100,
    description: 'A buffet setup with tableware, round tables and chairs for up to 100 guests.',
    items: cateringItems({ guests: 100, warmers: 8, warmerName: 'Food Warmers', tables: 10, pitchers: 4, jugs: 1 }),
    mood: 1
  },
  {
    id: 'pkg-1-waiters',
    slug: 'classic-full-service',
    name: 'Classic Full Service',
    price: 12000,
    guests: 100,
    description: 'Everything in Classic for up to 100 guests, with 2 waiters/dishwashers.',
    items: cateringItems({ guests: 100, warmers: 8, warmerName: 'Food Warmers', tables: 10, pitchers: 4, jugs: 1, waiters: 2 }),
    mood: 1
  },
  {
    id: 'pkg-2',
    slug: 'premier',
    name: 'Premier',
    price: 15000,
    guests: 150,
    description: 'A buffet setup with elegant food warmers, tableware, round tables and chairs for up to 150 guests.',
    items: cateringItems({ guests: 150, warmers: 5, warmerName: 'Elegant Food Warmers', tables: 15, pitchers: 4, jugs: 1 }),
    mood: 2
  },
  {
    id: 'pkg-2-waiters',
    slug: 'premier-full-service',
    name: 'Premier Full Service',
    price: 15000,
    guests: 150,
    description: 'Everything in Premier for up to 150 guests, with 3 waiters/dishwashers.',
    items: cateringItems({ guests: 150, warmers: 5, warmerName: 'Elegant Food Warmers', tables: 15, pitchers: 4, jugs: 1, waiters: 3 }),
    mood: 2
  },
  {
    id: 'pkg-3',
    slug: 'grand',
    name: 'Grand',
    price: 20000,
    guests: 200,
    description: 'A buffet setup with elegant food warmers, tableware, round tables and chairs for up to 200 guests.',
    items: cateringItems({ guests: 200, warmers: 5, warmerName: 'Elegant Food Warmers', tables: 20, pitchers: 6, jugs: 2 }),
    mood: 3
  },
  {
    id: 'pkg-3-waiters',
    slug: 'grand-full-service',
    name: 'Grand Full Service',
    price: 20000,
    guests: 200,
    description: 'Everything in Grand for up to 200 guests, with 4 waiters/dishwashers.',
    items: cateringItems({ guests: 200, warmers: 5, warmerName: 'Elegant Food Warmers', tables: 20, pitchers: 6, jugs: 2, waiters: 4 }),
    mood: 3
  },
  {
    id: 'pkg-wedding-1',
    slug: 'signature-wedding',
    name: 'Signature Wedding',
    price: 25000,
    guests: 150,
    description: 'A full reception setup for up to 150 guests: presidential table, tent, arc, stage, cake and water tables, with 6 waiters/dishwashers.',
    items: items([
      [5, 'Elegant Food Warmers'],
      [150, 'Plates'],
      [150, 'Spoons'],
      [150, 'Forks'],
      [6, 'Trays of Glasses'],
      [150, 'Chairs with Cover'],
      [10, 'Round Tables with Cover'],
      [2, 'Water Jugs'],
      [4, 'Pitchers'],
      [2, 'Dessert Plates'],
      [6, 'Waiters/Dishwashers'],
      [null, 'Tent (20x20)'],
      ...WEDDING_EXTRAS
    ]),
    mood: 3,
    icon: 'favorite'
  },
  {
    id: 'pkg-wedding-2',
    slug: 'royal-wedding',
    name: 'Royal Wedding',
    price: 30000,
    guests: 170,
    description: 'A full reception setup for up to 170 guests: presidential table, a larger tent, arc, stage, cake and water tables, with 8 waiters/dishwashers.',
    items: items([
      [5, 'Elegant Food Warmers'],
      [170, 'Plates'],
      [170, 'Spoons'],
      [170, 'Forks'],
      [8, 'Trays of Glasses'],
      [170, 'Chairs with Cover'],
      [15, 'Round Tables with Cover'],
      [2, 'Water Jugs'],
      [5, 'Pitchers'],
      [4, 'Dessert Plates'],
      [8, 'Waiters/Dishwashers'],
      [null, 'Tent (20x40)'],
      ...WEDDING_EXTRAS
    ]),
    mood: 3,
    icon: 'favorite'
  },
  {
    id: 'pkg-equipment-rental',
    slug: 'equipment-rental',
    name: 'Equipment Rental',
    kind: 'rental',
    price: 0,
    guests: 0,
    description: 'Rent only what you need: tables, chairs, linens, food warmers, tableware, tents and decor, priced per piece. Pick up in Magapi, Malvar, Batangas, or have it delivered.',
    items: [],
    mood: 1,
    icon: 'chair'
  }
].map((pkg) => ({ kind: 'package', icon: 'restaurant', featured: false, visible: true, archived: false, ...pkg }));

/**
 * Additional charges a customer can tick on the reservation form. They start with no price of
 * their own (`price: null`), so each is priced in the quotation until the admin gives it one on
 * the Packages page (Additional charges tab).
 * The Tent comes in sizes: each size is a row of its own pointing at the Tent (`parentId`), counted
 * by the piece, and the customer books the sizes (nestAddons in domain/catalog.js). Sounds and lights
 * and Photographer and videographer are charges with packages (`hasPackages`, "Additional charges with
 * packages" on the admin's Packages page): their packages are rows stored the same way, but the customer
 * picks one, booked once, and each one's description says what it includes. Sizes and packages come
 * last, after every charge, so a charge is always saved before the rows that point at it.
 * The sound packages and their starting prices (the low end of the market price ranges the owner
 * shared on 2026-10-01) are estimates for the owner to confirm; the grand setup and the
 * photo and video packages have no price yet, so they are set in each quotation until the admin adds one.
 */
const ADDONS = [
  { id: 'add-stage', name: 'Stage decoration', description: 'Backdrop and styling for the stage or program area.' },
  { id: 'add-balloons', name: 'Balloon decoration', description: 'Balloon arches, garlands or columns in your motif.' },
  { id: 'add-tent', name: 'Tent', description: 'A tent over the dining area for outdoor venues.' },
  { id: 'add-sounds-lights', name: 'Sounds and lights', description: 'Speakers, microphones and event lighting for the program.', hasPackages: true },
  { id: 'add-host', name: 'Host', description: 'A host or emcee to run the program.' },
  { id: 'add-clown', name: 'Clown', description: 'A clown with games and balloon art for children.' },
  // One charge for both (merged 2026-10-01; there was a separate Videographer before)
  { id: 'add-photographer', name: 'Photographer and videographer', description: 'Event photographer and videographer, with edited photos and a highlights video after the event.', hasPackages: true },
  // The only charge counted by the piece: the customer says how many, and the admin prices one of them
  { id: 'add-waiters', name: 'Waiter/Dishwasher', description: 'Extra waiters or dishwashers on top of what your package includes.', hasQuantity: true },
  // The Tent's sizes, priced per piece once the admin sets them
  // Each books its tent in the inventory (inventorySeed.js ADDON_LINKS), so a booking holds it on the date
  { id: 'add-tent-10x10', parentId: 'add-tent', name: '10 × 10', description: '', hasQuantity: true },
  { id: 'add-tent-10x20', parentId: 'add-tent', name: '10 × 20', description: '', hasQuantity: true },
  { id: 'add-tent-20x20', parentId: 'add-tent', name: '20 × 20', description: '', hasQuantity: true },
  { id: 'add-tent-20x40', parentId: 'add-tent', name: '20 × 40', description: '', hasQuantity: true },
  // The sound packages, smallest first
  {
    id: 'add-sound-basic',
    parentId: 'add-sounds-lights',
    name: 'Basic sound system',
    price: 3500,
    description: '2 active speakers with stands\nAudio mixer\nLaptop or music player\n2 microphones (wired or wireless)'
  },
  {
    id: 'add-sound-lights',
    parentId: 'add-sounds-lights',
    name: 'Basic lights and sounds',
    price: 5000,
    description: '2 powered speakers\n8 to 12 stage or backdrop lights on T-bar stands\nAudio mixer and 2 microphones\nAn operator for 4 to 5 hours'
  },
  {
    id: 'add-sound-full',
    parentId: 'add-sounds-lights',
    name: 'Medium / full package',
    price: 8000,
    description: 'Everything in Basic lights and sounds\nSubwoofers and moving head lights\nDMX lighting controller\nFog or smoke machine\nAn on-site technician'
  },
  {
    id: 'add-sound-grand',
    parentId: 'add-sounds-lights',
    name: 'Grand / corporate / wedding setup',
    description: 'For large venues: full band equipment, heavy trusses, LED walls and a large generator'
  },
  // The photo and video packages
  {
    id: 'add-photo-only',
    parentId: 'add-photographer',
    name: 'Photos only',
    description: 'A photographer for the whole event\nAll edited photos, sent online after the event'
  },
  {
    id: 'add-video-only',
    parentId: 'add-photographer',
    name: 'Video only',
    description: 'A videographer for the whole event\nA 3 to 5 minute highlights video after the event'
  },
  {
    id: 'add-photo-video',
    parentId: 'add-photographer',
    name: 'Photos and video',
    description: 'A photographer and a videographer for the whole event\nAll edited photos and a highlights video after the event'
  }
].map((addon) => ({ parentId: null, price: null, hasQuantity: false, hasPackages: false, archived: false, ...addon }));

/**
 * The dishes the admin offers, grouped by the four categories a buffet menu is built from.
 * A buffet takes exactly one dish from each category; the admin adds, renames and archives
 * them on the Packages page. Every dish costs the same, because a buffet is charged per person.
 */
const DISHES = [
  ['pork', [
    ['lechon-kawali', 'Lechon Kawali'],
    ['crispy-pata', 'Crispy Pata'],
    ['menudo', 'Pork Menudo'],
    ['bbq', 'Pork Barbecue'],
    ['adobo-gata', 'Pork Adobo sa Gata'],
    ['humba', 'Pork Humba'],
    ['sisig', 'Pork Sisig']
  ]],
  ['chicken', [
    ['inasal', 'Chicken Inasal'],
    ['cordon-bleu', 'Chicken Cordon Bleu'],
    ['fried', 'Crispy Fried Chicken'],
    ['adobo', 'Chicken Adobo'],
    ['relleno', 'Chicken Relleno'],
    ['afritada', 'Chicken Afritada'],
    ['buffalo', 'Buffalo Chicken Wings'],
    ['teriyaki', 'Chicken Teriyaki']
  ]],
  ['fish', [
    ['fillet-tartar', 'Fish Fillet with Tartar Sauce'],
    ['fillet-lemon', 'Fish Fillet in Lemon Butter'],
    ['escabeche', 'Fish Escabeche'],
    ['grilled-tilapia', 'Grilled Tilapia'],
    ['sinigang-hipon', 'Sinigang na Hipon'],
    ['baked-scallops', 'Baked Scallops'],
    ['tahong', 'Cheesy Baked Tahong']
  ]],
  ['vegetable', [
    ['chopsuey', 'Chopsuey'],
    ['kare-kare', 'Kare-Kare'],
    ['buttered', 'Buttered Mixed Vegetables'],
    ['lumpiang-gulay', 'Lumpiang Gulay'],
    ['pinakbet', 'Pinakbet'],
    ['laing', 'Laing']
  ]]
].flatMap(([category, list]) => list.map(([slug, name]) => ({ id: `dish-${category}-${slug}`, category, name, archived: false })));

// The dish name behind a slug, e.g. ('pork', 'lechon-kawali') -> 'Lechon Kawali'
const named = (category, slug) => {
  const dish = DISHES.find((d) => d.id === `dish-${category}-${slug}`);
  return dish ? dish.name : slug;
};

/**
 * Short form for a menu row: the four dish slugs, in category order (pork, chicken, fish, vegetable).
 * A menu line is stored as the text the customer wrote, not as a dish id, so these are turned into
 * names here. A line can name more than one dish - pass an array to get "A and B".
 */
const menu = (pork, chicken, fish, vegetable) => {
  const line = (category, slug) => (Array.isArray(slug) ? slug.map((one) => named(category, one)).join(' and ') : named(category, slug));
  return {
    pork: line('pork', pork),
    chicken: line('chicken', chicken),
    fish: line('fish', fish),
    vegetable: line('vegetable', vegetable)
  };
};

/** The buffet menu each sample reservation ordered, by the row key used in the RES table below. */
const MENUS = {
  'santos-wedding': menu(['lechon-kawali', 'crispy-pata'], 'relleno', 'escabeche', 'chopsuey'),
  'lola-carmen': menu('menudo', 'inasal', 'fillet-lemon', 'chopsuey'),
  'santos-christmas': menu('adobo-gata', 'cordon-bleu', 'escabeche', 'buttered'),
  'sofia-debut': menu('bbq', 'cordon-bleu', 'fillet-lemon', 'buttered'),
  'cruz-wedding': menu('crispy-pata', 'inasal', 'escabeche', 'kare-kare'),
  'villanueva-yearend': menu('crispy-pata', 'inasal', 'grilled-tilapia', 'kare-kare'),
  'liam-christening': menu('bbq', 'fried', 'fillet-tartar', 'lumpiang-gulay'),
  'mendoza-anniversary': menu('humba', 'relleno', 'sinigang-hipon', 'buttered'),
  'bautista-graduation': menu('bbq', 'fried', 'fillet-tartar', 'lumpiang-gulay'),
  'aquino-seminar': menu('menudo', 'inasal', 'escabeche', 'buttered'),
  'ramos-reunion': menu('lechon-kawali', 'afritada', 'grilled-tilapia', 'kare-kare'),
  'villanueva-townhall': menu('bbq', 'inasal', 'fillet-tartar', 'chopsuey'),
  'aquino-anniversary': menu('humba', 'cordon-bleu', 'baked-scallops', 'buttered'),
  'rhea-sister-debut': menu('bbq', 'fried', 'fillet-tartar', 'lumpiang-gulay'),
  'cruz-engagement': menu('crispy-pata', 'adobo', 'sinigang-hipon', 'kare-kare'),
  'tabra-birthday': menu('sisig', 'buffalo', 'fillet-tartar', 'buttered'),
  'tabra-reunion': menu('lechon-kawali', 'afritada', 'grilled-tilapia', 'chopsuey'),
  'tabra-teambuilding': menu('humba', 'teriyaki', 'fillet-lemon', 'lumpiang-gulay'),
  'althea-christening': menu('bbq', 'fried', 'fillet-tartar', 'lumpiang-gulay'),
  'tabra-anniversary': menu('humba', 'relleno', 'grilled-tilapia', 'buttered'),
  'tabra-graduation': menu('bbq', 'afritada', 'tahong', 'chopsuey'),
  'tabra-christmas': menu('humba', 'cordon-bleu', 'escabeche', 'buttered'),
  'jhen-debut': menu('humba', 'cordon-bleu', 'fillet-tartar', 'buttered'),
  'tabra-company-anniversary': menu('menudo', 'inasal', 'escabeche', 'chopsuey'),
  'tabra-outing': menu('bbq', 'adobo', 'fillet-tartar', 'chopsuey')
};

/** Rows booked as Catering only: the equipment on its own, no menu and no per-person charge. */
const SERVICE_ONLY = new Set(['lim-thanksgiving', 'mendoza-outing', 'paolo-engagement']);

/** What a Catering only customer wrote instead of a menu. */
const SERVICE_ONLY_NOTE = 'We are cooking the food ourselves. We only need the equipment and the setup.';

/** How many of a by-the-piece additional charge a row asked for, e.g. four extra waiters or two 10 × 20 tents. */
const ADDON_QTY = { 'villanueva-yearend': { 'add-tent-10x20': 2, 'add-waiters': 4 }, 'villanueva-townhall': { 'add-tent-10x10': 2 } };

// Customers as [id, name, email, mobile, days since joining]. Their password is SEED_CUSTOMER_PASSWORD (src/seed.js).
const CUSTOMERS = [
  ['cus-001', 'Maria Santos', 'maria.santos@gmail.com', '09171234567', 420],
  ['cus-002', 'Jose Ramos', 'jose.ramos@yahoo.com', '09182345678', 400],
  ['cus-003', 'Angela Cruz', 'angela.cruz@gmail.com', '09193456789', 150],
  ['cus-004', 'Mark Villanueva', 'mark.villanueva@villanuevalogistics.ph', '09204567890', 260],
  ['cus-005', 'Patricia Lim', 'patricia.lim@gmail.com', '09215678901', 90],
  ['cus-006', 'Carlo Mendoza', 'carlo.mendoza@outlook.com', '09226789012', 130],
  ['cus-007', 'Rhea Bautista', 'rhea.bautista@gmail.com', '09237890123', 360],
  ['cus-008', 'Daniel Aquino', 'daniel.aquino@gmail.com', '09248901234', 240],
  // Demo account: one customer with every reservation, payment, chat and review situation
  ['cus-009', 'Jherson Gabrial Tabra', 'jherson.tabra@gmail.com', '09259012345', 330]
];

/** Build the complete starting data set. All dates are relative to today. */
export function buildSeed() {
  const T = todayISO();
  // Date `offset` days from today, e.g. day(-2) = two days ago
  const day = (offset) => addDays(T, offset);
  // Timestamp for a day offset at a given time
  const at = (offset, hour = 10, minute = 0) => {
    const [y, m, d] = day(offset).split('-').map(Number);
    return new Date(y, m - 1, d, hour, minute).getTime();
  };

  const pkgById = Object.fromEntries(PACKAGES.map((p) => [p.id, p]));

  // Prices the admin put on each additional charge in the sample quotations.
  // 'add-waiters' and the tent sizes are counted by the piece, so their amount is the price of ONE.
  const ADDON_PRICES = {
    'add-stage': 8000,
    'add-balloons': 4500,
    'add-tent-10x10': 4500,
    'add-tent-10x20': 7000,
    'add-sounds-lights': 12000,
    'add-host': 6000,
    'add-clown': 4000,
    'add-photographer': 23500,
    'add-waiters': 800
  };

  // The sample customers, without passwords (the seeder gives each one SEED_CUSTOMER_PASSWORD)
  const customers = CUSTOMERS.map(([id, name, email, mobile, joinedDaysAgo]) => ({
    id,
    name,
    email,
    mobile,
    createdAt: at(-joinedDaysAgo, 9),
    company: id === 'cus-004' ? 'Villanueva Logistics Inc.' : ''
  }));

  // The owner's admin account, without a password (the seeder gives it SEED_ADMIN_PASSWORD)
  const admins = [
    {
      id: 'adm-001',
      name: 'Wilma W. Cabiscuelas',
      email: 'emmamariaobet@gmail.com',
      mobile: '09515621060',
      role: 'Administrator',
      createdAt: at(-420, 9),
      passwordChangedAt: at(-60, 10)
    }
  ];

  let receiptSeq = 1040; // next receipt number
  const payments = [];
  // A PayMongo payment id for the n-th sample payment, e.g. "pay_Hq3xK…" (24 letters and digits, the same
  // every time the seed is built): the reference of a GCash QR payment
  const PAYMONGO_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const payMongoId = (n) => {
    let x = ((n + 1) * 7919) % 2147483647;
    let id = '';
    for (let i = 0; i < 24; i++) {
      x = (x * 48271) % 2147483647; // small enough to stay exact in a JS number
      id += PAYMONGO_CHARS[x % PAYMONGO_CHARS.length];
    }
    return `pay_${id}`;
  };
  // Add a payment record; verified payments get a receipt number. Cash is recorded by the admin on the
  // spot and a GCash QR ('qrph') is confirmed by PayMongo the moment it is paid (both verified at once,
  // with no proof); bank transfers come with a photo of the receipt and are verified the next morning.
  // Rejected ones keep the reason.
  const pay = (ref, customerId, amount, kind, method, offset, status = 'verified', extra = {}) => {
    const id = `pay-${String(payments.length + 1).padStart(4, '0')}`;
    const instant = method === 'cash' || method === 'qrph';
    payments.push({
      id,
      ref,
      customerId,
      amount,
      kind,
      method,
      referenceNo: method === 'cash' ? '' : method === 'qrph' ? payMongoId(payments.length) : extra.referenceNo || `${1000 + payments.length * 37} ${4400 + payments.length * 91} ${310 + payments.length}`,
      proofName: instant ? '' : extra.proofName || `bank-receipt-${ref.toLowerCase()}.jpg`,
      status,
      submittedAt: at(offset, 14, 20),
      verifiedAt: status === 'verified' ? (instant ? at(offset, 14, 20) : at(offset + 1, 10, 5)) : null,
      receiptNo: status === 'verified' ? `OR-${receiptSeq++}` : '',
      rejectReason: extra.rejectReason || ''
    });
  };

  /**
   * [key, customerId, eventName, occasion, dateOffset, start, guests, packageId,
   *  status, createdOffset, addonIds, venue, food notes, extras]
   * The buffet menu, the service type and any add-on quantities come from MENUS, SERVICE_ONLY
   * and ADDON_QTY above, keyed by `key`, so the rows stay one line of reading each.
   * `key` is a short name used only inside this file; the real reference (RES-YYYY-MMDD-NN) is built from the event date below.
   * The occasion and the package are independent: e.g. a corporate event can use Classic.
   * Extras: quoted, dueOffset, paidFull (balanceMethod: 'cash' = paid on the event day), paidHalf,
   * rejected { amount share, method, offset, reason }, awaiting { referenceNo, proofName, method },
   * declineReason, cancelReason, accessNotes, notes.
   * Rows for new customers go at the end so existing references, payment ids and receipt numbers stay the same.
   */
  const RES = [
    ['santos-wedding', 'cus-001', 'Santos–Reyes Wedding Reception', 'Wedding', 26, '18:00', 180, 'pkg-wedding-2', 'pending', -2,
      ['add-stage', 'add-balloons'], ['The Glass Garden', '1 Ortigas Avenue Extension', 'Pasig City'],
      'Lechon kawali, chicken relleno, beef caldereta, pancit bihon, steamed rice, leche flan and iced tea. Vegetarian chopsuey for 12 guests.', { quoted: true }],
    ['lola-carmen', 'cus-001', "Lola Carmen's 80th Birthday", 'Birthday', 0, '11:00', 80, 'pkg-1-waiters', 'confirmed', -48,
      [], ['Santos Residence', '27 Mabini Street, Barangay Kapitolyo', 'Pasig City'],
      'Pancit canton, pork menudo, chicken inasal, steamed rice, buko pandan and sago’t gulaman. Soft food for the elders.', { paidFull: true, accessNotes: true }],
    ['santos-christmas', 'cus-001', 'Santos Family Christmas Reunion', 'Reunion', -268, '17:00', 120, 'pkg-2', 'completed', -320,
      [], ['Kapitolyo Clubhouse', 'Brixton Street', 'Pasig City'],
      'Hamon, pork adobo sa gata, chicken cordon bleu, pancit bihon, rice and fruit salad.', { paidFull: true, accessNotes: true }],
    ['sofia-debut', 'cus-002', "Sofia's 18th Debut", 'Debut', 0, '18:00', 150, 'pkg-2-waiters', 'downpayment_paid', -35,
      ['add-stage', 'add-balloons'], ['Casa Ibarra Events Place', '45 Tomas Morato Avenue', 'Quezon City'],
      'Chicken cordon bleu, beef salpicao, fish fillet in lemon butter, carbonara, rice, mango float and four seasons juice.', { paidHalf: true }],
    ['cruz-wedding', 'cus-003', 'Cruz–Dela Rosa Wedding', 'Wedding', 48, '16:00', 220, 'pkg-wedding-2', 'pending', -1,
      ['add-balloons'], ['Fernwood Gardens', 'Commonwealth Avenue', 'Quezon City'],
      'Still deciding. We would like Filipino favourites for the mains and two desserts.', {}],
    ['villanueva-yearend', 'cus-004', 'Villanueva Logistics Year-End Party', 'Corporate', 95, '19:00', 300, 'pkg-3-waiters', 'pending', 0,
      ['add-tent-10x20', 'add-waiters'], ['Villanueva Logistics Warehouse Hall', '12 Sampaguita Road, Parañaque', 'Parañaque City'],
      'Crispy pata, kare-kare, chicken inasal, pancit canton, rice, leche flan and iced tea.', {}],
    ['liam-christening', 'cus-005', "Baby Liam's Christening", 'Christening', 12, '12:00', 60, 'pkg-mini', 'approved', -9,
      [], ['San Antonio de Padua Parish Hall', 'Forbes Park', 'Makati City'],
      'Spaghetti, fried chicken, lumpiang shanghai, rice and maja blanca.', { quoted: true, awaiting: { referenceNo: 'BPI-IB-5021-8843', proofName: 'BPI-Receipt-Liam-Christening.jpg' }, dueOffset: 4 }],
    ['mendoza-anniversary', 'cus-006', 'Mendoza 25th Wedding Anniversary', 'Anniversary', 33, '18:30', 120, 'pkg-2', 'confirmed', -30,
      ['add-balloons'], ['Mendoza Residence', '8 Acacia Lane, Ayala Alabang', 'Muntinlupa City'],
      'Roast beef with mushroom gravy, chicken relleno, sinigang na hipon, rice and sans rival.', { paidHalf: true, accessNotes: true }],
    ['mendoza-outing', 'cus-006', 'Mendoza Company Team Outing', 'Corporate', 20, '10:00', 90, 'pkg-1', 'declined', -6,
      [], ['Caliraya Lakeside Resort', 'Lumban', 'Laguna'],
      'Packed-style lunch: chicken adobo, rice and banana.', { declineReason: 'The venue is outside our service area for groups under 150 guests. We would be glad to cater an event within Metro Manila.' }],
    ['lim-thanksgiving', 'cus-005', 'Lim Family Thanksgiving Lunch', 'Reunion', 18, '11:30', 100, 'pkg-1-waiters', 'approved', -16,
      [], ['Lim Residence', '19 Banuyo Street, San Lorenzo Village', 'Makati City'],
      'Beef caldereta, fish fillet, chopsuey, rice, cassava cake and calamansi juice.', { quoted: true, dueOffset: -3 }],
    ['bautista-graduation', 'cus-007', 'Bautista Graduation Party', 'Graduation', -5, '17:00', 70, 'pkg-1', 'completed', -52,
      [], ['Bautista Residence', '5 Jasmine Street, Tahanan Village', 'Parañaque City'],
      'Pork barbecue, pancit bihon, lumpiang shanghai, rice and buko pandan.', { paidFull: true, accessNotes: true }],
    ['aquino-seminar', 'cus-008', 'Aquino & Co. Seminar Lunch', 'Corporate', -40, '12:00', 90, 'pkg-1-waiters', 'completed', -80,
      [], ['Aquino & Co. Training Center', '3F Salcedo Tower, Salcedo Village', 'Makati City'],
      'Chicken inasal, pork menudo, rice, fruit cup and iced tea. Coffee in the afternoon.', { paidFull: true, accessNotes: true }],
    ['ramos-reunion', 'cus-002', 'Ramos Family Reunion', 'Reunion', -120, '11:00', 100, 'pkg-1', 'completed', -170,
      [], ['Ramos Ancestral House', '14 General Luna Street', 'Marikina City'],
      'Lechon kawali, kare-kare, pancit canton, rice and leche flan.', { paidFull: true, accessNotes: true }],
    ['villanueva-townhall', 'cus-004', 'Villanueva Logistics Q2 Town Hall', 'Corporate', -150, '09:00', 250, 'pkg-3-waiters', 'completed', -190,
      ['add-tent-10x10'], ['Villanueva Logistics Warehouse Hall', '12 Sampaguita Road, Parañaque', 'Parañaque City'],
      'Breakfast: tapsilog and longsilog. Lunch: chicken inasal, pancit, rice. Coffee station all day.', { paidFull: true, accessNotes: true }],
    ['aquino-anniversary', 'cus-008', 'Aquino 10th Wedding Anniversary', 'Anniversary', -200, '18:00', 110, 'pkg-2', 'completed', -240,
      ['add-stage'], ['Blue Leaf Pavilion', 'McKinley Hill', 'Taguig City'],
      'Beef salpicao, baked scallops, chicken cordon bleu, rice and mango float.', { paidFull: true, accessNotes: true }],
    ['rhea-sister-debut', 'cus-007', "Rhea's Sister's 18th Debut", 'Debut', -330, '18:00', 160, 'pkg-3', 'completed', -360,
      ['add-balloons'], ['Bautista Residence', '5 Jasmine Street, Tahanan Village', 'Parañaque City'],
      'Carbonara, fried chicken, pork barbecue, lumpiang shanghai, rice and ube halaya.', { paidFull: true, accessNotes: true }],
    ['cruz-engagement', 'cus-003', 'Cruz Engagement Dinner', 'Other', -75, '19:00', 60, 'pkg-mini', 'completed', -110,
      [], ['The Cruz Residence', '22 Rosal Street, Loyola Heights', 'Quezon City'],
      'Kare-kare, crispy pata, sinigang na hipon, rice and sans rival.', { paidFull: true, accessNotes: true }],

    // Jherson Gabrial Tabra (demo account): one event for every situation a customer can be in
    ['tabra-birthday', 'cus-009', "Jherson's 21st Birthday Celebration", 'Birthday', 60, '18:00', 90, 'pkg-1', 'pending', -1,
      ['add-balloons'], ['Tabra Residence', '31 Kamagong Street, Barangay San Antonio', 'Pasig City'],
      'Pork sisig, chicken buffalo wings, baked macaroni, garlic rice, graham float and red iced tea.',
      { notes: 'Wants a photo corner with the balloon setup. Ask about the venue parking before quoting.' }],
    ['tabra-reunion', 'cus-009', 'Tabra Family Reunion', 'Reunion', 15, '11:00', 140, 'pkg-2', 'approved', -14,
      [], ['Tabra Ancestral House', '8 Rizal Street, Poblacion', 'Taytay, Rizal'],
      'Lechon belly, pancit malabon, chicken afritada, steamed rice, buko salad and sago’t gulaman.', { quoted: true, dueOffset: -2 }],
    ['tabra-teambuilding', 'cus-009', 'Tabra Printing Co. Team Building Lunch', 'Corporate', 24, '12:00', 80, 'pkg-1-waiters', 'approved', -10,
      [], ['Tabra Printing Co. Office', '2F Cambridge Building, Shaw Boulevard', 'Mandaluyong City'],
      'Chicken teriyaki, beef broccoli, vegetable spring rolls, steamed rice and fruit salad.',
      {
        quoted: true,
        dueOffset: 5,
        rejected: { method: 'bank', offset: -4, reason: 'The reference number does not match any transfer in our bank account.' },
        awaiting: { method: 'bank', referenceNo: 'BDO-20260917-3381', proofName: 'BDO-Transfer-Tabra-Team-Building.jpg' }
      }],
    ['althea-christening', 'cus-009', "Baby Althea's Christening", 'Christening', 9, '11:00', 55, 'pkg-mini', 'downpayment_paid', -25,
      [], ['Our Lady of the Abandoned Parish Hall', 'Santa Ana', 'Manila'],
      'Spaghetti, crispy fried chicken, lumpiang shanghai, steamed rice and maja blanca.', { paidHalf: true }],
    ['tabra-anniversary', 'cus-009', "Mama and Papa Tabra's 25th Anniversary", 'Anniversary', 38, '18:30', 150, 'pkg-2-waiters', 'confirmed', -30,
      ['add-stage'], ['Villa Caceres Events Place', '15 Ortigas Avenue', 'Cainta, Rizal'],
      'Roast beef with gravy, chicken galantina, grilled tilapia, steamed rice, leche flan and four seasons juice.', { paidHalf: true, accessNotes: true }],
    ['tabra-graduation', 'cus-009', "Jherson's College Graduation Party", 'Graduation', 5, '17:00', 70, 'pkg-1', 'confirmed', -40,
      [], ['Tabra Residence', '31 Kamagong Street, Barangay San Antonio', 'Pasig City'],
      'Pork barbecue, pancit canton, cheesy baked tahong, steamed rice and buko pandan.', { paidFull: true, accessNotes: true }],
    ['tabra-christmas', 'cus-009', 'Tabra Barkada Christmas Party', 'Other', -270, '19:00', 110, 'pkg-2', 'completed', -300,
      [], ['Kamagong Covered Court', 'Kamagong Street, Barangay San Antonio', 'Pasig City'],
      'Hamon, pork humba, chicken cordon bleu, pancit bihon, steamed rice and fruit salad.', { paidFull: true, balanceMethod: 'cash', accessNotes: true }],
    ['jhen-debut', 'cus-009', "Jhen's 18th Debut", 'Debut', -180, '18:00', 180, 'pkg-3-waiters', 'completed', -220,
      ['add-stage', 'add-balloons'], ['The Garden Pavilion', 'Frontera Verde, Ortigas Avenue', 'Pasig City'],
      'Beef salpicao, chicken cordon bleu, fish fillet in tartar sauce, carbonara, steamed rice, mango float and iced tea.', { paidFull: true, accessNotes: true }],
    ['tabra-company-anniversary', 'cus-009', 'Tabra Printing Co. 5th Anniversary', 'Corporate', -20, '17:30', 90, 'pkg-1-waiters', 'completed', -60,
      [], ['Tabra Printing Co. Office', '2F Cambridge Building, Shaw Boulevard', 'Mandaluyong City'],
      'Chicken inasal, pork menudo, pancit bihon, steamed rice, cassava cake and calamansi juice.', { paidFull: true, accessNotes: true }],
    ['tabra-outing', 'cus-009', 'Tabra Summer Outing', 'Other', 28, '09:00', 60, 'pkg-mini', 'declined', -5,
      [], ['Pansol Hot Spring Resort', 'Pansol', 'Calamba, Laguna'],
      'Packed breakfast and lunch: longganisa, fried rice, chicken adobo and banana.',
      { declineReason: 'Our crew is already committed to another event on that date, and the resort is outside our usual service area. We would be glad to cater a different date within Metro Manila or Rizal.' }],
    ['paolo-engagement', 'cus-009', "Kuya Paolo's Engagement Party", 'Other', 52, '19:00', 50, 'pkg-mini', 'cancelled', -20,
      [], ['Tabra Residence', '31 Kamagong Street, Barangay San Antonio', 'Pasig City'],
      'Kare-kare, crispy pata, steamed rice and ube halaya.', { cancelReason: 'The couple moved the engagement party to next year.' }]
  ];

  // Reference for each seed key, e.g. REF['lola-carmen'] -> "RES-2026-0915-01". Built in table order,
  // so two seed events on the same date get -01 and -02, the same way new bookings are numbered.
  const REF = {};
  RES.forEach(([key, , , , dateOffset]) => {
    REF[key] = makeReservationRef(day(dateOffset), Object.values(REF));
  });

  // Turn each RES row into a full reservation: quotation, activity history and payments
  const reservations = RES.map(
    ([key, customerId, eventName, occasion, dateOffset, startTime, guests, packageId, status, createdOffset, addonIds, venue, foodNotes, extra]) => {
      const ref = REF[key];
      const pkg = pkgById[packageId];
      // Catering only is the equipment on its own; every other row is a buffet with a four-dish menu
      const serviceType = SERVICE_ONLY.has(key) ? 'Catering only' : 'Buffet and Catering';
      const buffetMenu = serviceType === 'Buffet and Catering' ? MENUS[key] : null;
      const addonQty = ADDON_QTY[key] || {};
      // What every quote for this row shares. The buffet is charged per person, so the food price
      // is already known before the admin sends anything; only the add-on prices are still missing.
      const quoteBase = { pkg, serviceType, guests, pricePerPlate: DEFAULT_PRICE_PER_PLATE, addonIds, addonQty };
      const estimate = computeQuote(quoteBase);
      const hasQuote = extra.quoted || !['pending', 'declined'].includes(status);
      const discount = status === 'completed' && guests >= 150 ? 2000 : 0;
      const quotation = hasQuote
        ? {
            ...computeQuote({
              ...quoteBase,
              addonPrices: ADDON_PRICES,
              discount
            }),
            otherLabel: '',
            sentAt: at(createdOffset + 1, 15),
            note: ''
          }
        : null;
      const total = quotation ? quotation.net : estimate.net;
      const customer = customers.find((c) => c.id === customerId);

      const activity = [{ at: at(createdOffset, 20, 15), actor: customer.name, text: 'Submitted the reservation request.' }];
      if (quotation) activity.push({ at: quotation.sentAt, actor: 'Wilma W. Cabiscuelas', text: `Sent the quotation (${'₱' + total.toLocaleString('en-PH')}).` });
      if (!['pending', 'declined'].includes(status)) {
        activity.push({ at: at(createdOffset + 1, 15, 30), actor: 'Wilma W. Cabiscuelas', text: 'Approved the reservation.' });
      }
      if (status === 'declined') {
        activity.push({ at: at(createdOffset + 1, 11), actor: 'Wilma W. Cabiscuelas', text: 'Declined the reservation.' });
      }

      const downpaymentDue =
        extra.dueOffset !== undefined
          ? day(extra.dueOffset)
          : !['pending', 'declined'].includes(status)
            ? day(Math.min(createdOffset + 8, dateOffset - 3))
            : null;

      // A payment the admin turned down (the customer then sends it again, see `awaiting`)
      if (extra.rejected) {
        const { method, offset, reason } = extra.rejected;
        pay(ref, customerId, Math.round(total / 2), 'downpayment', method, offset, 'rejected', { rejectReason: reason });
        activity.push({ at: at(offset + 1, 10, 5), actor: 'Wilma W. Cabiscuelas', text: `Rejected a payment of ₱${Math.round(total / 2).toLocaleString('en-PH')}. Reason: ${reason}` });
      }
      if (extra.paidFull) {
        pay(ref, customerId, Math.round(total / 2), 'downpayment', 'qrph', createdOffset + 4);
        // The balance is paid by bank a few days before, or in cash to the coordinator on the event day
        if (extra.balanceMethod === 'cash') pay(ref, customerId, total - Math.round(total / 2), 'balance', 'cash', dateOffset);
        else pay(ref, customerId, total - Math.round(total / 2), 'balance', 'bank', Math.min(dateOffset - 3, -3));
      } else if (extra.paidHalf) {
        pay(ref, customerId, Math.round(total / 2), 'downpayment', 'bank', createdOffset + 5);
      } else if (extra.awaiting) {
        const { method = 'bank', referenceNo, proofName } = extra.awaiting;
        pay(ref, customerId, Math.round(total / 2), 'downpayment', method, -1, 'awaiting', { referenceNo, proofName });
      }

      const myPayments = payments.filter((p) => p.ref === ref && p.status === 'verified');
      // A GCash QR payment is confirmed by PayMongo, everything else by the admin
      myPayments.forEach((p) =>
        activity.push({ at: p.verifiedAt, actor: p.method === 'qrph' ? 'PayMongo' : 'Wilma W. Cabiscuelas', text: `Verified a ${p.kind} payment of ₱${p.amount.toLocaleString('en-PH')} (${p.receiptNo}).` })
      );
      if (['confirmed', 'completed'].includes(status)) {
        activity.push({ at: at(createdOffset + 7, 9, 40), actor: 'Wilma W. Cabiscuelas', text: 'Confirmed the booking.' });
      }
      if (status === 'completed') {
        activity.push({ at: at(dateOffset, 23, 0), actor: 'Wilma W. Cabiscuelas', text: 'Marked the event as completed.' });
      }
      if (status === 'cancelled') {
        activity.push({ at: at(createdOffset + 6, 19, 10), actor: customer.name, text: `Cancelled the reservation. Reason: ${extra.cancelReason}` });
      }
      activity.sort((a, b) => a.at - b.at);

      return {
        ref,
        customerId,
        eventName,
        occasion,
        date: day(dateOffset),
        startTime,
        // Every sample event runs 4 hours (e.g. 6:00 pm – 10:00 pm); the owner's events run 2 to 6
        endTime: shiftEndTime('00:00', '04:00', startTime),
        guests,
        packageId,
        serviceType,
        menu: buffetMenu,
        foodNotes: serviceType === 'Buffet and Catering' ? foodNotes : SERVICE_ONLY_NOTE,
        // The rate this booking was made at, so re-quoting it never picks up a newer price
        pricePerPlate: DEFAULT_PRICE_PER_PLATE,
        // The minimum downpayment in force when it was made (the least to pay first); a later change leaves it alone
        minDownpayment: DEFAULT_MIN_DOWNPAYMENT,
        venue: { name: venue[0], address: venue[1], city: venue[2], accessNotes: extra.accessNotes ? 'Service entrance at the side gate. Parking for the catering van is available.' : '' },
        addonIds,
        addonQty,
        status,
        estimate,
        quotation,
        downpaymentDue,
        // When the admin marked "Started preparing" (none in the seed)
        preparingAt: null,
        // Admin's private notes: from the row, or the sample note on the Santos wedding
        notes: extra.notes || (status === 'pending' && key === 'santos-wedding' ? 'Couple asked for a vegetarian option for 12 guests.' : ''),
        declineReason: extra.declineReason || '',
        cancelReason: extra.cancelReason || '',
        // Who cancelled: the seeded cancellation is the customer's own
        cancelledBy: status === 'cancelled' ? 'customer' : null,
        activity,
        createdAt: at(createdOffset, 20, 15)
      };
    }
  );

  // Payments the demo account's chat messages talk about
  const tabraRejected = payments.find((p) => p.ref === REF['tabra-teambuilding'] && p.status === 'rejected');
  const tabraGradBalance = payments.find((p) => p.ref === REF['tabra-graduation'] && p.kind === 'balance');
  const tabraReunion = reservations.find((r) => r.ref === REF['tabra-reunion']);
  // Its minimum downpayment (nothing paid yet), for the reminder below
  const tabraReunionDown = Math.min(tabraReunion.minDownpayment, tabraReunion.quotation.net);

  // Build one chat message; the sender has always read their own message.
  // `extra.ref` tags it with the reservation it is about (otherwise its topic's reservation is used).
  const msg = (from, senderName, body, offset, hour, minute, extra = {}) => ({
    id: `m-${Math.random().toString(36).slice(2, 10)}`,
    from,
    senderName,
    body,
    ref: extra.ref || null,
    at: at(offset, hour, minute),
    readByCustomer: from === 'customer' ? true : extra.readByCustomer ?? true,
    readByAdmin: from === 'admin' ? true : extra.readByAdmin ?? true,
    attachment: extra.attachment || null
  });

  /**
   * Chat topics per customer. `ref` is the reservation a topic is about (null for general payment
   * talk, where each message names its own reservation). They are merged below into one
   * conversation per customer, the way the chat works.
   */
  const conversations = [
    {
      customerId: 'cus-001',
      ref: REF['santos-wedding'],
      messages: [
        msg('customer', 'Maria Santos', 'Hi! We just sent our reservation for the wedding reception. Is it possible to add a vegetarian option for around 12 guests?', -2, 9, 12),
        msg('admin', 'Wilma W. Cabiscuelas', 'Congratulations, Maria! Yes, we can cook a vegetarian dish for those guests. We are reviewing your request now.', -2, 9, 20),
        msg('admin', 'Wilma W. Cabiscuelas', 'Here is your quotation. Once you confirm, we will approve the reservation and send the downpayment instructions.', -1, 9, 41, {
          readByCustomer: false,
          attachment: { name: `Quotation-${REF['santos-wedding']}.pdf`, kind: 'quotation', ref: REF['santos-wedding'] }
        }),
        msg('admin', 'Wilma W. Cabiscuelas', 'Also, the complimentary food tasting for Wedding package bookings can be scheduled any weekday afternoon. Let us know what works for you.', -1, 9, 44, { readByCustomer: false })
      ]
    },
    {
      customerId: 'cus-001',
      ref: null,
      messages: [
        msg('customer', 'Maria Santos', "Good afternoon. I sent the balance for Lola Carmen's birthday through bank transfer.", -2, 15, 5, { ref: REF['lola-carmen'] }),
        msg('admin', 'Wilma W. Cabiscuelas', 'Received and verified, thank you! Your official receipt is now in Documents.', -1, 10, 10, { ref: REF['lola-carmen'] })
      ]
    },
    {
      customerId: 'cus-001',
      ref: REF['lola-carmen'],
      messages: [
        msg('admin', 'Wilma W. Cabiscuelas', 'Good morning, Maria! We arrive at 7:00 am for setup. We will use the side gate as discussed.', 0, 6, 45),
        msg('customer', 'Maria Santos', 'Perfect, thank you Wilma. See you!', 0, 6, 52)
      ]
    },
    {
      customerId: 'cus-005',
      ref: null,
      messages: [
        msg('customer', 'Patricia Lim', 'I have uploaded the bank receipt for the downpayment. Thank you!', -1, 14, 25, { readByAdmin: false, ref: REF['liam-christening'] })
      ]
    },
    {
      customerId: 'cus-003',
      ref: REF['cruz-wedding'],
      messages: [
        msg('customer', 'Angela Cruz', 'Hello, can we request a food tasting before the approval? We are still deciding which dishes to request for the buffet.', -1, 20, 30, { readByAdmin: false })
      ]
    },
    {
      customerId: 'cus-002',
      ref: REF['sofia-debut'],
      messages: [
        msg('customer', 'Jose Ramos', 'Hi, just confirming the stage decoration will be set up by 4 pm for the debut rehearsal.', -1, 11, 0),
        msg('admin', 'Wilma W. Cabiscuelas', 'Confirmed, Jose. The stage will be ready by 3:30 pm.', -1, 11, 18)
      ]
    },
    // Jherson Gabrial Tabra (demo account): billing with a rejected and re-sent payment, a receipt and a reminder,
    // plus event threads for a pending request, a confirmed booking's contract and an upcoming event
    {
      customerId: 'cus-009',
      ref: null,
      messages: [
        msg('customer', 'Jherson Gabrial Tabra', 'Good afternoon po. I sent the downpayment for the team building lunch through BDO.', -4, 14, 40, { ref: REF['tabra-teambuilding'] }),
        msg('admin', 'Wilma W. Cabiscuelas', `We could not verify your payment of ₱${tabraRejected.amount.toLocaleString('en-PH')} for Tabra Printing Co. Team Building Lunch. ${tabraRejected.rejectReason} Please submit it again from Payments.`, -3, 10, 5, { ref: REF['tabra-teambuilding'] }),
        msg('customer', 'Jherson Gabrial Tabra', 'Sorry po, I typed the wrong reference number. I will send it again.', -3, 10, 30, { ref: REF['tabra-teambuilding'] }),
        msg('admin', 'Wilma W. Cabiscuelas', `We received your payment of ₱${tabraGradBalance.amount.toLocaleString('en-PH')} for Jherson's College Graduation Party. Receipt ${tabraGradBalance.receiptNo} is now in Documents.`, -2, 10, 6, {
          ref: REF['tabra-graduation'],
          attachment: { name: `Receipt-${tabraGradBalance.receiptNo}.pdf`, kind: 'receipt', ref: REF['tabra-graduation'], paymentId: tabraGradBalance.id }
        }),
        msg('customer', 'Jherson Gabrial Tabra', 'Uploaded the new BDO receipt with the correct reference number. Thank you!', -1, 14, 25, { readByAdmin: false, ref: REF['tabra-teambuilding'] }),
        msg('admin', 'Wilma W. Cabiscuelas', `A friendly reminder for Tabra Family Reunion: a downpayment of at least ₱${tabraReunionDown.toLocaleString('en-PH')} was due on ${formatDate(day(-2))}. Please pay from Payments so we can keep your date reserved.`, 0, 8, 30, { readByCustomer: false, ref: REF['tabra-reunion'] })
      ]
    },
    {
      customerId: 'cus-009',
      ref: REF['tabra-birthday'],
      messages: [
        msg('customer', 'Jherson Gabrial Tabra', 'Hi! Can the balloon setup be a photo corner near the entrance? Thank you po.', -1, 20, 20),
        msg('admin', 'Wilma W. Cabiscuelas', 'Hi Jherson! Yes, we can set it up as a photo corner. We are reviewing your request and will send the quotation within the day.', 0, 9, 10, { readByCustomer: false })
      ]
    },
    {
      customerId: 'cus-009',
      ref: REF['tabra-anniversary'],
      messages: [
        msg('admin', 'Wilma W. Cabiscuelas', "Mama and Papa Tabra's 25th Anniversary is now confirmed. Your contract is available in Documents.", -23, 9, 40, {
          attachment: { name: `Contract-${REF['tabra-anniversary']}.pdf`, kind: 'contract', ref: REF['tabra-anniversary'] }
        }),
        msg('customer', 'Jherson Gabrial Tabra', 'Thank you! We will prepare the balance for the event day.', -23, 12, 15)
      ]
    },
    {
      customerId: 'cus-009',
      ref: REF['tabra-graduation'],
      messages: [
        msg('admin', 'Wilma W. Cabiscuelas', 'Hi Jherson! Our crew arrives at 2:00 pm on the day for setup. Please keep the garage clear for the van.', -1, 16, 0),
        msg('customer', 'Jherson Gabrial Tabra', 'Noted po, thank you!', -1, 16, 12)
      ]
    }
  ];

  // One conversation per customer; each message keeps its topic's reservation as its tag
  const threads = [];
  conversations.forEach((topic) => {
    let thread = threads.find((t) => t.customerId === topic.customerId);
    if (!thread) {
      thread = { id: `th-${String(threads.length + 1).padStart(4, '0')}`, customerId: topic.customerId, messages: [] };
      threads.push(thread);
    }
    thread.messages.push(...topic.messages.map((m) => ({ ...m, ref: m.ref || topic.ref })));
  });
  threads.forEach((t) => t.messages.sort((a, b) => a.at - b.at));

  /**
   * Feedback written after completed events, as
   * [id, customerId, reservation key, overall rating, [food, service, punctuality, setup],
   *  text, days ago, hour, what the admin has done with it]
   * The last item is left out when the admin has not touched the feedback yet: a new review is
   * not published, has no reply, and is unread until the admin opens the Feedbacks page.
   */
  const FEEDBACK = [
    ['tst-001', 'cus-007', 'bautista-graduation', 5, [5, 5, 5, 4],
      'The food was a hit and the service was so polite. Everyone asked who our caterer was!', -3, 19,
      { unread: true }],
    ['tst-002', 'cus-008', 'aquino-seminar', 5, [5, 5, 5, 4],
      'On time, well organised and the packed lunches were still warm. Booking again for our next seminar.', -38, 16,
      { status: 'published', featured: true, reply: 'Thank you, Mr Aquino. We are glad the packed lunches arrived warm — we will keep the same schedule for your next seminar.' }],
    ['tst-003', 'cus-004', 'villanueva-townhall', 4, [4, 4, 5, 4],
      'Smooth service for 250 people. The coffee station ran out once but was refilled quickly.', -148, 10,
      { status: 'published', reply: 'Thank you for telling us about the coffee station. For crowds above 200 we now set up a second one from the start.' }],
    ['tst-004', 'cus-002', 'ramos-reunion', 5, [5, 5, 4, 5],
      'Three generations at one table and not one complaint. The lechon kawali was gone in minutes.', -118, 15,
      { status: 'published', featured: true }],
    ['tst-005', 'cus-008', 'aquino-anniversary', 5, [5, 5, 5, 5],
      'Beautiful setup and the plated service was timed perfectly. Our guests are still talking about the dessert.', -197, 11,
      { status: 'published' }],
    ['tst-006', 'cus-007', 'rhea-sister-debut', 3, [4, 3, 2, 4],
      'The food was good, but the team arrived late and the program started almost an hour behind.', -327, 20,
      { archived: true, reply: 'We are sorry for the late arrival. Our crew now leaves two hours ahead for events across the city.' }],
    ['tst-007', 'cus-003', 'cruz-engagement', 2, [3, 2, 2, 2],
      'Only half of the dishes we picked were served, and nobody explained why until the dinner was over.', -72, 21,
      { flagged: true, flagReason: 'Checking the service report for this date before it goes on the website: the coordinator says two dishes were swapped on site.' }],
    // Demo account: one published review with a reply, one new review still with the team
    // (the Christmas party is left without a review so "Write a testimonial" shows)
    ['tst-008', 'cus-009', 'jhen-debut', 5, [5, 5, 5, 5],
      'Jhen felt like a princess the whole night. The waiters were attentive and the food was still hot until the last dance.', -178, 21,
      { status: 'published', reply: 'Thank you, Jherson! It was a joy to be part of Jhen’s debut. Please send our greetings to your family.' }],
    ['tst-009', 'cus-009', 'tabra-company-anniversary', 4, [5, 4, 4, 4],
      'Great food and friendly staff. Setup took a little longer than planned, but everything was ready before the program.', -18, 20,
      { unread: true }]
  ];

  const testimonials = FEEDBACK.map(([id, customerId, key, rating, [food, service, punctuality, setup], body, daysAgo, hour, state = {}]) => ({
    id,
    customerId,
    ref: REF[key],
    rating,
    categories: { food, service, punctuality, setup },
    body,
    createdAt: at(daysAgo, hour),
    // Published / hidden, and the flags the admin sets on the Feedbacks page
    status: state.status || 'hidden',
    featured: Boolean(state.featured),
    flagged: Boolean(state.flagged),
    flagReason: state.flagReason || '',
    archived: Boolean(state.archived),
    readByAdmin: state.unread !== true,
    // The admin's answer, sent the morning after the review came in
    reply: state.reply ? { body: state.reply, at: at(daysAgo + 1, 9, 30), by: 'Wilma W. Cabiscuelas' } : null
  }));

  // Equipment inventory (items and the counter for new item codes); some pieces are out at today's two events
  const inventory = buildInventorySeed(REF);

  // An Equipment Rental request from the demo customer: chairs, tables, linens and warmers delivered
  // in ten days, waiting for its quotation. Added after the table above so every other reference,
  // payment id and receipt number stays the same. Prices are copied from the inventory, as a booking does.
  const rentalWanted = [['Monobloc chair', 100], ['Round table (10 seats)', 10], ['Round tablecloth', 10], ['Food warmer', 4], ['Table skirting', 2]];
  const rentalItems = rentalWanted.map(([name, qty]) => {
    const item = inventory.items.find((i) => i.name === name);
    return { itemId: item.id, name, qty, price: item.rentPrice, damageFee: item.damageFee };
  });
  const rentalRef = makeReservationRef(day(10), reservations.map((r) => r.ref));
  reservations.push({
    ref: rentalRef,
    customerId: 'cus-009',
    eventName: 'Tabra Family Barbecue Party',
    occasion: 'Reunion',
    date: day(10),
    startTime: '08:00',
    endTime: null, // a rental has only its delivery (or pick-up) time
    guests: 0,
    packageId: 'pkg-equipment-rental',
    serviceType: RENTAL_SERVICE,
    menu: null,
    foodNotes: '',
    pricePerPlate: 0,
    minDownpayment: DEFAULT_MIN_DOWNPAYMENT,
    rentalItems,
    fulfilment: 'delivery',
    damageCharges: [],
    venue: { name: 'Tabra Residence', address: '31 Kamagong Street, Barangay San Antonio', city: 'Pasig City', accessNotes: 'Please call when you are at the gate.' },
    addonIds: [],
    addonQty: {},
    status: 'pending',
    estimate: computeQuote({ pkg: pkgById['pkg-equipment-rental'], serviceType: RENTAL_SERVICE, rentalItems, deliveryFee: 100 }),
    quotation: null,
    downpaymentDue: null,
    preparingAt: null,
    notes: '',
    declineReason: '',
    cancelReason: '',
    cancelledBy: null,
    activity: [{ at: at(0, 8, 30), actor: 'Jherson Gabrial Tabra', text: 'Submitted the equipment rental request.' }],
    createdAt: at(0, 8, 30)
  });
  // The automatic thank-you the booking form posts in the customer's chat
  const tabraThread = threads.find((t) => t.customerId === 'cus-009');
  tabraThread.messages.push(
    msg('admin', 'Tres Marias team', `Thank you for your equipment rental request for ${formatDate(day(10))}. We are checking the items and will send your quotation within 24 hours.`, 0, 8, 31, { ref: rentalRef, readByCustomer: false })
  );
  // Outsourcing partners and the contracts sent to them (with the counter for new contract numbers)
  const outsourcing = buildOutsourceSeed(REF, reservations);

  return {
    // The day the dates were counted from (the seeder prints it)
    seededOn: T,
    // Settings the admin edits in the app: the buffet price per person and the minimum downpayment
    settings: { pricePerPlate: DEFAULT_PRICE_PER_PLATE, minDownpayment: DEFAULT_MIN_DOWNPAYMENT },
    admins,
    customers,
    packages: PACKAGES,
    addons: ADDONS,
    dishes: DISHES,
    reservations,
    payments,
    // Money returned to customers (cancellations and overpayments); none yet
    refunds: [],
    threads,
    testimonials,
    calendar: {
      // The owner's default (2026-10-03): up to 5 events a day
      dailyCapacity: 5,
      blocked: [
        { date: day(21), reason: 'Fully booked', note: '' },
        { date: day(41), reason: 'Private event', note: 'Our team has a company outing that day.' }
      ]
    },
    inventory: inventory.items,
    outsourcing: { partners: outsourcing.partners, contracts: outsourcing.contracts },
    // Counters: `receipt` is the NEXT receipt number (used, then increased); the others are the LAST number
    // used (increased, then used), so the next payment after pay-0032 is pay-0033 and the first refund is rf-0001
    counters: { receipt: receiptSeq, payment: payments.length, inventory: inventory.counter, outsource: outsourcing.counter, refund: 0 }
  };
}
