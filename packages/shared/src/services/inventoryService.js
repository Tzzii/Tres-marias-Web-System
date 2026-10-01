import { HOLDS_DATE } from '../utils/status.js';
import { isRental } from './config.js';
import {
  NO_EVENT,
  addedText,
  archiveProblem,
  archiveText,
  editProblem,
  editText,
  editedItem,
  equipmentActivity,
  inventoryOrder,
  inventoryView,
  itemFields,
  itemProblem,
  rentalCheckOut,
  rentalCheckOutText,
  rentalDamage,
  rentalProblem,
  rentalReturn,
  rentalReturnText,
  repeatedRow,
  stockMove
} from '../domain/inventory.js';
import { financials } from '../domain/money.js';
import { postAdminMessage } from './reservationService.js';
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
 *
 * The rules, texts and counts come from domain/inventory.js, the same code the API server runs
 * (apps/api/src/modules/inventory), so both give the same answers and errors; this file only finds
 * and saves records in the browser store.
 */

export { NO_EVENT };

// Name of the signed-in admin, for the history logs
const ADMIN_NAME = () => {
  try {
    const user = JSON.parse(sessionStorage.getItem('tm.admin.session') || localStorage.getItem('tm.admin.session'));
    return (user && user.user && user.user.name) || 'Tres Marias team';
  } catch (e) {
    return 'Tres Marias team';
  }
};

// A refusal from domain/inventory.js as the error the pages already handle
const toError = ({ code, message, meta }) => new ApiError(code, message, meta);

// The event name and date of a reservation, for an item's "Currently out" list
const eventOf = (data) => (ref) => {
  const reservation = data.reservations.find((r) => r.ref === ref);
  return reservation ? { eventName: reservation.eventName, date: reservation.date } : null;
};

/** Item plus its computed counts, stock level and where its in-use pieces are (inventoryView in domain/inventory.js). */
const enrich = (item, data) => inventoryView(clone(item), eventOf(data));

// Add an entry to an item's history. When linked to a reservation, also add it to that reservation's
// audit trail without the REF, e.g. "Equipment · Monobloc chair: Checked out 80 pcs."
const log = (data, item, text, ref) => {
  const actor = ADMIN_NAME();
  const linked = ref && ref !== NO_EVENT;
  item.history.push({ at: Date.now(), actor, text, ...(linked ? { ref } : {}) });
  if (linked) {
    const reservation = data.reservations.find((r) => r.ref === ref);
    if (reservation) reservation.activity.push({ at: Date.now(), actor, text: equipmentActivity(item, text, ref) });
  }
};

// Find an item or throw
const findItem = (data, id) => {
  const item = data.inventory.find((i) => i.id === id);
  if (!item) throw new ApiError('NOT_FOUND', 'Item not found.');
  return item;
};

// The names of every item but `id` (archived ones too), for the "already in the inventory" check
const otherNames = (data, id) => data.inventory.filter((i) => i.id !== id).map((i) => i.name);

