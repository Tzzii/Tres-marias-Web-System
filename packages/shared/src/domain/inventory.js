import { INVENTORY_CATEGORIES, isRental } from '../services/config.js';
import { HOLDS_DATE } from '../utils/status.js';
import { NO_EVENT } from './outsource.js';
import { rentalQuote } from './reservation.js';

/**
 * Inventory rules that need no stored data: what an item's details and a stock movement need, the
 * counts the pages show, the lines written to an item's history and to a reservation's audit trail,
 * and the damage charges of an equipment rental that came back damaged or short.
 *
 * Pure (no store.js, no localStorage, no React), so the browser service (inventoryService.js) and the
 * API server (apps/api/src/modules/inventory) give the same answers, texts and errors
 * (docs/backend-development-phases.md §7.8). A refusal comes back as data, { code, message, meta }:
 * the ApiError each service then throws.
 *
 * An item is { id, code, name, category, total, lowStockAt, allocations, damaged, rentable, rentPrice,
 * damageFee, notes, archived, history }; `allocations` is { reservationRef or NO_EVENT: pieces out }.
 * In use = the sum of the allocations; Available = total − in use − damaged.
 */

// Key used in `allocations` for pieces checked out without an event: the same 'none' a contract that is
// not tied to a reservation uses (domain/outsource.js), so both tables store one value
export { NO_EVENT };

// A refusal as data: the ApiError a service throws
const refuse = (code, message, meta = {}) => ({ code, message, meta });
const invalid = (message, meta) => refuse('INVALID', message, meta);

// "₱1,200", as the history lines and chat messages write amounts
const peso = (value) => `₱${Number(value).toLocaleString('en-PH')}`;

// Plain text order (code units), for dates written YYYY-MM-DD and for refs
const textOrder = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** True for a whole number of at least `min`. */
export const isCount = (value, min = 0) => Number.isInteger(value) && value >= min;

/** Pieces out, at events or without one: the sum of the item's allocations. */
export const inUseOf = (item) => Object.values(item.allocations).reduce((sum, qty) => sum + qty, 0);

/** Pieces that can be checked out now: total − in use − damaged. */
export const availableOf = (item) => item.total - inUseOf(item) - item.damaged;

/* ============================ What the pages show ============================ */

/**
 * The item as the pages show it: its record plus `inUse`, `available`, `stock` ('out' when nothing is
 * available, 'low' at or below the alert level, else 'ok') and `out`, where the in-use pieces are:
 * [{ ref, qty, eventName, eventDate }], soonest event first (then by ref), pieces out without an event
 * last. The Return dialog starts on the first of them. `eventOf(ref)` gives a reservation's
 * { eventName, date }, or null. The record is copied one level deep only, so pass a copy of a stored
 * item (the browser store clones it first).
 */
export function inventoryView(item, eventOf) {
  const inUse = inUseOf(item);
  const available = item.total - inUse - item.damaged;
  const stock = available <= 0 ? 'out' : available <= item.lowStockAt ? 'low' : 'ok';
  const out = Object.entries(item.allocations)
    .map(([ref, qty]) => {
      const event = ref === NO_EVENT ? null : eventOf(ref);
      return { ref, qty, eventName: event ? event.eventName : '', eventDate: event ? event.date : '' };
    })
    .sort((a, b) => (a.ref === NO_EVENT) - (b.ref === NO_EVENT) || textOrder(a.eventDate || '~', b.eventDate || '~') || textOrder(a.ref, b.ref));
  return { ...item, inUse, available, stock, out };
}

/** The order of the inventory list: by INVENTORY_CATEGORIES, then by name. */
export const inventoryOrder = (a, b) => INVENTORY_CATEGORIES.indexOf(a.category) - INVENTORY_CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name);

/* ============================ An item's details ============================ */

// The rental settings as saved: for rent or not (as JavaScript reads the value), the price of one piece,
// and the damage fee of one piece (blank is ₱0). An item that is not for rent carries ₱0 for both.
function rentalOf(values) {
  const rentable = Boolean(values.rentable);
  return { rentable, rentPrice: rentable ? Number(values.rentPrice) : 0, damageFee: rentable ? Number(values.damageFee) || 0 : 0 };
}

