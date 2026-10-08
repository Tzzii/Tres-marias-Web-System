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
} from '@tm/shared/src/domain/inventory.js';
import { financials } from '@tm/shared/src/domain/money.js';
import { isRental } from '@tm/shared/src/services/config.js';
import { pool, tx } from '../../db.js';
import { ApiError } from '../../lib/ApiError.js';
import { newId, nextCounter } from '../../lib/ids.js';
import { now } from '../../lib/time.js';
import { lockAvailability } from '../calendar/calendar.repo.js';
import * as catalogRepo from '../catalog/catalog.repo.js';
import { postAdminMessage } from '../messages/messages.repo.js';
import * as reservationsRepo from '../reservations/reservations.repo.js';
import * as repo from './inventory.repo.js';

/**
 * The equipment inventory on the server (docs/backend-development-phases.md Phase 10, §9.9): the item
 * list, adding and editing items, stock movements (check out, return, report damage, repair, dispose),
 * archiving, and an equipment rental's check-out and return with its damage charges. Admin only. The
 * rules, counts, texts and errors (with meta.field / meta.row) are @tm/shared/src/domain/inventory.js,
 * and the page's checks are repeated here in the same order because the server never trusts the page
 * (§3 rule 3).
 *
 * On purpose:
 * - The admin in the histories, the audit trail and the chat is the signed-in one (req.user.name).
 * - An item id and a booking ref must be spelled exactly as stored: the columns' collation ignores case
 *   and trailing spaces, so the service compares the id or ref itself.
 * - The columns' limits: an item name up to 120 characters and notes up to 2,000 (the dialogs allow 80
 *   and 300), a batch of up to 100 new items (the dialog has 20 rows).
 * - Two names that differ only by an accent ("Cafe" / "Café") are the same name to the UNIQUE index, so
 *   the second is NAME_TAKEN too.
 *
 * Every write runs in one transaction and takes the availability lock first (lockAvailability in
 * calendar.repo.js): a check-out, a return, damage, a repair, a disposal, an edit of the total or of
 * "for rent" and archiving all change the stock a rental booking or an accepted quotation counts (rentalStock), and
 * those take the same lock, so the two never pass the same check at once. Lock order, as every write
 * keeps it: the availability lock, then the booking's row when the write is for a booking (lockOwner:
 * a check-out and a return for an event, a rental's check-out and return; the customer's and the admin's
 * cancellation read the pieces out under that lock, so a cancel and a check-out never cross), then the
 * item rows, then the customer's chat thread (a rental's damage message).
 */

// A refusal from domain/inventory.js as an ApiError
const toError = ({ code, message, meta }) => new ApiError(code, message, meta);
const itemNotFound = () => new ApiError('NOT_FOUND', 'Item not found.');

// The most items one Add item(s) request may carry, and the columns' lengths (schema.sql)
const MAX_NEW_ITEMS = 100;
const NAME_MAX = 120;

// True when a save failed because another item already has the name (the UNIQUE name index)
const isNameTaken = (err) => Boolean(err) && err.code === 'ER_DUP_ENTRY' && String(err.sqlMessage || err.message).includes('uq_inventory_items_name');
const nameTaken = (name, meta) => new ApiError('NAME_TAKEN', `"${name}" is already in the inventory.`, meta);

// The item `id` names exactly, with its row locked until the transaction ends, or NOT_FOUND
async function lockedItem(conn, id) {
  const { items, eventOf } = await repo.findItems(conn, { ids: [id], lock: true });
  const item = items.find((i) => i.id === id);
  if (!item) throw itemNotFound();
  return { item, eventOf };
}

// One item as the pages show it, read inside the transaction after a change
async function itemView(conn, id) {
  const { items, eventOf } = await repo.findItems(conn, { ids: [id] });
  return inventoryView(items.find((i) => i.id === id), eventOf);
}

// The booking `ref` names exactly, { ref, customerId, status }, with its row locked until the transaction ends, or null
async function lockedBooking(conn, ref) {
  const owner = typeof ref === 'string' && ref ? await reservationsRepo.lockOwner(conn, ref) : null;
  return owner && owner.ref === ref ? owner : null;
}

