import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanAssistantIntent, ASSISTANT_AUTH } from '../../../packages/shared/src/domain/assistant.js';
import { encodeQuestionWav, startQuestionRecording } from '../src/lib/assistantAudio.js';
import { canOpenAssistantSession, createAssistantApi, createAssistantDraftWriter } from '../src/lib/assistantApi.js';
import { assistantAnswerBlocks, buildCelebrationSummary } from '../src/lib/assistantSummary.js';
import { readIntent, saveIntent, saveAssistantIntent } from '../src/lib/booking.js';

test('server microphone policy failures explain why no browser permission prompt appears', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { permissionsPolicy: { allowsFeature: (feature) => feature !== 'microphone' } }
  });
  try {
    await assert.rejects(
      startQuestionRecording(() => {}),
      (error) => {
        assert.match(error.message, /website.*blocks microphone/i);
        assert.match(error.message, /permission prompt/i);
        return true;
      }
    );
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete globalThis.document;
  }
});

function replaceStorage(local, session) {
  const originals = new Map(
    ['localStorage', 'sessionStorage'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  );
  for (const [key, value] of [
    ['localStorage', local],
    ['sessionStorage', session]
  ])
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  return () => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  };
}

test('signed-in customers retain local structured planning when paid assistance is disabled; guests remain gated', () => {
  assert.equal(canOpenAssistantSession({ available: false }, 'customer-a'), true);
  assert.equal(canOpenAssistantSession({ available: false }, null), false);
  assert.equal(canOpenAssistantSession({ available: true }, null), true);
});

test('personal assistant handoffs are account-bound; guest handoffs can be claimed once during signup/login', () => {
  const local = new Map(),
    session = new Map();
  const storage = (values) => ({
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  });
  const restoreStorage = replaceStorage(storage(local), storage(session));
  try {
    local.set('tm.client.session', JSON.stringify({ user: { id: 'customer-a' } }));
    saveAssistantIntent({ venueName: 'A private venue', venueAddress: 'A address', guests: 100 }, 'customer-a');
    assert.equal(readIntent('customer-a').venueName, 'A private venue');
    local.delete('tm.client.session');
    assert.equal(readIntent(), null);
    local.set('tm.client.session', JSON.stringify({ user: { id: 'customer-b' } }));
    assert.equal(readIntent('customer-b'), null);
    saveIntent({ packageSlug: 'classic' });
    assert.equal(readIntent('customer-b').venueName, undefined);
    local.clear();
    saveAssistantIntent({ venueName: 'Guest venue', guests: 100 });
    assert.equal(readIntent().venueName, 'Guest venue');
    assert.equal(readIntent('new-customer').venueName, 'Guest venue');
    assert.equal(readIntent('another-customer'), null);
  } finally {
    restoreStorage();
  }
});

function draftClock() {
  const tasks = new Map();
  const saved = [];
  let id = 0;
  const options = {
    persist: (customerId, draft) => saved.push({ customerId, draft }),
    schedule: (callback) => {
      tasks.set(++id, callback);
      return id;
    },
    cancel: (id) => tasks.delete(id)
  };
  return {
    options,
    saved,
    tasks,
    tick() {
      for (const [id, run] of [...tasks]) {
        tasks.delete(id);
        run();
      }
    }
  };
}

test('rapid typing persists the latest complete draft once after the pause', () => {
  const clock = draftClock();
  const writer = createAssistantDraftWriter('customer-a', clock.options);
  for (const text of ['B', 'Birth', 'Birthday for 100 guests']) writer.schedule({ text, source: 'text' });
  assert.equal(clock.saved.length, 0);
  assert.equal(clock.tasks.size, 1);
  clock.tick();
  assert.deepEqual(clock.saved, [
    { customerId: 'customer-a', draft: { text: 'Birthday for 100 guests', source: 'text' } }
  ]);
  writer.flush();
  assert.equal(clock.saved.length, 1);
});

