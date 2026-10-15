import {
  blockNote,
  buildSnapshot,
  dateUnavailableReason,
  endTimeProblem,
  eventHours,
  timeUnavailableReason
} from '@tm/shared/src/domain/availability.js';
import { BLOCK_NOTE_MAX, BLOCK_REASONS } from '@tm/shared/src/services/config.js';
import { addDays } from '@tm/shared/src/utils/format.js';
import { tx } from '../../db.js';
import { ApiError } from '../../lib/ApiError.js';
import { isClockTime, isISODate, now } from '../../lib/time.js';
import * as repo from './calendar.repo.js';

const MAX_BLOCK_DAYS = 60;

const invalid = (message, field) => new ApiError('INVALID', message, { field });

const toNumber = (value) =>
  typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;

export async function availabilityMap(db) {
  const [capacity, blocked, reservations] = await Promise.all([
    repo.getDailyCapacity(db),
    repo.listBlocks(db),
    repo.listSlotHolders(db)
  ]);
  return buildSnapshot({ capacity, blocked, reservations });
}

export async function getCalendar() {
  const map = await availabilityMap();
  return { ...map, events: map.events.map(({ date, startTime, hours }) => ({ date, startTime, hours })) };
}

export async function checkAvailability(date, time, end) {
  if (!isISODate(date)) throw invalid('Choose your event date.', 'date');
  const startTime = time ?? '';
  if (startTime !== '' && !isClockTime(startTime)) throw invalid('Enter the start time as HH:MM, e.g. 18:00.', 'time');
  const endTime = startTime ? (end ?? '') : '';
  if (endTime !== '') {
    const problem = endTimeProblem(startTime, endTime);
    if (problem) throw invalid(`${problem}.`, 'end');
  }
  const map = await availabilityMap();
  const dateReason = dateUnavailableReason(date, map);
  if (dateReason)
    return {
      date,
      startTime,
      endTime,
      available: false,
      reason: dateReason,
      note: blockNote(date, map),
      timeConflict: false
    };
  const timeReason = startTime
    ? timeUnavailableReason(date, startTime, map, endTime ? eventHours(startTime, endTime) : undefined)
    : '';
  return {
    date,
    startTime,
    endTime,
    available: !timeReason,
    reason: timeReason,
    note: '',
    timeConflict: Boolean(timeReason)
  };
}

export async function blockDates({ from, to, reason, note }) {
  if (!isISODate(from)) throw invalid('Choose the first and last date to block.', 'from');
  if (!isISODate(to)) throw invalid('Choose the first and last date to block.', 'to');
  if (to < from) throw invalid('The end date must be on or after the start date.', 'to');
  const total = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (total > MAX_BLOCK_DAYS) throw invalid(`Block at most ${MAX_BLOCK_DAYS} days at a time.`, 'to');
  if (!BLOCK_REASONS.includes(reason)) throw invalid('Choose a reason from the list.', 'reason');
  if (note !== undefined && note !== null && typeof note !== 'string') throw invalid('Write the note as text.', 'note');
  const cleanNote = (note || '').replace(/\s+/g, ' ').trim();
  if (reason === 'Others' && !cleanNote) throw invalid('Specify why these dates are blocked.', 'note');
  if (cleanNote.length > BLOCK_NOTE_MAX)
    throw invalid(`Keep the note to ${BLOCK_NOTE_MAX} characters or fewer.`, 'note');

  const dates = Array.from({ length: total }, (_, i) => addDays(from, i));
  return tx(async (conn) => {
    await repo.touchSettings(conn, now());
    const already = await repo.countBlocked(conn, from, to);
    await repo.upsertBlocks(conn, dates, reason, cleanNote);
    return { added: total - already, total };
  });
}

export async function unblockDate(date) {
  if (!isISODate(date)) throw invalid('Choose the date to unblock.', 'date');
  await tx(async (conn) => {
    await repo.touchSettings(conn, now());
    await repo.deleteBlock(conn, date);
  });
  return { ok: true };
}

export async function setDailyCapacity(value) {
  const capacity = toNumber(value);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10)
    throw invalid('Capacity must be between 1 and 10 events.', 'value');
  await repo.setDailyCapacity(capacity, now());
  return { capacity };
}
