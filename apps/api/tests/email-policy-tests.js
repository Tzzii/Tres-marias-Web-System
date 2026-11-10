import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertCustomerEmailAllowed } from '../src/modules/auth/email-policy.js';

test('blocks known disposable providers including mixed-case and provider subdomains', () => {
  for (const email of [
    'test@mailinator.com',
    'test@yopmail.com',
    'test@mailinator.com.',
    ' Test@MAILINATOR.COM ',
    'test@inbox.mailinator.com'
  ]) {
    assert.throws(
      () => assertCustomerEmailAllowed(email),
      (error) => {
        assert.equal(error.code, 'INVALID');
        assert.equal(error.meta.field, 'email');
        assert.match(error.message, /Temporary email/);
        return true;
      }
    );
  }
});

test('allows permanent, school and custom domains and preserves address aliases', () => {
  for (const email of [
    'test@gmail.com',
    'test+booking@gmail.com',
    'person@outlook.com',
    'person@school.edu.ph',
    'person@mycompany.ph',
    'person@mailinator.com.example.org'
  ]) {
    assert.doesNotThrow(() => assertCustomerEmailAllowed(email));
  }
});

test('rejects malformed addresses before the disposable-provider lookup', () => {
  for (const email of [
    '',
    null,
    'mailinator.com',
    'person@@gmail.com',
    'person@ gmail.com',
    'test@mailinator\u3002com'
  ]) {
    assert.throws(
      () => assertCustomerEmailAllowed(email),
      (error) => error.code === 'INVALID' && error.meta.field === 'email'
    );
  }
});