test('sending or clearing a question cancels stale delayed writes and preserves retry identity', () => {
  const clock = draftClock();
  const writer = createAssistantDraftWriter('customer-a', clock.options);
  writer.schedule({ text: 'An earlier draft', source: 'text' });
  const request = { text: 'Latest question', source: 'voice', requestId: 'retry-this-request' };
  writer.write(request);
  assert.deepEqual(clock.saved.at(-1).draft, request);
  writer.write(null);
  clock.tick();
  assert.equal(clock.saved.length, 2);
  assert.equal(clock.saved.at(-1).draft, null);
  assert.equal(clock.tasks.size, 0);
});

test('leaving the chat flushes immediately and keeps guest and customer drafts in their original scopes', () => {
  const clock = draftClock();
  const guest = createAssistantDraftWriter(undefined, clock.options);
  const customer = createAssistantDraftWriter('customer-a', clock.options);
  guest.schedule({ text: 'Guest question', source: 'text' });
  customer.schedule({ text: 'Customer question', source: 'text' });
  guest.flush();
  customer.flush();
  clock.tick();
  assert.deepEqual(
    clock.saved.map(({ customerId, draft }) => [customerId, draft.text]),
    [
      [undefined, 'Guest question'],
      ['customer-a', 'Customer question']
    ]
  );
  assert.equal(clock.tasks.size, 0);
});

test('booking handoff strips prices, ownership, unsupported selections and invalid times', () => {
  const intent = cleanAssistantIntent({
    packageSlug: 'classic',
    serviceType: 'Buffet and Catering',
    guests: 100,
    date: '2090-01-01',
    startTime: '12:00',
    endTime: '18:00',
    price: 0,
    customerId: 'other',
    addonPrices: { x: 0 }
  });
  assert.deepEqual(Object.keys(intent).sort(), [
    'date',
    'endTime',
    'guests',
    'packageSlug',
    'serviceType',
    'startTime'
  ]);
  assert.deepEqual(
    cleanAssistantIntent({ packageSlug: 'https://bad', guests: -1, startTime: '99:30', serviceType: 'free' }),
    {}
  );
  assert.deepEqual(cleanAssistantIntent({ date: '2026-02-31' }), {});
  assert.equal(ASSISTANT_AUTH.signup, '/signup?continue=assistant');
  assert.match(ASSISTANT_AUTH.login, /portal%2Fassistant/);
});

test('recorder produces bounded mono PCM16 WAV suitable for server validation', async () => {
  const blob = encodeQuestionWav(new Float32Array(48000).fill(0.5), 48000);
  const view = new DataView(await blob.arrayBuffer());
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(blob.size, 32044);
  const capped = encodeQuestionWav(new Float32Array(48000 * 31), 48000);
  assert.equal(capped.size, 960044);
});

