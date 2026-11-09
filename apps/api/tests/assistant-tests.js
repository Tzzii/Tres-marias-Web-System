import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once, EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createAssistantTools } from '../src/modules/assistant/assistant.tools.js';
import { createAssistantProvider } from '../src/integrations/ai/assistant.openai.js';
import { withScopeVerdicts } from './helpers/assistant-scope-client.js';

import { createAssistantService } from '../src/modules/assistant/assistant.service.js';
import { createAssistantRoutes } from '../src/modules/assistant/assistant.routes.js';
import { readQuestionAudio, pcmWave } from '../src/modules/assistant/assistant.audio.js';
import { errorHandler } from '../src/middleware/errors.js';
import { ApiError } from '../src/lib/ApiError.js';
import { computeQuote, INCLUSIVE_PRICING_MODEL } from '@tm/shared/src/services/pricing.js';

const providerWithScopeFixtures = (options) =>
  createAssistantProvider({
    ...options,
    client: withScopeVerdicts(options.client)
  });

const settings = {
  enabled: true,
  voiceEnabled: true,
  apiKey: 'test-only-not-a-key',
  model: 'gpt-6-luna',
  dailyLimit: 20,
  dailyBudgetMicro: 1000000,
  monthlyBudgetMicro: 10000000,
  timeoutMs: 100,
  turnTimeoutMs: 1000,
  maxOutputTokens: 2048,
  maxInputBytes: 32000,
  maxCalls: 4
};
const catalog = {
  pricePerPlate: 600,
  sixHourFee: 5000,
  minDownpayment: 3000,
  rentals: [],
  packages: [
    {
      id: 'pkg-a',
      name: 'Classic',
      slug: 'classic',
      visible: true,
      guests: 100,
      price: 15000,
      kind: 'package',
      items: []
    },
    { id: 'hidden', name: 'Hidden', slug: 'hidden', visible: false, guests: 100, price: 1 },
    { id: 'archived', name: 'Archived', slug: 'archived', archived: true, price: 1 }
  ],
  addons: [
    {
      id: 'custom',
      name: 'Custom backdrop',
      description: 'Subject to quote',
      price: null,
      hasQuantity: false,
      sizes: []
    }
  ],
  dishes: [{ id: 'kawali', name: 'Lechon Kawali', category: 'pork' }]
};

test('menu overview includes later vegetable dishes instead of silently stopping at sixteen', async () => {
  const dishes = [
    ...Array.from({ length: 17 }, (_, i) => ({ id: `chicken-${i}`, name: `Chicken ${i}`, category: 'chicken' })),
    { id: 'chopsuey', name: 'Chopsuey', category: 'vegetable' },
    { id: 'hidden-veg', name: 'Archived vegetable', category: 'vegetable', archived: true }
  ];
  const tools = createAssistantTools({ getCatalog: async () => ({ ...catalog, dishes }) });
  const result = await tools.run('search_catalog', { query: '', kind: 'dishes' });
  assert.equal(result.dishes.length, 18);
  assert.ok(result.dishes.some((dish) => dish.id === 'chopsuey'));
  assert.ok(!result.dishes.some((dish) => dish.archived || dish.id === 'hidden-veg'));
});

for (const query of ['vegetable', 'vegetables', 'gulay']) {
  test(`menu search resolves category wording without needing it in the dish name: ${query}`, async () => {
    const tools = createAssistantTools({
      getCatalog: async () => ({
        ...catalog,
        dishes: [...catalog.dishes, { id: 'chopsuey', name: 'Chopsuey', category: 'vegetable' }]
      })
    });
    const result = await tools.run('search_catalog', { query, kind: 'dishes' });
    assert.deepEqual(
      result.dishes.map((dish) => dish.id),
      ['chopsuey']
    );
  });
}

