import { addDays, todayISO } from '../utils/format.js';

/**
 * Starting equipment list for the inventory, used by seed.js.
 * Some items are already out at today's two seed events (Lola Carmen's birthday and Sofia's debut), and a few are damaged.
 *
 * Every item a package lists has a matching item here (warmers, pitchers, water jugs, goblets, tents,
 * the arc and stage, cake and water tables), so the admin can check out what a package needs.
 * Lights and sound are not owned: they come from an outsourcing partner, so they are not in this list.
 *
 * Rental prices are per piece for one event, set from 2026 Philippine rental price lists (Manila rental
 * shops, a little lower for Batangas). The damage fee is what the customer pays for each piece that comes
 * back damaged or not at all, close to what a new one costs.
 */

// [name, category, total, low-stock alert level, { seed reservation key: quantity out }, damaged, rental]
// `rental` is [rent per piece, damage fee per piece] for items customers can rent, or null for items
// only our team uses (kitchen equipment, the stage and the presidential table set).
// The keys are the ones in seed.js's RES table; buildInventorySeed swaps them for the real RES-YYYY-MMDD-NN references.
const ITEMS = [
  ['Monobloc chair', 'Furniture', 400, 60, { 'lola-carmen': 80, 'sofia-debut': 150 }, 6, [15, 400]],
  ['Tiffany chair', 'Furniture', 150, 20, {}, 3, [90, 3000]],
  ['Round table (10 seats)', 'Furniture', 60, 8, { 'lola-carmen': 8, 'sofia-debut': 15 }, 0, [150, 3500]],
  ['Rectangular buffet table', 'Furniture', 12, 3, { 'lola-carmen': 2, 'sofia-debut': 3 }, 0, [180, 3500]],
  ['Cocktail table', 'Furniture', 15, 3, {}, 1, [150, 2500]],
  ['Cake table', 'Furniture', 2, 0, {}, 0, [300, 3500]],
  ['Water table', 'Furniture', 2, 0, {}, 0, [300, 3500]],
  ['Presidential table set', 'Furniture', 2, 0, {}, 0, null],
  ['Round tablecloth', 'Linens', 60, 10, { 'lola-carmen': 8, 'sofia-debut': 15 }, 2, [80, 500]],
  ['Chair cover', 'Linens', 400, 50, { 'sofia-debut': 150 }, 12, [15, 150]],
  ['Table skirting', 'Linens', 20, 4, { 'lola-carmen': 2, 'sofia-debut': 3 }, 0, [500, 2000]],
  ['Table napkin', 'Linens', 300, 50, { 'lola-carmen': 80, 'sofia-debut': 150 }, 0, [10, 60]],
  ['Food warmer', 'Serving ware', 15, 3, { 'lola-carmen': 6 }, 1, [250, 2500]],
  ['Elegant food warmer', 'Serving ware', 15, 3, { 'sofia-debut': 5 }, 0, [450, 5000]],
  ['Serving tray', 'Serving ware', 40, 8, { 'lola-carmen': 6, 'sofia-debut': 10 }, 0, [20, 300]],
  ['Beverage dispenser', 'Serving ware', 10, 2, { 'lola-carmen': 2, 'sofia-debut': 3 }, 0, [150, 1500]],
  ['Soup tureen', 'Serving ware', 20, 4, {}, 0, [200, 1500]],
  ['Stainless pitcher', 'Serving ware', 30, 6, { 'lola-carmen': 4, 'sofia-debut': 4 }, 0, [25, 400]],
  ['Water jug', 'Serving ware', 5, 1, { 'lola-carmen': 1, 'sofia-debut': 1 }, 0, [100, 800]],
  ['Dinner plate', 'Tableware', 600, 100, { 'lola-carmen': 90, 'sofia-debut': 165 }, 14, [5, 80]],
  ['Dessert plate', 'Tableware', 500, 80, { 'lola-carmen': 90, 'sofia-debut': 165 }, 0, [3, 50]],
  ['Drinking glass', 'Tableware', 600, 100, { 'lola-carmen': 90, 'sofia-debut': 165 }, 21, [3, 40]],
  ['Goblet', 'Tableware', 30, 6, {}, 0, [8, 80]],
  ['Spoon', 'Tableware', 600, 100, { 'lola-carmen': 90, 'sofia-debut': 165 }, 0, [2, 25]],
  ['Fork', 'Tableware', 600, 100, { 'lola-carmen': 90, 'sofia-debut': 165 }, 0, [2, 25]],
  ['Serving spoon and tongs (pair)', 'Tableware', 60, 10, { 'lola-carmen': 12, 'sofia-debut': 16 }, 0, [15, 150]],
  ['Gas burner', 'Kitchen', 6, 2, { 'sofia-debut': 2 }, 1, null],
  ['LPG tank', 'Kitchen', 8, 2, { 'sofia-debut': 2 }, 0, null],
  ['Large cooking pot', 'Kitchen', 12, 3, { 'sofia-debut': 3 }, 0, null],
  ['Ice cooler', 'Kitchen', 10, 2, { 'lola-carmen': 2, 'sofia-debut': 3 }, 0, [150, 2000]],
  ['Tent 20x20', 'Tents and stage', 5, 1, {}, 0, [3500, 30000]],
  ['Tent 20x40', 'Tents and stage', 3, 0, {}, 0, [6500, 55000]],
  ['Stage', 'Tents and stage', 1, 0, {}, 0, null],
  ['Arc', 'Tents and stage', 2, 0, {}, 0, [1500, 6000]],
  ['Centrepiece vase', 'Decor', 40, 8, { 'sofia-debut': 15 }, 2, [50, 300]],
  ['Backdrop frame', 'Decor', 5, 1, { 'sofia-debut': 1 }, 0, [800, 5000]],
  // The ten styling pieces Filipino caterers are asked for most, rentable on their own
  ['Artificial flower centerpiece', 'Decor', 40, 8, {}, 0, [150, 600]],
  ['Flower stand with artificial flowers', 'Decor', 10, 2, {}, 0, [350, 1500]],
  ['Flower wall panel', 'Decor', 6, 1, {}, 0, [800, 3500]],
  ['Ceiling drape', 'Decor', 20, 4, {}, 0, [250, 1200]],
  ['Chair ribbon', 'Decor', 300, 50, {}, 0, [10, 40]],
  ['Table runner', 'Decor', 60, 10, {}, 0, [40, 250]],
  ['Red aisle carpet', 'Decor', 2, 0, {}, 0, [900, 4000]],
  ['Three-tier cake stand', 'Decor', 4, 1, {}, 0, [250, 1200]],
  ["Celebrant's chair", 'Decor', 2, 0, {}, 0, [1000, 6000]],
  ['Welcome sign easel', 'Decor', 4, 1, {}, 0, [150, 800]]
];