test('assistant transport shares guest identity across text and voice without cookies or query credentials', async () => {
  const calls = [];
  const api = createAssistantApi({
    base: 'http://example.invalid/assistant',
    getToken: () => 'customer-session',
    getVisitor: () => 'visitor-secret',
    fetcher: async (url, init) => {
      calls.push({ url, ...init });
      return new Response(init.body instanceof FormData ? '{"text":"Hello"}' : '{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
  await api.send('conversation', { requestId: 'request', text: 'Hi', source: 'text' });
  await api.transcribe('conversation', new Blob(['audio'], { type: 'audio/wav' }));
  assert.equal(
    calls.every((c) => c.headers['X-Assistant-Visitor'] === 'visitor-secret'),
    true
  );
  assert.equal(
    calls.every((c) => c.headers.Authorization === 'Bearer customer-session'),
    true
  );
  assert.equal(
    calls.every((c) => !c.url.includes('secret') && !c.url.includes('session')),
    true
  );
  assert.equal(calls[1].headers['Content-Type'], undefined);
});

test('sign-in prioritizes the current guest conversation over an older customer conversation', async () => {
  const values = new Map([
    ['tm.assistant.guestConversation', 'guest-current'],
    ['tm.assistant.conversation.customer', 'customer-old']
  ]);
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
  const restoreStorage = replaceStorage(storage, storage);
  try {
    const api = createAssistantApi({
      base: 'http://example.invalid',
      getToken: () => 'session',
      getVisitor: () => 'visitor',
      fetcher: async (url, init) => {
        assert.equal(JSON.parse(init.body).conversationId, 'guest-current');
        return new Response('{"conversationId":"guest-current"}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    });
    await api.open('customer');
    assert.equal(values.get('tm.assistant.conversation.customer'), 'guest-current');
    assert.equal(values.has('tm.assistant.guestConversation'), false);
  } finally {
    restoreStorage();
  }
});

test('celebration summary tracks progress, catalog or custom package names, and live estimates', () => {
  const empty = buildCelebrationSummary(null);
  assert.equal(empty.completedCount, 0);
  assert.equal(empty.totalCount, 8);
  assert.equal(empty.statusLabel, 'Ready to plan');
  assert.equal(
    empty.rows.every((row) => !row.filled),
    true
  );

  const catalogDraft = buildCelebrationSummary({
    bookingDraft: {
      eventName: 'Athena Birthday',
      serviceType: 'Buffet and Catering',
      guests: 120,
      budget: 85000,
      occasion: 'Birthday',
      date: '2027-05-15',
      startTime: '18:00',
      endTime: '22:00',
      packageSlug: 'grand-celebration',
      styling: { theme: 'Modern Minimalist', colors: [{ name: 'Ivory' }, { name: 'Champagne' }] },
      venueName: 'Lipa Grand Ballroom',
      city: 'Lipa'
    },
    bookingCatalog: {
      packages: [{ slug: 'grand-celebration', name: 'Grand Celebration Package' }]
    },
    bookingEstimate: {
      knownSubtotal: 78000,
      pendingQuotation: ['Custom floral arch']
    },
    referencePhotos: [
      { index: 0, name: 'inspo-1.png' },
      { index: 1, name: 'inspo-2.png' }
    ]
  });
  assert.equal(catalogDraft.completedCount, 8);
  assert.equal(catalogDraft.statusLabel, 'In progress');
  assert.equal(catalogDraft.eventName, 'Athena Birthday');
  assert.equal(catalogDraft.venueLabel, 'Lipa Grand Ballroom, Lipa');
  const byLabel = Object.fromEntries(catalogDraft.rows.map((row) => [row.label, row]));
  assert.equal(byLabel.Package.value, 'Grand Celebration Package');
  assert.equal(byLabel.Package.filled, true);
  assert.equal(byLabel['Reference photos'].value, '2 uploaded');
  assert.equal(byLabel['Reference photos'].filled, true);
  assert.equal(catalogDraft.knownEstimateTotal, 78000);
  assert.equal(catalogDraft.hasPendingCharges, true);
});

test('assistant answer formatting separates introductions, bullet choices, notes and follow-up questions', () => {
  const blocks = assistantAnswerBlocks(
    'Available packages:\n\n- Petite: up to 60 guests.\n- Classic: up to 100 guests.\n- Premier: up to 150 guests.\n\nFull Service options include helpers.\n\nHow many guests will attend?'
  );
  assert.deepEqual(
    blocks.map((block) => block.type),
    ['paragraph', 'list', 'paragraph', 'paragraph']
  );
  assert.equal(blocks[1].ordered, false);
  assert.equal(blocks[1].items.length, 3);
  assert.equal(blocks[1].items[0], 'Petite: up to 60 guests.');
  assert.equal(blocks[3].text, 'How many guests will attend?');
});

test('assistant formatting supports numbered steps, Taglish, CRLF and indented continuations without interpreting HTML', () => {
  const blocks = assistantAnswerBlocks(
    'Mga steps:\r\n1. Piliin ang package.\r\n   Review muna ang inclusions.\r\n2. I-check ang date.\r\n\r\n<script>alert(1)</script>'
  );
  assert.equal(blocks[1].ordered, true);
  assert.equal(blocks[1].start, 1);
  assert.deepEqual(blocks[1].items, ['Piliin ang package.\nReview muna ang inclusions.', 'I-check ang date.']);
  assert.equal(blocks[2].text, '<script>alert(1)</script>');
  assert.deepEqual(assistantAnswerBlocks('A short answer.'), [{ type: 'paragraph', text: 'A short answer.' }]);
  assert.deepEqual(assistantAnswerBlocks(''), []);
});
