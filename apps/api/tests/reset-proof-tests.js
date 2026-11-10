import assert from 'node:assert/strict';
import { test } from 'node:test';
import { issueResetProof, hasResetProof } from '../src/modules/auth/reset-proof.js';

const secret = 'local-test-reset-secret';
const verifiedAt = Date.now();
const reset = { id: 'reset-1', codeHash: 'hashed-otp', verifiedAt, expiresAt: Date.now() + 120000, usedAt: null };

test('reset completion proof requires the new secret returned after OTP verification', () => {
  const proof = issueResetProof(reset, verifiedAt, secret, 2);
  assert.equal(hasResetProof(proof, reset, secret), true);
  for (const token of [undefined, reset.id, 'invalid', `${proof}changed`]) {
    assert.equal(hasResetProof(token, reset, secret), false);
  }
  assert.equal(hasResetProof(proof, reset, 'another-secret'), false);
});

test('reset proofs cannot cross requests, survive resends or verification changes, or be reused after completion', () => {
  const proof = issueResetProof(reset, verifiedAt, secret, 2);
  for (const change of [
    { id: 'reset-2' },
    { codeHash: 'resent-code' },
    { verifiedAt: verifiedAt + 1 },
    { verifiedAt: null },
    { usedAt: Date.now() },
    { expiresAt: Date.now() - 1 }
  ]) {
    assert.equal(hasResetProof(proof, { ...reset, ...change }, secret), false);
  }
});
