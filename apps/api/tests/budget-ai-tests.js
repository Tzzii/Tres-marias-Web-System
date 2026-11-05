import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { buildBudgetCandidates } from '@tm/shared/src/domain/budget.js';
import { config, API_ROOT } from '../src/config.js';
import { budgetCatalogFingerprint } from '../src/lib/budgetCatalogFingerprint.js';
import { rankBudgetCandidates, BudgetAIUnavailable } from '../src/integrations/ai/openai.js';
import { createBudgetProposalService } from '../src/modules/budget/budget.service.js';
import { budgetCatalog, budgetContext } from './helpers/budget-fixtures.js';

const settings = {
  enabled: true,
  model: config.aiBudget.model,
  apiKey: 'fixture-only-key',
  timeoutMs: 100,
  maxOutputTokens: 2000
};
const fixture = () => {
  const catalog = budgetCatalog();
  catalog.budgetCatalogFingerprint = budgetCatalogFingerprint(catalog);
  return { catalog, context: budgetContext(catalog.budgetCatalogFingerprint) };
};
const response = (rankings) => ({
  status: 'completed',
  output: [],
  output_text: JSON.stringify({ rankings }),
  usage: { input_tokens: 100, output_tokens: 30 }
});
const spend = { reserve: async () => 'fixture-spend', settle: async () => {} };

test('budget ranking uses the configured Luna model and returns validated IDs without PII or executable prices', async () => {
  const { catalog, context } = fixture();
  const candidates = buildBudgetCandidates(context, { catalog });
  const calls = [];
  const logs = [];
  const client = {
    responses: {
      create: async (...args) => {
        calls.push(args);
        return response([{ candidateId: 'c1', reasonCode: 'optional_cost' }]);
      }
    }
  };
  const result = await rankBudgetCandidates(
    { context: { ...context, name: 'PRIVATE PERSON', address: 'PRIVATE ADDRESS' }, candidates, catalog },
    { client, settings, spend, logger: (entry) => logs.push(entry) }
  );
  assert.equal(result.rankings[0].id, candidates[0].id);
  const [request, options] = calls[0];
  assert.equal(request.model, 'gpt-6-luna');
  assert.equal(request.model, config.assistant.model);
  assert.equal(request.store, false);
  assert.equal(options.maxRetries, 0);
  assert.equal(request.text.format.strict, true);
  assert.equal(request.reasoning.effort, 'low');
  assert.ok(!request.input.includes('PRIVATE PERSON') && !request.input.includes('PRIVATE ADDRESS'));
  assert.ok(!request.input.includes('lockedContextFingerprint'));
  assert.equal(JSON.parse(request.input).options[0].candidateId, 'c1');
  assert.ok(!JSON.stringify(logs).includes(settings.apiKey));
});

