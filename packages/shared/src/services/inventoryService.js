import { HOLDS_DATE } from '../utils/status.js';
import { INVENTORY_CATEGORIES } from './config.js';
import { ApiError, clone, latency, nextId, read, write } from './store.js';

/**
 * Equipment inventory (admin): what Tres Marias owns, what is out at events and what is damaged.
 *
 * Each item stores `total`, `damaged` and `allocations` ({ reservationRef or 'none': quantity out }).
 * In use = sum of allocations; Available = total − in use − damaged.
 * Check out moves Available → In use, Return moves In use → Available (or Damaged),
 * Report damage moves Available → Damaged, Repair moves Damaged → Available, Dispose removes damaged pieces from the total.
 * Every change is written to the item's history; check-outs and returns for an event also go in that reservation's audit trail.
 */

// Key used in `allocations` for pieces checked out without an event
export const NO_EVENT = 'none';

// Name of the signed-in admin, for the history logs
const ADMIN_NAME = () => {
  try {
    const user = JSON.parse(sessionStorage.getItem('tm.admin.session') || localStorage.getItem('tm.admin.session'));
    return (user && user.user && user.user.name) || 'Tres Marias team';
  } catch (e) {
    return 'Tres Marias team';
  }
};

// Sum of pieces currently out at events
const inUseOf = (item) => Object.values(item.allocations).reduce((sum, qty) => sum + qty, 0);

/**
 * Item plus its computed counts and stock level:
 * stock is 'out' when nothing is available, 'low' when available is at or below the alert level, else 'ok'.
 * `out` lists where the in-use pieces are, with the event name and date when linked to a reservation.
 */
function enrich(item, data) {
  const inUse = inUseOf(item);
  const available = item.total - inUse - item.damaged;
  const stock = available <= 0 ? 'out' : available <= item.lowStockAt ? 'low' : 'ok';
  const out = Object.entries(item.allocations).map(([ref, qty]) => {
    const reservation = ref === NO_EVENT ? null : data.reservations.find((r) => r.ref === ref);
    return { ref, qty, eventName: reservation ? reservation.eventName : '', eventDate: reservation ? reservation.date : '' };
  });
  return { ...clone(item), inUse, available, stock, out };
}

// Add an entry to an item's history. When linked to a reservation, also add it to that reservation's
// audit trail without the REF, e.g. "Equipment · Monobloc chair: Checked out 80 pcs."
const log = (data, item, text, ref) => {
  const actor = ADMIN_NAME();
  const linked = ref && ref !== NO_EVENT;
  item.history.push({ at: Date.now(), actor, text, ...(linked ? { ref } : {}) });
  if (linked) {
    const reservation = data.reservations.find((r) => r.ref === ref);
    if (reservation) reservation.activity.push({ at: Date.now(), actor, text: `Equipment · ${item.name}: ${text.replace(` for ${ref}`, '').replace(` from ${ref}`, '')}` });
  }
};

// Find an item or throw
const findItem = (data, id) => {
  const item = data.inventory.find((i) => i.id === id);
  if (!item) throw new ApiError('NOT_FOUND', 'Item not found.');
  return item;
};

// A whole number of at least `min`
const isCount = (value, min = 0) => Number.isInteger(value) && value >= min;

/** All items (archived ones only when asked), sorted by category order, then name. */
export async function listInventory({ includeArchived = false } = {}) {
  await latency(180, 420);
  const data = read();
  return data.inventory
    .filter((item) => includeArchived || !item.archived)
    .map((item) => enrich(item, data))
    .sort((a, b) => INVENTORY_CATEGORIES.indexOf(a.category) - INVENTORY_CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name));
}

/** Reservations equipment can be checked out for: approved to confirmed bookings, soonest first. */
export async function listCheckoutEvents() {
  await latency(120, 300);
  return read()
    .reservations.filter((r) => HOLDS_DATE.includes(r.status))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ ref: r.ref, eventName: r.eventName, date: r.date, guests: r.guests }));
}