/**
 * What is wrong with an item's details, or null: the rules of the Add item(s) and Edit dialogs, in their
 * order. A name of 2+ characters not already used (any case; `names` are the other items' names,
 * archived ones included), a category from INVENTORY_CATEGORIES, a quantity of 1 to 100,000, an alert
 * level below the total, and for an item for rent a price of ₱1 to ₱100,000 and a damage fee of ₱0 to
 * ₱1,000,000 (the fee may be ₱0: nothing is charged). `index` is the row of Add item(s): it goes in
 * meta as `row`, next to `field`.
 */
export function itemProblem(values, { names = [], index } = {}) {
  const meta = (field) => (index === undefined ? { field } : { field, row: index });
  const name = (values.name || '').trim();
  if (name.length < 2) return invalid('Enter the item name.', meta('name'));
  if (names.some((other) => other.toLowerCase() === name.toLowerCase())) return refuse('NAME_TAKEN', `"${name}" is already in the inventory.`, meta('name'));
  if (!INVENTORY_CATEGORIES.includes(values.category)) return invalid('Choose a category.', meta('category'));
  if (!isCount(values.total, 1) || values.total > 100000) return invalid('Enter a quantity from 1 to 100,000.', meta('total'));
  if (!isCount(values.lowStockAt) || values.lowStockAt >= values.total) return invalid('The alert level must be below the total.', meta('lowStockAt'));
  const { rentable, rentPrice, damageFee } = rentalOf(values);
  if (rentable && (!isCount(rentPrice, 1) || rentPrice > 100000)) return invalid('Enter a rental price from ₱1 to ₱100,000.', meta('rentPrice'));
  if (rentable && (!isCount(damageFee) || damageFee > 1000000)) return invalid('Enter a damage fee from ₱0 to ₱1,000,000.', meta('damageFee'));
  return null;
}

/** An item's details as saved, once itemProblem() has passed: { name (trimmed), rentable, rentPrice, damageFee }. */
export const itemFields = (values) => ({ name: (values.name || '').trim(), ...rentalOf(values) });

/**
 * The first row of Add item(s) whose name repeats an earlier row's (any case), or -1. The service answers
 * NAME_TAKEN `"…" is listed twice.` for it, so a list is never half saved.
 */
export const repeatedRow = (names) => names.findIndex((name, i) => names.findIndex((other) => other.toLowerCase() === name.toLowerCase()) !== i);

/** The history line of a new item, e.g. "Added to inventory with 50 pcs. For rent at ₱15 per piece (damage fee ₱400)." */
export const addedText = (total, { rentable, rentPrice, damageFee }) =>
  `Added to inventory with ${total} pcs.${rentable ? ` For rent at ${peso(rentPrice)} per piece (damage fee ${peso(damageFee)}).` : ''}`;

/**
 * What is wrong with an edit of `item`, or null: itemProblem() (`names` are the other items' names),
 * then a total that can't go below the pieces in use and damaged.
 */
export function editProblem(item, values, { names = [] } = {}) {
  const problem = itemProblem(values, { names });
  if (problem) return problem;
  const minimum = inUseOf(item) + item.damaged;
  if (values.total < minimum) return invalid(`The total can't be below ${minimum} (in use + damaged).`, { field: 'total' });
  return null;
}

/**
 * The details an edit saves (after editProblem()): name, category, total, alert level, rental settings
 * and notes. Switching rent off keeps the last prices, so switching it back on starts from them. A new
 * price or damage fee only reaches rental bookings made from now on: a booking copies both when made.
 */
export function editedItem(item, values) {
  const { name, rentable, rentPrice, damageFee } = itemFields(values);
  return {
    name,
    category: values.category,
    total: values.total,
    lowStockAt: values.lowStockAt,
    rentable,
    rentPrice: rentable ? rentPrice : item.rentPrice || 0,
    damageFee: rentable ? damageFee : item.damageFee || 0,
    notes: (values.notes || '').trim()
  };
}

/**
 * The history line of an edit, old value and new where it matters, e.g. "Changed total from 50 to 60
 * pcs, rental price from ₱15 to ₱20.", or '' when nothing changed.
 */
