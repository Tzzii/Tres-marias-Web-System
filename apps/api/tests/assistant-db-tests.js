import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config } from '../src/config.js';
import { pool, closePool } from '../src/db.js';
import { createAssistantRepository, visitorHash, manilaDay } from '../src/modules/assistant/assistant.repo.js';

test('durable assistant trial, concurrent reservations, claims and spending caps', async (t) => {
  assert.equal(config.isProduction, false);
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(config.db.host));
  const fixed = Date.now() + 100 * 366 * 86400000;
  const settings = {
    ...config.assistant,
    dailyLimit: 3,
    dailyBudgetMicro: 100000,
    monthlyBudgetMicro: 100000,
    conversationTtlMs: 86400000,
    visitorTtlMs: 90 * 86400000
  };
  const repo = createAssistantRepository({ settings, clock: () => fixed });
  const customer = `assistant-qa-${randomUUID()}`;
  const sessions = [];
  const buckets = [`d:${manilaDay(fixed)}`, `m:${manilaDay(fixed).slice(0, 7)}`];
  const [priorBuckets] = await pool.query('SELECT * FROM assistant_spend WHERE id IN (?, ?)', buckets);
  try {
    const opened = await repo.open({});
    sessions.push(opened);
    const actor = { visitorHash: visitorHash(opened.visitorToken) };
    assert.equal((await repo.read(actor, opened.conversationId)).allowance.remaining, 2);
    await repo.updateDraft(actor, opened.conversationId, { guests: 100 }, 0);
    assert.equal((await repo.read(actor, opened.conversationId)).draftRevision, 1);
    await assert.rejects(
      () => repo.updateDraft({ visitorHash: 'a'.repeat(64) }, opened.conversationId, { guests: 500 }, 1),
      (e) => e.code === 'NOT_FOUND'
    );
    await assert.rejects(
      () => repo.updateDraft(actor, opened.conversationId, { guests: 500 }, 0),
      (e) => e.code === 'ASSISTANT_BUSY'
    );
    await assert.rejects(
      () => repo.read({ visitorHash: 'a'.repeat(64) }, opened.conversationId),
      (e) => e.code === 'NOT_FOUND'
    );
    const input = () => ({ requestId: randomUUID(), text: 'Show packages', source: 'text' });
    const firstInput = input();
    const parallel = await Promise.allSettled([
      repo.begin(actor, opened.conversationId, firstInput),
      repo.begin(actor, opened.conversationId, input())
    ]);
    assert.equal(parallel.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(parallel.filter((r) => r.status === 'rejected')[0].reason.code, 'ASSISTANT_BUSY');
    const first = parallel.find((r) => r.status === 'fulfilled').value;
    assert.equal(first.bookingDraft.guests, 100);
    await assert.rejects(
      () => repo.updateDraft(actor, opened.conversationId, { guests: 500 }, 1),
      (e) => e.code === 'ASSISTANT_BUSY'
    );
    const response = { answer: 'Published packages.', packages: [], estimates: [], needsAdmin: false };
    await repo.finish(first.id, { ...response, bookingDraft: { guests: 120, venueName: 'Saved venue' } });
    const afterFirst = await repo.read(actor, opened.conversationId);
    assert.equal(afterFirst.bookingDraft.guests, 120);
    assert.equal(afterFirst.draftRevision, 2);
    const answeredInput = afterFirst.messages[0];
    assert.equal(
      (
        await repo.begin(actor, opened.conversationId, {
          requestId: answeredInput.requestId,
          text: answeredInput.text,
          source: 'text'
        })
      ).replay,
      true
    );
    const second = await repo.begin(actor, opened.conversationId, input());
    await repo.finish(second.id, response);
    assert.equal((await repo.read(actor, opened.conversationId)).allowance.remaining, 0);
    const restartedRepo = createAssistantRepository({ settings, clock: () => fixed });
    await assert.rejects(
      () => restartedRepo.begin(actor, opened.conversationId, input()),
      (e) => e.code === 'ASSISTANT_SIGN_IN_REQUIRED'
    );
    await assert.rejects(
      () => repo.voiceAttempt(actor, opened.conversationId),
      (e) => e.code === 'ASSISTANT_SIGN_IN_REQUIRED'
    );
    const resumed = await repo.open(actor);
    assert.equal(resumed.conversationId, opened.conversationId);
    const claimed = await repo.open({ ...actor, customerId: customer }, opened.conversationId);
    assert.equal(claimed.allowance.remaining, 3);
    await assert.rejects(
      () => repo.read(actor, opened.conversationId),
      (e) => e.code === 'NOT_FOUND'
    );
    await assert.rejects(
      () => repo.read({ customerId: 'other' }, opened.conversationId),
      (e) => e.code === 'NOT_FOUND'
    );
    assert.equal((await repo.read({ customerId: customer }, opened.conversationId)).messages.length, 2);
    assert.equal(
      (await repo.read({ customerId: customer }, opened.conversationId)).bookingDraft.venueName,
      'Saved venue'
    );
    const failed = await repo.begin({ customerId: customer }, opened.conversationId, input());
    assert.equal(failed.bookingDraft.guests, 120);
    await repo.finish(failed.id, null);
    assert.equal((await repo.read({ customerId: customer }, opened.conversationId)).allowance.remaining, 3);
    // A test-only future day isolates the real application's budget buckets.
    await pool.query('DELETE FROM assistant_spend WHERE id IN (?, ?)', buckets);
    const reservations = await Promise.allSettled([
      repo.reserveSpend('answer', customer, 60000),
      repo.reserveSpend('answer', customer, 60000)
    ]);
    assert.equal(reservations.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(reservations.find((r) => r.status === 'rejected').reason.code, 'RATE_LIMITED');
    const reservation = reservations.find((r) => r.status === 'fulfilled').value;
    await repo.settleSpend(reservation, 20000, { input_tokens: 100, output_tokens: 10 });
    const next = await repo.reserveSpend('answer', customer, 80000);
    await repo.settleSpend(next, undefined);
    const [[spent]] = await pool.query('SELECT used_micro FROM assistant_spend WHERE id = ?', [buckets[0]]);
    assert.equal(Number(spent.used_micro), 100000);
    await assert.rejects(
      () => repo.reserveSpend('speech', customer, 1),
      (e) => e.code === 'RATE_LIMITED'
    );
    const [[counts]] = await pool.query('SELECT COUNT(*) AS total FROM assistant_usage WHERE owner_key = ?', [
      customer
    ]);
    assert.equal(Number(counts.total), 2);
  } finally {
    for (const session of sessions) {
      await pool.query('DELETE FROM assistant_conversations WHERE id = ?', [session.conversationId]);
      await pool.query('DELETE FROM assistant_allowances WHERE id = ?', [`g:${visitorHash(session.visitorToken)}`]);
    }
    await pool.query('DELETE FROM assistant_allowances WHERE id LIKE ?', [`c:${customer}:%`]);
    await pool.query('DELETE FROM assistant_usage WHERE owner_key = ?', [customer]);
    await pool.query('DELETE FROM assistant_spend WHERE id IN (?, ?)', buckets);
    for (const row of priorBuckets)
      await pool.query('INSERT INTO assistant_spend (id, used_micro, created_at) VALUES (?, ?, ?)', [
        row.id,
        row.used_micro,
        row.created_at
      ]);
    await closePool();
  }
});
