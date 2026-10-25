import {
  linkByName,
  planAddonSizes,
  readAddonPrice,
  readAddonSizes,
  rentalPriceList,
  slugify,
  withListedSizes
} from '@tm/shared/src/domain/catalog.js';
import {
  DEFAULT_MIN_DOWNPAYMENT,
  DEFAULT_PRICE_PER_PLATE,
  DEFAULT_SIX_HOUR_FEE,
  DISH_CATEGORIES,
  MIN_DOWNPAYMENT_RANGE,
  PRICE_PER_PLATE_RANGE,
  RULES
} from '@tm/shared/src/services/config.js';
import { tx } from '../../db.js';
import crypto from 'node:crypto';
import { storage } from '../../integrations/storage/index.js';
import { readPhoto } from '../../lib/photos.js';
import { ApiError } from '../../lib/ApiError.js';
import { newId } from '../../lib/ids.js';
import { now } from '../../lib/time.js';
import * as repo from './catalog.repo.js';
import { sixHourFeeProblem } from '@tm/shared/src/services/pricing.js';

const MAX_PACKAGE_PRICE = 10_000_000;
const MAX_ITEMS = 100;
const MAX_ITEM_NAME = 120;
const MAX_ITEM_QTY = 100_000;

const peso = (amount) => `₱${amount.toLocaleString('en-PH')}`;
const invalid = (message, field) => new ApiError('INVALID', message, { field });

const toNumber = (value) =>
  typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;

const isDuplicate = (err, ...keys) =>
  err && err.code === 'ER_DUP_ENTRY' && keys.some((key) => String(err.sqlMessage || err.message).includes(key));

export function listPackages({ includeHidden = false, includeArchived = false } = {}, { admin = false } = {}) {
  return repo.listPackages({ includeHidden: admin && includeHidden, includeArchived: admin && includeArchived });
}

export async function getPackageBySlug(slug) {
  const pkg = await repo.findPublicPackageBySlug(slug);
  if (!pkg) throw new ApiError('NOT_FOUND', 'This package is no longer available.');
  return pkg;
}

export async function listAddons({ includeArchived = false } = {}, { admin = false } = {}) {
  return (await repo.listAddons({ includeArchived: admin && includeArchived })).map(withListedSizes);
}

export function listDishes({ includeArchived = false } = {}, { admin = false } = {}) {
  return repo.listDishes({ includeArchived: admin && includeArchived });
}

async function currentPricePerPlate() {
  return Number(await repo.getPricePerPlate()) || DEFAULT_PRICE_PER_PLATE;
}

export async function getPricePerPlate() {
  return { pricePerPlate: await currentPricePerPlate() };
}

async function currentMinDownpayment() {
  return Number(await repo.getMinDownpayment()) || DEFAULT_MIN_DOWNPAYMENT;
}

export async function getMinDownpayment() {
  return { minDownpayment: await currentMinDownpayment() };
}

export async function getSixHourFee() {
  return { sixHourFee: Number((await repo.getSixHourFee()) ?? DEFAULT_SIX_HOUR_FEE) };
}

export async function getPricingSettings() {
  const settings = await repo.getPricingSettings();
  return {
    pricePerPlate: Number(settings?.pricePerPlate) || DEFAULT_PRICE_PER_PLATE,
    minDownpayment: Number(settings?.minDownpayment) || DEFAULT_MIN_DOWNPAYMENT,
    sixHourFee: Number(settings?.sixHourFee ?? DEFAULT_SIX_HOUR_FEE)
  };
}

export async function setSixHourFee(value) {
  const problem = sixHourFeeProblem(value);
  if (problem) throw invalid(problem, 'sixHourFee');
  await repo.setSixHourFee(Number(value), now());
  return { sixHourFee: Number(value) };
}

export async function listRentalItems() {
  return rentalPriceList(await repo.listRentableItems());
}

export async function getCatalog() {
  const [packages, addons, dishes, pricing, rentals] = await Promise.all([
    repo.listPackages(),
    repo.listAddons(),
    repo.listDishes(),
    getPricingSettings(),
    listRentalItems()
  ]);
  return { packages, addons, dishes, ...pricing, rentals };
}

