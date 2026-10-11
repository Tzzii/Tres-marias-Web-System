import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateMobile } from '@tm/shared/src/utils/validation.js';
import { mobileInputValue, nationalMobile, readPhilippineMobile } from '@tm/shared/src/utils/mobile.js';
import { formatMobile } from '@tm/shared/src/utils/format.js';
import { cleanMobile } from '@tm/shared/src/domain/account.js';
import { partnerFields, partnerProblem } from '@tm/shared/src/domain/outsource.js';
import { startSignUp, updateCustomerProfile } from '../src/modules/auth/auth.service.js';
import { updateCustomerContact } from '../src/modules/customers/customers.service.js';

const partner = { name: 'Phone test supplier', service: 'Transport', email: 'supplier@example.test' };
const invalid = '+6391234567896';

test('PH mobile equivalents share validation, domestic storage and +63 display', () => {
  for (const input of ['09171234567', '+639171234567', '+63 917 123 4567', '639171234567', '9171234567', '0917-123-4567']) {
    assert.equal(validateMobile(input), '', input);
    assert.equal(cleanMobile(input), '09171234567', input);
    assert.equal(mobileInputValue(input), '09171234567', input);
    assert.equal(formatMobile(input), '+63 917 123 4567', input);
    assert.equal(partnerFields({ ...partner, mobile: input }).mobile, '09171234567', input);
  }
});

test('recognized mobile ranges across networks, including 8-series, are supported', () => {
  for (const input of ['09171234567', '09181234567', '09911234567', '09561234567', '08131234567', '08171234567', '08951234567']) {
    assert.equal(validateMobile(input), '', input);
    assert.equal(readPhilippineMobile(input).getType(), 'MOBILE');
  }
  assert.equal(formatMobile('08131234567'), '+63 813 123 4567');
});

test('extra digits stay visible and cannot turn into a valid number on paste', () => {
  assert.equal(nationalMobile(invalid), '91234567896');
  assert.equal(mobileInputValue(invalid), '091234567896');
  assert.match(validateMobile(mobileInputValue(invalid)), /exactly 10 digits/);
  assert.equal(cleanMobile(invalid), invalid);
  assert.equal(readPhilippineMobile(invalid), null);
});

test('short, long, duplicated prefix, foreign, landline and unknown mobile ranges are rejected', () => {
  for (const input of ['0917123456', '091712345678', '+6309171234567', '009171234567', '+6581234567', '+63281234567', '+639001234567', '00000000000']) {
    assert.notEqual(validateMobile(input), '', input);
    assert.notEqual(validateMobile(mobileInputValue(input)), '', input);
    assert.equal(partnerProblem({ ...partner, mobile: input }).meta.field, 'mobile', input);
  }
});

test('letters, commas, extensions and embedded text cannot be silently stripped into a valid phone', () => {
  for (const input of ['+639171234567,,', '0917abc1234567', 'call +639171234567', '+639171234567 ext 1', '+63(0)9171234567']) {
    assert.notEqual(validateMobile(input), '', input);
    assert.notEqual(validateMobile(mobileInputValue(input)), '', input);
    assert.equal(readPhilippineMobile(input), null);
  }
});

test('an optional partner mobile may be blank when email is present; provided phones must pass', () => {
  assert.equal(partnerProblem({ ...partner, mobile: '' }), null);
  assert.equal(partnerProblem({ ...partner, email: '', mobile: '' }).meta.field, 'email');
  assert.equal(partnerProblem({ ...partner, email: '', mobile: '+639171234567' }), null);
  assert.equal(partnerProblem({ ...partner, mobile: invalid }).meta.field, 'mobile');
  assert.equal(validateMobile(''), 'Mobile number is required.');
});

const mobileRejection = error => error.code === 'INVALID' && error.meta.field === 'mobile';

test('signup API service rejects the overlong phone before account creation or email', async () => {
  await assert.rejects(startSignUp({ firstName: 'Local', lastName: 'Preview', email: 'phone@example.test', mobile: invalid, password: 'Mobile-Test-2026', agreeTerms: true }), mobileRejection);
});

test('customer profile API service rejects the overlong phone before reading or writing records', async () => {
  await assert.rejects(updateCustomerProfile('no-record-needed', { name: 'Local Preview', mobile: invalid }), mobileRejection);
});

test('admin customer-contact API service rejects the overlong phone before entering a database transaction', async () => {
  await assert.rejects(updateCustomerContact('no-record-needed', { email: 'phone@example.test', mobile: invalid }), mobileRejection);
});
