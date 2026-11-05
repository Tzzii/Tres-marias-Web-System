import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { reservationAdminRoutes } from '../src/modules/reservations/reservations.routes.js';
import { requireAuth, requireRole } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/errors.js';
import { signToken } from '../src/lib/tokens.js';
import { pool } from '../src/db.js';
import { updateAddons } from '../src/modules/reservations/reservations.service.js';
import { validateServiceDependencies } from '../src/modules/budget/budget.submission.js';
import { budgetCatalog } from './helpers/budget-fixtures.js';

test('working selection endpoint requires administrator role and rejects invalid quantities before a write', async (t) => {
  t.mock.method(pool, 'query', async () => [[{ name: 'QA', password_changed_at: 0, session_id: 'qa' }]]);
  const app = express();
  app.use(express.json());
  app.use('/admin/reservations', requireAuth, requireRole('admin'), reservationAdminRoutes);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((r) => server.close(r)));
  const send = (role, body = { addonIds: [], addonQty: {} }) =>
    fetch(`http://127.0.0.1:${server.address().port}/admin/reservations/QA/addons`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(role ? { Authorization: `Bearer ${signToken({ id: 'qa', role, sessionId: 'qa' }, { ttl: '1h' })}` } : {})
      },
      body: JSON.stringify(body)
    });
  assert.equal((await send()).status, 401);
  assert.equal((await send('customer')).status, 403);
  assert.equal((await send('admin', { addonIds: ['helpers'], addonQty: { helpers: 0 } })).status, 400);
  assert.equal((await send('admin', { addonIds: [], addonQty: {}, budgetRequest: {} })).status, 400);
});
test('non-pending and rental requests cannot have their working additional services edited', async () => {
  for (const [status, service] of [
    ['approved', 'Buffet and Catering'],
    ['pending', 'Equipment rental'],
    ['completed', 'Catering only']
  ]) {
    const row = { ref: 'QA', customer_id: 'qa', status, service_type: service, quotation: null, estimate: '{}' };
    const db = {
      query: async (sql) =>
        sql.includes('FROM calendar_settings')
          ? [[{ id: 1 }]]
          : sql.startsWith('SELECT ref, customer_id, status FROM reservations') ||
              (sql.includes('FROM reservations r') && sql.includes('LEFT JOIN customers'))
            ? [[row]]
            : [[]]
    };
    await assert.rejects(
      updateAddons('QA', { addonIds: [], addonQty: {} }, { name: 'Admin' }, { transact: (fn) => fn(db) }),
      (e) => e.code === 'INVALID_STATE'
    );
  }
});
test('dependencies cannot be silently dropped by a manual admin service edit', () => {
  const catalog = budgetCatalog();
  catalog.addons[0].budgetPolicy.requires = ['helpers'];
  assert.throws(
    () => validateServiceDependencies({ addonIds: ['stage'], addonQty: { stage: 1 } }, catalog),
    /required additional services/
  );
  assert.doesNotThrow(() =>
    validateServiceDependencies({ addonIds: ['stage', 'helpers'], addonQty: { stage: 1, helpers: 2 } }, catalog)
  );
});
