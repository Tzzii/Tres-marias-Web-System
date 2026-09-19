import { SETUP_STYLES } from './config.js';
import { ApiError, clone, latency, read, uid, write } from './store.js';

/**
 * Packages and additional charges (add-ons): public browsing plus the admin package manager.
 * A package is a flat-priced set of equipment and service (no food); add-ons have no fixed
 * price because the admin prices them in each quotation.
 */

/** Packages list. By default only visible, non-archived ones (what customers see). */
export async function listPackages({ includeHidden = false, includeArchived = false } = {}) {
  await latency(150, 380);
  return clone(
    read().packages.filter((p) => (includeArchived || !p.archived) && (includeHidden || p.visible))
  );
}

/** One public package by its URL name, e.g. 'package-1'. */
export async function getPackageBySlug(slug) {
  await latency(150, 350);
  const pkg = read().packages.find((p) => p.slug === slug && !p.archived && p.visible);
  if (!pkg) throw new ApiError('NOT_FOUND', 'This package is no longer available.');
  return clone(pkg);
}

export async function listAddons({ includeArchived = false } = {}) {
  await latency(120, 300);
  return clone(read().addons.filter((a) => includeArchived || !a.archived));
}

/** Everything the reservation form needs in one call: visible packages and active add-ons. */
export async function getCatalog() {
  await latency(180, 420);
  const data = read();
  return clone({
    packages: data.packages.filter((p) => !p.archived && p.visible),
    addons: data.addons.filter((a) => !a.archived)
  });
}

// Turn a name into a URL-safe slug: "Package 1 with Waiters!" -> "package-1-with-waiters" (accents removed)
const slugify = (value) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/**
 * Admin: update a package if it has an id, otherwise create a new (hidden) one. Names must be unique.
 * Expects { name, price, guests, description, items: [{ qty, name }], setups: ['Buffet', …], visible }.
 * `setups` needs at least one known setup style; it is stored in SETUP_STYLES order.
 */
export async function savePackage(pkg) {
  await latency(350, 650);
  return write((data) => {
    const slug = slugify(pkg.name);
    const clash = data.packages.find((p) => p.slug === slug && p.id !== pkg.id);
    if (clash) throw new ApiError('NAME_TAKEN', 'Another package already uses this name.', { field: 'name' });
    const setups = SETUP_STYLES.filter((s) => (pkg.setups || []).includes(s));
    if (!setups.length) throw new ApiError('INVALID', 'Choose at least one setup style.', { field: 'setups' });
    pkg = { ...pkg, setups };

    if (pkg.id) {
      const index = data.packages.findIndex((p) => p.id === pkg.id);
      if (index < 0) throw new ApiError('NOT_FOUND', 'Package not found.');
      data.packages[index] = { ...data.packages[index], ...pkg, slug };
      return clone(data.packages[index]);
    }
    const created = {
      ...pkg,
      id: `pkg-${slug}-${Date.now().toString(36).slice(-4)}`,
      slug,
      mood: data.packages.length % 4,
      icon: 'restaurant',
      featured: false,
      visible: pkg.visible ?? false,
      archived: false
    };
    data.packages.push(created);
    return clone(created);
  });
}

/** Admin: show or hide a package on the website. */
export async function setPackageVisibility(id, visible) {
  await latency(200, 400);
  return write((data) => {
    const pkg = data.packages.find((p) => p.id === id);
    if (!pkg) throw new ApiError('NOT_FOUND', 'Package not found.');
    pkg.visible = visible;
    return clone(pkg);
  });
}

/** Admin: archive (also hides it) or restore a package. */
export async function setPackageArchived(id, archived) {
  await latency(250, 450);
  return write((data) => {
    const pkg = data.packages.find((p) => p.id === id);
    if (!pkg) throw new ApiError('NOT_FOUND', 'Package not found.');
    pkg.archived = archived;
    if (archived) pkg.visible = false;
    return clone(pkg);
  });
}

/** Admin: update or create an add-on (name and description; the price is set in each quotation). */
export async function saveAddon(addon) {
  await latency(300, 550);
  return write((data) => {
    const name = addon.name.trim();
    if (data.addons.some((a) => a.name.toLowerCase() === name.toLowerCase() && a.id !== addon.id)) {
      throw new ApiError('NAME_TAKEN', 'An additional charge with this name already exists.', { field: 'name' });
    }
    if (addon.id) {
      const existing = data.addons.find((a) => a.id === addon.id);
      if (!existing) throw new ApiError('NOT_FOUND', 'Add-on not found.');
      Object.assign(existing, { name, description: addon.description.trim() });
      return clone(existing);
    }
    const created = {
      id: uid('add'),
      name,
      description: addon.description.trim(),
      archived: false
    };
    data.addons.push(created);
    return clone(created);
  });
}

/** Admin: archive or restore an add-on. */
export async function setAddonArchived(id, archived) {
  await latency(200, 400);
  return write((data) => {
    const addon = data.addons.find((a) => a.id === id);
    if (!addon) throw new ApiError('NOT_FOUND', 'Add-on not found.');
    addon.archived = archived;
    return clone(addon);
  });
}