function packageValues(values, rental) {
  const name = values.name.trim();
  const description = values.description.trim();
  if (name.length < 3) throw invalid('Enter a package name.', 'name');
  if (description.length < 10) throw invalid('Describe the package in at least 10 characters.', 'description');
  if (!slugify(name)) throw invalid('Use letters or numbers in the package name.', 'name');
  if (rental) return { name, description, price: 0, guests: 0, items: [] };

  const price = toNumber(values.price);
  if (!price || price < 100) throw invalid('Enter a price of at least ₱100.', 'price');
  if (!Number.isInteger(price)) throw invalid('Enter the price in whole pesos.', 'price');
  if (price > MAX_PACKAGE_PRICE) throw invalid(`Enter a price of at most ${peso(MAX_PACKAGE_PRICE)}.`, 'price');

  const guests = toNumber(values.guests);
  if (!Number.isInteger(guests) || guests < 1 || guests > RULES.maxGuests)
    throw invalid(`Between 1 and ${RULES.maxGuests}.`, 'guests');

  return { name, description, price, guests, items: packageItems(values.items) };
}

function packageItems(list) {
  if (!Array.isArray(list) || list.length === 0) throw invalid('List at least one item.', 'items');
  if (list.length > MAX_ITEMS) throw invalid(`List at most ${MAX_ITEMS} items.`, 'items');
  return list.map((item) => {
    const name = item && typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) throw invalid('Give every item a name.', 'items');
    if (name.length > MAX_ITEM_NAME) throw invalid(`Keep each item to ${MAX_ITEM_NAME} characters or fewer.`, 'items');
    const qty = item.qty ?? null;
    if (qty !== null && (!Number.isInteger(qty) || qty < 1 || qty > MAX_ITEM_QTY)) {
      throw invalid(
        `Start a line with a quantity from 1 to ${MAX_ITEM_QTY.toLocaleString('en-PH')}, or leave the number out.`,
        'items'
      );
    }
    return qty !== null && typeof item.grows === 'boolean' ? { qty, name, grows: item.grows } : { qty, name };
  });
}

const packageTaken = () => new ApiError('NAME_TAKEN', 'Another package already uses this name.', { field: 'name' });

export async function savePackage(id, values, file) {
  if (file && values.removePhoto) throw invalid('Choose a new photo or remove the current photo, not both.', 'photo');
  const type = file ? readPhoto(file) : null;
  let newKey = null;
  let oldKey = null;
  const savedId = id || newId('pkg');
  try {
    await tx(async (conn) => {
      const existing = id ? await repo.findPackageById(id, conn, true) : null;
      if (id && !existing) throw new ApiError('NOT_FOUND', 'Package not found.');
      const clean = packageValues(values, Boolean(existing && existing.kind === 'rental'));
      const slug = slugify(clean.name);
      if (await repo.packageSlugTaken(slug, id || '', conn)) throw packageTaken();
      if (existing) {
        await repo.updatePackage(id, { ...clean, slug, visible: values.visible ?? existing.visible }, conn);
      } else {
        const { total, nextOrder } = await repo.packageCounts(conn);
        await repo.insertPackage(
          {
            ...clean,
            id: savedId,
            slug,
            kind: 'package',
            mood: total % 4,
            icon: 'restaurant',
            featured: false,
            visible: values.visible ?? false,
            archived: false,
            sortOrder: nextOrder
          },
          conn
        );
      }
      if (file || values.removePhoto) {
        oldKey = (await repo.findPackagePhoto(savedId, conn))?.key;
        if (file) newKey = await storage.put(`packages/${crypto.randomUUID()}.${type.ext}`, file.buffer);
        await repo.setPackagePhoto(savedId, file ? { key: newKey, mime: type.mime } : null, conn);
      }
    });
  } catch (err) {
    if (newKey) await storage.remove(newKey).catch(() => {});
    if (isDuplicate(err, 'uq_packages_slug', 'uq_packages_name')) throw packageTaken();
    throw err;
  }
  if (oldKey) await storage.remove(oldKey).catch((err) => console.error('[package-photo] Cleanup failed:', err.code));
  return repo.findPackageById(savedId);
}

