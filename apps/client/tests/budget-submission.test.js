import test from 'node:test';
import assert from 'node:assert/strict';
import { budgetSubmission, baselineFor, buildBudgetContext } from '../src/lib/budgetDraft.js';
import { budgetCatalog } from '../../api/tests/helpers/budget-fixtures.js';
import { http } from '../../../packages/shared/src/services/http.js';
import { createReservation } from '../../../packages/shared/src/services/remote/reservation.js';
import { sectionForField } from '../src/lib/bookingForm.js';

test('submission sends editable budget metadata only, and omits it for ordinary/rental bookings', () => {
  const catalog = { ...budgetCatalog(), budgetCatalogFingerprint: 'a'.repeat(64) };
  const form = {
    packageId: 'p',
    serviceType: 'Buffet and Catering',
    guests: '200',
    date: '2030-12-20',
    startTime: '12:00',
    endTime: '16:00',
    addonIds: ['helpers'],
    addonQty: { helpers: '5' },
    budgetDraft: { amount: '100000' }
  };
  const context = buildBudgetContext(form, catalog);
  form.budgetDraft.baseline = baselineFor(context, { knownTotal: 133000 }, catalog);
  form.budgetDraft.proposalRef = { id: 'budget-qa', generatedAt: 1 };
  const request = budgetSubmission(form, catalog);
  assert.deepEqual(Object.keys(request).sort(), [
    'budget',
    'preferences',
    'proposalId',
    'protectedAddonIds',
    'reviewedCatalogFingerprint'
  ]);
  assert.equal(request.proposalId, 'budget-qa');
  assert.equal(budgetSubmission({ ...form, guests: '201' }, catalog).proposalId, undefined);
  assert.equal(budgetSubmission(form, { ...catalog, budgetCatalogFingerprint: 'b'.repeat(64) }).proposalId, undefined);
  assert.equal(budgetSubmission({ ...form, serviceType: 'Catering only' }, catalog), undefined);
  assert.equal(budgetSubmission({ ...form, budgetDraft: { amount: '' } }, catalog), undefined);
  assert.equal(sectionForField('budgetRequest'), 'budget');
});
test('normal booking transport carries budgetRequest while dropping local history and raw provider output', async (t) => {
  let sent;
  t.mock.method(http, 'post', async (url, body) => {
    sent = { url, body };
    return { ref: 'QA' };
  });
  await createReservation('owner', {
    eventName: 'QA',
    budgetRequest: { budget: 100000 },
    budgetDraft: { history: ['local'] },
    proposal: { candidates: [] }
  });
  assert.equal(sent.url, '/reservations');
  assert.deepEqual(sent.body.budgetRequest, { budget: 100000 });
  assert.equal(sent.body.budgetDraft, undefined);
  assert.equal(sent.body.proposal, undefined);
});
