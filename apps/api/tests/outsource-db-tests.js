import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { config } from '../src/config.js';
import { closePool, pool } from '../src/db.js';
import { createApp } from '../src/app.js';
import { signToken } from '../src/lib/tokens.js';
import * as repo from '../src/modules/outsource/outsource.repo.js';
import { deletePartner } from '../src/modules/outsource/outsource.service.js';
import { contractView } from '@tm/shared/src/domain/outsource.js';
import { migrateOutsourcePartnerDeletion } from '../scripts/lib/outsource-partner-deletion-migration.js';

if (config.isProduction || !['127.0.0.1', 'localhost', '::1'].includes(config.db.host))
  throw new Error('Outsourcing database tests require local, non-production MySQL.');
after(() => closePool());

test('DELETE partner route requires an admin and reports a missing partner as 404', async () => {
  const [[customer]] = await pool.query(
    'SELECT id, name, password_changed_at AS passwordChangedAt FROM customers LIMIT 1'
  );
  const [[admin]] = await pool.query(
    'SELECT id, name, password_changed_at AS passwordChangedAt, session_id AS sessionId FROM admins WHERE session_id IS NOT NULL LIMIT 1'
  );
  assert.ok(customer && admin, 'A local customer and signed-in admin are needed; existing sessions are not changed.');
  const server = createApp().listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const url = `http://127.0.0.1:${server.address().port}/api/admin/outsource/partners/op-qa-missing-${randomUUID().slice(0, 8)}`;
    for (const [account, role, status, code] of [
      [null, null, 401, 'UNAUTHENTICATED'],
      [customer, 'customer', 403, 'FORBIDDEN'],
      [admin, 'admin', 404, 'NOT_FOUND']
    ]) {
      const headers = account ? { Authorization: `Bearer ${signToken({ ...account, role }, { ttl: '5m' })}` } : {};
      const response = await fetch(url, { method: 'DELETE', headers });
      assert.equal(response.status, status);
      assert.equal((await response.json()).code, code);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('partner deletion removes profiles while keeping request records (fixtures rolled back)', async (t) => {
  const conn = await pool.getConnection();
  try {
    assert.equal(
      await migrateOutsourcePartnerDeletion(conn),
      false,
      'Run db:migrate first; repeat migration is a no-op.'
    );
    await conn.beginTransaction();
    const admin = { name: 'QA partner deletion' };
    const transact = (fn) => fn(conn);
    async function fixture(statuses = [], archived = false) {
      const suffix = randomUUID().slice(0, 8);
      const partner = {
        id: `op-qa-delete-${suffix}`,
        name: `QA delete partner ${suffix}`,
        service: 'Chairs and tables',
        contactPerson: 'QA',
        email: 'delete-partner@example.test',
        mobile: '',
        address: '',
        notes: '',
        archived
      };
      await repo.insertPartner(conn, partner);
      await repo.insertPartnerHistory(conn, partner.id, { at: Date.now(), actor: admin.name, text: 'QA fixture.' });
      const contracts = [];
      for (const [index, status] of statuses.entries()) {
        const contract = {
          id: `oc-qa-delete-${suffix}-${index}`,
          ref: `OUT-QA-${suffix}-${index}`,
          partnerId: partner.id,
          reservationRef: 'none',
          items: [{ name: 'QA chair', qty: 2 }],
          needBy: '2040-11-20',
          amount: 100,
          notes: '',
          status,
          body: 'QA original request text.',
          createdAt: Date.now(),
          sentAt: status === 'draft' ? null : Date.now(),
          answeredAt: null,
          answerNote: ''
        };
        await repo.insertContract(conn, contract);
        await repo.insertContractHistory(conn, contract.id, {
          at: Date.now(),
          actor: admin.name,
          text: 'QA original history.'
        });
        await repo.insertDelivery(conn, contract.id, {
          channel: 'email',
          to: partner.email,
          at: Date.now(),
          body: contract.body,
          outboxId: null
        });
        contracts.push(contract);
      }
      return { partner, contracts };
    }

    for (const archived of [false, true]) {
      await t.test(
        `deletes an ${archived ? 'archived' : 'active'} partner with no requests and frees its name`,
        async () => {
          const { partner } = await fixture([], archived);
          await deletePartner(partner.id, admin, { transact });
          assert.equal(await repo.readPartner(conn, partner.id), null);
          const [[history]] = await conn.query(
            'SELECT COUNT(*) AS count FROM outsource_partner_history WHERE partner_id = ?',
            [partner.id]
          );
          assert.equal(history.count, 0);
          await repo.insertPartner(conn, { ...partner, id: `${partner.id}-new` });
        }
      );
    }

    await t.test(
      'keeps drafts, closed requests, deliveries and their histories after real profile deletion',
      async () => {
        const { partner, contracts } = await fixture(['draft', 'declined', 'completed', 'cancelled']);
        await deletePartner(partner.id, admin, { transact });
        assert.equal(await repo.readPartner(conn, partner.id), null);
        for (const original of contracts) {
          const [saved] = await repo.findContracts(conn, { id: original.id });
          assert.equal(saved.contract.partnerId, null);
          assert.equal(saved.partner, null);
          assert.equal(contractView(saved.contract, saved.partner, null).partnerName, 'Removed partner');
          assert.equal(saved.contract.status, original.status);
          assert.equal(saved.contract.body, original.body);
          assert.deepEqual(saved.contract.items, original.items);
          assert.equal(saved.contract.deliveries.length, 1);
          assert.equal(saved.contract.history[0].text, 'QA original history.');
          assert.equal(saved.contract.history[1].actor, admin.name);
          assert.ok(saved.contract.history[1].text.includes(partner.name));
        }
      }
    );

    for (const status of ['sent', 'accepted']) {
      await t.test(`refuses deletion while a request is ${status}, preserving all data`, async () => {
        const { partner, contracts } = await fixture(['completed', status]);
        await assert.rejects(deletePartner(partner.id, admin, { transact }), { code: 'IN_USE' });
        assert.ok(await repo.readPartner(conn, partner.id));
        const [savedPartner] = await repo.findPartners(conn, { ids: [partner.id] });
        assert.equal(savedPartner.history.length, 1);
        for (const original of contracts) {
          const [saved] = await repo.findContracts(conn, { id: original.id });
          assert.equal(saved.contract.partnerId, partner.id);
          assert.equal(saved.contract.history.length, 1);
        }
      });
    }

    await t.test('missing ids, different casing and trailing spaces cannot delete a partner', async () => {
      const { partner } = await fixture();
      for (const id of ['op-qa-delete-missing', partner.id.toUpperCase(), `${partner.id} `]) {
        await assert.rejects(deletePartner(id, admin, { transact }), { code: 'NOT_FOUND' });
      }
      assert.ok(await repo.readPartner(conn, partner.id));
    });
  } finally {
    await conn.rollback();
    conn.release();
  }
});
