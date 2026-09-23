import { HOLDS_DATE } from '../utils/status.js';
import { INVENTORY_CATEGORIES, isRental } from './config.js';
import { financials, postAdminMessage } from './reservationService.js';
import { ApiError, clone, latency, nextId, read, write } from './store.js';

/**
 * Equipment inventory (admin): what Tres Marias owns, what is out at events and what is damaged.
 *
 * Each item stores `total`, `damaged` and `allocations` ({ reservationRef or 'none': quantity out }).
 * In use = sum of allocations; Available = total − in use − damaged.
 * Check out moves Available → In use, Return moves In use → Available (or Damaged),
 * Report damage moves Available → Damaged, Repair moves Damaged → Available, Dispose removes damaged pieces from the total.
 * Every change is written to the item's history; check-outs and returns for an event also go in that reservation's audit trail.
 *
 * Items can also be rented out through the Equipment Rental package: `rentable` turns that on,
 * `rentPrice` is what one piece costs for one event and `damageFee` what the customer pays for each
 * piece that comes back damaged or not at all. A rental booking copies both prices when it is made,
 * so changing them here only affects bookings made afterwards.
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

/**
 * Reservations equipment can be checked out for: approved to confirmed bookings, soonest first.
 * `rental` is true for an Equipment Rental booking (it has no guest count).
 */
export async function listCheckoutEvents() {
  await latency(120, 300);
  return read()
    .reservations.filter((r) => HOLDS_DATE.includes(r.status))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ ref: r.ref, eventName: r.eventName, date: r.date, guests: r.guests, rental: isRental(r.serviceType) }));
}

/**
 * Check name, category, numbers and rental settings of one new or edited item; `index` names the row
 * in error messages. A rentable item needs a rental price; the damage fee may be 0 (nothing charged).
 * Returns the cleaned name and rental settings.
 */
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
  const rentable = Boolean(item.rentable);
  const rentPrice = rentable ? Number(item.rentPrice) : 0;
  const damageFee = rentable ? Number(item.damageFee) || 0 : 0;
  if (rentable && (!isCount(rentPrice, 1) || rentPrice > 100000)) throw new ApiError('INVALID', 'Enter a rental price from ₱1 to ₱100,000.', field('rentPrice'));
  if (rentable && (!isCount(damageFee) || damageFee > 1000000)) throw new ApiError('INVALID', 'Enter a damage fee from ₱0 to ₱1,000,000.', field('damageFee'));
  return { name, rentable, rentPrice, damageFee };
}

// "₱1,200" for the history texts
const peso = (value) => `₱${Number(value).toLocaleString('en-PH')}`;

/**
 * Add one or more new items. Names must be unique, including among the new rows. Returns the created items.
 * Each row may also carry `rentable`, `rentPrice` and `damageFee` (not rentable when left out).
 */
export async function addInventoryItems(items) {
  await latency(350, 650);
  return write((data) => {
    if (!items.length) throw new ApiError('INVALID', 'Add at least one item.');
    // Validate every row before saving any, so a bad row doesn't leave half the list saved
    const checked = items.map((item, index) => validateItem(data, item, { index }));
    const names = checked.map((c) => c.name);
    const duplicate = names.findIndex((name, i) => names.findIndex((n) => n.toLowerCase() === name.toLowerCase()) !== i);
    if (duplicate >= 0) throw new ApiError('NAME_TAKEN', `"${names[duplicate]}" is listed twice.`, { field: 'name', row: duplicate });

    const created = items.map((item, index) => {
      const { rentable, rentPrice, damageFee } = checked[index];
      const created = {
        id: `inv-${Date.now().toString(36)}-${index}`,
        code: nextId(data, 'inventory', 'EQ-'),
        name: names[index],
        category: item.category,
        total: item.total,
        lowStockAt: item.lowStockAt,
        allocations: {},
        damaged: 0,
        rentable,
        rentPrice,
        damageFee,
        notes: (item.notes || '').trim(),
        archived: false,
        history: []
      };
      log(data, created, `Added to inventory with ${item.total} pcs.${rentable ? ` For rent at ${peso(rentPrice)} per piece (damage fee ${peso(damageFee)}).` : ''}`);
      data.inventory.push(created);
      return created;
    });
    return created.map((item) => enrich(item, data));
  });
}

