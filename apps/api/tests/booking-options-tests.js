import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanMenu,
  menuProblem,
  menuCount,
  buffetDrinks,
  dessertSummary,
  DESSERT_ADDON_ID
} from '@tm/shared/src/domain/menu.js';
import { menuDishes } from '@tm/shared/src/domain/reservation.js';
import { cleanStyling, stylingProblem, STYLING_THEMES, METALLICS } from '@tm/shared/src/domain/styling.js';
import { themeColorSchemes, RAINBOW_COLORS } from '@tm/shared/src/domain/themeColors.js';
import { computeQuote } from '@tm/shared/src/services/pricing.js';
const menu = {
  pork: ['Lechon Kawali', 'Kare-Kare'],
  chicken: ['Inasal'],
  vegetable: ['Chopsuey'],
  fish: [],
  juice: 'Pineapple',
  dessert: { name: 'Leche Flan', description: 'Individual portions' }
};
test('four dishes can omit fish and allocate a second pork choice', () => {
  assert.equal(menuProblem(menu), null);
  assert.equal(menuCount(menu), 4);
  assert.equal(menuDishes({ serviceType: 'Buffet and Catering', menu }).length, 4);
});
test('under, over, duplicates and blank custom choices fail', () => {
  assert.equal(menuProblem({ ...menu, pork: ['Lechon Kawali'] }).field, 'menu.total');
  assert.equal(menuProblem({ ...menu, fish: ['Fish Fillet'] }).field, 'menu.total');
  assert.equal(menuProblem({ ...menu, pork: ['A dish', 'Another', 'Third'] }).field, 'menu.pork');
  assert.equal(menuProblem({ ...menu, pork: ['Dish', ' dish '] }).field, 'menu.pork');
  assert.equal(menuProblem({ ...menu, pork: ['Lechon Kawali', ''] }).field, 'menu.pork');
  assert.equal(menuProblem({ ...menu, pork: ['Lechon Kawali', 2] }).field, 'menu.pork');
});
test('legacy text menus remain readable and editable', () => {
  const old = { pork: 'Adobo', chicken: 'Fried Chicken', fish: 'Escabeche', vegetable: 'Laing' };
  assert.equal(menuProblem(old), null);
  assert.equal(menuDishes({ serviceType: 'Buffet and Catering', menu: old })[0].name, 'Adobo');
  assert.deepEqual(cleanMenu(old).pork, ['Adobo']);
});
test('dessert required only for its additional charge and works with catering only', () => {
  assert.equal(menuProblem({}, { buffet: false }), null);
  assert.equal(menuProblem({}, { buffet: false, dessert: true }).field, 'menu.dessert.name');
  assert.deepEqual(cleanMenu(menu, { buffet: false, dessert: true }), { dessert: menu.dessert });
  assert.equal(cleanMenu(menu, { dessert: false }).dessert, undefined);
});
test('juice and dessert details round trip without being part of the four dishes', () => {
  const saved = JSON.parse(JSON.stringify(cleanMenu(menu, { dessert: true })));
  assert.equal(menuCount(saved), 4);
  assert.equal(buffetDrinks(saved), 'Unlimited water and juice (Pineapple)');
  assert.match(dessertSummary(saved), /Individual portions/);
  assert.equal(menuProblem({ ...menu, juice: 'x'.repeat(121) }).field, 'menu.juice');
});
test('dessert is quoted separately and does not change buffet rate', () => {
  const input = {
    pkg: { price: 12000, guests: 100 },
    serviceType: 'Buffet and Catering',
    guests: 100,
    pricePerPlate: 600,
    addonIds: [DESSERT_ADDON_ID],
    addonPrices: { [DESSERT_ADDON_ID]: 1500 }
  };
  const q = computeQuote(input);
  assert.equal(q.addonTotals[DESSERT_ADDON_ID], 1500);
  assert.equal(q.pricePerPlate, 600);
});
test('every listed theme has complete suggested schemes that survive saved styling normalization', () => {
  for (const theme of STYLING_THEMES) {
    const schemes = themeColorSchemes(theme.name);
    assert.equal(schemes.length, 2, theme.name);
    for (const scheme of schemes) {
      assert.equal(scheme.colors.length, 3, scheme.label);
      const saved = cleanStyling({ theme: theme.name, colors: scheme.colors });
      assert.deepEqual(saved.colors, scheme.colors, scheme.label);
    }
  }
  assert.deepEqual(themeColorSchemes('Other'), []);
});
test('only ROYGBIV families are exposed; shades keep their saved names', () => {
  assert.deepEqual(
    RAINBOW_COLORS.map((c) => c.name),
    ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Indigo', 'Violet']
  );
  for (const family of RAINBOW_COLORS)
    for (const color of family.shades) assert.deepEqual(cleanStyling({ colors: [color] }).colors[0], color);
});

test('an optional color motif accepts no colors or two to five distinct colors', () => {
  const colors = RAINBOW_COLORS.slice(0, 6).map((family) => family.shades[0]);
  const check = (picked) => stylingProblem(cleanStyling({ theme: 'Royal', colors: picked }));
  assert.equal(stylingProblem(null), null);
  assert.equal(check([]), null);
  assert.equal(check(colors.slice(0, 1)).field, 'styling.colors');
  assert.match(check(colors.slice(0, 1)).message, /at least 2 colors/);
  for (const count of [2, 3, 4, 5]) assert.equal(check(colors.slice(0, count)), null);
  assert.equal(check(colors).field, 'styling.colors');
});

test('metallics count toward the motif minimum and duplicate colors cannot satisfy it', () => {
  const color = RAINBOW_COLORS[0].shades[0];
  const metal = { ...METALLICS[0], metallic: true };
  const check = (colors) => stylingProblem(cleanStyling({ colors }));
  assert.equal(check([color, metal]), null);
  assert.equal(check(METALLICS.slice(0, 2).map((entry) => ({ ...entry, metallic: true }))), null);
  assert.equal(check([color, { ...color, hex: color.hex.toLowerCase() }]).field, 'styling.colors');
  assert.equal(check([metal, metal]).field, 'styling.colors');
  assert.equal(check([color, { hex: 'invalid' }]).field, 'styling.colors');
});

test('removing colors validates the remaining motif without changing its main color order', () => {
  const colors = RAINBOW_COLORS.slice(0, 3).map((family) => family.shades[0]);
  for (const removed of [0, 1]) {
    const saved = cleanStyling({ colors: colors.slice(removed) });
    assert.equal(stylingProblem(saved), null);
    assert.deepEqual(saved.colors[0], colors[removed]);
  }
  assert.equal(stylingProblem(cleanStyling({ colors: colors.slice(2) })).field, 'styling.colors');
  assert.equal(stylingProblem(cleanStyling({ colors: [] })), null);
});
