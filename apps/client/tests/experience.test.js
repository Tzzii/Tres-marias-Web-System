import assert from 'node:assert/strict';
import test from 'node:test';
import { compareValues, matchesSearch, reservationChecklist } from '../../../packages/shared/src/domain/experience.js';
import { sendMultipart, subscribeUploads } from '../../../packages/shared/src/services/upload.js';
import { operationsMetrics } from '../../admin/src/lib/operationsMetrics.js';

test('business pulse uses Manila collection dates and comparable month-to-date windows', () => {
  const result = operationsMetrics(
    {
      payments: [
        { status: 'verified', amount: 5000, verifiedAt: '2026-02-28T16:30:00Z' },
        { status: 'awaiting', amount: 10000, verifiedAt: '2026-03-01T00:00:00Z' },
        { status: 'verified', amount: 2000, verifiedAt: '2026-02-01T00:00:00Z' },
        { status: 'verified', amount: 9000, verifiedAt: '2026-02-02T00:00:00Z' }
      ],
      refunds: [{ amount: 1000, sentOn: '2026-03-01' }]
    },
    '2026-03-01'
  );
  assert.equal(result.net, 4000);
  assert.equal(result.before, 2000);
});

test('booking value excludes cancelled requests and open balances exclude completed events', () => {
  const result = operationsMetrics(
    {
      reservations: [
        { date: '2026-01-20', status: 'confirmed', total: 10000, balance: 4000 },
        { date: '2026-01-10', status: 'completed', total: 8000, balance: 1000 },
        { date: '2026-01-18', status: 'cancelled', total: 9000, balance: 9000 },
        { date: '2026-01-18', status: 'pending', total: 7000, balance: 7000 }
      ],
      payments: [{ status: 'verified', amount: 1000, verifiedAt: '2025-12-10T00:00:00Z' }]
    },
    '2026-01-17'
  );
  assert.equal(result.bookingValue, 18000);
  assert.equal(result.outstanding, 4000);
  assert.equal(result.before, 1000);
});

test('pending and awaiting-verification reservations do not report payment milestones complete', () => {
  const pending = reservationChecklist({ status: 'pending', balance: 0, awaitingCount: 1 });
  assert.ok(pending.every((item) => !item.done));
  assert.match(pending[1].note, /being verified/);
  const approved = reservationChecklist({ status: 'approved', balance: 8000 });
  assert.equal(approved[0].done, true);
  assert.equal(approved[1].done, false);
  const paid = reservationChecklist({ status: 'confirmed', balance: 0 });
  assert.ok(paid.every((item) => item.done));
});

test('search combines words across fields without requiring their original order', () => {
  assert.ok(matchesSearch(['RES-0042', 'Maria Santos', 'Wedding'], 'wedding santos'));
  assert.ok(!matchesSearch(['Maria Santos'], 'maria receipt'));
  assert.ok(matchesSearch([null, undefined, 'REF 10'], 'ref 10'));
  assert.ok(compareValues(900, 10000) < 0);
  assert.ok(compareValues('RES-2', 'RES-10') < 0);
  assert.ok(compareValues(900, 10000, 'desc') > 0);
});

class FakeUpload {
  static current;
  constructor() {
    this.upload = {};
    this.headers = {};
    FakeUpload.current = this;
  }
  open(method, url) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name, value) {
    this.headers[name] = value;
  }
  send(body) {
    this.body = body;
  }
  progress(loaded, total) {
    this.upload.onprogress({ loaded, total, lengthComputable: Boolean(total) });
  }
  finish(status, responseText) {
    this.status = status;
    this.responseText = responseText;
    this.onload();
    this.onloadend();
  }
}

test('multipart uploads report real progress and preserve authorization and server responses', async () => {
  const snapshots = [];
  const unsubscribe = subscribeUploads((value) => snapshots.push(value));
  const body = new FormData();
  body.append('file', 'fixture');
  const promise = sendMultipart(
    '/test',
    { method: 'POST', headers: { Authorization: 'Bearer fixture' }, body },
    FakeUpload
  );
  const xhr = FakeUpload.current;
  assert.equal(xhr.body, body);
  assert.equal(xhr.headers.Authorization, 'Bearer fixture');
  assert.equal(xhr.headers['Content-Type'], undefined);
  xhr.progress(50, 100);
  assert.deepEqual(snapshots.at(-1), [{ loaded: 50, total: 100 }]);
  xhr.finish(422, '{"code":"INVALID","message":"Choose a valid photo"}');
  const response = await promise;
  assert.equal(response.ok, false);
  assert.equal(response.status, 422);
  assert.equal((await response.json()).message, 'Choose a valid photo');
  assert.deepEqual(snapshots.at(-1), []);
  unsubscribe();
});

test('failed and concurrent uploads clean up their own progress without hiding another upload', async () => {
  let latest = [];
  const unsubscribe = subscribeUploads((snapshot) => {
    latest = snapshot;
  });
  const first = sendMultipart('/one', { method: 'POST', body: new FormData() }, FakeUpload);
  const firstXhr = FakeUpload.current;
  const second = sendMultipart('/two', { method: 'POST', body: new FormData() }, FakeUpload);
  const secondXhr = FakeUpload.current;
  assert.equal(latest.length, 2);
  firstXhr.onerror();
  firstXhr.onloadend();
  await assert.rejects(first, /could not reach the server/);
  assert.equal(latest.length, 1);
  secondXhr.finish(200, '{}');
  await second;
  assert.equal(latest.length, 0);
  unsubscribe();
});