/**
 * Build the inventory items and the next item-code number. Timestamps are relative to today.
 * `refs` maps each seed reservation key to its reference, e.g. { 'lola-carmen': 'RES-2026-0915-01' } (the REF map in seed.js).
 * Each item carries `rentable`, `rentPrice` and `damageFee` for the Equipment Rental package.
 */
export function buildInventorySeed(refs, actor = 'Teresa Marquez') {
  const today = todayISO();
  // Timestamp `offset` days from today at a given hour
  const at = (offset, hour) => {
    const [y, m, d] = addDays(today, offset).split('-').map(Number);
    return new Date(y, m - 1, d, hour).getTime();
  };

  const items = ITEMS.map(([name, category, total, lowStockAt, keyedAllocations, damaged, rental], i) => {
    // { 'lola-carmen': 80 } -> { 'RES-2026-0915-01': 80 }
    const allocations = Object.fromEntries(Object.entries(keyedAllocations).map(([key, qty]) => [refs[key], qty]));
    const history = [{ at: at(-90, 9), actor, text: `Added to inventory with ${total} pcs.` }];
    if (damaged) history.push({ at: at(-6, 16), actor, text: `Reported ${damaged} pcs damaged after an event.` });
    if (rental) history.push({ at: at(-2, 10), actor, text: `Set for rent at ₱${rental[0].toLocaleString('en-PH')} per piece (damage fee ₱${rental[1].toLocaleString('en-PH')}).` });
    Object.entries(allocations).forEach(([ref, qty]) => history.push({ at: at(0, 6), actor, text: `Checked out ${qty} pcs for ${ref}.`, ref }));
    return {
      id: `inv-${String(i + 1).padStart(3, '0')}`,
      code: `EQ-${String(i + 1).padStart(4, '0')}`,
      name,
      category,
      total,
      lowStockAt,
      allocations,
      damaged,
      rentable: Boolean(rental),
      rentPrice: rental ? rental[0] : 0,
      damageFee: rental ? rental[1] : 0,
      notes: '',
      archived: false,
      history
    };
  });
  return { items, counter: ITEMS.length };
}
