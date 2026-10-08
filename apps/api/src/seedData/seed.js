import { DEFAULT_MIN_DOWNPAYMENT, DEFAULT_PRICE_PER_PLATE } from '@tm/shared/src/services/config.js';
import { addDays, todayISO } from '@tm/shared/src/utils/format.js';
import { buildInventorySeed } from './inventorySeed.js';

/**
 * The business data the API seeder loads (src/seed.js): the packages, additional charges and dishes,
 * the price per person and minimum downpayment, the daily capacity, the owner's admin account and
 * the inventory. `npm run seed:starter` loads this alone (the live server's fresh start).
 *
 * No customer is written here. The sample customers with their reservations, payments, chat, reviews
 * and outsourcing are in seedData/sample/, which stays on the developer's computer and out of GitHub
 * (.gitignore; split off 2026-10-08), so a clone of the repository, the live server's included, has
 * none. `npm run seed:api` adds them on top of this data (sampleLoader.js).
 *
 * No password is written here either (the repository is public): the seeder takes the accounts'
 * passwords from apps/api/.env (SEED_ADMIN_PASSWORD, SEED_CUSTOMER_PASSWORD), so these records carry none.
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
export const DISHES = [
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

/**
 * Build the business data. The admin account's dates are relative to today; the inventory comes from
 * inventorySeed.js with every piece on the shelf. Returns { settings, admins, packages, addons, dishes,
 * dailyCapacity, inventory: { items, counter } }, which seed:starter loads as it is and the sample data
 * (seedData/sample/sample.js) builds on.
 */
export function buildBusinessSeed() {
  const T = todayISO();
  // Timestamp `offset` days from today at a given time
  const at = (offset, hour = 10, minute = 0) => {
    const [y, m, d] = addDays(T, offset).split('-').map(Number);
    return new Date(y, m - 1, d, hour, minute).getTime();
  };

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

  return {
    // Settings the admin edits in the app: the buffet price per person and the minimum downpayment
    settings: { pricePerPlate: DEFAULT_PRICE_PER_PLATE, minDownpayment: DEFAULT_MIN_DOWNPAYMENT },
    admins,
    packages: PACKAGES,
    addons: ADDONS,
    dishes: DISHES,
    // The owner's default (2026-10-03): up to 5 events a day
    dailyCapacity: 5,
    // Equipment inventory (items and the counter for new item codes)
    inventory: buildInventorySeed(admins[0].name)
  };
}
