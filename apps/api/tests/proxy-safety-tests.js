import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createApp } from '../src/app.js';

test('proxy trust ignores forwarded client addresses received directly from untrusted peers', () => {
  const app = createApp();
  const req = Object.create(app.request);
  req.socket = { remoteAddress: '203.0.113.8' };
  req.headers = { 'x-forwarded-for': '198.51.100.25' };
  assert.equal(req.ip, '203.0.113.8');
  req.socket.remoteAddress = '127.0.0.1';
  assert.equal(req.ip, '198.51.100.25');
});

test('trusted proxy configuration rejects blanket and numeric trust while permitting explicit networks', () => {
  const run = (value) =>
    spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "const {config}=await import('./apps/api/src/config.js');process.stdout.write(JSON.stringify(config.trustProxy ?? null));"
      ],
      {
        cwd: new URL('../../..', import.meta.url),
        env: { ...process.env, NODE_ENV: 'development', TRUST_PROXY: value },
        encoding: 'utf8',
        windowsHide: true
      }
    );
  for (const value of ['true', '1', '2', '0.0.0.0/0', '::/0', 'unknown-proxy', '10.0.0.0/33']) {
    const result = run(value);
    assert.notEqual(result.status, 0, `${value} must not trust arbitrary forwarded addresses`);
    assert.match(result.stderr, /TRUST_PROXY/);
  }
  for (const [value, expected] of [
    ['false', false],
    ['loopback', ['loopback']],
    ['127.0.0.1,10.0.0.0/24', ['127.0.0.1', '10.0.0.0/24']]
  ]) {
    const result = run(value);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), expected);
  }
});
