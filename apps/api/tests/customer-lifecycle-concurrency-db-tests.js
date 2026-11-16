import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/config.js';
import { pool, closePool } from '../src/db.js';
import { createAssistantRepository } from '../src/modules/assistant/assistant.repo.js';
import { deleteCustomerAccount } from '../src/modules/customers/customers.service.js';
import { processCustomerFileDeletions } from '../src/modules/customers/customers.deletion.js';
import { storage } from '../src/integrations/storage/index.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function transact(fn) {
  const conn = await pool.getConnection();
  conn.afterCommit = () => {}; // Fixtures never run physical file cleanup.
  try {
    await conn.beginTransaction();
    const value = await fn(conn);
    await conn.commit();
    return value;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    delete conn.afterCommit;
    conn.release();
  }
}

test('hard deletion serializes with assistant creation and in-flight photo updates', async (t) => {
  assert.equal(config.isProduction, false);
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(config.db.host));
  const repo = createAssistantRepository({ settings: { dailyLimit: 20, conversationTtlMs: 60000 } });
  const admin = { id: 'qa-lifecycle-admin', role: 'admin' };
  try {
    for (const mode of ['creation', 'photo update']) {
      await t.test(mode, async () => {
        const id = `life-${randomUUID().slice(0, 20)}`;
        const email = `${id}@example.invalid`;
        const files = ['old', 'new'].map((name) => ({
          key: `styling/${randomUUID()}.png`,
          name: `${name}.png`,
          mime: 'image/png',
          size: 67
        }));
        const ready = deferred();
        const release = deferred();
        let work;
        let deletion;
        try {
          await pool.query('INSERT INTO customers (id, name, email, created_at) VALUES (?, ?, ?, ?)', [
            id,
            'Lifecycle QA',
            email,
            Date.now()
          ]);
          if (mode === 'creation') {
            deletion = deleteCustomerAccount(id, { confirmationEmail: email }, admin, {
              transact: async (fn) =>
                transact(async (conn) => {
                  const result = await fn(conn);
                  ready.resolve();
                  await release.promise;
                  return result;
                })
            });
            await Promise.race([
              ready.promise,
              deletion.then(() => {
                throw new Error('Deletion committed too soon');
              })
            ]);
            work = repo.open({ customerId: id }, null, { fresh: true });
            const rejected = assert.rejects(work, { code: 'UNAUTHENTICATED' });
            await new Promise((resolve) => setTimeout(resolve, 30));
            release.resolve();
            await deletion;
            await rejected;
          } else {
            await storage.put(files[0].key, Buffer.from('Old fixture photo'));
            const conversationId = randomUUID();
            await pool.query(
              'INSERT INTO assistant_conversations (id, customer_id, created_at, expires_at, booking_draft, reference_photos) VALUES (?, ?, ?, ?, ?, ?)',
              [
                conversationId,
                id,
                Date.now(),
                Date.now() + 60000,
                JSON.stringify({ serviceType: 'Catering only' }),
                JSON.stringify([files[0]])
              ]
            );
            work = repo.updatePhotos({ customerId: id }, conversationId, 0, async () => {
              ready.resolve();
              await release.promise;
              await storage.put(files[1].key, Buffer.from('New fixture photo'));
              return files;
            });
            await Promise.race([
              ready.promise,
              work.then(() => {
                throw new Error('Photo update completed too soon');
              })
            ]);
            deletion = deleteCustomerAccount(id, { confirmationEmail: email }, admin, { transact });
            await new Promise((resolve) => setTimeout(resolve, 30));
            release.resolve();
            await work;
            await deletion;
            const [queued] = await pool.query('SELECT file_key FROM customer_file_deletions WHERE file_key IN (?)', [
              files.map((file) => file.key)
            ]);
            assert.equal(queued.length, 2, 'The newly attached photo is included in deletion');
            await processCustomerFileDeletions({ db: { query: (sql, args) => sql.startsWith('SELECT')
              ? pool.query('SELECT file_key FROM customer_file_deletions WHERE file_key IN (?)', [files.map((file) => file.key)])
              : pool.query(sql, args) } });
            for (const file of files) await assert.rejects(access(path.join(config.storage.uploadDir, file.key)), { code: 'ENOENT' });
          }
          const [[orphans]] = await pool.query(
            'SELECT COUNT(*) AS n FROM assistant_conversations WHERE customer_id = ?',
            [id]
          );
          assert.equal(orphans.n, 0);
        } finally {
          release.resolve();
          await Promise.allSettled([work, deletion]);
          await deleteCustomerAccount(id, { confirmationEmail: email }, admin, { transact });
          await Promise.all(files.map((file) => storage.remove(file.key)));
          await pool.query('DELETE FROM customer_file_deletions WHERE file_key IN (?)', [
            files.map((file) => file.key)
          ]);
        }
      });
    }
  } finally {
    await closePool();
  }
});
