import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createAssistantRepository } from '../src/modules/assistant/assistant.repo.js';
import { createAssistantService } from '../src/modules/assistant/assistant.service.js';
import { createAssistantRoutes } from '../src/modules/assistant/assistant.routes.js';
import { errorHandler } from '../src/middleware/errors.js';
import { ApiError } from '../src/lib/ApiError.js';

const at = Date.now();
const actor = { customerId: 'customer-owner' };
const photo = { key: `styling/${randomUUID()}.png`, name: 'Inspiration.png', mime: 'image/png', size: 67 };
const draft = {
  planningStarted: true,
  serviceType: 'Catering only',
  eventName: 'Birthday',
  guests: 100,
  packageSlug: 'classic'
};
const catalog = {
  packages: [{ id: 'p1', slug: 'classic', name: 'Classic', visible: true, kind: 'package', price: 10000 }],
  addons: [],
  rentals: [],
  dishes: [],
  pricePerPlate: 600,
  sixHourFee: 5000
};
const settings = { enabled: true, apiKey: 'fixture', dailyBudgetMicro: 1, monthlyBudgetMicro: 1, dailyLimit: 20 };

// An isolated transactional SQL adapter: production repository code owns all locking,
// authorization, revision, rollback and idempotency decisions under test.
function database(overrides = {}) {
  let state = {
    conversation: {
      id: 'conversation',
      customer_id: actor.customerId,
      expires_at: at + 86400000,
      draft_revision: 3,
      booking_draft: JSON.stringify(draft),
      reference_photos: JSON.stringify([photo]),
      submitted_ref: null,
      ...overrides
    },
    quota: { used: 2, active_request: null, lease_until: 0 },
    reservations: []
  };
  let tail = Promise.resolve();
  const query = async (sql, values = []) => {
    if (sql.startsWith('SELECT * FROM assistant_conversations WHERE id = ?'))
      return [
        [
          state.conversation && values[0] === state.conversation.id ? structuredClone(state.conversation) : undefined
        ].filter(Boolean)
      ];
    if (/^INSERT (?:IGNORE )?INTO assistant_allowances/.test(sql)) return [{}];
    if (sql.startsWith('SELECT * FROM assistant_allowances')) return [[structuredClone(state.quota)]];
    if (sql.startsWith('SELECT id, name FROM customers')) return [[{ id: actor.customerId, name: 'Customer Name' }]];
    if (sql.startsWith('SELECT id, request_id')) return [[]];
    if (sql.startsWith('UPDATE assistant_conversations SET submitted_ref')) {
      state.conversation.submitted_ref = values[0];
      state.conversation.draft_revision++;
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE assistant_conversations SET reference_photos')) {
      state.conversation.reference_photos = values[0];
      state.conversation.draft_revision++;
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE assistant_conversations SET booking_draft')) {
      state.conversation.booking_draft = values[0];
      state.conversation.draft_revision++;
      if (sql.includes('reference_photos = NULL')) state.conversation.reference_photos = null;
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT * FROM assistant_conversations WHERE expires_at'))
      return [[state.conversation].filter((c) => c && c.expires_at <= values[0])];
    if (sql.startsWith('DELETE FROM assistant_conversations WHERE id')) {
      state.conversation = null;
      return [{}];
    }
    if (
      sql.startsWith('DELETE FROM assistant_allowances') ||
      sql.startsWith('DELETE FROM assistant_usage') ||
      sql.startsWith('DELETE FROM assistant_spend')
    )
      return [{}];
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const transact = (fn) => {
    const result = tail.then(async () => {
      const before = structuredClone(state);
      try {
        return await fn({ query });
      } catch (e) {
        state = before;
        throw e;
      }
    });
    tail = result.catch(() => {});
    return result;
  };
  return {
    query,
    transact,
    get state() {
      return state;
    }
  };
}
const repoFor = (db, extra = {}) => createAssistantRepository({ ...db, settings, clock: () => at, ...extra });

test('submission is transactional and concurrent retries preserve one reservation across repository restarts', async () => {
  const db = database();
  const repo = repoFor(db);
  let calls = 0;
  const create = async (conn, saved, photos, customer) => {
    calls++;
    assert.equal(customer.name, 'Customer Name');
    assert.equal(saved.eventName, 'Birthday');
    assert.deepEqual(photos, [photo]);
    db.state.reservations.push('TM-ONE');
    return { ref: 'TM-ONE' };
  };
  const first = await Promise.all([
    repo.submit(actor, 'conversation', 3, create),
    repo.submit(actor, 'conversation', 3, create)
  ]);
  assert.deepEqual(first, ['TM-ONE', 'TM-ONE']);
  assert.equal(await repoFor(db).submit(actor, 'conversation', 0, create), 'TM-ONE');
  assert.equal(calls, 1);
  assert.deepEqual(db.state.reservations, ['TM-ONE']);
  assert.equal(db.state.conversation.draft_revision, 4);
});

test('failed creation rolls back submission and may be retried with original revision', async () => {
  const db = database();
  const repo = repoFor(db);
  await assert.rejects(
    () =>
      repo.submit(actor, 'conversation', 3, async () => {
        db.state.reservations.push('partial');
        throw new Error('Validation failure');
      }),
    /Validation failure/
  );
  assert.equal(db.state.conversation.submitted_ref, null);
  assert.deepEqual(db.state.reservations, []);
  assert.equal(await repo.submit(actor, 'conversation', 3, async () => ({ ref: 'TM-RETRY' })), 'TM-RETRY');
});

test('submission rejects visitors, foreign owners, stale drafts, active answers and expired conversations', async () => {
  for (const [who, overrides, revision, code] of [
    [{}, {}, 3, 'UNAUTHENTICATED'],
    [{ customerId: 'other' }, {}, 3, 'NOT_FOUND'],
    [actor, {}, 2, 'ASSISTANT_BUSY'],
    [actor, { expires_at: at }, 3, 'NOT_FOUND']
  ]) {
    const repo = repoFor(database(overrides));
    await assert.rejects(
      () =>
        repo.submit(who, 'conversation', revision, () => {
          throw Error('Must not create');
        }),
      (e) => e.code === code
    );
  }
  const db = database();
  db.state.quota.active_request = 'answer';
  db.state.quota.lease_until = at + 1000;
  await assert.rejects(
    () => repoFor(db).submit(actor, 'conversation', 3, () => {}),
    (e) => e.code === 'ASSISTANT_BUSY'
  );
});

test('submitted conversations reject draft, turn, transcription and photo mutations', async () => {
  const repo = repoFor(database({ submitted_ref: 'TM-DONE' }));
  for (const run of [
    () => repo.updateDraft(actor, 'conversation', {}, 3),
    () => repo.begin(actor, 'conversation', { requestId: randomUUID(), text: 'edit', source: 'text' }),
    () => repo.voiceAttempt(actor, 'conversation'),
    () => repo.updatePhotos(actor, 'conversation', 3, () => [])
  ])
    await assert.rejects(run, (e) => e.code === 'INVALID_STATE');
});

test('voice upload is rejected before reading audio when the conversation is already submitted', async () => {
  const service = createAssistantService({
    settings: { ...settings, voiceEnabled: true },
    repo: repoFor(database({ submitted_ref: 'TM-DONE' }))
  });
  await assert.rejects(
    () => service.canTranscribe(actor, 'conversation'),
    (e) => e.code === 'INVALID_STATE'
  );
});

test('photo upload preflight rejects guests, stale revisions, rental plans and full galleries before parsing files', async () => {
  const service = (overrides = {}) => createAssistantService({ settings, repo: repoFor(database(overrides)) });
  await assert.rejects(
    () => service().canUploadReferencePhotos({}, 'conversation', { revision: 3 }),
    (e) => e.code === 'UNAUTHENTICATED'
  );
  await assert.rejects(
    () => service().addReferencePhotos({}, 'conversation', { revision: 3 }, []),
    (e) => e.code === 'UNAUTHENTICATED'
  );
  await assert.rejects(
    () => service().canUploadReferencePhotos(actor, 'conversation', { revision: 2 }),
    (e) => e.code === 'ASSISTANT_BUSY'
  );
  await assert.rejects(
    () =>
      service({ booking_draft: JSON.stringify({ serviceType: 'Equipment rental' }) }).canUploadReferencePhotos(
        actor,
        'conversation',
        { revision: 3 }
      ),
    (e) => e.code === 'INVALID'
  );
  await assert.rejects(
    () =>
      service({ reference_photos: JSON.stringify(Array.from({ length: 5 }, () => photo)) }).canUploadReferencePhotos(
        actor,
        'conversation',
        { revision: 3 }
      ),
    (e) => e.code === 'INVALID'
  );
  assert.deepEqual(await service().canUploadReferencePhotos(actor, 'conversation', { revision: 3 }), { remaining: 4 });
});

test('photo multipart parsing stops at the number of available gallery slots', async (t) => {
  const id = randomUUID();
  let inspections = 0;
  const app = express();
  app.use(
    '/assistant',
    createAssistantRoutes({
      authenticate: (req, res, next) => {
        req.user = { id: actor.customerId, role: 'customer' };
        next();
      },
      service: createAssistantService({
        settings,
        repo: repoFor(database({ id })),
        inspectPhoto: () => {
          inspections++;
        }
      })
    })
  );
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const body = new FormData();
  body.append('revision', '3');
  for (let index = 0; index < 5; index++)
    body.append('photos', new Blob(['fixture'], { type: 'image/png' }), `reference-${index}.png`);
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/assistant/conversations/${id}/reference-photos?revision=3`,
    { method: 'POST', body }
  );
  assert.equal(response.status, 400);
  assert.equal(inspections, 0, 'An excess multipart file must be rejected before service inspection or storage');
});

test('photo upload authorization and revision are checked before malformed multipart data', async (t) => {
  const id = randomUUID();
  const app = express();
  app.use(
    '/assistant',
    createAssistantRoutes({
      authenticate: (req, res, next) => {
        if (req.get('X-Test-Customer')) req.user = { id: actor.customerId, role: 'customer' };
        next();
      },
      service: createAssistantService({ settings, repo: repoFor(database({ id })) })
    })
  );
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/assistant/conversations/${id}/reference-photos`;
  const post = (suffix, customer) =>
    fetch(base + suffix, {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=missing',
        ...(customer ? { 'X-Test-Customer': 'yes' } : {})
      },
      body: 'malformed'
    });
  assert.equal((await post('?revision=3', false)).status, 401);
  assert.equal((await post('', true)).status, 400);
  assert.equal((await post('?revision=2', true)).status, 409);
});

test('an expired admission cannot store photos after multipart parsing finishes', async (t) => {
  const id = randomUUID();
  const db = database({ id });
  const app = express();
  app.use(
    '/assistant',
    createAssistantRoutes({
      authenticate: (req, res, next) => {
        req.user = { id: actor.customerId, role: 'customer' };
        next();
      },
      admission: (req, res, next) => {
        req.ensureAIAdmission = () => {
          throw new ApiError('RATE_LIMITED', 'Request expired.');
        };
        next();
      },
      service: createAssistantService({
        settings,
        repo: repoFor(db),
        getCatalog: async () => catalog,
        storePhoto: async () => ({ ...photo, key: `styling/${randomUUID()}.png` })
      })
    })
  );
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const body = new FormData();
  body.append('revision', '3');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=',
    'base64'
  );
  body.append('photos', new Blob([png], { type: 'image/png' }), 'reference.png');
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/assistant/conversations/${id}/reference-photos?revision=3`,
    { method: 'POST', body }
  );
  assert.deepEqual(JSON.parse(db.state.conversation.reference_photos), [photo]);
  assert.equal(db.state.conversation.draft_revision, 3);
  assert.equal(response.status, 429);
});

test('photos remain private, revision guarded, and expiry never deletes transferred reservation images', async () => {
  const db = database();
  const removed = [];
  const repo = repoFor(db, { removePhoto: async (key) => removed.push(key) });
  const snapshot = await repo.read(actor, 'conversation');
  assert.deepEqual(snapshot.referencePhotos, [{ index: 0, name: photo.name, mime: photo.mime, size: photo.size }]);
  assert.equal(JSON.stringify(snapshot).includes(photo.key), false);
  assert.deepEqual(await repo.referencePhoto(actor, 'conversation', 0), photo);
  await assert.rejects(
    () => repo.referencePhoto({ customerId: 'other' }, 'conversation', 0),
    (e) => e.code === 'NOT_FOUND'
  );
  await assert.rejects(
    () => repo.updatePhotos(actor, 'conversation', 2, () => []),
    (e) => e.code === 'ASSISTANT_BUSY'
  );
  await repo.updatePhotos(actor, 'conversation', 3, () => []);
  assert.equal(db.state.conversation.draft_revision, 4);
  const expired = database({ expires_at: at });
  await repoFor(expired, { removePhoto: async (key) => removed.push(key) }).cleanup();
  assert.deepEqual(removed, [photo.key]);
  const transferred = database({ expires_at: at, submitted_ref: 'TM-DONE' });
  await repoFor(transferred, { removePhoto: async (key) => removed.push(key) }).cleanup();
  assert.deepEqual(removed, [photo.key]);
});

test('snapshot returns current public catalog, deterministic schedule and estimate without a provider call', async () => {
  let calls = 0;
  const db = database({ booking_draft: JSON.stringify({ ...draft, date: '2090-12-12' }) });
  const service = createAssistantService({
    settings,
    repo: repoFor(db),
    getCatalog: async () => catalog,
    provider: {
      answer: () => {
        throw Error('No paid call');
      }
    },
    toolsFactory: () => ({
      run: async (name) => {
        calls++;
        return name === 'check_reservation_availability'
          ? { date: '2090-12-12', dateOnly: true, available: true }
          : { knownSubtotal: 10000 };
      }
    })
  });
  const result = await service.read(actor, 'conversation');
  assert.equal(result.bookingCatalog.packages[0].id, 'p1');
  assert.equal(result.bookingSchedule.dateOnly, true);
  assert.equal(result.bookingSchedule.serviceType, 'Catering only');
  assert.equal(result.bookingEstimate.knownSubtotal, 10000);
  assert.equal(calls, 2);
});

test('retired catalog selections remain readable for correction with an empty estimate', async () => {
  const service = createAssistantService({
    settings,
    repo: repoFor(database()),
    getCatalog: async () => ({ ...catalog, packages: [] })
  });
  const snapshot = await service.read(actor, 'conversation');
  assert.equal(snapshot.bookingDraft.packageSlug, 'classic');
  assert.equal(snapshot.bookingEstimate, null);
  assert.ok(snapshot.bookingPlan.warnings.length);
});

test('submission reconstructs saved selections on its transaction connection and takes identity only from customer account', async () => {
  const db = database();
  let created = false;
  let connection;
  const service = createAssistantService({
    settings,
    repo: repoFor(db),
    getCatalog: async () => {
      assert.equal(created, true, 'Public pooled catalog must only be read after the transaction completes');
      return catalog;
    },
    getSubmissionCatalog: async (conn) => {
      connection = conn;
      return catalog;
    },
    createReservation: async (conn, customer, form, photos) => {
      assert.equal(conn, connection);
      assert.deepEqual(customer, { id: actor.customerId, name: 'Customer Name' });
      assert.equal(form.packageId, 'p1');
      assert.equal(form.agreeTerms, true);
      assert.equal(form.eventName, 'Birthday');
      assert.equal(form.price, undefined);
      assert.equal(form.customerId, undefined);
      assert.equal(form.styling?.referencePhotos, undefined);
      assert.deepEqual(photos, [photo]);
      created = true;
      return { ref: 'TM-SAVED' };
    },
    toolsFactory: () => ({ run: async () => ({ error: 'Incomplete' }) })
  });
  await assert.rejects(
    () => service.submit(actor, 'conversation', { revision: 3, agreeTerms: false, confirmSubmission: true }),
    (e) => e.code === 'INVALID'
  );
  const result = await service.submit(actor, 'conversation', {
    revision: 3,
    agreeTerms: true,
    confirmSubmission: true
  });
  assert.equal(result.submittedRef, 'TM-SAVED');
  assert.equal(created, true);
});

test('an account deleted after authentication cannot submit its saved draft', async () => {
  const db = database();
  const query = db.query;
  db.query = async (sql, values) => (sql.startsWith('SELECT id, name FROM customers') ? [[]] : query(sql, values));
  // Bind the transaction's connection to this missing-account adapter too.
  db.transact = async (fn) => fn({ query: db.query });
  await assert.rejects(
    () =>
      repoFor(db).submit(actor, 'conversation', 3, () => {
        throw Error('Must not create');
      }),
    (e) => e.code === 'UNAUTHENTICATED'
  );
});

test('photo writes validate before storage, clean partial failures, and preserve committed images when snapshot refresh fails', async () => {
  const files = [{ buffer: Buffer.from('one') }, { buffer: Buffer.from('two') }];
  const removed = [];
  let stored = 0;
  const db = database({ reference_photos: null });
  const service = createAssistantService({
    settings,
    repo: repoFor(db),
    getCatalog: async () => {
      throw Error('Refresh failed');
    },
    inspectPhoto: () => {},
    storePhoto: async () => {
      stored++;
      if (stored === 2) throw Error('Storage failed');
      return photo;
    },
    removePhoto: async (key) => removed.push(key)
  });
  await assert.rejects(
    () => service.addReferencePhotos(actor, 'conversation', { revision: 3 }, files),
    /Storage failed/
  );
  assert.deepEqual(removed, [photo.key]);
  assert.equal(db.state.conversation.reference_photos, null);
  assert.equal(db.state.conversation.draft_revision, 3);
  stored = 0;
  removed.length = 0;
  await assert.rejects(
    () => service.addReferencePhotos(actor, 'conversation', { revision: 3 }, [files[0]]),
    /Refresh failed/
  );
  assert.deepEqual(removed, []);
  assert.equal(db.state.conversation.draft_revision, 4);
  assert.deepEqual(JSON.parse(db.state.conversation.reference_photos), [photo]);
});

test('switching to equipment rental clears temporary styling photos after committing the draft', async () => {
  const db = database();
  const removed = [];
  const repo = repoFor(db, {
    removePhoto: async (key) => {
      assert.equal(db.state.conversation.reference_photos, null);
      removed.push(key);
    }
  });
  await repo.updateDraft(actor, 'conversation', { serviceType: 'Equipment rental' }, 3);
  assert.deepEqual(removed, [photo.key]);
  assert.equal(db.state.conversation.draft_revision, 4);
  await assert.rejects(
    () => repo.updatePhotos(actor, 'conversation', 4, () => [photo]),
    (e) => e.code === 'INVALID'
  );
});

test('a model-confirmed rental switch clears temporary photos only after a successful turn commit', async () => {
  const db = database();
  const removed = [];
  const query = db.query;
  db.state.quota.active_request = 'turn';
  db.state.quota.lease_until = at + 1000;
  db.query = async (sql, values) => {
    if (sql.startsWith('SELECT quota_key, conversation_id'))
      return [[{ quota_key: 'quota', conversation_id: 'conversation' }]];
    if (sql.startsWith('SELECT * FROM assistant_turns'))
      return [[{ id: 'turn', status: 'pending', quota_key: 'quota' }]];
    if (sql.startsWith('UPDATE assistant_turns') || sql.startsWith('UPDATE assistant_allowances')) return [{}];
    return query(sql, values);
  };
  db.transact = async (fn) => fn({ query: db.query });
  const repo = repoFor(db, { removePhoto: async (key) => removed.push(key) });
  assert.equal(
    await repo.finish('turn', { answer: 'Rental selected', bookingDraft: { serviceType: 'Equipment rental' } }),
    true
  );
  assert.deepEqual(removed, [photo.key]);
  assert.equal(db.state.conversation.reference_photos, null);
});

test('explicit submission consent is required server side and identity, prices and photo paths cannot be injected', async (t) => {
  let submits = 0;
  let opened;
  const app = express();
  app.use(express.json());
  app.use(
    '/assistant',
    createAssistantRoutes({
      authenticate: (req, res, next) => {
        if (req.get('X-Test-Customer')) req.user = { id: actor.customerId, role: 'customer' };
        next();
      },
      service: {
        publicConfig: () => ({}),
        open: async (...args) => {
          opened = args;
          return {};
        },
        submit: async () => {
          submits++;
          return { submittedRef: 'TM-DONE' };
        }
      }
    })
  );
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/assistant`;
  const url = `${base}/conversations/${randomUUID()}/submit`;
  const post = (body, customer = true, path = url) =>
    fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(customer ? { 'X-Test-Customer': 'yes' } : {}) },
      body: JSON.stringify(body)
    });
  const consent = { revision: 3, agreeTerms: true, confirmSubmission: true };
  for (const body of [
    { revision: 3 },
    { ...consent, agreeTerms: false },
    { ...consent, confirmSubmission: false },
    { ...consent, customerId: 'other' },
    { ...consent, photos: [photo] },
    { ...consent, price: 1 }
  ])
    assert.equal((await post(body)).status, 400);
  assert.equal((await post(consent, false)).status, 401);
  assert.equal(submits, 0);
  assert.equal((await post(consent)).status, 200);
  assert.equal(submits, 1);
  assert.equal((await post({ fresh: true }, true, `${base}/session`)).status, 200);
  assert.deepEqual(opened[2], { fresh: true });
});

