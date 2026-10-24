import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { createGoogleIdentity } from '../src/modules/auth/google.identity.js';

const clientId = 'test-client.apps.googleusercontent.com';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const certificate = publicKey.export({ type: 'spki', format: 'pem' });
const secret = 'google-test-challenge-secret-at-least-32-characters';

function setup() {
  const googleClient = new OAuth2Client(clientId);
  // Replace only the network certificate fetch. Signature and claim checks use Google's real verifier.
  googleClient.getFederatedSignonCertsAsync = async () => ({ certs: { fixture: certificate } });
  return createGoogleIdentity({ clientId, secret, googleClient });
}

function credential(nonce, claims = {}, signingKey = privateKey) {
  return jwt.sign(
    {
      sub: 'google-person-1',
      email: 'person@gmail.com',
      email_verified: true,
      given_name: 'Maria',
      family_name: 'Santos',
      nonce,
      ...claims
    },
    signingKey,
    { algorithm: 'RS256', keyid: 'fixture', audience: clientId, issuer: 'https://accounts.google.com', expiresIn: '5m' }
  );
}

test('Google verifies a real signature and returns only verified identity data', async () => {
  const identity = setup();
  const challenge = identity.issue();
  assert.equal(challenge.clientId, clientId);
  assert.ok(challenge.nonce.length >= 32);
  assert.notEqual(identity.issue().nonce, challenge.nonce);
  const result = await identity.verify({ ...challenge, credential: credential(challenge.nonce) });
  assert.deepEqual(result, {
    sub: 'google-person-1',
    email: 'person@gmail.com',
    firstName: 'Maria',
    lastName: 'Santos',
    authoritativeEmail: true
  });
});

test('Google rejects a wrong nonce, missing challenge, unverified email, expired token and forged signature', async () => {
  const identity = setup();
  const issued = identity.issue();
  const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const inputs = [
    { ...issued, credential: credential('different-nonce') },
    { credential: credential(issued.nonce) },
    { ...issued, credential: credential(issued.nonce, { email_verified: false }) },
    { ...issued, credential: credential(issued.nonce, {}, otherKey) },
    { ...issued, credential: 'not-a-token' },
    { ...issued, challenge: `${issued.challenge}tampered`, credential: credential(issued.nonce) }
  ];
  const expired = jwt.sign(
    {
      sub: 'p',
      email: 'person@gmail.com',
      email_verified: true,
      nonce: issued.nonce,
      iat: Math.floor(Date.now() / 1000) - 7200,
      exp: Math.floor(Date.now() / 1000) - 3600
    },
    privateKey,
    { algorithm: 'RS256', keyid: 'fixture', audience: clientId, issuer: 'https://accounts.google.com' }
  );
  inputs.push({ ...issued, credential: expired });
  for (const input of inputs) await assert.rejects(identity.verify(input), { code: 'INVALID_CREDENTIALS' });
});

test('Google rejects credentials issued for another client or issuer', async () => {
  const identity = setup();
  const issued = identity.issue();
  for (const options of [
    { audience: 'other-client', issuer: 'https://accounts.google.com' },
    { audience: clientId, issuer: 'https://attacker.example' }
  ]) {
    const token = jwt.sign(
      { sub: 'p', email: 'person@gmail.com', email_verified: true, nonce: issued.nonce },
      privateKey,
      { algorithm: 'RS256', keyid: 'fixture', expiresIn: '5m', ...options }
    );
    await assert.rejects(identity.verify({ ...issued, credential: token }), { code: 'INVALID_CREDENTIALS' });
  }
});

test('third-party Google email addresses require separate ownership confirmation at signup', async () => {
  const identity = setup();
  const issued = identity.issue();
  for (const [claims, expected] of [
    [{ email: 'person@another.example' }, false],
    [{ email: 'person@business.example', hd: 'business.example' }, true]
  ]) {
    const result = await identity.verify({ ...issued, credential: credential(issued.nonce, claims) });
    assert.equal(result.authoritativeEmail, expected);
  }
});

test('Google stays disabled without an explicitly configured client ID', async () => {
  const identity = createGoogleIdentity({ clientId: '', secret });
  assert.deepEqual(identity.issue(), { clientId: '' });
  await assert.rejects(identity.verify({}), { code: 'INVALID_STATE' });
});