// A line in an item's history, and for a booking the same line (without its ref) in that booking's audit trail
async function logMove(conn, item, text, ref, admin) {
  const at = now();
  const linked = ref !== NO_EVENT;
  await repo.insertHistory(conn, item.id, { at, actor: admin.name, text, ref: linked ? ref : null });
  if (linked) await reservationsRepo.insertActivity(conn, ref, { at, actor: admin.name, text: equipmentActivity(item, text, ref) });
}

/**
 * Charge a rental's damaged or missing pieces (`lost` is [{ item, qty }]) at their damage fees, with the
 * transparency rules of rentalDamage (domain/inventory.js): the new damage lines, and when anything was
 * charged, the old and new total in the audit trail and a message in the customer's chat, all in this
 * transaction. The sent quotation is not edited: it shows as out of date until the admin re-sends it.
 * `booking` is an entry of reservationsRepo.findReservations() (the rental with its payments and refunds).
 */
async function chargeDamage(conn, booking, lost, admin) {
  const { reservation } = booking;
  const pkg = await catalogRepo.findPackageById(reservation.packageId, conn);
  const total = financials(reservation, booking.payments, booking.refunds).total;
  const damage = rentalDamage(reservation, lost, { pkg, total });
  await reservationsRepo.replaceDamageCharges(conn, reservation.ref, damage.lines);
  if (!damage.added) return;
  await reservationsRepo.insertActivity(conn, reservation.ref, { at: now(), actor: admin.name, text: damage.activity });
  await postAdminMessage(conn, reservation, damage.message, null, admin.name);
}

/* ============================ Reads ============================ */

/** Every item (archived ones only when asked), by category order then name, each with its counts and where its pieces are. */
export async function listInventory({ includeArchived = false } = {}) {
  const { items, eventOf } = await repo.findItems(pool, { includeArchived });
  return items.map((item) => inventoryView(item, eventOf)).sort(inventoryOrder);
}

/**
 * The bookings equipment can be checked out for: approved to confirmed, soonest first (same date: the
 * earlier request first). `rental` is true for an Equipment Rental booking (it has no guest count).
 */
export async function listCheckoutEvents() {
  const bookings = await reservationsRepo.listHeldBookings(pool);
  return bookings.map((r) => ({ ref: r.ref, eventName: r.eventName, date: r.date, guests: r.guests, rental: isRental(r.serviceType) }));
}

/**
 * What is out for one reservation right now: { itemId: pieces checked out }, in the items' order; {}
 * when nothing is, when the booking does not exist, or for no ref at all.
 */
export async function listReservationEquipment(ref) {
  if (typeof ref !== 'string' || !ref) return {};
  const rows = await repo.equipmentOut(pool, ref);
  return Object.fromEntries(rows.filter((row) => row.ref === ref).map((row) => [row.itemId, row.qty]));
}

/* ============================ Items ============================ */

/**
 * Add one or more items (Add item(s)): every row is checked before any is saved, so a bad row never
 * leaves half the list saved; names must be unique, among the new rows too (NAME_TAKEN with meta.row).
 * Each new item gets the next EQ- code, starts fully available, and a history line (with its rental
 * price and damage fee when it is for rent). Returns the created items, in the order sent.
 */