test('API settings default to Luna for budget ranking and preserve the separate voice models', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
      import { config } from './src/config.js';
      console.log(JSON.stringify({
        assistant: config.assistant.model,
        budget: config.aiBudget.model,
        transcription: config.assistant.transcriptionModel,
        speech: config.assistant.speechModel
      }));
    `
    ],
    {
      cwd: API_ROOT,
      env: { ...process.env, NODE_ENV: 'test', AI_TEXT_MODEL: '', AI_BUDGET_MODEL: 'gpt-6-luna' },
      encoding: 'utf8'
    }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    assistant: 'gpt-6-luna',
    budget: 'gpt-6-luna',
    transcription: 'gpt-transcribe',
    speech: 'gpt-realtime-2.1-mini'
  });
});

test('API settings reject a budget model that differs from the shared text model', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', "import './src/config.js';"], {
    cwd: API_ROOT,
    env: { ...process.env, NODE_ENV: 'test', AI_TEXT_MODEL: '', AI_BUDGET_MODEL: 'other-model' },
    encoding: 'utf8'
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /AI_BUDGET_MODEL must be gpt-6-luna/);
});

test('disabled or unconfigured recommendations make zero provider requests', async () => {
  let calls = 0;
  const client = {
    responses: {
      create: async () => {
        calls++;
      }
    }
  };
  await assert.rejects(
    rankBudgetCandidates({}, { settings: { ...settings, enabled: false }, client }),
    BudgetAIUnavailable
  );
  await assert.rejects(rankBudgetCandidates({}, { settings: { ...settings, apiKey: '' } }), BudgetAIUnavailable);
  assert.equal(calls, 0);
});

test('unknown/duplicate IDs, made-up fields, invalid reason codes, refusals and incomplete output are rejected', async () => {
  const { catalog, context } = fixture();
  const candidates = buildBudgetCandidates(context, { catalog });
  for (const answer of [
    response([{ candidateId: 'c999', reasonCode: 'optional_cost' }]),
    response([
      { candidateId: 'c1', reasonCode: 'optional_cost' },
      { candidateId: 'c1', reasonCode: 'optional_cost' }
    ]),
    response([{ candidateId: 'c1', reasonCode: 'suitable_for_200_guests' }]),
    response([{ candidateId: 'c1', reasonCode: 'optional_cost', price: 1 }]),
    { ...response([]), output_text: JSON.stringify({ rankings: [], guests: 2, menu: ['one dish'] }) },
    { status: 'completed', output_text: '{broken' },
    { status: 'incomplete', output_text: '{}' },
    { status: 'completed', output: [{ content: [{ type: 'refusal' }] }] }
  ]) {
    await assert.rejects(
      rankBudgetCandidates(
        { catalog, context, candidates },
        { client: { responses: { create: async () => answer } }, settings, spend, logger: () => {} }
      ),
      BudgetAIUnavailable
    );
  }
});

test('provider quota errors and timeouts stay generic, never retry, and do not leak errors', async () => {
  const { catalog, context } = fixture();
  const candidates = buildBudgetCandidates(context, { catalog });
  const logs = [];
  let calls = 0;
  const client = {
    responses: {
      create: async () => {
        calls++;
        throw Object.assign(new Error('PRIVATE raw-provider-details'), { code: 'insufficient_quota' });
      }
    }
  };
  await assert.rejects(
    rankBudgetCandidates({ catalog, context, candidates }, { client, settings, spend, logger: (e) => logs.push(e) }),
    (e) => e.outcome === 'quota' && !e.message.includes('PRIVATE')
  );
  assert.equal(calls, 1);
  assert.ok(!JSON.stringify(logs).includes('PRIVATE'));
  await assert.rejects(
    rankBudgetCandidates(
      { catalog, context, candidates },
      {
        settings,
        spend,
        logger: () => {},
        client: {
          responses: {
            create: async () => {
              calls++;
              throw Object.assign(new Error('PRIVATE provider rate limit'), { status: 429 });
            }
          }
        }
      }
    ),
    (e) => e.outcome === 'provider-error' && !e.message.includes('PRIVATE')
  );
  assert.equal(calls, 2);
  await assert.rejects(
    rankBudgetCandidates(
      { catalog, context, candidates },
      {
        settings: { ...settings, timeoutMs: 5 },
        spend,
        logger: () => {},
        client: { responses: { create: () => new Promise(() => {}) } }
      }
    ),
    (e) => e.outcome === 'timeout'
  );
});

test('proposal service validates before ranking, persists server snapshots and caches per customer', async () => {
  const { catalog, context } = fixture();
  const saved = [];
  let calls = 0;
  const service = createBudgetProposalService({
    readCatalog: async () => catalog,
    readStock: async () => ({}),
    rank: async ({ candidates }) => {
      calls++;
      return { rankings: [{ id: candidates[0].id, reasonCode: 'optional_cost' }] };
    },
    save: async (p) => saved.push(p),
    clock: () => 1000
  });
  const first = await service({ id: 'customer-a' }, context);
  assert.equal(first.status, 'ready');
  assert.equal(first.estimate.baseTotal, 120000);
  assert.equal(saved[0].customerId, 'customer-a');
  assert.equal(saved[0].expiresAt - saved[0].createdAt, 86400000);
  first.candidates.length = 0;
  assert.equal((await service({ id: 'customer-a' }, context)).candidates.length, 1);
  assert.equal(calls, 1);
  await service({ id: 'customer-b' }, context);
  assert.equal(calls, 2);
  await assert.rejects(
    service({ id: 'customer-a' }, { ...context, reviewedCatalogFingerprint: 'b'.repeat(64) }),
    (e) => e.code === 'CATALOG_CHANGED'
  );
  await assert.rejects(
    service({ id: 'customer-a' }, { ...context, selection: { addonIds: ['invented'], addonQty: {} } }),
    (e) => e.code === 'INVALID'
  );
  assert.equal(calls, 2);
});

test('identical in-flight requests share ranking and changed stock invalidates cached no-change results', async () => {
  const { catalog, context } = fixture();
  let resolve;
  let calls = 0;
  let stock = {};
  const wait = new Promise((r) => {
    resolve = r;
  });
  const service = createBudgetProposalService({
    readCatalog: async () => catalog,
    readStock: async () => stock,
    rank: async ({ candidates }) => {
      calls++;
      await wait;
      return { rankings: [{ id: candidates[0].id, reasonCode: 'optional_cost' }] };
    },
    save: async () => {}
  });
  const first = service({ id: 'a' }, context);
  const second = service({ id: 'a' }, context);
  await new Promise((r) => setImmediate(r));
  assert.equal(calls, 1);
  resolve();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.proposalId, b.proposalId);
  stock = { item: { left: 1 } };
  await service({ id: 'a' }, context);
  assert.equal(calls, 2);
});

test('no candidates skip AI, provider failures retain estimates, and catalog changes during ranking reject results', async () => {
  const { catalog, context } = fixture();
  let calls = 0;
  const dependencies = {
    readCatalog: async () => catalog,
    readStock: async () => ({}),
    save: async () => {},
    rank: async () => {
      calls++;
      throw Error('PRIVATE');
    }
  };
  const service = createBudgetProposalService(dependencies);
  const unavailable = await service({ id: 'a' }, context);
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.estimate.knownTotal, 133000);
  assert.equal(unavailable.proposalId, null);
  assert.ok(!unavailable.message.includes('PRIVATE'));
  const noChanges = await service({ id: 'a' }, { ...context, protectedAddonIds: ['stage', 'helpers', 'premium'] });
  assert.equal(noChanges.status, 'no-changes');
  assert.equal(calls, 1);
  const changed = createBudgetProposalService({
    ...dependencies,
    rank: async ({ candidates }) => {
      const id = candidates[0].id;
      catalog.pricePerPlate = 700;
      return { rankings: [{ id, reasonCode: 'optional_cost' }] };
    }
  });
  await assert.rejects(changed({ id: 'a' }, context), (e) => e.code === 'CATALOG_CHANGED');
});

test('service descriptions cannot claim known savings or an incompatible action from a model reason code', async () => {
  const { catalog, context } = fixture();
  const service = createBudgetProposalService({
    readCatalog: async () => catalog,
    readStock: async () => ({}),
    save: async () => {},
    rank: async ({ candidates }) => ({
      rankings: candidates
        .filter((c) => ['unknown', 'stage'].includes(c.action.addonId))
        .map((c) => ({ id: c.id, reasonCode: 'alternative' }))
    })
  });
  const result = await service(
    { id: 'a' },
    { ...context, selection: { addonIds: ['stage', 'unknown'], addonQty: { stage: 1, unknown: 1 } } }
  );
  assert.equal(result.candidates.find((c) => c.action.addonId === 'unknown').reasonCode, 'price_review');
  assert.equal(result.candidates.find((c) => c.action.addonId === 'stage').reasonCode, 'optional_cost');
  assert.equal(result.candidates.find((c) => c.action.addonId === 'unknown').knownSavings, null);
});

test('text model can switch to Sol and rejects unsupported models or mismatched rankers', () => {
  for (const [model, budget, ok] of [
    ['gpt-6.1-sol', '', true],
    ['gpt-6.1-sol', 'gpt-6.1-sol', true],
    ['gpt-6-luna', 'gpt-6.1-sol', false],
    ['unknown-model', '', false]
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import {config} from './src/config.js'; console.log(JSON.stringify([config.assistant.model, config.aiBudget.model]));"
      ],
      {
        cwd: API_ROOT,
        env: { ...process.env, NODE_ENV: 'test', AI_TEXT_MODEL: model, AI_BUDGET_MODEL: budget },
        encoding: 'utf8'
      }
    );
    if (ok) {
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), [model, model]);
    } else assert.notEqual(result.status, 0);
  }
});

test('text spending uses selected-model rates and rounds fractional microdollars upward', async () => {
  const { textCostMicro } = await import('../src/integrations/ai/textPricing.js');
  assert.equal(textCostMicro('gpt-6-luna', 100, 20), 20);
  assert.equal(textCostMicro('gpt-6.1-sol', 100, 20), 400);
  assert.equal(textCostMicro('gpt-6-luna', 13, 7), 5);
  assert.throws(() => textCostMicro('unknown-model', 100, 20));
});

test('legacy ranking requires an approved spending reservation before a paid request', async () => {
  const { catalog, context } = fixture();
  const candidates = buildBudgetCandidates(context, { catalog });
  let calls = 0;
  const client = {
    responses: {
      create: async () => {
        calls++;
        return response([]);
      }
    }
  };
  await assert.rejects(
    rankBudgetCandidates({ catalog, context, candidates }, { settings, client, logger: () => {} }),
    BudgetAIUnavailable
  );
  await assert.rejects(
    rankBudgetCandidates(
      { catalog, context, candidates },
      {
        settings,
        client,
        logger: () => {},
        spend: {
          reserve: async () => {
            throw new Error('cap exhausted');
          },
          settle: async () => {}
        }
      }
    ),
    BudgetAIUnavailable
  );
  assert.equal(calls, 0);
});

test('legacy ranking charges validated usage and conservatively settles failed or missing usage once', async () => {
  const { catalog, context } = fixture();
  const candidates = buildBudgetCandidates(context, { catalog });
  for (const [answer, expected] of [
    [response([]), 25],
    [{ ...response([]), usage: {} }, undefined],
    [new Error('provider failure'), undefined]
  ]) {
    const events = [];
    const accounting = {
      reserve: async (kind, upper) => {
        events.push(['reserve', kind, upper]);
        return 'spend-1';
      },
      settle: async (...args) => events.push(['settle', ...args])
    };
    const operation = rankBudgetCandidates(
      { catalog, context, candidates },
      {
        settings,
        spend: accounting,
        logger: () => {},
        client: {
          responses: {
            create: async (body, options) => {
              events.push(['provider']);
              assert.ok(body.max_output_tokens <= 1000);
              assert.equal(options.maxRetries, 0);
              if (answer instanceof Error) throw answer;
              return answer;
            }
          }
        }
      }
    );
    if (answer instanceof Error) await assert.rejects(operation, BudgetAIUnavailable);
    else await operation;
    assert.deepEqual(
      events.map(([name]) => name),
      ['reserve', 'provider', 'settle']
    );
    assert.equal(events[0][1], 'answer');
    assert.ok(events[0][2] > 25);
    assert.equal(events[2][1], 'spend-1');
    assert.equal(events[2][2], expected);
  }
});

test('legacy ranking rejects oversized prompts without reserving spend or calling the provider', async () => {
  const { catalog, context } = fixture();
  const candidates = buildBudgetCandidates(context, { catalog });
  let calls = 0;
  await assert.rejects(
    rankBudgetCandidates(
      { catalog, context: { ...context, preferences: 'x'.repeat(70000) }, candidates },
      {
        settings: { ...settings, maxInputBytes: 64000 },
        logger: () => {},
        spend: {
          reserve: async () => {
            calls++;
          },
          settle: async () => {}
        },
        client: {
          responses: {
            create: async () => {
              calls++;
              return response([]);
            }
          }
        }
      }
    ),
    BudgetAIUnavailable
  );
  assert.equal(calls, 0);
});

test('legacy ranking shares only a stable prompt cache key while keeping customer text out of the key', async () => {
  const { catalog, context } = fixture();
  const candidates = buildBudgetCandidates(context, { catalog });
  const requests = [];
  for (const preferences of ['PRIVATE CUSTOMER ONE', 'PRIVATE CUSTOMER TWO'])
    await rankBudgetCandidates(
      { catalog, context: { ...context, preferences }, candidates },
      {
        settings,
        spend,
        logger: () => {},
        client: {
          responses: {
            create: async (body) => {
              requests.push(body);
              return response([]);
            }
          }
        }
      }
    );
  assert.ok(requests[0].prompt_cache_key);
  assert.equal(requests[0].prompt_cache_key, requests[1].prompt_cache_key);
  assert.ok(!requests[0].prompt_cache_key.includes('PRIVATE'));
  assert.equal(requests[0].prompt_cache_retention, undefined);
});