test('private photo transport accepts validated multipart revisions and rejects forged metadata and invalid indexes', async (t) => {
  const accepted = [];
  const app = express();
  app.use(express.json());
  app.use(
    '/assistant',
    createAssistantRoutes({
      authenticate: (req, res, next) => {
        req.user = { id: actor.customerId, role: 'customer' };
        next();
      },
      service: {
        publicConfig: () => ({}),
        canUploadReferencePhotos: async () => ({ remaining: 1 }),
        addReferencePhotos: async (who, id, input, files) => {
          accepted.push({ input, files });
          return { referencePhotos: [] };
        },
        removeReferencePhoto: async () => ({}),
        referencePhoto: async () => {
          const error = new Error('Not found');
          error.code = 'NOT_FOUND';
          throw error;
        }
      }
    })
  );
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/assistant/conversations/${randomUUID()}/reference-photos`;
  const multipart = (revision = '3', field = 'photos', extra) => {
    const body = new FormData();
    body.append('revision', revision);
    body.append(field, new Blob(['fixture'], { type: 'image/png' }), 'inspiration.png');
    if (extra) body.append('key', photo.key);
    return body;
  };
  const post = (body) => fetch(`${base}?revision=3`, { method: 'POST', body });
  assert.equal((await post(multipart())).status, 200);
  assert.deepEqual(accepted[0].input, { revision: 3 });
  assert.equal(accepted[0].files[0].originalname, 'inspiration.png');
  assert.equal((await post(multipart('3.5'))).status, 400);
  assert.equal((await post(multipart('3', 'photo'))).status, 400);
  assert.equal((await post(multipart('3', 'photos', true))).status, 400);
  assert.equal((await post(multipart('4'))).status, 400);
  assert.equal((await post(multipart())).status, 429, 'Rejected uploads also count toward the customer throttle');
  assert.equal(accepted.length, 1);
  assert.equal(
    (
      await fetch(`${base}/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: 0, revision: 3, key: photo.key })
      })
    ).status,
    400
  );
  assert.equal((await fetch(`${base}/5`)).status, 400);
});
