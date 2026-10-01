import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
// config.js first: it loads apps/api/.env (the database, JWT_SECRET) and fixes the time zone
import { config } from '../../src/config.js';
import { closePool, pool } from '../../src/db.js';
import { hashSecret } from '../../src/lib/passwords.js';
import { signToken } from '../../src/lib/tokens.js';

/**
 * What the two security scripts share (Phase 12): scripts/route-audit.js and scripts/security-tests.js.
 *
 * - They test a real API process. By default each starts its own (startApi: `node src/server.js` from
 *   apps/api on a free port, with test-only settings), so nothing else has to be running and the API you
 *   use day to day is not touched. route-audit.js can also be pointed at a running API with --base, e.g.
 *   the live one in Phase 13.
 * - Sessions are made the way the API makes them: signed with JWT_SECRET from apps/api/.env (tokenFor),
 *   so the scripts never type a password or read an emailed code. Against --base that means running the
 *   script on the server itself, where its .env is.
 * - Test customers are written straight into the database named in apps/api/.env (createTestCustomer),
 *   with addresses @example.test that can never receive mail. The scripts write test records (bookings,
 *   payments, messages), so they refuse to run without --writes-test-data: run them on a database you will
 *   reset afterwards (your local copy, after a backup; the live server before `npm run seed:starter`).
 */

export const API_DIR = config.apiRoot;
export const REPO_DIR = path.resolve(API_DIR, '..', '..');

/** Command-line options: --base <url>, --out <file>, --writes-test-data, --help. */
export function parseArgs(argv) {
  const args = { base: null, out: null, writesOk: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--base') args.base = String(argv[(i += 1)] || '').replace(/\/+$/, '');
    else if (arg === '--out') args.out = argv[(i += 1)];
    else if (arg === '--writes-test-data') args.writesOk = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

/** Stop unless --writes-test-data was given: the scripts add test records to the database in apps/api/.env. */
export function requireWriteConsent(args, what) {
  if (args.writesOk) return;
  const { host, port, database } = config.db;
  console.error(
    `${what} writes test records (customers, bookings, payments, messages) into the database "${database}" on ${host}:${port}.\n` +
      'Run it only on a database you will reset afterwards (back up your local data first; on the live server, before npm run seed:starter),\n' +
      'then add --writes-test-data to go ahead.'
  );
  process.exit(1);
}

// One folder per run in the system's temp directory: the API's log, and its uploads (test receipts)
let runFolder = null;
export function runDir() {
  if (!runFolder) runFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-security-'));
  return runFolder;
}

/** A TCP port nothing listens on right now. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Start an API process: `node [--import preload] src/server.js` in apps/api, with `env` on top of this
 * process's environment (which already holds apps/api/.env; settings given here win, as in the shell).
 * Its output goes to <run folder>/<label>.log. Resolves once /api/health answers, with
 * { base: 'http://127.0.0.1:<port>/api', logFile, stop() }; rejects with the log's end if it exits first.
 */
export async function startApi({ env = {}, preload = null, label = 'api' } = {}) {
  const port = await freePort();
  const logFile = path.join(runDir(), `${label}.log`);
  const out = fs.openSync(logFile, 'a');
  const args = [...(preload ? ['--import', pathToFileURL(preload).href] : []), 'src/server.js'];
  const child = spawn(process.execPath, args, { cwd: API_DIR, env: { ...process.env, ...env, PORT: String(port) }, stdio: ['ignore', out, out], windowsHide: true });
  let exitCode = null;
  const exited = new Promise((resolve) => child.once('exit', (code) => resolve((exitCode = code ?? -1))));
  const base = `http://127.0.0.1:${port}/api`;
  for (let i = 0; i < 100 && exitCode === null; i += 1) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) break;
    } catch {
      /* not listening yet */
    }
    await wait(200);
  }
  if (exitCode !== null) {
    fs.closeSync(out);
    throw new Error(`The test API stopped at start-up (exit ${exitCode}):\n${fs.readFileSync(logFile, 'utf8').slice(-1500)}`);
  }
  return {
    base,
    logFile,
    async stop() {
      if (exitCode === null) {
        child.kill();
        await Promise.race([exited, wait(5000)]);
      }
      fs.closeSync(out);
    }
  };
}

/**
 * Run the API once with `env` and capture what it prints, for start-up checks: resolves with
 * { started: false, code, output } when it exits on its own within `ms`, or { started: true, output }
 * when it was still running (it is then stopped).
 */