test('assistant estimates use current inclusive pricing and preserve pending quotation items', async () => {
  const tools = createAssistantTools({ getCatalog: async () => catalog });
  const search = await tools.run('search_catalog', { query: '', kind: 'packages' });
  assert.deepEqual(
    search.packages.map((p) => p.id),
    ['pkg-a']
  );
  const args = {
    packageId: 'pkg-a',
    serviceType: 'Buffet and Catering',
    guests: 100,
    date: null,
    startTime: '12:00',
    endTime: '18:00',
    addons: [{ id: 'custom', quantity: 1 }]
  };
  const estimate = await tools.run('estimate_event', args);
  const expected = computeQuote({
    pkg: catalog.packages[0],
    pricingModel: INCLUSIVE_PRICING_MODEL,
    serviceType: args.serviceType,
    guests: 100,
    pricePerPlate: 600,
    sixHourFee: 5000,
    startTime: '12:00',
    endTime: '18:00'
  });
  assert.equal(estimate.knownSubtotal, expected.net);
  assert.equal(estimate.knownSubtotal, 65000);
  assert.deepEqual(estimate.pendingQuotation, ['Custom backdrop']);
  assert.equal(estimate.finalQuotation, false);
  assert.equal(estimate.intent.serviceType, args.serviceType);
  assert.equal((await tools.run('estimate_event', { ...args, pricePerPlate: 0 })).error.includes('invalid'), true);
  assert.match((await tools.run('get_package', { packageId: 'hidden' })).error, /no longer published/);
  const dish = await tools.run('search_catalog', { query: 'lechon', kind: 'dishes' });
  assert.deepEqual(
    dish.dishes.map((p) => p.name),
    ['Lechon Kawali']
  );
});

test('calendar function removes internal notes and personal information from results', async () => {
  const tools = createAssistantTools({
    availability: async () => ({
      date: '2090-01-01',
      startTime: '12:00',
      endTime: '14:00',
      available: false,
      reason: 'Not available',
      note: 'Private internal note',
      customer: 'Private customer'
    })
  });
  const result = await tools.run('check_availability', { date: '2090-01-01', startTime: '12:00', endTime: '14:00' });
  assert.equal(result.holdsSlot, false);
  assert.equal(JSON.stringify(result).includes('Private'), false);
  await assert.rejects(
    () => tools.run('delete_all_bookings', {}),
    (e) => e.code === 'INVALID'
  );
});

test('question audio verifies PCM data, sample count and format rather than trusting metadata', () => {
  const wav = pcmWave(Buffer.alloc(16000 * 2), 16000);
  assert.equal(readQuestionAudio(wav).seconds, 1);
  assert.throws(() => readQuestionAudio(pcmWave(Buffer.alloc(31 * 16000 * 2), 16000)));
  assert.throws(() => readQuestionAudio(pcmWave(Buffer.alloc(1000), 16000)));
  const forged = Buffer.from(wav);
  forged.writeUInt16LE(2, 22);
  assert.throws(() => readQuestionAudio(forged));
  const trailing = Buffer.concat([wav, Buffer.alloc(2)]);
  assert.throws(() => readQuestionAudio(trailing));
});

