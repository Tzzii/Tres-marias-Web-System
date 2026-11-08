import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config } from '../src/config.js';
import { pool, closePool } from '../src/db.js';
import { createAssistantRepository, visitorHash, manilaDay } from '../src/modules/assistant/assistant.repo.js';

test('durable assistant trial, concurrent reservations, claims and spending caps', async (t) => {
  assert.equal(config.isProduction, false);
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(config.db.host));
  let fixed = Date.now() + 100 * 366 * 86400000;
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
    assert.equal((await repo.read(actor, opened.conversationId)).allowance.remaining, 5);
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
    assert.equal((await repo.read(actor, opened.conversationId)).allowance.remaining, 3);
    for (let question = 3; question <= 5; question++) {
      const turn = await repo.begin(actor, opened.conversationId, input());
      await repo.finish(turn.id, response);
      assert.equal((await repo.read(actor, opened.conversationId)).allowance.remaining, 5 - question);
    }
    const restartedRepo = createAssistantRepository({ settings, clock: () => fixed });
    await assert.rejects(
      () => restartedRepo.begin(actor, opened.conversationId, input()),
      (e) => e.code === 'RATE_LIMITED'
    );
    await assert.rejects(
      () => repo.voiceAttempt(actor, opened.conversationId),
      (e) => e.code === 'RATE_LIMITED'
    );
    const resumed = await repo.open(actor);
    assert.equal(resumed.conversationId, opened.conversationId);
    const startedAt = fixed;
    assert.equal(resumed.allowance.resetsAt, startedAt + 3 * 86400000);
    await pool.query('UPDATE assistant_allowances SET voice_tries = 10 WHERE id = ?', [`g:${actor.visitorHash}`]);
    for (const elapsed of [86400000, 2 * 86400000, 3 * 86400000 - 1]) {
      fixed = startedAt + elapsed;
      const waiting = await repo.open(actor);
      sessions.push(waiting);
      assert.equal(waiting.allowance.remaining, 0);
      assert.equal(waiting.allowance.resetsAt, startedAt + 3 * 86400000);
    }
    fixed = startedAt + 3 * 86400000;
    const renewed = await repo.open(actor);
    sessions.push(renewed);
    assert.equal(renewed.visitorToken, undefined);
    assert.equal(renewed.allowance.remaining, 5);
    assert.equal(renewed.allowance.resetsAt, fixed + 3 * 86400000);
    await repo.voiceAttempt(actor, renewed.conversationId);
    const renewedTurn = await repo.begin(actor, renewed.conversationId, input());
    await repo.finish(renewedTurn.id, response);
    assert.equal((await repo.read(actor, renewed.conversationId)).allowance.remaining, 4);
    const fresh = await repo.open(actor, undefined, { fresh: true });
    sessions.push(fresh);
    assert.equal(fresh.allowance.remaining, 4);
    fixed = startedAt + 6 * 86400000;
    const renewedAgain = await repo.open(actor);
    sessions.push(renewedAgain);
    assert.equal(renewedAgain.visitorToken, undefined);
    assert.equal(renewedAgain.allowance.remaining, 5, 'unused questions do not accumulate across windows');
    assert.equal(renewedAgain.allowance.resetsAt, fixed + 3 * 86400000);
    // Return to the original clock for the independent customer/claim checks below.
    fixed = startedAt;
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
    assert.equal((await repo.read({ customerId: customer }, opened.conversationId)).messages.length, 5);
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