/** All items (archived ones only when asked), sorted by category order, then name. */
export async function listInventory({ includeArchived = false } = {}) {
  await latency(180, 420);
  const data = read();
  return data.inventory
    .filter((item) => includeArchived || !item.archived)
    .map((item) => enrich(item, data))
    .sort(inventoryOrder);
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
 * Add one or more new items. Names must be unique, including among the new rows. Returns the created items.
 * Each row may also carry `rentable`, `rentPrice` and `damageFee` (not rentable when left out).
 */
export async function addInventoryItems(items) {
  await latency(350, 650);
  return write((data) => {
    if (!items.length) throw new ApiError('INVALID', 'Add at least one item.');
    // Validate every row before saving any, so a bad row doesn't leave half the list saved
    const names = otherNames(data);
    items.forEach((item, index) => {
      const problem = itemProblem(item, { names, index });
      if (problem) throw toError(problem);
    });
    const checked = items.map(itemFields);
    const duplicate = repeatedRow(checked.map((c) => c.name));
    if (duplicate >= 0) throw new ApiError('NAME_TAKEN', `"${checked[duplicate].name}" is listed twice.`, { field: 'name', row: duplicate });

    const created = items.map((item, index) => {
      const { name, rentable, rentPrice, damageFee } = checked[index];
      const created = {
        id: `inv-${Date.now().toString(36)}-${index}`,
        code: nextId(data, 'inventory', 'EQ-'),
        name,
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
      log(data, created, addedText(item.total, checked[index]));
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
    const problem = editProblem(item, changes, { names: otherNames(data, id) });
    if (problem) throw toError(problem);
    const text = editText(item, changes);
    Object.assign(item, editedItem(item, changes));
    if (text) log(data, item, text);
    return enrich(item, data);
  });
}

/**
 * Move pieces between Available, In use and Damaged (stockMove in domain/inventory.js has the rules).
 * action: 'checkout' { qty, ref? } · 'return' { ref, qty, damagedQty } · 'damage' { qty, note } · 'repair' { qty } · 'dispose' { qty, note }
 * Damaged pieces coming back from an equipment rental are charged to that customer (chargeRentalDamage).
 */
export async function moveInventoryStock(id, action, input = {}) {
  await latency(300, 550);
  return write((data) => {
    const item = findItem(data, id);
    const booking = input.ref === undefined || input.ref === NO_EVENT ? null : data.reservations.find((r) => r.ref === input.ref);
    const move = stockMove(item, action, input, booking ? booking.status : null);
    if (move.problem) throw toError(move.problem);
    Object.assign(item, move.counts);
    log(data, item, move.text, move.ref);
    // Damaged pieces coming back from a rental are charged to that customer, the same as on the reservation page
    const rental = move.ref === NO_EVENT ? null : data.reservations.find((r) => r.ref === move.ref && isRental(r.serviceType));
    if (rental && move.damaged) chargeRentalDamage(data, rental, [{ item, qty: move.damaged }]);
    return enrich(item, data);
  });
}

/** Archive or restore several items. Items with pieces still out at events can't be archived. */
export async function setInventoryArchived(ids, archived) {
  await latency(250, 450);
  return write((data) => {
    const items = ids.map((id) => findItem(data, id));
    const problem = archiveProblem(items, archived);
    if (problem) throw toError(problem);
    items.forEach((item) => {
      if (item.archived === archived) return;
      item.archived = archived;
      log(data, item, archiveText(archived));
    });
    return { count: items.length };
  });
}

/* ============================ Equipment rental ============================ */

// Find an Equipment Rental reservation or throw
const findRental = (data, ref) => {
  const reservation = data.reservations.find((r) => r.ref === ref) || null;
  const problem = rentalProblem(reservation);
  if (problem) throw toError(problem);
  return reservation;
};

/**
 * Add damage charges to a rental after its items came back: `lost` is [{ item, qty }] of pieces that
 * came back damaged or not at all (rentalDamage in domain/inventory.js prices them and writes the texts).
 *
 * Transparency rules for anything that moves a customer's total, all in the same change:
 * the audit trail records the old and the new amount, the customer is told in their chat at once,
 * and the sent quotation is NOT edited. It is flagged out of date (see quotationStale in
 * reservationService.js), and the amount owed only changes when the admin re-sends it. The contract
 * says the same (DocumentDialog, rental terms).
 */
function chargeRentalDamage(data, reservation, lost) {
  const pkg = data.packages.find((p) => p.id === reservation.packageId) || null;
  const total = financials(reservation, data.payments, data.refunds).total;
  const damage = rentalDamage(reservation, lost, { pkg, total });
  reservation.damageCharges = damage.lines;
  if (!damage.added) return;
  reservation.activity.push({ at: Date.now(), actor: ADMIN_NAME(), text: damage.activity });
  postAdminMessage(data, reservation, damage.message);
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
    const plan = rentalCheckOut(reservation, (id) => data.inventory.find((i) => i.id === id) || null);
    if (plan.problem) throw toError(plan.problem);
    plan.moves.forEach(({ item, qty }) => {
      item.allocations[ref] = (item.allocations[ref] || 0) + qty;
      log(data, item, rentalCheckOutText(qty, ref), ref);
    });
    return { lines: plan.moves.length };
  });
}

/**
 * Admin: record a rental coming back. `returns` is [{ itemId, good, damaged }] for the rented items:
 * how many came back fine (back to Available) and how many came back damaged or not at all (to Damaged,
 * where they can later be repaired or disposed of). Rows of the same item are added together. Damaged
 * or missing pieces are charged to the customer at each item's damage fee (see chargeRentalDamage).
 * Every row is checked before anything moves. Returns { pieces, damaged }.
 */
export async function returnRental(ref, returns = []) {
  await latency(350, 650);
  return write((data) => {
    const reservation = findRental(data, ref);
    const plan = rentalReturn(reservation, returns, (id) => data.inventory.find((i) => i.id === id) || null);
    if (plan.problem) throw toError(plan.problem);
    plan.rows.forEach(({ item, good, damaged }) => {
      item.allocations[ref] -= good + damaged;
      if (!item.allocations[ref]) delete item.allocations[ref];
      item.damaged += damaged;
      log(data, item, rentalReturnText(ref, good, damaged), ref);
    });
    const lost = plan.rows.filter((row) => row.damaged).map(({ item, damaged }) => ({ item, qty: damaged }));
    if (lost.length) chargeRentalDamage(data, reservation, lost);
    return { pieces: plan.rows.reduce((sum, row) => sum + row.good + row.damaged, 0), damaged: lost.reduce((sum, row) => sum + row.qty, 0) };
  });
}

/** What is out for one reservation right now: { itemId: pieces checked out } (empty when nothing is). */
export async function listReservationEquipment(ref) {
  await latency(120, 300);
  return Object.fromEntries(read().inventory.filter((item) => item.allocations[ref]).map((item) => [item.id, item.allocations[ref]]));
}