export async function getPackagePhoto(id, { admin = false, version } = {}) {
  const photo = await repo.findPackagePhoto(id);
  if (!photo || (!admin && (!photo.visible || photo.archived))) throw new ApiError('NOT_FOUND', 'Package not found.');
  if (!photo?.key) throw new ApiError('NOT_FOUND', 'No photo has been uploaded for this package.');
  if (version && version !== photo.key.split('/').pop()) throw new ApiError('NOT_FOUND', 'Photo not found.');
  return { key: photo.key, mime: photo.mime };
}

async function packageOrFail(id) {
  const pkg = await repo.findPackageById(id);
  if (!pkg) throw new ApiError('NOT_FOUND', 'Package not found.');
  return pkg;
}

export async function setPackageVisibility(id, visible) {
  await packageOrFail(id);
  await repo.setPackageVisible(id, visible);
  return repo.findPackageById(id);
}

export async function setPackageArchived(id, archived) {
  await packageOrFail(id);
  await repo.setPackageArchived(id, archived);
  return repo.findPackageById(id);
}

const addonTaken = () =>
  new ApiError('NAME_TAKEN', 'An additional charge with this name already exists.', { field: 'name' });

export async function saveAddon(id, values) {
  const name = values.name.trim();
  const description = values.description.trim();
  if (name.length < 3) throw invalid('Enter the name.', 'name');
  if (description.length < 10) throw invalid('Add a short description.', 'description');
  const current = id ? await repo.findAddonById(id) : null;
  if (id && !current) throw new ApiError('NOT_FOUND', 'Add-on not found.');
  const hasPackages = current ? current.hasPackages : values.hasPackages === true;
  const sized = readAddonSizes(values.sizes, { packages: hasPackages });
  if (sized.problem) throw invalid(sized.problem, sized.field);
  let { sizes } = sized;
  const own = sizes.length ? { price: null } : readAddonPrice(values.price);
  if (own.problem) throw invalid(own.problem, 'price');
  if (await repo.addonNameTaken(name, id || '')) throw addonTaken();

  const ownIds = new Set([id, ...(current ? current.sizes.map((s) => s.id) : [])].filter(Boolean));
  const inventory = await repo.listInventoryForLinks();
  const linked = linkByName(
    { name, inventoryItemId: typeof values.inventoryItemId === 'string' ? values.inventoryItemId : null, sizes },
    inventory,
    ownIds
  );
  const ownItem = linked.inventoryItemId;
  sizes = linked.sizes;
  [[ownItem, 'inventoryItemId'], ...sizes.map((s, i) => [s.inventoryItemId, `sizes.${i}.inventoryItemId`])]
    .filter(([itemId]) => itemId)
    .forEach(([itemId, field]) => {
      const item = inventory.find((i) => i.id === itemId);
      if (!item || item.archived) throw invalid('That inventory item no longer exists.', field);
      if (item.addonId && !ownIds.has(item.addonId))
        throw invalid(`${item.name} is already used by another additional charge.`, field);
    });

  const clean = {
    name,
    description,
    price: own.price,
    hasQuantity: sizes.length || hasPackages ? false : values.hasQuantity,
    hasPackages
  };
  const sizeCounted = !hasPackages;
  const savedId = id || newId('add');
  const plan = planAddonSizes(current ? current.sizes : [], sizes);
  const addedIds = plan.add.map(() => newId('add'));
  const links = [
    ...(ownItem ? [[savedId, ownItem]] : []),
    ...plan.update.filter((s) => s.inventoryItemId).map((s) => [s.id, s.inventoryItemId]),
    ...plan.add.map((s, i) => [addedIds[i], s.inventoryItemId]).filter(([, itemId]) => itemId)
  ];
  try {
    await tx(async (conn) => {
      if (id) await repo.updateAddon(id, clean, conn);
      else
        await repo.insertAddon(
          { ...clean, id: savedId, archived: false, sortOrder: await repo.nextAddonOrder(conn) },
          conn
        );
      for (const size of plan.update) await repo.updateAddonSize(size.id, { ...size, hasQuantity: sizeCounted }, conn);
      for (const sizeId of plan.archive) await repo.setAddonArchived(sizeId, true, conn);
      for (const [i, size] of plan.add.entries()) {
        await repo.insertAddon(
          {
            id: addedIds[i],
            parentId: savedId,
            name: size.name,
            description: size.description,
            price: size.price,
            hasQuantity: sizeCounted,
            archived: false,
            sortOrder: size.sortOrder
          },
          conn
        );
      }
      await repo.linkInventoryItems(conn, [savedId, ...ownIds], links);
    });
  } catch (err) {
    if (isDuplicate(err, 'uq_addons_name')) throw addonTaken();
    throw err;
  }
  return withListedSizes(await repo.findAddonById(savedId));
}

