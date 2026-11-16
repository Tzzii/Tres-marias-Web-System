import test from 'node:test';
import assert from 'node:assert/strict';
import { customerSession } from '../src/modules/auth/auth.service.js';
import { removalBody } from '../src/modules/customers/customers.schemas.js';
import { removeCustomerAccess } from '../src/modules/customers/customers.service.js';
import { createReservation } from '../src/modules/reservations/reservations.service.js';
import { restoreCustomerAccess, deleteCustomerAccount } from '../src/modules/customers/customers.service.js';
import { processCustomerFileDeletions } from '../src/modules/customers/customers.deletion.js';

test('failed file removal stays queued and a successful retry clears the job', async (t) => {
  let queued = true;
  let attempts = 0;
  let nextAt = 0;
  const db = {
    query: async (sql, args) => {
      if (sql.startsWith('SELECT')) return [queued && nextAt <= args[0] ? [{ file_key: 'proofs/fixture.png' }] : []];
      if (sql.startsWith('UPDATE')) {
        attempts++;
        nextAt = args[0];
      }
      if (sql.startsWith('DELETE')) queued = false;
      return [{}];
    }
  };
  t.mock.method(console, 'error', () => {});
  await processCustomerFileDeletions({
    db,
    clock: () => 0,
    remove: async () => {
      throw new Error('Temporary storage error');
    }
  });
  assert.equal(queued, true);
  assert.equal(attempts, 1);
  await processCustomerFileDeletions({
    db,
    clock: () => 60001,
    remove: async (key) => assert.equal(key, 'proofs/fixture.png')
  });
  assert.equal(queued, false);
});

test('fifty failing files cannot starve a newer file cleanup', async (t) => {
  const jobs = Array.from({ length: 51 }, (_, i) => ({ file_key: `file-${i}`, next_attempt_at: 0 }));
  const db = {
    query: async (sql, args) => {
      if (sql.startsWith('SELECT')) return [jobs.filter((job) => job.next_attempt_at <= 1000).slice(0, 50)];
      if (sql.startsWith('UPDATE') && sql.includes('next_attempt_at')) {
        const job = jobs.find((job) => job.file_key === args.at(-1));
        job.next_attempt_at = args[0];
      }
      if (sql.startsWith('DELETE'))
        jobs.splice(
          jobs.findIndex((job) => job.file_key === args[0]),
          1
        );
      return [{}];
    }
  };
  t.mock.method(console, 'error', () => {});
  const remove = async (key) => {
    if (key !== 'file-50') throw new Error('Persistent failure');
  };
  await processCustomerFileDeletions({ db, remove, clock: () => 1000 });
  await processCustomerFileDeletions({ db, remove, clock: () => 1000 });
  assert.equal(
    jobs.some((job) => job.file_key === 'file-50'),
    false
  );
});

test('restore and permanent deletion require admin authority before opening a transaction', async () => {
  const transact = () => {
    throw new Error('Transaction must not start');
  };
  for (const admin of [null, { id: 'customer', role: 'customer' }]) {
    await assert.rejects(restoreCustomerAccess('customer', admin, { transact }), { code: 'FORBIDDEN' });
    await assert.rejects(
      deleteCustomerAccount('customer', { confirmationEmail: 'customer@example.test' }, admin, { transact }),
      { code: 'FORBIDDEN' }
    );
  }
});

test('removal requires admin authority and a bounded nonempty reason before opening a transaction', async () => {
  const transact = () => {
    throw new Error('Transaction must not start');
  };
  for (const user of [null, { id: 'customer', role: 'customer' }, { role: 'admin' }]) {
    await assert.rejects(removeCustomerAccess('customer', { reason: 'Spam' }, user, { transact }), {
      code: 'FORBIDDEN'
    });
  }
  for (const reason of ['', '   ', 'x'.repeat(1001), 42]) {
    assert.equal(removalBody.safeParse({ reason }).success, false);
    await assert.rejects(removeCustomerAccess('customer', { reason }, { id: 'admin', role: 'admin' }, { transact }), {
      code: 'INVALID'
    });
  }
  assert.equal(removalBody.parse({ reason: ' Spam ' }).reason, 'Spam');
});

test('a removed customer cannot receive a session', () => {
  assert.throws(() => customerSession({ id: 'customer', removedAt: 123 }), { code: 'FORBIDDEN' });
});

test('booking rechecks the account before taking availability locks or writing anything', async () => {
  const queries = [];
  const transact = (fn) =>
    fn({
      query: async (sql) => {
        queries.push(sql);
        return [[{ id: 'customer', removed_at: 123 }]];
      }
    });
  await assert.rejects(createReservation({ id: 'customer' }, {}, { transact }), { code: 'UNAUTHENTICATED' });
  assert.equal(queries.length, 1);
  assert.match(queries[0], /customers.*FOR UPDATE/);
});