export async function addInventoryItems(rows, admin) {
  if (!rows.length) throw new ApiError('INVALID', 'Add at least one item.');
  if (rows.length > MAX_NEW_ITEMS) throw new ApiError('INVALID', `Add up to ${MAX_NEW_ITEMS} items at a time.`);
  return tx(async (conn) => {
    await lockAvailability(conn);
    const names = (await repo.itemNames(conn)).map((item) => item.name);
    rows.forEach((row, index) => {
      const problem = itemProblem(row, { names, index });
      if (problem) throw toError(problem);
      if (row.name.trim().length > NAME_MAX) throw new ApiError('INVALID', `Use ${NAME_MAX} characters or fewer.`, { field: 'name', row: index });
    });
    const checked = rows.map(itemFields);
    const duplicate = repeatedRow(checked.map((c) => c.name));
    if (duplicate >= 0) throw new ApiError('NAME_TAKEN', `"${checked[duplicate].name}" is listed twice.`, { field: 'name', row: duplicate });

    const ids = [];
    for (const [index, row] of rows.entries()) {
      const { name, rentable, rentPrice, damageFee } = checked[index];
      const item = {
        id: newId('inv'),
        code: `EQ-${String(await nextCounter(conn, 'inventory')).padStart(4, '0')}`,
        name,
        category: row.category,
        total: row.total,
        lowStockAt: row.lowStockAt,
        damaged: 0,
        rentable,
        rentPrice,
        damageFee,
        notes: row.notes.trim(),
        archived: false
      };
      try {
        await repo.insertItem(conn, item);
      } catch (err) {
        if (isNameTaken(err)) throw nameTaken(name, { field: 'name', row: index });
        throw err;
      }
      await repo.insertHistory(conn, item.id, { at: now(), actor: admin.name, text: addedText(row.total, checked[index]) });
      ids.push(item.id);
    }
    const { items, eventOf } = await repo.findItems(conn, { ids });
    return ids.map((id) => inventoryView(items.find((i) => i.id === id), eventOf));
  });
}

/**
 * Edit an item's name, category, total, alert level, rental settings and notes (editProblem: the Add
 * rules, and a total no lower than the pieces in use and damaged). A new rental price or damage fee
 * only reaches rentals booked from now on (a booking copies both). The history keeps the old and the
 * new values. Returns the item.
 */
export async function updateInventoryItem(id, values, admin) {
  return tx(async (conn) => {
    await lockAvailability(conn);
    const { item } = await lockedItem(conn, id);
    const names = (await repo.itemNames(conn)).filter((other) => other.id !== id).map((other) => other.name);
    const problem = editProblem(item, values, { names });
    if (problem) throw toError(problem);
    const text = editText(item, values);
    const changes = editedItem(item, values);
    try {
      await repo.updateItem(conn, item.id, changes);
    } catch (err) {
      if (isNameTaken(err)) throw nameTaken(changes.name, { field: 'name' });
      throw err;
    }
    if (text) await repo.insertHistory(conn, item.id, { at: now(), actor: admin.name, text });
    return itemView(conn, item.id);
  });
}

/**
 * Move pieces of one item (stockMove in domain/inventory.js has the rules): check out (for a booking that
 * is approved to confirmed, or for no event), return (good ones back to Available, damaged ones to
 * Damaged), report damage, repair, dispose. A check-out or return for a booking is also written to that
 * booking's audit trail; pieces that come back damaged from an equipment rental are charged to that
 * customer (chargeDamage). `input` is { qty, damagedQty, ref, note }. Returns the item.
 */
export async function moveInventoryStock(id, action, input, admin) {
  return tx(async (conn) => {
    await lockAvailability(conn);
    // The booking a check-out or return is for: its row is locked before the item's, and its status is read under that lock
    const forBooking = (action === 'checkout' || action === 'return') && input.ref !== NO_EVENT;
    const booking = forBooking ? await lockedBooking(conn, input.ref) : null;
    const { item } = await lockedItem(conn, id);
    const move = stockMove(item, action, input, booking ? booking.status : null);
    if (move.problem) throw toError(move.problem);

    // Only a check-out or a return moves pieces between places: the one place it names (a booking, or 'none')
    const { counts } = move;
    if (action === 'checkout' || action === 'return') await repo.setAllocation(conn, item.id, move.ref, counts.allocations[move.ref] || 0);
    await repo.updateItem(conn, item.id, { damaged: counts.damaged, total: counts.total, lowStockAt: counts.lowStockAt });
    await logMove(conn, item, move.text, move.ref, admin);

    // Damaged pieces coming back from a rental are charged to that customer, the same as on the reservation page
    if (action === 'return' && move.damaged && booking) {
      const [row] = await reservationsRepo.findReservations(conn, { ref: booking.ref });
      if (isRental(row.reservation.serviceType)) await chargeDamage(conn, row, [{ item, qty: move.damaged }], admin);
    }
    return itemView(conn, item.id);
  });
}

/**
 * Archive or restore several items (`ids`, as ticked; a repeated id counts once per mention in
 * `count`). Items with pieces still out can't be archived (IN_USE, naming them).
 * Returns { count }.
 */