export function editText(item, values) {
  const { name, rentable, rentPrice, damageFee } = itemFields(values);
  const edits = [];
  if (item.name !== name) edits.push(`name to "${name}"`);
  if (item.category !== values.category) edits.push(`category to ${values.category}`);
  if (item.total !== values.total) edits.push(`total from ${item.total} to ${values.total} pcs`);
  if (item.lowStockAt !== values.lowStockAt) edits.push(`low-stock alert to ${values.lowStockAt}`);
  if (Boolean(item.rentable) !== rentable) edits.push(rentable ? 'for rent: on' : 'for rent: off');
  if (rentable && (item.rentPrice || 0) !== rentPrice) edits.push(`rental price from ${peso(item.rentPrice || 0)} to ${peso(rentPrice)}`);
  if (rentable && (item.damageFee || 0) !== damageFee) edits.push(`damage fee from ${peso(item.damageFee || 0)} to ${peso(damageFee)}`);
  if (item.notes !== (values.notes || '').trim()) edits.push('notes');
  return edits.length ? `Changed ${edits.join(', ')}.` : '';
}

/** Items that can't be archived because pieces are still out (IN_USE), or null. Restoring is never refused. */
export function archiveProblem(items, archived) {
  const busy = archived ? items.filter((item) => inUseOf(item) > 0) : [];
  return busy.length ? refuse('IN_USE', `Return all pieces first: ${busy.map((item) => item.name).join(', ')}.`) : null;
}

/** The history line of archiving or restoring an item. */
export const archiveText = (archived) => (archived ? 'Archived.' : 'Restored from the archive.');

/* ============================ Stock movements ============================ */

/**
 * One stock movement on an item, from the Stock dialog:
 *   checkout  Available → In use: { qty (1+), ref } — `ref` NO_EVENT, or an approved to confirmed booking
 *   return    In use → Available, or Damaged: { ref, qty (good), damagedQty }, 1+ piece, no more than are out there
 *   damage    Available → Damaged: { qty, note (the reason, required) }
 *   repair    Damaged → Available: { qty }
 *   dispose   damaged pieces leave the total: { qty, note (required) }; not every piece (archive the item instead)
 * `input` is what the page sends, { qty, damagedQty, ref, note } (defaults 0, 0, NO_EVENT, ''); a note is
 * added to the history line as " Reason: …". `refStatus` is the status of the reservation `ref` names
 * (exactly), or null when there is none; only a check-out reads it. An archived item can't move.
 *
 * Returns { problem } or { counts: the item's new { allocations, damaged, total, lowStockAt }, text: its
 * history line, ref: the reservation the move is for (NO_EVENT when none: only a check-out and a return
 * have one), damaged: pieces that came back damaged (a rental charges them) }.
 */
export function stockMove(item, action, { qty = 0, damagedQty = 0, ref = NO_EVENT, note = '' } = {}, refStatus = null) {
  const fail = (message, field) => ({ problem: invalid(message, field ? { field } : {}) });
  if (item.archived) return fail('Restore this item before changing its stock.');
  const available = availableOf(item);
  const reason = note.trim();
  const suffix = reason ? ` Reason: ${reason}` : '';
  const allocations = { ...item.allocations };
  const done = (changes, text, linked = NO_EVENT, damaged = 0) => ({
    counts: { allocations, damaged: item.damaged, total: item.total, lowStockAt: item.lowStockAt, ...changes },
    text,
    ref: linked,
    damaged
  });

  if (action === 'checkout') {
    if (!isCount(qty, 1)) return fail('Enter how many to check out.', 'qty');
    if (qty > available) return fail(`Only ${available} pcs are available.`, 'qty');
    if (ref !== NO_EVENT && !HOLDS_DATE.includes(refStatus)) return fail('Choose an approved or confirmed reservation.', 'ref');
    allocations[ref] = (allocations[ref] || 0) + qty;
    return done({}, ref === NO_EVENT ? `Checked out ${qty} pcs (no event linked).${suffix}` : `Checked out ${qty} pcs for ${ref}.${suffix}`, ref);
  }
  if (action === 'return') {
    const out = allocations[ref] || 0;
    if (!out) return fail('Nothing is checked out there.', 'ref');
    if (!isCount(qty) || !isCount(damagedQty) || qty + damagedQty < 1) return fail('Enter how many came back.', 'qty');
    if (qty + damagedQty > out) return fail(`Only ${out} pcs are out there.`, 'qty');
    const left = out - qty - damagedQty;
    if (left) allocations[ref] = left;
    else delete allocations[ref];
    const where = ref === NO_EVENT ? '' : ` from ${ref}`;
    return done({ damaged: item.damaged + damagedQty }, `Returned ${qty + damagedQty} pcs${where}${damagedQty ? ` (${damagedQty} damaged)` : ''}.${suffix}`, ref, damagedQty);
  }
  if (action === 'damage') {
    if (!isCount(qty, 1)) return fail('Enter how many are damaged.', 'qty');
    if (qty > available) return fail(`Only ${available} pcs are available.`, 'qty');
    if (!reason) return fail('Describe the damage.', 'note');
    return done({ damaged: item.damaged + qty }, `Reported ${qty} pcs damaged.${suffix}`);
  }
  if (action === 'repair') {
    if (!isCount(qty, 1)) return fail('Enter how many were repaired.', 'qty');
    if (qty > item.damaged) return fail(`Only ${item.damaged} pcs are damaged.`, 'qty');
    return done({ damaged: item.damaged - qty }, `Repaired ${qty} pcs; back to available.${suffix}`);
  }
  if (action === 'dispose') {
    if (!isCount(qty, 1)) return fail('Enter how many to dispose of.', 'qty');
    if (qty > item.damaged) return fail(`Only ${item.damaged} pcs are damaged.`, 'qty');
    if (!reason) return fail('Give a reason for disposal.', 'note');
    if (qty >= item.total) return fail('Archive the item instead of disposing of every piece.', 'qty');
    const total = item.total - qty;
    return done({ damaged: item.damaged - qty, total, lowStockAt: Math.min(item.lowStockAt, total - 1) }, `Disposed of ${qty} damaged pcs; total is now ${total}.${suffix}`);
  }
  return fail('Unknown stock action.');
}

