import { DEFAULT_MIN_DOWNPAYMENT, DEFAULT_PRICE_PER_PLATE } from '@tm/shared/src/services/config.js';
import { addDays, todayISO } from '@tm/shared/src/utils/format.js';
import { buildInventorySeed } from './inventorySeed.js';


const items = (list) => list.map(([qty, name]) => ({ qty, name }));

const BUFFET_BASE = [
  [null, 'Buffet Table'],
  [null, 'Buffet Backdrop']
];

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
    ...(waiters ? [[waiters, 'Helpers']] : [])
  ]);

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
    description: 'Everything in Classic for up to 100 guests, with 2 helpers.',
    items: cateringItems({
      guests: 100,
      warmers: 8,
      warmerName: 'Food Warmers',
      tables: 10,
      pitchers: 4,
      jugs: 1,
      waiters: 2
    }),
    mood: 1
  },
  {
    id: 'pkg-2',
    slug: 'premier',
    name: 'Premier',
    price: 15000,
    guests: 150,
    description: 'A buffet setup with elegant food warmers, tableware, round tables and chairs for up to 150 guests.',
    items: cateringItems({
      guests: 150,
      warmers: 5,
      warmerName: 'Elegant Food Warmers',
      tables: 15,
      pitchers: 4,
      jugs: 1
    }),
    mood: 2
  },
  {
    id: 'pkg-2-waiters',
    slug: 'premier-full-service',
    name: 'Premier Full Service',
    price: 15000,
    guests: 150,
    description: 'Everything in Premier for up to 150 guests, with 3 helpers.',
    items: cateringItems({
      guests: 150,
      warmers: 5,
      warmerName: 'Elegant Food Warmers',
      tables: 15,
      pitchers: 4,
      jugs: 1,
      waiters: 3
    }),
    mood: 2
  },
  {
    id: 'pkg-3',
    slug: 'grand',
    name: 'Grand',
    price: 20000,
    guests: 200,
    description: 'A buffet setup with elegant food warmers, tableware, round tables and chairs for up to 200 guests.',
    items: cateringItems({
      guests: 200,
      warmers: 5,
      warmerName: 'Elegant Food Warmers',
      tables: 20,
      pitchers: 6,
      jugs: 2
    }),
    mood: 3
  },
  {
    id: 'pkg-3-waiters',
    slug: 'grand-full-service',
    name: 'Grand Full Service',
    price: 20000,
    guests: 200,
    description: 'Everything in Grand for up to 200 guests, with 4 helpers.',
    items: cateringItems({
      guests: 200,
      warmers: 5,
      warmerName: 'Elegant Food Warmers',
      tables: 20,
      pitchers: 6,
      jugs: 2,
      waiters: 4
    }),
    mood: 3
  },
  {
    id: 'pkg-wedding-1',
    slug: 'signature-wedding',
    name: 'Signature Wedding',
    price: 25000,
    guests: 150,
    description:
      'A full reception setup for up to 150 guests: presidential table, tent, arc, stage, cake and water tables, with 6 helpers.',
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
      [6, 'Helpers'],
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
    description:
      'A full reception setup for up to 170 guests: presidential table, a larger tent, arc, stage, cake and water tables, with 8 helpers.',
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
      [8, 'Helpers'],
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
    description:
      'Rent only what you need: tables, chairs, linens, food warmers, tableware, tents and decor, priced per piece. Pick up in Magapi, Malvar, Batangas, or have it delivered.',
    items: [],
    mood: 1,
    icon: 'chair'
  }
].map((pkg) => ({ kind: 'package', icon: 'restaurant', featured: false, visible: true, archived: false, ...pkg }));