const addonInUse = (name, count) =>
  new ApiError(
    'IN_USE',
    `${name} is on ${count} reservation${count === 1 ? '' : 's'}, so it can't be deleted. Archive it instead to stop offering it.`
  );

export async function deleteAddon(id) {
  const charge = await repo.findAddonById(id);
  if (!charge) throw new ApiError('NOT_FOUND', 'Add-on not found.');
  const ids = [charge.id, ...charge.sizes.map((s) => s.id)];
  const booked = await repo.countAddonBookings(ids);
  if (booked) throw addonInUse(charge.name, booked);
  try {
    await tx((conn) => repo.deleteAddon(conn, charge.id, ids));
  } catch (err) {
    if (err && err.code === 'ER_ROW_IS_REFERENCED_2') throw addonInUse(charge.name, await repo.countAddonBookings(ids));
    throw err;
  }
  return { id };
}

export async function setAddonArchived(id, archived) {
  if (!(await repo.findAddonById(id))) throw new ApiError('NOT_FOUND', 'Add-on not found.');
  await repo.setAddonArchived(id, archived);
  return withListedSizes(await repo.findAddonById(id));
}

const dishTaken = () =>
  new ApiError('NAME_TAKEN', 'This category already has a dish with that name.', { field: 'name' });

export async function saveDish(id, values) {
  const name = values.name.trim();
  if (name.length < 2) throw invalid('Enter the name of the dish.', 'name');
  if (!DISH_CATEGORIES.some((c) => c.key === values.category))
    throw invalid('Choose which part of the menu this dish belongs to.', 'category');
  if (id && !(await repo.findDishById(id))) throw new ApiError('NOT_FOUND', 'Dish not found.');
  if (await repo.dishNameTaken(values.category, name, id || '')) throw dishTaken();

  if (/^kare[\s-]*kare$/i.test(name) && values.category !== 'pork')
    throw invalid('Kare-Kare belongs under Pork Dish.', 'category');
  const clean = { name, category: values.category };
  const savedId = id || newId('dish');
  try {
    if (id) await repo.updateDish(id, clean);
    else await repo.insertDish({ ...clean, id: savedId, archived: false, sortOrder: await repo.nextDishOrder() });
  } catch (err) {
    if (isDuplicate(err, 'uq_dishes_category_name')) throw dishTaken();
    throw err;
  }
  return repo.findDishById(savedId);
}

export async function setDishArchived(id, archived) {
  if (!(await repo.findDishById(id))) throw new ApiError('NOT_FOUND', 'Dish not found.');
  await repo.setDishArchived(id, archived);
  return repo.findDishById(id);
}

export async function deleteDish(id) {
  if (!(await repo.findDishById(id))) throw new ApiError('NOT_FOUND', 'Dish not found.');
  await repo.deleteDish(id);
  return { id };
}

export async function setPricePerPlate(value) {
  const amount = toNumber(value);
  const { min, max } = PRICE_PER_PLATE_RANGE;
  if (!Number.isInteger(amount) || amount < min || amount > max) {
    throw invalid(
      `The buffet price per person must be between ₱${min} and ₱${max.toLocaleString('en-PH')}.`,
      'pricePerPlate'
    );
  }
  await repo.setPricePerPlate(amount, now());
  return { pricePerPlate: amount };
}

export async function setMinDownpayment(value) {
  const amount = toNumber(value);
  const { min, max } = MIN_DOWNPAYMENT_RANGE;
  if (!Number.isInteger(amount) || amount < min || amount > max) {
    throw invalid(
      `The minimum downpayment must be between ₱${min.toLocaleString('en-PH')} and ₱${max.toLocaleString('en-PH')}.`,
      'minDownpayment'
    );
  }
  await repo.setMinDownpayment(amount, now());
  return { minDownpayment: amount };
}
