import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config } from '../src/config.js';
import { pool, closePool } from '../src/db.js';
import { createAssistantRepository } from '../src/modules/assistant/assistant.repo.js';
import { createAssistantProvider } from '../src/integrations/ai/assistant.openai.js';
import { createAssistantTools } from '../src/modules/assistant/assistant.tools.js';
import { capTurnSpend } from '../src/integrations/ai/turnSpend.js';

test('input guard, answer and output guard settle through the real strict MySQL usage ledger', async () => {
  let conn;
  try {
    assert.equal(config.isProduction, false, 'Never run this test against production');
    assert.ok(['localhost', '127.0.0.1', '::1'].includes(config.db.host));
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const owner = `scope-ledger-qa-${randomUUID()}`;
    const settings = {
      ...config.assistant,
      model: 'gpt-6-luna',
      dailyBudgetMicro: 10000000,
      monthlyBudgetMicro: 10000000
    };
    // Every write, including budget buckets, is rolled back. No transcripts or customer records are touched.
    const repo = createAssistantRepository({
      settings,
      transact: (fn) => fn(conn),
      clock: () => Date.UTC(2196, 5, 17)
    });
    const spend = capTurnSpend(
      {
        reserve: (kind, amount) => repo.reserveSpend(kind, owner, amount),
        settle: (id, actual, usage) => repo.settleSpend(id, actual, usage)
      },
      { maxCalls: 9 }
    );
    const calls = [];
    const provider = createAssistantProvider({
      settings,
      client: {
        responses: {
          create: async (body) => {
            const name = body.text.format.name;
            calls.push(name);
            const value =
              name === 'tres_marias_scope_input'
                ? { decision: 'allowed', businessText: '', replyLanguage: 'english' }
                : name === 'tres_marias_scope_output'
                  ? { allowed: true }
                  : {
                      answer: 'I can help you compare our catering packages.',
                      packageIds: [],
                      estimateIds: [],
                      needsAdmin: false
                    };
            return {
              status: 'completed',
              output: [],
              output_text: JSON.stringify(value),
              usage: { input_tokens: 100, output_tokens: 20 }
            };
          }
        }
      }
    });
    const result = await provider.answer({
      text: 'What catering packages do you currently offer?',
      history: [],
      tools: createAssistantTools(),
      spend
    });
    assert.equal(result.answer, 'I can help you compare our catering packages.');
    assert.deepEqual(calls, ['tres_marias_scope_input', 'tres_marias_assistant', 'tres_marias_scope_output']);
    const [usage] = await conn.query('SELECT kind, outcome, charged_micro FROM assistant_usage WHERE owner_key = ?', [
      owner
    ]);
    assert.equal(usage.length, 3);
    assert.ok(
      usage.every((row) => row.kind === 'answer' && row.outcome === 'completed' && Number(row.charged_micro) === 20)
    );
  } finally {
    if (conn) {
      await conn.rollback();
      conn.release();
    }
    await closePool();
  }
});