test('provider completes a tool loop, validates returned cards and accounts for all model calls', async () => {
  const reservations = [];
  const settlements = [];
  const calls = [];
  const client = {
    responses: {
      create: async (body) => {
        calls.push(structuredClone(body));
        if (calls.length === 1)
          return {
            status: 'completed',
            usage: { input_tokens: 100, output_tokens: 10 },
            output: [
              { type: 'function_call', call_id: 'call-1', name: 'get_package', arguments: '{"packageId":"pkg-a"}' }
            ]
          };
        return {
          status: 'completed',
          usage: { input_tokens: 200, output_tokens: 20 },
          output: [],
          output_text: JSON.stringify({
            answer: 'Here is a published package.',
            packageIds: ['pkg-a'],
            estimateIds: [],
            needsAdmin: false
          })
        };
      }
    }
  };
  const spend = {
    reserve: async (...args) => {
      reservations.push(args);
      return String(reservations.length);
    },
    settle: async (...args) => settlements.push(args)
  };
  const provider = providerWithScopeFixtures({ settings, client });
  const result = await provider.answer({
    text: 'Show a package',
    history: [],
    tools: createAssistantTools({ getCatalog: async () => catalog }),
    spend
  });
  assert.equal(result.packages[0].id, 'pkg-a');
  assert.equal(calls.length, 2);
  assert.equal(reservations.length, 4);
  assert.equal(settlements.length, 4);
  assert.deepEqual(
    settlements.map((entry) => entry[1]),
    [0, 15, 30, 0]
  );
  assert.equal(
    reservations[1][1],
    Math.ceil((Buffer.byteLength(JSON.stringify(calls[0])) + 4096) * 0.1 + settings.maxOutputTokens * 0.5)
  );
  assert.match(calls[0].instructions, /one item per line/);
  assert.match(calls[0].instructions, /Separate the introduction, list/);
  assert.match(calls[0].instructions, /shown packages are default starting options/);
  assert.match(calls[0].instructions, /adjusted to the customer's preferences and event needs/);
  assert.match(calls[0].instructions, /Changes may affect pricing and require admin review/);
  assert.equal(calls[0].store, false);
  assert.equal(calls[0].model, 'gpt-6-luna');
  assert.equal(
    calls[1].input.some((m) => m.type === 'function_call_output'),
    true
  );
  const forged = providerWithScopeFixtures({
    settings,
    client: {
      responses: {
        create: async () => ({
          status: 'completed',
          output: [],
          output_text: JSON.stringify({
            answer: 'Invented',
            packageIds: ['hidden'],
            estimateIds: [],
            needsAdmin: false
          })
        })
      }
    }
  });
  await assert.rejects(
    () => forged.answer({ text: 'x', history: [], tools: createAssistantTools(), spend }),
    (e) => e.code === 'ASSISTANT_UNAVAILABLE'
  );
});

test('failed model requests release question allowance; duplicate completed requests do not call the provider', async () => {
  const finishes = [];
  let calls = 0;
  let replay = false;
  const repo = {
    begin: async () => ({ id: 'turn', history: [], replay }),
    finish: async (...args) => {
      finishes.push(args);
      return true;
    },
    read: async () => ({ allowance: { remaining: 1 }, messages: [] })
  };
  const service = createAssistantService({
    settings,
    repo,
    getCatalog: async () => catalog,
    provider: {
      answer: async () => {
        calls++;
        throw new ApiError('ASSISTANT_UNAVAILABLE', 'Unavailable');
      }
    }
  });
  await assert.rejects(() => service.answer({ visitorHash: 'x' }, 'id', { text: 'x' }));
  assert.deepEqual(finishes, [['turn', null]]);
  replay = true;
  await service.answer({ visitorHash: 'x' }, 'id', { text: 'x' });
  assert.equal(calls, 1);
  const disabled = createAssistantService({
    settings: { ...settings, apiKey: '' },
    repo,
    provider: {
      answer: () => {
        throw Error('must not run');
      }
    }
  });
  assert.equal(disabled.publicConfig().available, false);
  assert.equal('apiKey' in disabled.publicConfig(), false);
});

test('speech replay is deduplicated but still checks conversation ownership', async () => {
  const id = randomUUID();
  let reads = 0,
    speechCalls = 0;
  let allowed = true;
  const repo = {
    read: async () => {
      reads++;
      if (!allowed) throw new ApiError('NOT_FOUND', 'Not found');
      return { messages: [{ id, status: 'completed' }] };
    },
    voiceAttempt: async () => 'Read this answer.'
  };
  const service = createAssistantService({
    settings,
    repo,
    provider: {
      speak: async () => {
        speechCalls++;
        return Buffer.from('audio');
      }
    }
  });
  await Promise.all([service.speech({}, 'conversation', id), service.speech({}, 'conversation', id)]);
  assert.equal(reads, 2);
  assert.equal(speechCalls, 1);
  allowed = false;
  await assert.rejects(() => service.speech({}, 'conversation', id));
});

test('voice adapters use the supported transcription and Realtime protocols without exposing a client session', async () => {
  const commands = [];
  const bills = [];
  const spend = {
    reserve: async (kind, amount) => {
      bills.push({ kind, amount });
      return kind;
    },
    settle: async () => {}
  };
  const provider = providerWithScopeFixtures({
    settings: {
      ...settings,
      timeoutMs: 1000,
      transcriptionModel: 'gpt-transcribe',
      speechModel: 'gpt-realtime-2.1-mini',
      voice: 'marin'
    },
    client: {
      audio: {
        transcriptions: {
          create: async (body) => {
            assert.equal(body.model, 'gpt-transcribe');
            assert.equal(body.file.name, 'question.wav');
            return { text: 'Birthday for 100 guests' };
          }
        }
      }
    },
    socketFactory: (url, options) => {
      assert.match(url, /gpt-realtime-2.1-mini$/);
      assert.match(options.headers.Authorization, /^Bearer /);
      const socket = new EventEmitter();
      socket.close = () => socket.emit('close');
      socket.send = (raw) => {
        const event = JSON.parse(raw);
        commands.push(event);
        if (event.type === 'session.update')
          queueMicrotask(() => socket.emit('message', Buffer.from('{"type":"session.updated"}')));
        if (event.type === 'response.create')
          queueMicrotask(() => {
            socket.emit(
              'message',
              Buffer.from(
                JSON.stringify({ type: 'response.output_audio.delta', delta: Buffer.alloc(480).toString('base64') })
              )
            );
            socket.emit(
              'message',
              Buffer.from(
                '{"type":"response.done","response":{"status":"completed","usage":{"input_tokens":20,"output_tokens":10}}}'
              )
            );
          });
      };
      queueMicrotask(() => socket.emit('open'));
      return socket;
    }
  });
  const transcript = await provider.transcribe({ buffer: pcmWave(Buffer.alloc(32000), 16000), seconds: 1, spend });
  assert.equal(transcript.text, 'Birthday for 100 guests');
  const audio = await provider.speak({ text: 'Please review the estimate.', spend });
  assert.equal(audio.toString('ascii', 0, 4), 'RIFF');
  assert.equal(commands[0].session.type, 'realtime');
  assert.equal(commands[0].session.max_output_tokens, 2048);
  assert.deepEqual(commands[0].session.tools, []);
  assert.equal(
    commands.find((c) => c.type === 'conversation.item.create').item.content[0].text,
    'Please review the estimate.'
  );
  assert.deepEqual(
    bills.map((b) => b.kind),
    ['transcription', 'speech']
  );
});

test('live evaluation scenarios cover both languages, prices, schedules, privacy and escalation', async () => {
  const cases = JSON.parse(await readFile(new URL('./fixtures/assistant-evaluation.json', import.meta.url), 'utf8'));
  assert.ok(cases.length >= 30 && cases.length <= 50);
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  for (const entry of cases) assert.ok(entry.question && Array.isArray(entry.tools) && entry.review);
  for (const id of [
    'catalog-fil',
    'catalog-taglish',
    'six-hours',
    'overnight',
    'availability',
    'privacy-other',
    'prompt-injection',
    'scope-avengers',
    'scope-anime-taglish',
    'scope-theme-avengers',
    'scope-theme-anime',
    'scope-mixed',
    'calendar-month-taglish',
    'calendar-month-ambiguous-year'
  ])
    assert.ok(cases.some((c) => c.id === id));
});

test('routes reject injected models, prices and narration text and gate audio before upload', async (t) => {
  let paid = 0;
  let draftUpdates = 0;
  const service = {
    publicConfig: () => ({ available: true }),
    open: async () => ({}),
    answer: async () => {
      paid++;
      return {};
    },
    read: async () => ({}),
    updateDraft: async () => {
      draftUpdates++;
      return {};
    },
    canTranscribe: async () => {
      throw new ApiError('ASSISTANT_SIGN_IN_REQUIRED', 'Sign in');
    },
    transcribe: async () => {
      paid++;
    },
    speech: async () => {
      paid++;
      return Buffer.from('audio');
    }
  };
  const app = express();
  app.use(express.json());
  app.use('/assistant', createAssistantRoutes({ service, authenticate: (req, res, next) => next() }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/assistant/conversations/${randomUUID()}`;
  const post = (path, body) =>
    fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const input = { requestId: randomUUID(), text: 'Hello', source: 'text' };
  assert.equal((await post('/messages', { ...input, model: 'other-model' })).status, 400);
  assert.equal((await post('/messages', { ...input, customerId: 'other' })).status, 400);
  assert.equal((await post('/messages', { ...input, price: 0 })).status, 400);
  assert.equal((await post('/booking-draft', { draft: { guests: 100, price: 0 }, revision: 0 })).status, 400);
  assert.equal(
    (await post('/booking-draft', { draft: { guests: 100 }, revision: 0, customerId: 'another' })).status,
    400
  );
  assert.equal((await post('/booking-draft', { draft: { guests: 100 }, revision: 0 })).status, 200);
  assert.equal((await post('/resume-booking', { form: { guests: '100' }, revision: 0 })).status, 200);
  assert.equal(draftUpdates, 2);
  assert.equal((await post(`/messages/${randomUUID()}/speech`, { text: 'Arbitrary narration' })).status, 400);
  const audio = new FormData();
  audio.append('audio', new Blob(['audio']), 'question.wav');
  assert.equal((await fetch(base + '/transcriptions', { method: 'POST', body: audio })).status, 403);
  assert.equal(paid, 0);
  const answer = await post('/messages', input);
  assert.equal(answer.status, 200);
  assert.equal(answer.headers.get('cache-control'), 'no-store');
  assert.equal(paid, 1);
});

test('repeated equivalent tool calls stop a stalled loop before rerunning the tool or paying again', async () => {
  let calls = 0,
    catalogReads = 0;
  const provider = providerWithScopeFixtures({
    settings,
    client: {
      responses: {
        create: async () => ({
          status: 'completed',
          usage: { input_tokens: 100, output_tokens: 10 },
          output: [
            {
              type: 'function_call',
              call_id: `call-${++calls}`,
              name: 'search_catalog',
              arguments: calls === 1 ? '{"query":"","kind":"packages"}' : '{"kind":"packages","query":""}'
            }
          ]
        })
      }
    }
  });
  await assert.rejects(
    provider.answer({
      text: 'Show packages',
      history: [],
      tools: createAssistantTools({
        getCatalog: async () => {
          catalogReads++;
          return catalog;
        }
      }),
      spend: { reserve: async () => 'paid', settle: async () => {} }
    }),
    { code: 'ASSISTANT_UNAVAILABLE' }
  );
  assert.equal(calls, 2);
  assert.equal(catalogReads, 1);
});

test('tool repetition after a changed saved plan is allowed and never reuses an old estimate', async () => {
  const draft = { serviceType: 'Catering only', guests: 100, planningStarted: true };
  const outputs = [
    ['get_reservation_draft', {}],
    ['prepare_reservation', { patch: { guests: 120 }, clearFields: [] }],
    ['get_reservation_draft', {}]
  ];
  let calls = 0;
  const requests = [];
  const provider = providerWithScopeFixtures({
    settings,
    client: {
      responses: {
        create: async (body) => {
          requests.push(structuredClone(body));
          const entry = outputs[calls++];
          return {
            status: 'completed',
            usage: { input_tokens: 100, output_tokens: 10 },
            output: entry
              ? [
                  {
                    type: 'function_call',
                    call_id: `call-${calls}`,
                    name: entry[0],
                    arguments: JSON.stringify(entry[1])
                  }
                ]
              : [],
            output_text: JSON.stringify({ answer: 'Updated.', packageIds: [], estimateIds: [], needsAdmin: false })
          };
        }
      }
    }
  });
  const result = await provider.answer({
    text: 'Make it 120 guests',
    history: [],
    tools: createAssistantTools({ draft, getCatalog: async () => catalog }),
    spend: { reserve: async () => 'paid', settle: async () => {} }
  });
  assert.equal(result.bookingDraft.guests, 120);
  assert.equal(calls, 4);
  assert.equal(JSON.parse(requests[3].input.at(-1).output).draft.guests, 120);
});

test('provider caps paid loop calls and output tokens even when settings are raised accidentally', async () => {
  const requests = [];
  const provider = providerWithScopeFixtures({
    settings: { ...settings, maxCalls: 100, maxOutputTokens: 1000000 },
    client: {
      responses: {
        create: async (body) => {
          requests.push(structuredClone(body));
          return {
            status: 'completed',
            usage: { input_tokens: 100, output_tokens: 10 },
            output:
              body.tool_choice === 'none'
                ? []
                : [
                    {
                      type: 'function_call',
                      call_id: `call-${requests.length}`,
                      name: 'search_catalog',
                      arguments: JSON.stringify({ query: `option ${requests.length}`, kind: 'packages' })
                    }
                  ],
            output_text: JSON.stringify({
              answer: 'Please review the options.',
              packageIds: [],
              estimateIds: [],
              needsAdmin: false
            })
          };
        }
      }
    }
  });
  await provider.answer({
    text: 'Compare',
    history: [],
    tools: createAssistantTools({ getCatalog: async () => catalog }),
    spend: { reserve: async () => 'paid', settle: async () => {} }
  });
  assert.ok(requests.length <= 6);
  assert.ok(requests.every((request) => request.max_output_tokens <= 2048));
  assert.equal(requests.at(-1).tools, undefined);
  assert.ok(requests[0].prompt_cache_key);
  assert.equal(requests[0].prompt_cache_key, requests.at(-1).prompt_cache_key);
  assert.equal(requests[0].prompt_cache_retention, undefined);
});

test('incomplete token usage retains the conservative assistant reservation', async () => {
  const settled = [];
  const provider = providerWithScopeFixtures({
    settings,
    client: {
      responses: {
        create: async () => ({
          status: 'completed',
          usage: {},
          output: [],
          output_text: JSON.stringify({ answer: 'Hello.', packageIds: [], estimateIds: [], needsAdmin: false })
        })
      }
    }
  });
  await provider.answer({
    text: 'Hello',
    history: [],
    tools: createAssistantTools(),
    spend: { reserve: async () => 'paid', settle: async (...args) => settled.push(args) }
  });
  assert.equal(settled.length, 3);
  assert.equal(settled[1][1], undefined);
});

test('duplicate realtime session acknowledgements can create only one paid speech response', async () => {
  const commands = [],
    settled = [];
  const provider = providerWithScopeFixtures({
    settings: { ...settings, speechModel: 'gpt-realtime-2.1-mini', voice: 'marin' },
    socketFactory: () => {
      const socket = new EventEmitter();
      socket.close = () => socket.emit('close');
      socket.send = (raw) => {
        const event = JSON.parse(raw);
        commands.push(event);
        if (event.type === 'session.update')
          queueMicrotask(() => {
            socket.emit('message', Buffer.from('{"type":"session.updated"}'));
            socket.emit('message', Buffer.from('{"type":"session.updated"}'));
          });
        if (event.type === 'response.create')
          queueMicrotask(() => {
            socket.emit(
              'message',
              Buffer.from(
                JSON.stringify({ type: 'response.output_audio.delta', delta: Buffer.alloc(480).toString('base64') })
              )
            );
            socket.emit(
              'message',
              Buffer.from(
                '{"type":"response.done","response":{"status":"completed","usage":{"input_tokens":20,"output_tokens":10}}}'
              )
            );
          });
      };
      queueMicrotask(() => socket.emit('open'));
      return socket;
    }
  });
  await provider.speak({
    text: 'Please review.',
    spend: { reserve: async () => 'paid', settle: async (...args) => settled.push(args) }
  });
  assert.equal(commands.filter((event) => event.type === 'response.create').length, 1);
  assert.equal(commands.filter((event) => event.type === 'conversation.item.create').length, 1);
  assert.equal(settled.length, 1);
  assert.ok(settled[0][1] > 0);
});

for (const [question, response] of [
  [
    'Which November 2090 dates already have bookings?',
    'November 2090 has calendar openings. What exact date and times would you like checked?'
  ],
  [
    'Aling mga petsa sa Nobyembre 2090 ang may nakaiskedyul na pagdiriwang?',
    'May mga bukas na iskedyul sa Nobyembre 2090. Anong petsa at oras ang gusto ninyo?'
  ],
  [
    'What dates sa November 2090 ang may naka-reserve na?',
    'May calendar openings sa November 2090. Anong exact date at time ang gusto mong i-check?'
  ]
]) {
  test(`monthly calendar tool completes the provider loop for a public inquiry: ${question}`, async () => {
    const calls = [];
    let reads = 0;
    const provider = providerWithScopeFixtures({
      settings,
      client: {
        responses: {
          create: async (body) => {
            calls.push(structuredClone(body));
            if (calls.length === 1)
              return {
                status: 'completed',
                output: [
                  {
                    type: 'function_call',
                    call_id: 'monthly-calendar',
                    name: 'monthly_calendar_overview',
                    arguments: JSON.stringify({ year: 2090, month: 11 })
                  }
                ],
                usage: { input_tokens: 100, output_tokens: 20 }
              };
            return {
              status: 'completed',
              output: [],
              usage: { input_tokens: 100, output_tokens: 20 },
              output_text: JSON.stringify({ answer: response, packageIds: [], estimateIds: [], needsAdmin: false })
            };
          }
        }
      }
    });
    const tools = createAssistantTools({
      calendar: async () => {
        reads++;
        return { capacity: 2, blocked: [], booked: {}, events: [] };
      },
      getCatalog: async () => {
        throw Error('Monthly overview must not load the catalog');
      }
    });
    const result = await provider.answer({
      text: question,
      history: [],
      tools,
      spend: { reserve: async () => 'fixture', settle: async () => {} }
    });
    assert.equal(result.answer, response);
    assert.equal(reads, 1);
    assert.ok(calls[0].tools.some((tool) => tool.name === 'monthly_calendar_overview'));
    assert.match(calls[0].instructions, /not private-record lookups/);
    assert.match(calls[0].instructions, /otherwise ask which year/);
    const output = calls[1].input.find((entry) => entry.type === 'function_call_output');
    assert.equal(JSON.parse(output.output).days.length, 30);
    assert.equal(JSON.parse(output.output).holdsSlot, false);
    assert.deepEqual(tools.bookingDraft, {});
  });
}
