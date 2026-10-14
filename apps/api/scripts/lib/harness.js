import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from '../../src/config.js';
import { closePool, pool } from '../../src/db.js';
import { newId } from '../../src/lib/ids.js';
import { hashSecret } from '../../src/lib/passwords.js';
import { signToken } from '../../src/lib/tokens.js';


export const API_DIR = config.apiRoot;
export const REPO_DIR = path.resolve(API_DIR, '..', '..');

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

let runFolder = null;
export function runDir() {
  if (!runFolder) runFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-security-'));
  return runFolder;
}

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

export async function startApi({ env = {}, preload = null, label = 'api' } = {}) {
  const port = await freePort();
  const logFile = path.join(runDir(), `${label}.log`);
  const out = fs.openSync(logFile, 'a');
  const args = [...(preload ? ['--import', pathToFileURL(preload).href] : []), 'src/server.js'];
  const child = spawn(process.execPath, args, {
    cwd: API_DIR,
    env: { ...process.env, ...env, PORT: String(port) },
    stdio: ['ignore', out, out],
    windowsHide: true
  });
  let exitCode = null;
  const exited = new Promise((resolve) => child.once('exit', (code) => resolve((exitCode = code ?? -1))));
  const base = `http://127.0.0.1:${port}/api`;
  for (let i = 0; i < 100 && exitCode === null; i += 1) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) break;
    } catch {
    }
    await wait(200);
  }
  if (exitCode !== null) {
    fs.closeSync(out);
    throw new Error(
      `The test API stopped at start-up (exit ${exitCode}):\n${fs.readFileSync(logFile, 'utf8').slice(-1500)}`
    );
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

export async function runApiBriefly(env, ms = 8000) {
  const port = await freePort();
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: API_DIR,
    env: { ...process.env, ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const code = await Promise.race([
    new Promise((resolve) => child.once('exit', (c) => resolve(c ?? -1))),
    wait(ms).then(() => null)
  ]);
  if (code !== null) return { started: false, code, output };
  child.kill();
  return { started: true, output };
}

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
    }
    return { status: res.status, body: json, text, headers: res.headers };
  };
}

let ipCount = 0;
export const nextIp = () => {
  ipCount += 1;
  return `10.200.${Math.floor(ipCount / 250) % 250}.${(ipCount % 250) + 1}`;
};

export const tokenFor = (account, role, { expiresAt } = {}) =>
  signToken(
    {
      id: account.id,
      role,
      name: account.name,
      passwordChangedAt: account.passwordChangedAt,
      sessionId: account.sessionId
    },
    expiresAt ? { expiresAt } : { ttl: '1h' }
  );

export async function adminAccount() {
  const read = async () =>
    (await pool.query('SELECT id, name, email, password_changed_at, session_id FROM admins ORDER BY id LIMIT 1'))[0][0];
  let row = await read();
  if (!row) throw new Error('The database has no admin account. Seed it first (npm run seed:api or seed:starter).');
  if (!row.session_id) {
    await pool.query('UPDATE admins SET session_id = ? WHERE id = ? AND session_id IS NULL', [newId('ses'), row.id]);
    row = await read();
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordChangedAt: row.password_changed_at,
    sessionId: row.session_id
  };
}

export const randomPassword = () => `Test-${crypto.randomBytes(9).toString('base64url')}9a`;

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
    [
      customer.id,
      `Test ${label}`,
      customer.name,
      customer.email,
      customer.mobile,
      await hashSecret(password),
      Date.now()
    ]
  );
  return customer;
}

export async function createTestAdmin(password = randomPassword()) {
  const admin = {
    id: `adm-sectest-${crypto.randomBytes(8).toString('hex')}`,
    name: 'Security Test Admin',
    email: `sectest-admin-${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}@example.test`,
    password,
    passwordChangedAt: null
  };
  await pool.query(
    `INSERT INTO admins (id, name, email, mobile, password_hash, role, created_at)
     VALUES (?, ?, ?, '', ?, 'Administrator', ?)`,
    [admin.id, admin.name, admin.email, await hashSecret(password), Date.now()]
  );
  return admin;
}

export async function removeTestAdmin(admin) {
  await pool.query('DELETE FROM auth_challenges WHERE admin_id = ?', [admin.id]);
  await pool.query('DELETE FROM login_attempts WHERE identifier IN (?, ?)', [admin.email, admin.id]);
  await pool.query("DELETE FROM outbox WHERE channel = 'email' AND to_address = ?", [admin.email]);
  await pool.query('DELETE FROM admins WHERE id = ?', [admin.id]);
}

export async function lastEmailTo(address) {
  const [rows] = await pool.query(
    "SELECT subject, body, created_at FROM outbox WHERE channel = 'email' AND to_address = ? ORDER BY created_at DESC, id DESC LIMIT 1",
    [address]
  );
  return rows[0] || null;
}

export const codeIn = (email) => {
  const match = email && /^\s*(\d{6})\s*$/m.exec(email.body);
  return match ? match[1] : null;
};

export function writeFile(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

export function stampNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const cell = (value) =>
  String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');

export { closePool, config, pool };