/**
 * The line a check-out or return for a reservation adds to that reservation's audit trail (which the
 * customer sees too): the item's history line without the ref, e.g. "Equipment · Monobloc chair:
 * Checked out 80 pcs."
 */
export const equipmentActivity = (item, text, ref) => `Equipment · ${item.name}: ${text.replace(` for ${ref}`, '').replace(` from ${ref}`, '')}`;

/* ============================ Equipment rental ============================ */

/** Why a booking can't have its rented items checked out or returned (NOT_FOUND, or INVALID when it is not a rental), or null. */
export function rentalProblem(reservation) {
  if (!reservation) return refuse('NOT_FOUND', 'We could not find this reservation.');
  if (!isRental(reservation.serviceType)) return invalid('This reservation is not an equipment rental.');
  return null;
}

/** The history line of one item of a rental's check-out, e.g. "Checked out 100 pcs for RES-2026-1010-01." */
export const rentalCheckOutText = (qty, ref) => `Checked out ${qty} pcs for ${ref}.`;

/** The history line of one item of a rental's return, e.g. "Returned 100 pcs from RES-2026-1010-01 (2 damaged or missing)." */
export const rentalReturnText = (ref, good, damaged) => `Returned ${good + damaged} pcs from ${ref}${damaged ? ` (${damaged} damaged or missing)` : ''}.`;

/**
 * An approved rental's check-out: for each rented item, the pieces not yet out for it. `itemById(id)`
 * finds an item (null when there is none). Every line is checked before anything moves, so a short item
 * never leaves the rental half checked out: an archived item, or one with too few pieces available,
 * refuses the whole check-out (OUT_OF_STOCK, naming each). Returns { problem } or { moves: [{ item, qty }] }.
 */
export function rentalCheckOut(reservation, itemById) {
  if (!HOLDS_DATE.includes(reservation.status)) return { problem: refuse('INVALID_STATE', 'Approve the rental before checking out its items.') };
  const moves = [];
  for (const line of reservation.rentalItems || []) {
    const item = itemById(line.itemId);
    if (!item) return { problem: refuse('NOT_FOUND', 'Item not found.') };
    const qty = line.qty - (item.allocations[reservation.ref] || 0);
    if (qty > 0) moves.push({ item, qty });
  }
  if (!moves.length) return { problem: invalid('Everything on this rental is already checked out.') };
  const left = (item) => Math.max(0, availableOf(item));
  const short = moves.filter(({ item, qty }) => item.archived || qty > left(item));
  if (short.length) {
    const named = short.map(({ item }) => (item.archived ? `${item.name} (archived)` : `${item.name} (${left(item)} left)`));
    return { problem: refuse('OUT_OF_STOCK', `Not enough available: ${named.join(', ')}.`) };
  }
  return { moves };
}

