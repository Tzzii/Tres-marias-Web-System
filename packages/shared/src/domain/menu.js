import { DISH_CATEGORIES, MENU_LINE_MAX } from '../services/config.js';
export const DESSERT_ADDON_ID = 'add-dessert';
export const DESSERT_CHOICES = ['Leche Flan', 'Buko Pandan', 'Fruit Salad', 'Mango Float', 'Maja Blanca', 'Other'];
const text = (v) => typeof v === 'string' ? v.toWellFormed().trim().replace(/[\u0000-\u001f]/g, ' ') : '';
// Legacy text lines count as one choice; new menus store individual choices.
export const dishesInMenu = (menu, key) => Array.isArray(menu?.[key]) ? menu[key].filter((v) => typeof v === 'string') : typeof menu?.[key] === 'string' && menu[key] ? [menu[key]] : [];
export const menuCount = (menu) => DISH_CATEGORIES.reduce((n, { key }) => n + dishesInMenu(menu, key).filter((v) => text(v).length >= 2).length, 0);
export function menuProblem(menu, { buffet = true, dessert = false } = {}) {
  if (buffet) {
    for (const { key, label } of DISH_CATEGORIES) {
      const raw = menu?.[key];
      if ((raw != null && typeof raw !== 'string' && !Array.isArray(raw)) || (Array.isArray(raw) && raw.some((v) => typeof v !== 'string'))) return { field: `menu.${key}`, message: 'Each dish must have a name.' };
      const choices = dishesInMenu(menu, key);
      if (choices.length > 2) return { field: `menu.${key}`, message: `Choose at most 2 dishes for ${label.toLowerCase()}.` };
      if (choices.some((v) => text(v).length < 2 || text(v).length > MENU_LINE_MAX)) return { field: `menu.${key}`, message: `Name each dish using 2 to ${MENU_LINE_MAX} characters, or remove the empty choice.` };
      if (new Set(choices.map((v) => text(v).toLowerCase())).size !== choices.length) return { field: `menu.${key}`, message: 'Choose two different dishes.' };
    }
    if (menuCount(menu) !== 4) return { field: 'menu.total', message: `Choose exactly 4 dishes in total. You have ${menuCount(menu)}; each category allows up to 2.` };
    if (text(menu?.juice).length > 120) return { field: 'menu.juice', message: 'Keep your juice preference to 120 characters.' };
  }
  if (dessert) {
    const name = text(menu?.dessert?.name);
    if (name.length < 2 || name.length > 120) return { field: 'menu.dessert.name', message: 'Specify your dessert using 2 to 120 characters.' };
    if (text(menu?.dessert?.description).length > 500) return { field: 'menu.dessert.description', message: 'Keep the dessert description to 500 characters.' };
  }
  return null;
}
export function cleanMenu(menu, { buffet = true, dessert = false } = {}) {
  return {
    ...(buffet ? Object.fromEntries(DISH_CATEGORIES.map(({ key }) => [key, dishesInMenu(menu, key).map(text)])) : {}),
    ...(buffet ? { juice: text(menu?.juice) } : {}),
    ...(dessert ? { dessert: { name: text(menu?.dessert?.name), description: text(menu?.dessert?.description) } } : {})
  };
}
export const buffetDrinks = (menu) => menu?.juice ? `Unlimited water and juice (${menu.juice})` : 'Unlimited water and juice';
export const dessertSummary = (menu) => menu?.dessert?.name ? `${menu.dessert.name}${menu.dessert.description ? ` — ${menu.dessert.description}` : ''}` : '';