// Check name, category and numbers of one new or edited item; `index` names the row in error messages
function validateItem(data, item, { id, index } = {}) {
  const field = (name) => (index === undefined ? { field: name } : { field: name, row: index });
  const name = (item.name || '').trim();
  if (name.length < 2) throw new ApiError('INVALID', 'Enter the item name.', field('name'));
  if (data.inventory.some((i) => i.id !== id && i.name.toLowerCase() === name.toLowerCase())) {
    throw new ApiError('NAME_TAKEN', `"${name}" is already in the inventory.`, field('name'));
  }
  if (!INVENTORY_CATEGORIES.includes(item.category)) throw new ApiError('INVALID', 'Choose a category.', field('category'));
  if (!isCount(item.total, 1) || item.total > 100000) throw new ApiError('INVALID', 'Enter a quantity from 1 to 100,000.', field('total'));
  if (!isCount(item.lowStockAt) || item.lowStockAt >= item.total) throw new ApiError('INVALID', 'The alert level must be below the total.', field('lowStockAt'));
  return name;
}

/** Add one or more new items. Names must be unique, including among the new rows. Returns the created items. */
export async function addInventoryItems(items) {
  await latency(350, 650);
  return write((data) => {
    if (!items.length) throw new ApiError('INVALID', 'Add at least one item.');
    // Validate every row before saving any, so a bad row doesn't leave half the list saved
    const names = items.map((item, index) => validateItem(data, item, { index }));
    const duplicate = names.findIndex((name, i) => names.findIndex((n) => n.toLowerCase() === name.toLowerCase()) !== i);
    if (duplicate >= 0) throw new ApiError('NAME_TAKEN', `"${names[duplicate]}" is listed twice.`, { field: 'name', row: duplicate });

    const created = items.map((item, index) => {
      const created = {
        id: `inv-${Date.now().toString(36)}-${index}`,
        code: nextId(data, 'inventory', 'EQ-'),
        name: names[index],
        category: item.category,
        total: item.total,
        lowStockAt: item.lowStockAt,
        allocations: {},
        damaged: 0,
        notes: (item.notes || '').trim(),
        archived: false,
        history: []
      };
      log(data, created, `Added to inventory with ${item.total} pcs.`);
      data.inventory.push(created);
      return created;
    });
    return created.map((item) => enrich(item, data));
  });
}

/** Edit an item's name, category, total, alert level and notes. The total can't drop below what is in use or damaged. */
export async function updateInventoryItem(id, changes) {
  await latency(300, 550);
  return write((data) => {
    const item = findItem(data, id);
    const name = validateItem(data, changes, { id });
    const minimum = inUseOf(item) + item.damaged;
    if (changes.total < minimum) throw new ApiError('INVALID', `The total can't be below ${minimum} (in use + damaged).`, { field: 'total' });

    // Describe what changed for the history
    const edits = [];
    if (item.name !== name) edits.push(`name to "${name}"`);
    if (item.category !== changes.category) edits.push(`category to ${changes.category}`);
    if (item.total !== changes.total) edits.push(`total from ${item.total} to ${changes.total} pcs`);
    if (item.lowStockAt !== changes.lowStockAt) edits.push(`low-stock alert to ${changes.lowStockAt}`);
    if (item.notes !== (changes.notes || '').trim()) edits.push('notes');
    Object.assign(item, { name, category: changes.category, total: changes.total, lowStockAt: changes.lowStockAt, notes: (changes.notes || '').trim() });
    if (edits.length) log(data, item, `Changed ${edits.join(', ')}.`);
    return enrich(item, data);
  });
}

/**
 * Move pieces between Available, In use and Damaged.
 * action: 'checkout' { qty, ref? } · 'return' { ref, qty, damagedQty } · 'damage' { qty, note } · 'repair' { qty } · 'dispose' { qty, note }
 */