const ADDONS = [
  {
    id: 'add-dessert',
    name: 'Dessert',
    description: 'Your choice of dessert, with flavor and presentation requests. Priced separately in your quotation.'
  },
  { id: 'add-stage', name: 'Stage decoration', description: 'Backdrop and styling for the stage or program area.' },
  { id: 'add-balloons', name: 'Balloon decoration', description: 'Balloon arches, garlands or columns in your motif.' },
  { id: 'add-tent', name: 'Tent', description: 'A tent over the dining area for outdoor venues.' },
  {
    id: 'add-sounds-lights',
    name: 'Sounds and lights',
    description: 'Speakers, microphones and event lighting for the program.',
    hasPackages: true
  },
  { id: 'add-host', name: 'Host', description: 'A host or emcee to run the program.' },
  { id: 'add-clown', name: 'Clown', description: 'A clown with games and balloon art for children.' },
  {
    id: 'add-photographer',
    name: 'Photographer and videographer',
    description: 'Event photographer and videographer, with edited photos and a highlights video after the event.',
    hasPackages: true
  },
  {
    id: 'add-waiters',
    name: 'Helper',
    description: 'Extra helpers on top of what your package includes.',
    hasQuantity: true
  },
  { id: 'add-tent-10x10', parentId: 'add-tent', name: '10 × 10', description: '', hasQuantity: true },
  { id: 'add-tent-10x20', parentId: 'add-tent', name: '10 × 20', description: '', hasQuantity: true },
  { id: 'add-tent-20x20', parentId: 'add-tent', name: '20 × 20', description: '', hasQuantity: true },
  { id: 'add-tent-20x40', parentId: 'add-tent', name: '20 × 40', description: '', hasQuantity: true },
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
    description:
      '2 powered speakers\n8 to 12 stage or backdrop lights on T-bar stands\nAudio mixer and 2 microphones\nAn operator for 4 to 5 hours'
  },
  {
    id: 'add-sound-full',
    parentId: 'add-sounds-lights',
    name: 'Medium / full package',
    price: 8000,
    description:
      'Everything in Basic lights and sounds\nSubwoofers and moving head lights\nDMX lighting controller\nFog or smoke machine\nAn on-site technician'
  },
  {
    id: 'add-sound-grand',
    parentId: 'add-sounds-lights',
    name: 'Grand / corporate / wedding setup',
    description: 'For large venues: full band equipment, heavy trusses, LED walls and a large generator'
  },
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
    description:
      'A photographer and a videographer for the whole event\nAll edited photos and a highlights video after the event'
  }
].map((addon) => ({ parentId: null, price: null, hasQuantity: false, hasPackages: false, archived: false, ...addon }));

export const DISHES = [
  [
    'pork',
    [
      ['lechon-kawali', 'Lechon Kawali'],
      ['crispy-pata', 'Crispy Pata'],
      ['menudo', 'Pork Menudo'],
      ['bbq', 'Pork Barbecue'],
      ['adobo-gata', 'Pork Adobo sa Gata'],
      ['humba', 'Pork Humba'],
      ['sisig', 'Pork Sisig'],
      ['kare-kare', 'Kare-Kare']
    ]
  ],
  [
    'chicken',
    [
      ['inasal', 'Chicken Inasal'],
      ['cordon-bleu', 'Chicken Cordon Bleu'],
      ['fried', 'Crispy Fried Chicken'],
      ['adobo', 'Chicken Adobo'],
      ['relleno', 'Chicken Relleno'],
      ['afritada', 'Chicken Afritada'],
      ['buffalo', 'Buffalo Chicken Wings'],
      ['teriyaki', 'Chicken Teriyaki']
    ]
  ],
  [
    'fish',
    [
      ['fillet-tartar', 'Fish Fillet with Tartar Sauce'],
      ['fillet-lemon', 'Fish Fillet in Lemon Butter'],
      ['escabeche', 'Fish Escabeche'],
      ['grilled-tilapia', 'Grilled Tilapia'],
      ['sinigang-hipon', 'Sinigang na Hipon'],
      ['baked-scallops', 'Baked Scallops'],
      ['tahong', 'Cheesy Baked Tahong']
    ]
  ],
  [
    'vegetable',
    [
      ['chopsuey', 'Chopsuey'],
      ['buttered', 'Buttered Mixed Vegetables'],
      ['lumpiang-gulay', 'Lumpiang Gulay'],
      ['pinakbet', 'Pinakbet'],
      ['laing', 'Laing']
    ]
  ]
].flatMap(([category, list]) =>
  list.map(([slug, name]) => ({ id: `dish-${category}-${slug}`, category, name, archived: false }))
);

export function buildBusinessSeed() {
  const T = todayISO();
  const at = (offset, hour = 10, minute = 0) => {
    const [y, m, d] = addDays(T, offset).split('-').map(Number);
    return new Date(y, m - 1, d, hour, minute).getTime();
  };

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
    settings: { pricePerPlate: DEFAULT_PRICE_PER_PLATE, minDownpayment: DEFAULT_MIN_DOWNPAYMENT },
    admins,
    packages: PACKAGES,
    addons: ADDONS,
    dishes: DISHES,
    dailyCapacity: 5,
    inventory: buildInventorySeed(admins[0].name)
  };
}