export async function setInventoryArchived(ids, archived, admin) {
  const flag = Boolean(archived);
  return tx(async (conn) => {
    await lockAvailability(conn);
    const { items } = await repo.findItems(conn, { ids: [...new Set(ids)], lock: true });
    const list = ids.map((id) => items.find((item) => item.id === id) || null);
    if (list.some((item) => !item)) throw itemNotFound();
    const problem = archiveProblem(list, flag);
    if (problem) throw toError(problem);
    const done = new Set();
    for (const item of list) {
      if (done.has(item.id) || item.archived === flag) continue;
      done.add(item.id);
      await repo.updateItem(conn, item.id, { archived: flag });
      await repo.insertHistory(conn, item.id, { at: now(), actor: admin.name, text: archiveText(flag) });
    }
    return { count: list.length };
  });
}

/* ============================ Equipment rental ============================ */

// The equipment rental `ref` names exactly, locked (after the availability lock), as an entry of
// reservationsRepo.findReservations(); NOT_FOUND, or INVALID when it is not a rental
async function lockedRental(conn, ref) {
  const owner = await lockedBooking(conn, ref);
  const [booking] = owner ? await reservationsRepo.findReservations(conn, { ref: owner.ref }) : [];
  const problem = rentalProblem(booking ? booking.reservation : null);
  if (problem) throw toError(problem);
  return booking;
}

/**
 * Admin: check out everything an approved rental still needs, in one go (rentalCheckOut in
 * domain/inventory.js): for each rented item, the pieces not yet out for this booking move from Available
 * to In use. Every item is checked before anything moves, so a short or archived item never leaves the
 * rental half checked out (OUT_OF_STOCK). Returns { lines: how many items were checked out }.
 */
export async function checkOutRental(ref, admin) {
  return tx(async (conn) => {
    await lockAvailability(conn);
    const { reservation } = await lockedRental(conn, ref);
    const { items } = await repo.findItems(conn, { ids: (reservation.rentalItems || []).map((line) => line.itemId), lock: true });
    const plan = rentalCheckOut(reservation, (itemId) => items.find((item) => item.id === itemId) || null);
    if (plan.problem) throw toError(plan.problem);
    for (const { item, qty } of plan.moves) {
      await repo.setAllocation(conn, item.id, reservation.ref, (item.allocations[reservation.ref] || 0) + qty);
      await logMove(conn, item, rentalCheckOutText(qty, reservation.ref), reservation.ref, admin);
    }
    return { lines: plan.moves.length };
  });
}

/**
 * Admin: record a rental coming back (rentalReturn in domain/inventory.js). `returns` is [{ itemId, good,
 * damaged }]: good pieces go back to Available, damaged or missing ones to Damaged (to be repaired or
 * disposed of later) and are charged to the customer at each item's damage fee (chargeDamage). Rows of
 * the same item are added together; every row is checked before anything moves. Returns { pieces, damaged }.
 */
export async function returnRental(ref, returns, admin) {
  return tx(async (conn) => {
    await lockAvailability(conn);
    const booking = await lockedRental(conn, ref);
    const { reservation } = booking;
    const ids = [...new Set(returns.map((row) => row.itemId).filter((itemId) => typeof itemId === 'string'))];
    const { items } = await repo.findItems(conn, { ids, lock: true });
    const plan = rentalReturn(reservation, returns, (itemId) => items.find((item) => item.id === itemId) || null);
    if (plan.problem) throw toError(plan.problem);
    for (const { item, good, damaged } of plan.rows) {
      await repo.setAllocation(conn, item.id, reservation.ref, item.allocations[reservation.ref] - good - damaged);
      if (damaged) await repo.updateItem(conn, item.id, { damaged: item.damaged + damaged });
      await logMove(conn, item, rentalReturnText(reservation.ref, good, damaged), reservation.ref, admin);
    }
    const lost = plan.rows.filter((row) => row.damaged).map(({ item, damaged }) => ({ item, qty: damaged }));
    if (lost.length) await chargeDamage(conn, booking, lost, admin);
    return { pieces: plan.rows.reduce((sum, row) => sum + row.good + row.damaged, 0), damaged: lost.reduce((sum, row) => sum + row.qty, 0) };
  });
}
