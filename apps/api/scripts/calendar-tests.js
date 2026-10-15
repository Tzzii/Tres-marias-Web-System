import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blockNote, dateUnavailableReason } from '@tm/shared/src/domain/availability.js';
import { BLOCK_NOTE_MAX } from '@tm/shared/src/services/config.js';
import { pool } from '../src/db.js';
import { availabilityMap, blockDates } from '../src/modules/calendar/calendar.service.js';

const range = { from: '2099-01-10', to: '2099-01-11' };

test('Others rejects missing, blank, non-text and oversized explanations before saving', async (t) => {
  const connection = t.mock.method(pool, 'getConnection', () => {
    throw new Error('Invalid input must not reach the database.');
  });
  for (const note of [undefined, null, '', ' \n\t ', 123, 'a'.repeat(BLOCK_NOTE_MAX + 1)]) {
    await assert.rejects(blockDates({ ...range, reason: 'Others', note }), (error) => {
      assert.equal(error.code, 'INVALID');
      assert.equal(error.meta.field, 'note');
      return true;
    });
  }
  await assert.rejects(blockDates({ ...range, reason: 'Unlisted reason', note: 'An explanation' }), (error) => {
    assert.equal(error.meta.field, 'reason');
    return true;
  });
  assert.equal(connection.mock.callCount(), 0);
});

test('Others saves the explanation for every date and includes it in customer availability', async (t) => {
  const saved = new Map();
  const conn = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql, params) {
      if (sql.startsWith('UPDATE calendar_settings')) return [{ affectedRows: 1 }];
      if (sql.startsWith('SELECT COUNT(*)')) return [[{ n: saved.size }]];
      if (sql.startsWith('INSERT INTO calendar_blocks')) {
        for (const [date, reason, note] of params[0]) saved.set(date, { date, reason, note });
        return [{ affectedRows: params[0].length }];
      }
      if (sql.startsWith('SELECT daily_capacity')) return [[{ daily_capacity: 2 }]];
      if (sql.startsWith('SELECT date, reason, note')) return [[...saved.values()]];
      if (sql.includes('FROM reservations')) return [[]];
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  t.mock.method(pool, 'getConnection', async () => conn);
  assert.deepEqual(await blockDates({ ...range, reason: 'Others', note: '  Team\n  training day.  ' }), {
    added: 2,
    total: 2
  });
  const snapshot = await availabilityMap(conn);
  for (const date of [range.from, range.to]) {
    assert.equal(dateUnavailableReason(date, snapshot, { enforceLeadTime: false }), 'Others');
    assert.equal(blockNote(date, snapshot), 'Team training day.');
  }
  for (const reason of ['Fully booked', 'Private event', 'Maintenance']) {
    await blockDates({ ...range, reason });
    assert.equal(saved.get(range.from).reason, reason);
    assert.equal(saved.get(range.from).note, '');
  }
  await blockDates({ ...range, reason: 'Others', note: 'a'.repeat(BLOCK_NOTE_MAX) });
  assert.equal(saved.get(range.from).note.length, BLOCK_NOTE_MAX);
});
