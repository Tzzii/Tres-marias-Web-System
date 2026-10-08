import { addDays, todayISO } from '@tm/shared/src/utils/format.js';

/**
 * Starting equipment list for the inventory, used by seed.js (the business data). Every piece is on
 * the shelf here; the sample data (seedData/sample/sample.js, not on GitHub) checks some out for its
 * two events today and marks a few damaged.
 *
 * Every item a package lists has a matching item here (warmers, pitchers, water jugs, goblets, tents,
 * the arc and stage, cake and water tables), so the admin can check out what a package needs.
 * Lights and sound are not owned: they come from an outsourcing partner, so they are not in this list.
 *
 * Rental prices are per piece for one event, set from 2026 Philippine rental price lists (Manila rental
 * shops, a little lower for Batangas). The damage fee is what the customer pays for each piece that comes
 * back damaged or not at all. Set by the owner 2026-10-01 (as in the local admin): never more than ₱200
 * over the rent price, rent + ₱100 for most items and rent + ₱200 for items renting at ₱500 and up.
 */

// [name, category, total, low-stock alert level, rental]
// `rental` is [rent per piece, damage fee per piece] for items customers can rent, or null for items
// only our team uses (kitchen equipment, the stage, and the 10x10 and 10x20 tents until priced).
const ITEMS = [
  ['Monobloc chair', 'Furniture', 400, 60, [15, 40]],
  ['Tiffany chair', 'Furniture', 150, 20, [90, 150]],
  ['Round table (10 seats)', 'Furniture', 60, 8, [150, 250]],
  ['Rectangular buffet table', 'Furniture', 12, 3, [180, 250]],
  ['Cocktail table', 'Furniture', 15, 3, [150, 250]],
  ['Cake table', 'Furniture', 2, 0, [300, 500]],
  ['Water table', 'Furniture', 2, 0, [300, 400]],
  ['Presidential table set', 'Furniture', 2, 0, [500, 600]],
  ['Round tablecloth', 'Linens', 60, 10, [80, 180]],
  ['Chair cover', 'Linens', 400, 50, [15, 150]],
  ['Table skirting', 'Linens', 20, 4, [500, 700]],
  ['Table napkin', 'Linens', 300, 50, [10, 60]],
  ['Food warmer', 'Serving ware', 15, 3, [250, 350]],
  ['Elegant food warmer', 'Serving ware', 15, 3, [450, 550]],
  ['Serving tray', 'Serving ware', 40, 8, [20, 120]],
  ['Beverage dispenser', 'Serving ware', 10, 2, [150, 250]],
  ['Soup tureen', 'Serving ware', 20, 4, [200, 300]],
  ['Stainless pitcher', 'Serving ware', 30, 6, [25, 125]],
  ['Water jug', 'Serving ware', 5, 1, [100, 200]],
  ['Dinner plate', 'Tableware', 600, 100, [5, 80]],
  ['Dessert plate', 'Tableware', 500, 80, [3, 50]],
  ['Drinking glass', 'Tableware', 600, 100, [3, 40]],
  ['Goblet', 'Tableware', 30, 6, [8, 80]],
  ['Spoon', 'Tableware', 600, 100, [2, 25]],
  ['Fork', 'Tableware', 600, 100, [2, 25]],
  ['Serving spoon and tongs (pair)', 'Tableware', 60, 10, [15, 150]],
  ['Gas burner', 'Kitchen', 6, 2, null],
  ['LPG tank', 'Kitchen', 8, 2, null],
  ['Large cooking pot', 'Kitchen', 12, 3, null],
  ['Ice cooler', 'Kitchen', 10, 2, [150, 250]],
  ['Tent 20x20', 'Tents and stage', 2, 1, [3500, 3700]],
  ['Tent 20x40', 'Tents and stage', 4, 0, [6500, 6700]],
  ['Stage', 'Tents and stage', 1, 0, null],
  ['Arc', 'Tents and stage', 2, 0, [1500, 1700]],
  ['Centrepiece vase', 'Decor', 40, 8, [50, 150]],
  ['Backdrop frame', 'Decor', 5, 1, [800, 1000]],
  // The ten styling pieces Filipino caterers are asked for most, rentable on their own
  ['Artificial flower centerpiece', 'Decor', 40, 8, [150, 250]],
  ['Flower stand with artificial flowers', 'Decor', 10, 2, [350, 450]],
  ['Flower wall panel', 'Decor', 6, 1, [800, 1000]],
  ['Ceiling drape', 'Decor', 20, 4, [250, 350]],
  ['Chair ribbon', 'Decor', 300, 50, [10, 40]],
  ['Table runner', 'Decor', 60, 10, [40, 140]],
  ['Red aisle carpet', 'Decor', 2, 0, [900, 1100]],
  ['Three-tier cake stand', 'Decor', 4, 1, [250, 350]],
  ["Celebrant's chair", 'Decor', 2, 0, [1000, 1200]],
  ['Welcome sign easel', 'Decor', 4, 1, [150, 250]],
  // Added 2026-10-01 for the Tent additional charge's sizes. Kept at the end so every earlier item keeps
  // its code (these are EQ-0047 and EQ-0048, as in the live inventory). Not for rent until priced.
  ['Tent 10x10', 'Tents and stage', 2, 0, null],
  ['Tent 10x20', 'Tents and stage', 2, 0, null]
];

// The additional charge (here, a size of the Tent) that books each item: an event booking that size
// holds the item's pieces on its date (rentalStock in domain/reservation.js). Item name -> add-on id.
const ADDON_LINKS = {
  'Tent 10x10': 'add-tent-10x10',
  'Tent 10x20': 'add-tent-10x20',
  'Tent 20x20': 'add-tent-20x20',
  'Tent 20x40': 'add-tent-20x40'
};

/**
 * Build the inventory items, every piece on the shelf (no allocations, none damaged), and the next
 * item-code number. Timestamps are relative to today; `actor` is the admin named in each item's history.
 * Each item carries `rentable`, `rentPrice` and `damageFee` for the Equipment Rental package, and
 * `addonId`: the additional charge or size that books it (ADDON_LINKS), or null.
 */
export function buildInventorySeed(actor) {
  const today = todayISO();
  // Timestamp `offset` days from today at a given hour
  const at = (offset, hour) => {
    const [y, m, d] = addDays(today, offset).split('-').map(Number);
    return new Date(y, m - 1, d, hour).getTime();
  };

  const items = ITEMS.map(([name, category, total, lowStockAt, rental], i) => {
    const history = [{ at: at(-90, 9), actor, text: `Added to inventory with ${total} pcs.` }];
    if (rental) history.push({ at: at(-2, 10), actor, text: `Set for rent at ₱${rental[0].toLocaleString('en-PH')} per piece (damage fee ₱${rental[1].toLocaleString('en-PH')}).` });
    return {
      id: `inv-${String(i + 1).padStart(3, '0')}`,
      code: `EQ-${String(i + 1).padStart(4, '0')}`,
      name,
      category,
      total,
      lowStockAt,
      allocations: {},
      damaged: 0,
      rentable: Boolean(rental),
      rentPrice: rental ? rental[0] : 0,
      damageFee: rental ? rental[1] : 0,
      notes: '',
      archived: false,
      addonId: ADDON_LINKS[name] || null,
      history
    };
  });
  return { items, counter: ITEMS.length };
}
