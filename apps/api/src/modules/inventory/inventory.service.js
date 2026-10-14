import {
  NO_EVENT,
  addedText,
  inUseOf,
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
  rentalCheckoutDue,
  legacyRentalDispatched,
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
import { businessClock, now } from '../../lib/time.js';
import { lockAvailability } from '../calendar/calendar.repo.js';
import * as catalogRepo from '../catalog/catalog.repo.js';
import { postAdminMessage } from '../messages/messages.repo.js';
import * as reservationsRepo from '../reservations/reservations.repo.js';
import * as repo from './inventory.repo.js';
import { readPhoto } from '../../lib/photos.js';
import { storage } from '../../integrations/storage/index.js';
import crypto from 'node:crypto';


const toError = ({ code, message, meta }) => new ApiError(code, message, meta);
const itemNotFound = () => new ApiError('NOT_FOUND', 'Item not found.');

const MAX_NEW_ITEMS = 100;
const NAME_MAX = 120;

const isNameTaken = (err) =>
  Boolean(err) &&
  err.code === 'ER_DUP_ENTRY' &&
  String(err.sqlMessage || err.message).includes('uq_inventory_items_name');
const nameTaken = (name, meta) => new ApiError('NAME_TAKEN', `"${name}" is already in the inventory.`, meta);

async function lockedItem(conn, id) {
  const { items, eventOf } = await repo.findItems(conn, { ids: [id], lock: true });
  const item = items.find((i) => i.id === id);
  if (!item) throw itemNotFound();
  return { item, eventOf };
}

async function itemView(conn, id) {
  const { items, eventOf } = await repo.findItems(conn, { ids: [id] });
  return inventoryView(
    items.find((i) => i.id === id),
    eventOf
  );
}

async function lockedBooking(conn, ref) {
  const owner = typeof ref === 'string' && ref ? await reservationsRepo.lockOwner(conn, ref) : null;
  return owner && owner.ref === ref ? owner : null;
}

async function logMove(conn, item, text, ref, admin) {
  const at = now();
  const linked = ref !== NO_EVENT;
  await repo.insertHistory(conn, item.id, { at, actor: admin.name, text, ref: linked ? ref : null });
  if (linked)
    await reservationsRepo.insertActivity(conn, ref, {
      at,
      actor: admin.name,
      text: equipmentActivity(item, text, ref)
    });
}

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


export async function listInventory({ includeArchived = false } = {}) {
  const { items, eventOf } = await repo.findItems(pool, { includeArchived });
  return items.map((item) => inventoryView(item, eventOf)).sort(inventoryOrder);
}

export async function listCheckoutEvents() {
  const bookings = await reservationsRepo.listHeldBookings(pool);
  return bookings.map((r) => ({
    ref: r.ref,
    eventName: r.eventName,
    date: r.date,
    guests: r.guests,
    rental: isRental(r.serviceType)
  }));
}

export async function listReservationEquipment(ref) {
  if (typeof ref !== 'string' || !ref) return {};
  const rows = await repo.equipmentOut(pool, ref);
  return Object.fromEntries(rows.filter((row) => row.ref === ref).map((row) => [row.itemId, row.qty]));
}

async function dispatchedFor(conn, ref, items) {
  const saved = await repo.rentalDispatches(conn, ref);
  return Object.fromEntries(
    items.map((item) => [
      item.id,
      Math.max(item.allocations[ref] || 0, saved[item.id] ?? legacyRentalDispatched(item, ref))
    ])
  );
}

export async function rentalCheckoutState(ref) {
  const [row] = await reservationsRepo.findReservations(pool, { ref });
  if (!row || row.reservation.ref !== ref || !isRental(row.reservation.serviceType))
    throw new ApiError('NOT_FOUND', 'Rental not found.');
  const { items } = await repo.findItems(pool, { ids: row.reservation.rentalItems.map((line) => line.itemId) });
  return {
    out: Object.fromEntries((await repo.equipmentOut(pool, ref)).map((line) => [line.itemId, line.qty])),
    dispatched: await dispatchedFor(pool, ref, items)
  };
}


export async function addInventoryItems(rows, admin) {
  if (!rows.length) throw new ApiError('INVALID', 'Add at least one item.');
  if (rows.length > MAX_NEW_ITEMS) throw new ApiError('INVALID', `Add up to ${MAX_NEW_ITEMS} items at a time.`);
  return tx(async (conn) => {
    await lockAvailability(conn);
    const names = (await repo.itemNames(conn)).map((item) => item.name);
    rows.forEach((row, index) => {
      const problem = itemProblem(row, { names, index });
      if (problem) throw toError(problem);
      if (row.name.trim().length > NAME_MAX)
        throw new ApiError('INVALID', `Use ${NAME_MAX} characters or fewer.`, { field: 'name', row: index });
    });
    const checked = rows.map(itemFields);
    const duplicate = repeatedRow(checked.map((c) => c.name));
    if (duplicate >= 0)
      throw new ApiError('NAME_TAKEN', `"${checked[duplicate].name}" is listed twice.`, {
        field: 'name',
        row: duplicate
      });

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
      await repo.insertHistory(conn, item.id, {
        at: now(),
        actor: admin.name,
        text: addedText(row.total, checked[index])
      });
      ids.push(item.id);
    }
    const { items, eventOf } = await repo.findItems(conn, { ids });
    return ids.map((id) =>
      inventoryView(
        items.find((i) => i.id === id),
        eventOf
      )
    );
  });
}

