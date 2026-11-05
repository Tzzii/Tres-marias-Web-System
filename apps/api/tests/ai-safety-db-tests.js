import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config } from '../src/config.js';
import { pool, closePool } from '../src/db.js';
import { createAISafetyRepository } from '../src/modules/assistant/aiSafety.repo.js';
import { createAssistantRepository } from '../src/modules/assistant/assistant.repo.js';

test('durable admission serializes workers, limits attempts, expires leases and pauses on unknown outcomes', async () => {
  assert.equal(config.isProduction, false);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(config.db.host));
  let now = Date.now() + 120 * 366 * 86400000;
  const start = now,
    actors = Array.from({ length: 5 }, () => randomUUID().replaceAll('-', ''));
  const settings = { ...config.assistant, dailyLimit: 2 };
  const repo = createAISafetyRepository({ settings, clock: () => now });
  const usageIds = Array.from({ length: 5 }, () => randomUUID());
  const input = (i) => ({ kind: 'paid', actorKey: actors[i], ipKey: actors[i], signedIn: true });
  try {
    const parallel = await Promise.all([repo.admit(input(0)), repo.admit(input(0))]);
    assert.equal(parallel.filter((v) => v.allowed).length, 1);
    assert.equal(parallel.find((v) => !v.allowed).reason, 'concurrency');
    await repo.admit(input(1));
    await repo.admit(input(2));
    assert.equal((await repo.admit(input(3))).reason, 'concurrency');
    await repo.release(parallel.find((v) => v.allowed).lease);
    assert.equal((await repo.admit(input(3))).allowed, true);
    now += 121000;
    assert.equal((await repo.admit(input(4))).allowed, true);
    await pool.query('DELETE FROM ai_guard_leases WHERE actor_key IN (?)', [actors]);
    for (let i = 0; i < 6; i++) {
      const result = await repo.admit(input(0));
      if (result.lease) await repo.release(result.lease);
      assert.equal(result.allowed, true);
    }
    assert.equal((await repo.admit(input(0))).reason, 'attempt-limit');
    now += 61000;
    for (const id of usageIds)
      await pool.query(
        "INSERT INTO assistant_usage (id, owner_key, kind, day_key, month_key, reserved_micro, charged_micro, outcome, created_at) VALUES (?, ?, 'answer', 'test', 'test', 1, 1, 'unknown', ?)",
        [id, actors[0], now]
      );
    assert.equal((await repo.admit(input(1))).reason, 'provider-circuit');
    now += 301000;
    assert.equal((await repo.admit(input(1))).allowed, true);
    const assistant = createAssistantRepository({ settings, clock: () => now });
    const work = await assistant.beginExternal({ customerId: actors[0] });
    await assert.rejects(assistant.beginExternal({ customerId: actors[0] }), (e) => e.code === 'ASSISTANT_BUSY');
    assert.equal(await assistant.finishExternal(work, true), true);
    assert.equal(await assistant.finishExternal(work, true), false);
    const second = await assistant.beginExternal({ customerId: actors[0] });
    await assistant.finishExternal(second, true);
    await assert.rejects(assistant.beginExternal({ customerId: actors[0] }), (e) => e.code === 'RATE_LIMITED');
  } finally {
    await pool.query('DELETE FROM ai_guard_leases WHERE actor_key IN (?)', [actors]);
    await pool.query("DELETE FROM ai_guard_windows WHERE expires_at >= ? AND id <> 'mutex'", [start]);
    await pool.query('DELETE FROM assistant_usage WHERE id IN (?)', [usageIds]);
    await pool.query('DELETE FROM assistant_allowances WHERE id LIKE ?', [`c:${actors[0]}:%`]);
    await closePool();
  }
});