/**
 * Edit an item's name, category, total, alert level, rental settings and notes. The total can't drop
 * below what is in use or damaged. A new rental price or damage fee only applies to rental bookings
 * made from now on: bookings already made keep the prices they were made at. The history records
 * the old and the new price.
 */
export async function updateInventoryItem(id, changes) {
  await latency(300, 550);
  return write((data) => {
    const item = findItem(data, id);
    const { name, rentable, rentPrice, damageFee } = validateItem(data, changes, { id });
    const minimum = inUseOf(item) + item.damaged;
    if (changes.total < minimum) throw new ApiError('INVALID', `The total can't be below ${minimum} (in use + damaged).`, { field: 'total' });

    // Describe what changed for the history
    const edits = [];
    if (item.name !== name) edits.push(`name to "${name}"`);
    if (item.category !== changes.category) edits.push(`category to ${changes.category}`);
    if (item.total !== changes.total) edits.push(`total from ${item.total} to ${changes.total} pcs`);
    if (item.lowStockAt !== changes.lowStockAt) edits.push(`low-stock alert to ${changes.lowStockAt}`);
    if (Boolean(item.rentable) !== rentable) edits.push(rentable ? 'for rent: on' : 'for rent: off');
    if (rentable && (item.rentPrice || 0) !== rentPrice) edits.push(`rental price from ${peso(item.rentPrice || 0)} to ${peso(rentPrice)}`);
    if (rentable && (item.damageFee || 0) !== damageFee) edits.push(`damage fee from ${peso(item.damageFee || 0)} to ${peso(damageFee)}`);
    if (item.notes !== (changes.notes || '').trim()) edits.push('notes');
    // Switching rent off keeps the last prices, so switching it back on starts from them
    Object.assign(item, {
      name,
      category: changes.category,
      total: changes.total,
      lowStockAt: changes.lowStockAt,
      rentable,
      rentPrice: rentable ? rentPrice : item.rentPrice || 0,
      damageFee: rentable ? damageFee : item.damageFee || 0,
      notes: (changes.notes || '').trim()
    });
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
      // Damaged pieces coming back from a rental are charged to that customer, the same as on the reservation page
      const rental = ref === NO_EVENT ? null : data.reservations.find((r) => r.ref === ref && isRental(r.serviceType));
      if (rental && damagedQty) chargeRentalDamage(data, rental, [{ item, qty: damagedQty }]);
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

/* ============================ Equipment rental ============================ */

// Find an Equipment Rental reservation or throw
const findRental = (data, ref) => {
  const reservation = data.reservations.find((r) => r.ref === ref);
  if (!reservation) throw new ApiError('NOT_FOUND', 'We could not find this reservation.');
  if (!isRental(reservation.serviceType)) throw new ApiError('INVALID', 'This reservation is not an equipment rental.');
  return reservation;
};

/**
 * Add damage charges to a rental after its items came back: `lost` is [{ item, qty }] of pieces that
 * came back damaged or not at all. Each piece is charged at the damage fee the booking was made at
 * (the rental line's `damageFee`), falling back to the item's current fee for an item that was not on it.
 *
 * Transparency rules for anything that moves a customer's total, all in the same change:
 * the audit trail records the old and the new amount, the customer is told in their chat at once,
 * and the sent quotation is NOT edited. It is flagged out of date (see quotationStale in
 * reservationService.js), and the amount owed only changes when the admin re-sends it. The contract
 * says the same (DocumentDialog, rental terms).
 */
function chargeRentalDamage(data, reservation, lost) {
  const lines = (reservation.damageCharges || []).map((line) => ({ ...line }));
  let added = 0;
  lost.forEach(({ item, qty }) => {
    const booked = (reservation.rentalItems || []).find((line) => line.itemId === item.id);
    const fee = booked ? booked.damageFee : item.damageFee || 0;
    added += qty * fee;
    const existing = lines.find((line) => line.itemId === item.id);
    if (existing) existing.qty += qty;
    else lines.push({ itemId: item.id, name: item.name, qty, fee });
  });
  reservation.damageCharges = lines;
  if (!added) return;

  // The total as the customer holds it now, and what it becomes once the revised quotation is sent
  const before = financials(reservation, data.payments).total;
  const after = before + added;
  const detail = lost.map(({ item, qty }) => `${qty} × ${item.name}`).join(', ');
  reservation.activity.push({
    at: Date.now(),
    actor: ADMIN_NAME(),
    text: `Recorded damaged or missing rented items: ${detail}. Damage charges of ${peso(added)} move the total from ${peso(before)} to ${peso(after)} once the revised quotation is sent.`
  });
  postAdminMessage(
    data,
    reservation,
    `Your rented items for ${reservation.eventName} are back. ${detail} came back damaged or missing, so under your rental terms each is charged at its damage fee: ${peso(added)} in total. Your total changes from ${peso(before)} to ${peso(after)}. We will send you a revised quotation, and the amount you owe only changes once that quotation reaches you.`
  );
}

/**
 * Admin: check out everything an approved rental still needs, in one go. For each rented item the
 * pieces not yet out for this booking are moved from Available to In use. Every item is checked
 * before anything moves, so a short item never leaves the rental half checked out.
 * Returns { lines: how many items were checked out }.
 */
export async function checkOutRental(ref) {
  await latency(350, 650);
  return write((data) => {
    const reservation = findRental(data, ref);
    if (!HOLDS_DATE.includes(reservation.status)) throw new ApiError('INVALID_STATE', 'Approve the rental before checking out its items.');
    const moves = (reservation.rentalItems || [])
      .map((line) => {
        const item = findItem(data, line.itemId);
        return { item, qty: line.qty - (item.allocations[ref] || 0) };
      })
      .filter((move) => move.qty > 0);
    if (!moves.length) throw new ApiError('INVALID', 'Everything on this rental is already checked out.');
    const availableOf = (item) => Math.max(0, item.total - inUseOf(item) - item.damaged);
    const short = moves.filter(({ item, qty }) => item.archived || qty > availableOf(item));
    if (short.length) {
      throw new ApiError('OUT_OF_STOCK', `Not enough available: ${short.map(({ item }) => `${item.name} (${availableOf(item)} left)`).join(', ')}.`);
    }
    moves.forEach(({ item, qty }) => {
      item.allocations[ref] = (item.allocations[ref] || 0) + qty;
      log(data, item, `Checked out ${qty} pcs for ${ref}.`, ref);
    });
    return { lines: moves.length };
  });
}

/**
 * Admin: record a rental coming back. `returns` is [{ itemId, good, damaged }] for the rented items:
 * how many came back fine (back to Available) and how many came back damaged or not at all (to Damaged,
 * where they can later be repaired or disposed of). Damaged or missing pieces are charged to the
 * customer at each item's damage fee (see chargeRentalDamage). Every row is checked before anything moves.
 * Returns { pieces, damaged }.
 */
export async function returnRental(ref, returns = []) {
  await latency(350, 650);
  return write((data) => {
    const reservation = findRental(data, ref);
    const rows = returns
      .map((row) => ({ item: findItem(data, row.itemId), good: Number(row.good) || 0, damaged: Number(row.damaged) || 0 }))
      .filter((row) => row.good || row.damaged);
    if (!rows.length) throw new ApiError('INVALID', 'Enter how many pieces came back.');
    rows.forEach(({ item, good, damaged }) => {
      const out = item.allocations[ref] || 0;
      if (!isCount(good) || !isCount(damaged)) throw new ApiError('INVALID', `Enter whole numbers for ${item.name}.`, { field: item.id });
      if (good + damaged > out) throw new ApiError('INVALID', `Only ${out} ${item.name} ${out === 1 ? 'is' : 'are'} out for this rental.`, { field: item.id });
    });
    rows.forEach(({ item, good, damaged }) => {
      item.allocations[ref] -= good + damaged;
      if (!item.allocations[ref]) delete item.allocations[ref];
      item.damaged += damaged;
      log(data, item, `Returned ${good + damaged} pcs from ${ref}${damaged ? ` (${damaged} damaged or missing)` : ''}.`, ref);
    });
    const lost = rows.filter((row) => row.damaged).map(({ item, damaged }) => ({ item, qty: damaged }));
    if (lost.length) chargeRentalDamage(data, reservation, lost);
    return { pieces: rows.reduce((sum, row) => sum + row.good + row.damaged, 0), damaged: lost.reduce((sum, row) => sum + row.qty, 0) };
  });
}

/** What is out for one reservation right now: { itemId: pieces checked out } (empty when nothing is). */
export async function listReservationEquipment(ref) {
  await latency(120, 300);
  return Object.fromEntries(read().inventory.filter((item) => item.allocations[ref]).map((item) => [item.id, item.allocations[ref]]));
}