export async function updateInventoryItem(id, values, admin, file) {
  if (file && values.removePhoto)
    throw new ApiError('INVALID', 'Choose a new photo or use the mock photo, not both.', { field: 'photo' });
  const type = file ? readPhoto(file) : null;
  let newKey = null;
  let oldKey = null;
  let result;
  try {
    result = await tx(async (conn) => {
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
      if (file || values.removePhoto) {
        oldKey = (await repo.findItemPhoto(conn, item.id))?.key;
        if (file) newKey = await storage.put(`equipment/${crypto.randomUUID()}.${type.ext}`, file.buffer);
        await repo.setItemPhoto(conn, item.id, file ? { key: newKey, mime: type.mime } : null);
        if (file || oldKey)
          await repo.insertHistory(conn, item.id, {
            at: now(),
            actor: admin.name,
            text: file
              ? 'Updated equipment appearance photo.'
              : 'Removed uploaded equipment photo; using the mock photo.'
          });
      }
      return itemView(conn, item.id);
    });
  } catch (err) {
    if (newKey) await storage.remove(newKey).catch(() => {});
    throw err;
  }
  if (oldKey) await storage.remove(oldKey).catch((err) => console.error('[equipment-photo] Cleanup failed:', err.code));
  return result;
}

export async function getInventoryPhoto(id, { admin = false, version } = {}) {
  const photo = await repo.findItemPhoto(pool, id);
  if (!photo || photo.id !== id || (!admin && (!photo.rentable || photo.archived || photo.rent_price <= 0)))
    throw itemNotFound();
  if (!photo.key || (version && version !== photo.key.split('/').pop()))
    throw new ApiError('NOT_FOUND', 'Equipment photo not found.');
  return { key: photo.key, mime: photo.mime };
}

export async function deleteInventoryItem(id, { transact = tx } = {}) {
  let photoKey;
  const result = await transact(async (conn) => {
    await lockAvailability(conn);
    const { item } = await lockedItem(conn, id);
    if (inUseOf(item) > 0)
      throw new ApiError('IN_USE', `Return all checked-out pieces of ${item.name} before deleting it.`);
    if (item.addonId)
      throw new ApiError(
        'IN_USE',
        `${item.name} is linked to an additional charge. Unlink it on the Packages page or archive the item instead.`
      );
    if (await repo.hasBookingReferences(conn, item.id))
      throw new ApiError(
        'IN_USE',
        `${item.name} is linked to booking records. Archive the item to keep those records.`
      );
    photoKey = (await repo.findItemPhoto(conn, item.id))?.key;
    await repo.deleteItem(conn, item.id);
    return { ok: true };
  });
  if (photoKey)
    await storage.remove(photoKey).catch((err) => console.error('[equipment-photo] Cleanup failed:', err.code));
  return result;
}

