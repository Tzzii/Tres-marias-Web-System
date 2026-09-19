import { addDays, todayISO } from '../utils/format.js';

/**
 * Starting equipment list for the inventory, used by seed.js.
 * Some items are already out at today's two seed events (Lola Carmen's birthday and Sofia's debut), and a few are damaged.
 */

// [name, category, total, low-stock alert level, { seed reservation key: quantity out }, damaged]
// The keys are the ones in seed.js's RES table; buildInventorySeed swaps them for the real RES-YYYY-MMDD-NN references.
const ITEMS = [
  ['Monobloc chair', 'Furniture', 400, 60, { 'lola-carmen': 80, 'sofia-debut': 150 }, 6],
  ['Tiffany chair', 'Furniture', 150, 20, {}, 3],
  ['Round table (10 seats)', 'Furniture', 40, 6, { 'lola-carmen': 8, 'sofia-debut': 15 }, 0],
  ['Rectangular buffet table', 'Furniture', 12, 3, { 'lola-carmen': 2, 'sofia-debut': 3 }, 0],
  ['Cocktail table', 'Furniture', 15, 3, {}, 1],
  ['Round tablecloth', 'Linens', 60, 10, { 'lola-carmen': 8, 'sofia-debut': 15 }, 2],
  ['Chair cover', 'Linens', 300, 40, { 'sofia-debut': 150 }, 12],
  ['Table skirting', 'Linens', 20, 4, { 'lola-carmen': 2, 'sofia-debut': 3 }, 0],
  ['Table napkin', 'Linens', 500, 80, { 'lola-carmen': 80, 'sofia-debut': 150 }, 0],
  ['Chafing dish', 'Serving ware', 30, 6, { 'lola-carmen': 6, 'sofia-debut': 8 }, 1],
  ['Serving tray', 'Serving ware', 40, 8, { 'lola-carmen': 6, 'sofia-debut': 10 }, 0],
  ['Beverage dispenser', 'Serving ware', 10, 2, { 'lola-carmen': 2, 'sofia-debut': 3 }, 0],
  ['Soup tureen', 'Serving ware', 8, 2, {}, 0],
  ['Dinner plate', 'Tableware', 600, 100, { 'lola-carmen': 90, 'sofia-debut': 165 }, 14],
  ['Dessert plate', 'Tableware', 500, 80, { 'lola-carmen': 90, 'sofia-debut': 165 }, 0],
  ['Drinking glass', 'Tableware', 600, 100, { 'lola-carmen': 90, 'sofia-debut': 165 }, 21],
  ['Spoon and fork set', 'Tableware', 600, 100, { 'lola-carmen': 90, 'sofia-debut': 165 }, 0],
  ['Serving spoon and tongs', 'Tableware', 60, 10, { 'lola-carmen': 12, 'sofia-debut': 16 }, 0],
  ['Gas burner', 'Kitchen', 6, 2, { 'sofia-debut': 2 }, 1],
  ['LPG tank', 'Kitchen', 8, 2, { 'sofia-debut': 2 }, 0],
  ['Large cooking pot', 'Kitchen', 12, 3, { 'sofia-debut': 3 }, 0],
  ['Ice cooler', 'Kitchen', 10, 2, { 'lola-carmen': 2, 'sofia-debut': 3 }, 0],
  ['LED par light', 'Lights and sound', 16, 4, { 'sofia-debut': 12 }, 0],
  ['Speaker set', 'Lights and sound', 2, 1, { 'sofia-debut': 2 }, 0],
  ['Wireless microphone', 'Lights and sound', 4, 1, { 'sofia-debut': 2 }, 1],
  ['Centrepiece vase', 'Decor', 40, 8, { 'sofia-debut': 15 }, 2],
  ['Backdrop frame', 'Decor', 4, 1, { 'sofia-debut': 1 }, 0]
];

/**
 * Build the inventory items and the next item-code number. Timestamps are relative to today.
 * `refs` maps each seed reservation key to its reference, e.g. { 'lola-carmen': 'RES-2026-0915-01' } (the REF map in seed.js).
 */
export function buildInventorySeed(refs, actor = 'Teresa Marquez') {
  const today = todayISO();
  // Timestamp `offset` days from today at a given hour
  const at = (offset, hour) => {
    const [y, m, d] = addDays(today, offset).split('-').map(Number);
    return new Date(y, m - 1, d, hour).getTime();
  };

  const items = ITEMS.map(([name, category, total, lowStockAt, keyedAllocations, damaged], i) => {
    // { 'lola-carmen': 80 } -> { 'RES-2026-0915-01': 80 }
    const allocations = Object.fromEntries(Object.entries(keyedAllocations).map(([key, qty]) => [refs[key], qty]));
    const history = [{ at: at(-90, 9), actor, text: `Added to inventory with ${total} pcs.` }];
    if (damaged) history.push({ at: at(-6, 16), actor, text: `Reported ${damaged} pcs damaged after an event.` });
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
      notes: '',
      archived: false,
      history
    };
  });
  return { items, counter: ITEMS.length };
}