/**
 * A rental coming back, from the Return dialog: `returns` is [{ itemId, good, damaged }] as sent (good
 * pieces go back to Available; damaged or missing ones to Damaged, and are charged). `itemById(id)` finds
 * an item (null when there is none: NOT_FOUND for any row, even an empty one). Rows with nothing in them
 * are skipped, and rows for the same item are added together (the dialog sends one per item). Every row
 * is checked before anything moves: whole numbers, and no more than are out for this rental.
 * Returns { problem } or { rows: [{ item, good, damaged }] }.
 */
export function rentalReturn(reservation, returns, itemById) {
  const sent = returns.map((row) => ({ item: itemById(row.itemId), good: Number(row.good) || 0, damaged: Number(row.damaged) || 0 }));
  if (sent.some((row) => !row.item)) return { problem: refuse('NOT_FOUND', 'Item not found.') };
  const rows = [];
  sent
    .filter((row) => row.good || row.damaged)
    .forEach(({ item, good, damaged }) => {
      const whole = isCount(good) && isCount(damaged);
      const same = rows.find((row) => row.item.id === item.id);
      if (same) Object.assign(same, { good: same.good + good, damaged: same.damaged + damaged, whole: same.whole && whole });
      else rows.push({ item, good, damaged, whole });
    });
  if (!rows.length) return { problem: invalid('Enter how many pieces came back.') };
  for (const { item, good, damaged, whole } of rows) {
    const out = item.allocations[reservation.ref] || 0;
    if (!whole) return { problem: invalid(`Enter whole numbers for ${item.name}.`, { field: item.id }) };
    if (good + damaged > out) return { problem: invalid(`Only ${out} ${item.name} ${out === 1 ? 'is' : 'are'} out for this rental.`, { field: item.id }) };
  }
  return { rows: rows.map(({ item, good, damaged }) => ({ item, good, damaged })) };
}

/**
 * Damage charges for a rental whose pieces came back damaged or not at all: `lost` is [{ item, qty }].
 * Each piece is charged at the damage fee the booking was made at (its rental line's), or the item's
 * current fee for an item that is not on it; more pieces of an item already charged join its line at
 * that line's fee.
 *
 * Transparency (anything that moves what a customer owes): the audit trail keeps the old and the new
 * total, the customer is told in their chat at once, and the sent quotation is NOT edited: it shows as
 * out of date (quotationStale) until the admin re-sends it, and only then does the amount owed change.
 * `pkg` is the booking's package and `total` what the customer owes now (financials().total). The new
 * total is the revised quotation with every damage charge on it (rentalQuote), so it also counts charges
 * recorded earlier and not yet quoted.
 *
 * Returns { lines: the booking's new damageCharges, by item id (the order the API's database gives them
 * back in, so a quotation lists them the same way on both sides), added: ₱ of this charge, activity,
 * message }; the two texts are '' when nothing was charged (every fee ₱0), which then leaves no log line
 * and no message.
 */
export function rentalDamage(reservation, lost, { pkg, total }) {
  const lines = (reservation.damageCharges || []).map((line) => ({ ...line }));
  let added = 0;
  lost.forEach(({ item, qty }) => {
    const existing = lines.find((line) => line.itemId === item.id);
    const booked = (reservation.rentalItems || []).find((line) => line.itemId === item.id);
    const fee = existing ? existing.fee : booked ? booked.damageFee : item.damageFee || 0;
    added += qty * fee;
    if (existing) existing.qty += qty;
    else lines.push({ itemId: item.id, name: item.name, qty, fee });
  });
  lines.sort((a, b) => textOrder(a.itemId, b.itemId));
  if (!added) return { lines, added, activity: '', message: '' };

  const after = rentalQuote(pkg, { ...reservation, damageCharges: lines }).net;
  const detail = lost.map(({ item, qty }) => `${qty} × ${item.name}`).join(', ');
  return {
    lines,
    added,
    activity: `Recorded damaged or missing rented items: ${detail}. Damage charges of ${peso(added)}: the total moves from ${peso(total)} to ${peso(after)} once the revised quotation is sent.`,
    message: `Your rented items for ${reservation.eventName} are back. ${detail} came back damaged or missing, so under your rental terms each is charged at its damage fee: ${peso(added)} in total. Your total changes from ${peso(total)} to ${peso(after)}. We will send you a revised quotation, and the amount you owe only changes once that quotation reaches you.`
  };
}