export async function moveInventoryStock(id, action, { qty = 0, damagedQty = 0, ref = NO_EVENT, note = '' } = {}) {
  await latency(300, 550);
  return write((data) => {
    const item = findItem(data, id);
    if (item.archived) throw new ApiError('INVALID', 'Restore this item before changing its stock.');
    const available = item.total - inUseOf(item) - item.damaged;
    const reason = note.trim();
    const suffix = reason ? ` Reason: ${reason}` : '';

    if (action === 'checkout') {
      if (!isCount(qty, 1)) throw new ApiError('INVALID', 'Enter how many to check out.', { field: 'qty' });
      if (qty > available) throw new ApiError('INVALID', `Only ${available} pcs are available.`, { field: 'qty' });
      if (ref !== NO_EVENT) {
        const reservation = data.reservations.find((r) => r.ref === ref);
        if (!reservation || !HOLDS_DATE.includes(reservation.status)) throw new ApiError('INVALID', 'Choose an approved or confirmed reservation.', { field: 'ref' });
      }
      item.allocations[ref] = (item.allocations[ref] || 0) + qty;
      log(data, item, ref === NO_EVENT ? `Checked out ${qty} pcs (no event linked).${suffix}` : `Checked out ${qty} pcs for ${ref}.${suffix}`, ref);
    } else if (action === 'return') {
      const out = item.allocations[ref] || 0;
      if (!out) throw new ApiError('INVALID', 'Nothing is checked out there.', { field: 'ref' });
      if (!isCount(qty) || !isCount(damagedQty) || qty + damagedQty < 1) throw new ApiError('INVALID', 'Enter how many came back.', { field: 'qty' });
      if (qty + damagedQty > out) throw new ApiError('INVALID', `Only ${out} pcs are out there.`, { field: 'qty' });
      item.allocations[ref] = out - qty - damagedQty;
      if (!item.allocations[ref]) delete item.allocations[ref];
      item.damaged += damagedQty;
      const where = ref === NO_EVENT ? '' : ` from ${ref}`;
      log(data, item, `Returned ${qty + damagedQty} pcs${where}${damagedQty ? ` (${damagedQty} damaged)` : ''}.${suffix}`, ref);
    } else if (action === 'damage') {
      if (!isCount(qty, 1)) throw new ApiError('INVALID', 'Enter how many are damaged.', { field: 'qty' });
      if (qty > available) throw new ApiError('INVALID', `Only ${available} pcs are available.`, { field: 'qty' });
      if (!reason) throw new ApiError('INVALID', 'Describe the damage.', { field: 'note' });
      item.damaged += qty;
      log(data, item, `Reported ${qty} pcs damaged.${suffix}`);
    } else if (action === 'repair') {
      if (!isCount(qty, 1)) throw new ApiError('INVALID', 'Enter how many were repaired.', { field: 'qty' });
      if (qty > item.damaged) throw new ApiError('INVALID', `Only ${item.damaged} pcs are damaged.`, { field: 'qty' });
      item.damaged -= qty;
      log(data, item, `Repaired ${qty} pcs; back to available.${suffix}`);
    } else if (action === 'dispose') {
      if (!isCount(qty, 1)) throw new ApiError('INVALID', 'Enter how many to dispose of.', { field: 'qty' });
      if (qty > item.damaged) throw new ApiError('INVALID', `Only ${item.damaged} pcs are damaged.`, { field: 'qty' });
      if (!reason) throw new ApiError('INVALID', 'Give a reason for disposal.', { field: 'note' });
      if (qty >= item.total) throw new ApiError('INVALID', 'Archive the item instead of disposing of every piece.', { field: 'qty' });
      item.damaged -= qty;
      item.total -= qty;
      item.lowStockAt = Math.min(item.lowStockAt, item.total - 1);
      log(data, item, `Disposed of ${qty} damaged pcs; total is now ${item.total}.${suffix}`);
    } else {
      throw new ApiError('INVALID', 'Unknown stock action.');
    }
    return enrich(item, data);
  });
}

/** Archive or restore several items. Items with pieces still out at events can't be archived. */
export async function setInventoryArchived(ids, archived) {
  await latency(250, 450);
  return write((data) => {
    const items = ids.map((id) => findItem(data, id));
    const busy = archived ? items.filter((item) => inUseOf(item) > 0) : [];
    if (busy.length) throw new ApiError('IN_USE', `Return all pieces first: ${busy.map((i) => i.name).join(', ')}.`);
    items.forEach((item) => {
      if (item.archived === archived) return;
      item.archived = archived;
      log(data, item, archived ? 'Archived.' : 'Restored from the archive.');
    });
    return { count: items.length };
  });
}