export async function runApiBriefly(env, ms = 8000) {
  const port = await freePort();
  const child = spawn(process.execPath, ['src/server.js'], { cwd: API_DIR, env: { ...process.env, ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const code = await Promise.race([new Promise((resolve) => child.once('exit', (c) => resolve(c ?? -1))), wait(ms).then(() => null)]);
  if (code !== null) return { started: false, code, output };
  child.kill();
  return { started: true, output };
}

/**
 * A small HTTP client for one API base. call(method, path, options) resolves with { status, body
 * (parsed JSON or null), text, headers }. Options: token (Bearer), body (sent as JSON), form (FormData),
 * raw (a string sent as it is), headers, and ip: sent as X-Forwarded-For, which the API trusts from its one
 * proxy, so each test can have its own rate-limit count (only an API reached directly takes it; behind
 * Nginx the real address wins).
 */
export function client(base) {
  return async function call(method, url, { token, body, form, raw, headers = {}, ip } = {}) {
    const sent = { ...headers };
    if (token) sent.Authorization = `Bearer ${token}`;
    if (ip) sent['X-Forwarded-For'] = ip;
    let payload;
    if (form) payload = form;
    else if (raw !== undefined) payload = raw;
    else if (body !== undefined) {
      sent['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(base + url, { method, headers: sent, body: payload, redirect: 'manual' });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON (e.g. a receipt image) */
    }
    return { status: res.status, body: json, text, headers: res.headers };
  };
}

// A different made-up client address for each call that asks, 10.200.x.y (see client's `ip`)
let ipCount = 0;
export const nextIp = () => {
  ipCount += 1;
  return `10.200.${Math.floor(ipCount / 250) % 250}.${(ipCount % 250) + 1}`;
};

/**
 * A session token for an account, signed like the API signs one (lib/tokens.js). `account` is
 * { id, name, passwordChangedAt }; `role` 'customer' or 'admin'. `expiresAt` (seconds) instead of the
 * one-hour default makes, e.g., a token that has already expired.
 */
export const tokenFor = (account, role, { expiresAt } = {}) =>
  signToken({ id: account.id, role, name: account.name, passwordChangedAt: account.passwordChangedAt }, expiresAt ? { expiresAt } : { ttl: '1h' });

/** The first admin account: { id, name, email, passwordChangedAt }. */
export async function adminAccount() {
  const [rows] = await pool.query('SELECT id, name, email, password_changed_at FROM admins ORDER BY id LIMIT 1');
  if (!rows.length) throw new Error('The database has no admin account. Seed it first (npm run seed:api or seed:starter).');
  const row = rows[0];
  return { id: row.id, name: row.name, email: row.email, passwordChangedAt: row.password_changed_at };
}

/** A strong random password for a test account (letters and digits, so every password rule passes). */
export const randomPassword = () => `Test-${crypto.randomBytes(9).toString('base64url')}9a`;

/**
 * A test customer written straight into the database: "Security Test <label>", an @example.test address
 * (that domain never receives mail), a made-up mobile number and `password` (hashed like a sign-up).
 * Returns { id, name, email, mobile, password, passwordChangedAt: null }.
 */
export async function createTestCustomer(label, password = randomPassword()) {
  const stamp = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
  const customer = {
    id: `cus-${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
    name: `Security Test ${label}`,
    email: `sectest-${label.toLowerCase()}-${stamp}@example.test`,
    mobile: `0917${String(crypto.randomInt(0, 10_000_000)).padStart(7, '0')}`,
    password,
    passwordChangedAt: null
  };
  await pool.query(
    `INSERT INTO customers (id, first_name, middle_name, last_name, name, email, mobile, password_hash, company, created_at, password_changed_at)
     VALUES (?, 'Security', '', ?, ?, ?, ?, ?, '', ?, NULL)`,
    [customer.id, `Test ${label}`, customer.name, customer.email, customer.mobile, await hashSecret(password), Date.now()]
  );
  return customer;
}

/** The newest email the log mail driver kept for an address (dev only: an smtp driver keeps none), or null. */
export async function lastEmailTo(address) {
  const [rows] = await pool.query("SELECT subject, body, created_at FROM outbox WHERE channel = 'email' AND to_address = ? ORDER BY created_at DESC, id DESC LIMIT 1", [address]);
  return rows[0] || null;
}

/** The 6-digit code in an email's body, or null. */
export const codeIn = (email) => {
  const match = email && /^\s*(\d{6})\s*$/m.exec(email.body);
  return match ? match[1] : null;
};

/** Write a text file, creating its folder; returns the path. */
export function writeFile(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

/** "2026-10-01 23:40" in Manila time (config.js fixes the process time zone). */
export function stampNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Escape a value for a Markdown table cell. */
export const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

export { closePool, config, pool };