export async function moveInventoryStock(id, action, input, admin) {
  return tx(async (conn) => {
    await lockAvailability(conn);
    const forBooking = (action === 'checkout' || action === 'return') && input.ref !== NO_EVENT;
    const booking = forBooking ? await lockedBooking(conn, input.ref) : null;
    const { item } = await lockedItem(conn, id);
    const move = stockMove(item, action, input, booking ? booking.status : null);
    if (move.problem) throw toError(move.problem);

    const { counts } = move;
    if (action === 'checkout' && booking) {
      const [row] = await reservationsRepo.findReservations(conn, { ref: booking.ref });
      if (isRental(row.reservation.serviceType)) {
        const dispatched = await dispatchedFor(conn, booking.ref, [item]);
        const booked = row.reservation.rentalItems.find((line) => line.itemId === item.id)?.qty || 0;
        if (booked && dispatched[item.id] + input.qty > booked)
          throw new ApiError('INVALID_STATE', 'These rented pieces have already been checked out.');
        await repo.setRentalDispatch(conn, booking.ref, item.id, dispatched[item.id] + input.qty, now());
      }
    }
    if (action === 'checkout' || action === 'return')
      await repo.setAllocation(conn, item.id, move.ref, counts.allocations[move.ref] || 0);
    await repo.updateItem(conn, item.id, {
      damaged: counts.damaged,
      total: counts.total,
      lowStockAt: counts.lowStockAt
    });
    await logMove(conn, item, move.text, move.ref, admin);

    if (action === 'return' && move.damaged && booking) {
      const [row] = await reservationsRepo.findReservations(conn, { ref: booking.ref });
      if (isRental(row.reservation.serviceType)) await chargeDamage(conn, row, [{ item, qty: move.damaged }], admin);
    }
    return itemView(conn, item.id);
  });
}

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


async function lockedRental(conn, ref) {
  const owner = await lockedBooking(conn, ref);
  const [booking] = owner ? await reservationsRepo.findReservations(conn, { ref: owner.ref }) : [];
  const problem = rentalProblem(booking ? booking.reservation : null);
  if (problem) throw toError(problem);
  return booking;
}

export async function checkOutRental(ref, admin, { automatic = false, clock = businessClock(), transact = tx } = {}) {
  return transact(async (conn) => {
    await lockAvailability(conn);
    const { reservation } = await lockedRental(conn, ref);
    if (automatic && !rentalCheckoutDue(reservation, clock)) return { lines: 0, changed: false };
    const { items } = await repo.findItems(conn, {
      ids: (reservation.rentalItems || []).map((line) => line.itemId),
      lock: true
    });
    const dispatched = await dispatchedFor(conn, ref, items);
    const plan = rentalCheckOut(reservation, (itemId) => items.find((item) => item.id === itemId) || null, dispatched);
    if (plan.problem) {
      if (!automatic) throw toError(plan.problem);
      if (plan.problem.code === 'INVALID_STATE') return { lines: 0, changed: false };
      const text = `Automatic checkout could not proceed: ${plan.problem.message} Restore stock or update the rental items; it will retry automatically.`;
      const changed = (await repo.lastAutomaticNotice(conn, ref)) !== text;
      if (changed) await reservationsRepo.insertActivity(conn, ref, { at: now(), actor: admin.name, text });
      return { lines: 0, changed, problem: plan.problem.code };
    }
    for (const { item, qty } of plan.moves) {
      await repo.setAllocation(conn, item.id, reservation.ref, (item.allocations[reservation.ref] || 0) + qty);
      await repo.setRentalDispatch(conn, ref, item.id, dispatched[item.id] + qty, now());
      await logMove(conn, item, rentalCheckOutText(qty, reservation.ref), reservation.ref, admin);
    }
    return { lines: plan.moves.length, changed: true };
  });
}

export async function returnRental(ref, returns, admin, { transact = tx } = {}) {
  return transact(async (conn) => {
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
    return {
      pieces: plan.rows.reduce((sum, row) => sum + row.good + row.damaged, 0),
      damaged: lost.reduce((sum, row) => sum + row.qty, 0)
    };
  });
}
