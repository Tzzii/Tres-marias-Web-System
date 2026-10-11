import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OUTSOURCE_SERVICES, OUTSOURCE_OTHER_RANGE } from '@tm/shared/src/services/config.js';
import {
  partnerProblem, partnerFields, partnerServiceInput, partnerServiceCategory,
  partnerOrder, partnerEditText, contractView
} from '@tm/shared/src/domain/outsource.js';
import { partnerBody } from '../src/modules/outsource/outsource.schemas.js';
import { insertPartner, updatePartner, findPartners } from '../src/modules/outsource/outsource.repo.js';

const details = { name: 'Local supplier', service: 'Other', serviceOther: 'Photo booth', email: 'supplier@example.test' };

test('a custom supply survives API validation and is saved as the actual supply name', () => {
  const parsed = partnerBody.parse(details);
  assert.equal(partnerProblem(parsed), null);
  assert.equal(partnerFields(parsed).service, 'Photo booth');
  assert.equal('serviceOther' in partnerFields(parsed), false);
});

test('Other requires a specific supply with the error attached to its text field', () => {
  for (const serviceOther of [undefined, null, 42, {}, [], '', '   ', 'A', 'Other', ' other ']) {
    const problem = partnerProblem({ ...details, serviceOther });
    assert.equal(problem.code, 'INVALID');
    assert.equal(problem.meta.field, 'serviceOther');
  }
});

test('custom supplies respect the existing database length and reject multiline/control text', () => {
  assert.equal(partnerProblem({ ...details, serviceOther: 'A'.repeat(OUTSOURCE_OTHER_RANGE.max) }), null);
  for (const serviceOther of ['A'.repeat(OUTSOURCE_OTHER_RANGE.max + 1), 'LED\nwall', 'LED\rwall', 'LED\twall', 'LED\0wall', 'LED\u2028wall']) {
    assert.equal(partnerProblem({ ...details, serviceOther }).meta.field, 'serviceOther');
  }
});

test('custom text is trimmed, repeated spaces collapse, and typed standard categories normalize', () => {
  assert.equal(partnerFields({ ...details, serviceOther: '  Photo   booth  ' }).service, 'Photo booth');
  assert.equal(partnerFields({ ...details, serviceOther: ' LIGHTS AND SOUND ' }).service, 'Lights and sound');
});

test('all standard supply categories retain their existing save behavior', () => {
  for (const service of OUTSOURCE_SERVICES.filter(s => s !== 'Other')) {
    const values = { ...details, service, serviceOther: '' };
    assert.equal(partnerProblem(values), null);
    assert.equal(partnerFields(values).service, service);
    assert.deepEqual(partnerServiceInput(service), { service, serviceOther: '' });
  }
  assert.equal(partnerProblem({ ...details, service: 'Unknown category' }).meta.field, 'service');
});

test('editing a saved custom supply restores Other plus the original text without losing it', () => {
  const input = partnerServiceInput('Photo booth');
  assert.deepEqual(input, { service: 'Other', serviceOther: 'Photo booth' });
  assert.equal(partnerFields({ ...details, ...input }).service, 'Photo booth');
  assert.deepEqual(partnerServiceInput('Other'), { service: 'Other', serviceOther: '' });
  assert.deepEqual(partnerServiceInput(''), { service: '', serviceOther: '' });
  assert.equal(partnerEditText({ ...partnerFields(details) }, partnerFields({ ...details, serviceOther: 'LED wall' })), 'Changed service.');
});

test('switching from Other to a standard supply ignores the hidden custom value', () => {
  const values = { ...details, service: 'Transport', serviceOther: 'Photo booth' };
  assert.equal(partnerProblem(values), null);
  assert.equal(partnerFields(values).service, 'Transport');
});

test('custom supplies are included under Other for partner and request filters, sorted last', () => {
  assert.equal(partnerServiceCategory('Photo booth'), 'Other');
  assert.equal(partnerServiceCategory('Other'), 'Other');
  assert.equal(partnerServiceCategory('Transport'), 'Transport');
  assert.equal(partnerServiceCategory(''), '');
  const partners = [
    { name: 'Z Booth', service: 'Photo booth' },
    { name: 'A Transport', service: 'Transport' },
    { name: 'A Wall', service: 'LED wall' },
    { name: 'Z Chairs', service: 'Chairs and tables' }
  ].sort(partnerOrder);
  assert.deepEqual(partners.map(p => p.name), ['Z Chairs', 'A Transport', 'A Wall', 'Z Booth']);
  assert.deepEqual(partners.filter(p => partnerServiceCategory(p.service) === 'Other').map(p => p.name), ['A Wall', 'Z Booth']);
});

test('custom supplies still require valid partner contact details', () => {
  assert.equal(partnerProblem({ ...details, email: '' }).meta.field, 'email');
  assert.equal(partnerProblem({ ...details, email: 'bad email' }).meta.field, 'email');
  assert.equal(partnerProblem({ ...details, email: '', mobile: '09171234567' }), null);
});

test('SQL create, edit, and read preserve the actual custom supply in the existing service column', async () => {
  const calls = [];
  const fake = { async query(sql, params) { calls.push({ sql, params }); return [[]]; } };
  await insertPartner(fake, { id: 'local-test', ...partnerFields(details), archived: false });
  assert.equal(calls[0].params[2], 'Photo booth');
  await updatePartner(fake, 'local-test', { service: 'LED wall' });
  assert.deepEqual(calls[1].params, ['LED wall', 'local-test']);
  const read = { async query(sql) {
    return [sql.includes('SELECT p.*') ? [{ id: 'local-test', name: 'Local supplier', service: 'LED wall', archived: 0 }] : []];
  } };
  const [partner] = await findPartners(read, {});
  assert.equal(partner.service, 'LED wall');
});

test('request views carry the custom supply for partner pickers, details, and exports', () => {
  const view = contractView({ items: [{ name: 'Photo booth', qty: 1 }] }, { ...partnerFields(details), id: 'local-test' }, null);
  assert.equal(view.service, 'Photo booth');
  assert.equal(view.partnerName, 'Local supplier');
  assert.equal(view.itemsSummary, 'Photo booth × 1');
});
